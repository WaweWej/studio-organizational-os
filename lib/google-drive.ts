import type { Context } from './store';
import type { GoogleConnection } from './google-calendar-types';
import {
  accessToken,
  driveScopes,
  googleConnection,
  googleConfigured,
  googleRequest,
  type GoogleConfig,
} from './google-calendar-auth';
import { AppError } from './validation';

// Google Drive integration. Drive owns the bytes; Studio owns the canonical
// record of what belongs to whom. Uploads land in a "Studio" folder tree with
// one subfolder per client. Editing authority stays with the source: files are
// opened in Drive, and Studio never mirrors or rewrites their content.

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,iconLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const MAX_DRIVE_FILE = 20 * 1024 * 1024;

export type DriveAccess = 'full' | 'upload' | null;
export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  trashed?: boolean;
  modifiedTime?: string;
};

// Which Drive capability the stored grant covers. 'upload' means the Studio
// folder tree and app-created files only; 'full' adds browsing existing files.
export function driveAccess(connection: GoogleConnection | null): DriveAccess {
  if (!connection || connection.status !== 'connected') return null;
  const granted = connection.scopes.split(' ');
  const [file, readonly] = driveScopes;
  if (!granted.includes(file)) return null;
  return granted.includes(readonly) ? 'full' : 'upload';
}

export async function driveStatus(c: Context, config: GoogleConfig) {
  if (!googleConfigured(config))
    return { configured: false, connected: false, access: null as DriveAccess };
  const connection = await googleConnection(c);
  const access = driveAccess(connection ?? null);
  return {
    configured: true,
    connected: !!access,
    access,
    account: access ? connection!.account : '',
  };
}

const escapeQuery = (value: string) => value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");

async function findFolder(
  token: string,
  name: string,
  parentId: string | null,
  fetcher: typeof fetch,
) {
  const q = [
    `mimeType = '${FOLDER_MIME}'`,
    `name = '${escapeQuery(name)}'`,
    'trashed = false',
    parentId ? `'${escapeQuery(parentId)}' in parents` : `'root' in parents`,
  ].join(' and ');
  const found = await googleRequest<{ files?: DriveFile[] }>(
    DRIVE_FILES + '?' + new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '5' }),
    { headers: { Authorization: 'Bearer ' + token } },
    fetcher,
  );
  return found.files?.[0]?.id || null;
}

async function createFolder(
  token: string,
  name: string,
  parentId: string | null,
  fetcher: typeof fetch,
) {
  const created = await googleRequest<DriveFile>(
    DRIVE_FILES + '?fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
    fetcher,
  );
  if (!created.id) throw new AppError('Google Drive did not return the folder.', 502);
  return created.id;
}

async function cachedFolder(c: Context, spaceKey: string) {
  return c.db
    .prepare('SELECT id,folderId,name FROM driveFolders WHERE org=? AND spaceId=?')
    .bind(c.org, spaceKey)
    .first<{ id: string; folderId: string; name: string }>();
}

async function folderAlive(token: string, folderId: string, fetcher: typeof fetch) {
  try {
    const file = await googleRequest<DriveFile>(
      DRIVE_FILES + '/' + encodeURIComponent(folderId) + '?fields=id,trashed',
      { headers: { Authorization: 'Bearer ' + token } },
      fetcher,
    );
    return !!file.id && !file.trashed;
  } catch {
    return false;
  }
}

// Resolve (and if needed create) the Drive folder for a client space, or the
// Studio root for internal work. Lost creation responses are reconciled by
// searching before creating again, so retries never duplicate folders.
export async function ensureDriveFolder(
  c: Context,
  token: string,
  space: { id: string; name: string } | null,
  fetcher: typeof fetch = fetch,
) {
  const rootKey = '';
  const rootRow = await cachedFolder(c, rootKey);
  let rootId = rootRow?.folderId || '';
  if (!rootId || !(await folderAlive(token, rootId, fetcher))) {
    rootId =
      (await findFolder(token, 'Studio', null, fetcher)) ||
      (await createFolder(token, 'Studio', null, fetcher));
    await c.db
      .prepare(
        'INSERT INTO driveFolders (org,id,spaceId,folderId,name,createdAt) VALUES (?,?,?,?,?,?) ON CONFLICT(org,spaceId) DO UPDATE SET folderId=excluded.folderId,name=excluded.name',
      )
      .bind(c.org, rootRow?.id || crypto.randomUUID(), rootKey, rootId, 'Studio', new Date().toISOString())
      .run();
  }
  if (!space) return rootId;
  const row = await cachedFolder(c, space.id);
  let folderId = row?.folderId || '';
  if (folderId && row?.name === space.name && (await folderAlive(token, folderId, fetcher)))
    return folderId;
  folderId =
    (await findFolder(token, space.name, rootId, fetcher)) ||
    (await createFolder(token, space.name, rootId, fetcher));
  await c.db
    .prepare(
      'INSERT INTO driveFolders (org,id,spaceId,folderId,name,createdAt) VALUES (?,?,?,?,?,?) ON CONFLICT(org,spaceId) DO UPDATE SET folderId=excluded.folderId,name=excluded.name',
    )
    .bind(c.org, row?.id || crypto.randomUUID(), space.id, folderId, space.name, new Date().toISOString())
    .run();
  return folderId;
}

// Multipart upload. The response is the only evidence of success; a lost
// response surfaces as an error and the retry reuses the caller's upload ID
// against the canonical resource record, never a second blind upload.
export async function uploadDriveFile(
  token: string,
  folderId: string,
  filename: string,
  mime: string,
  content: ArrayBuffer,
  fetcher: typeof fetch = fetch,
) {
  if (content.byteLength > MAX_DRIVE_FILE)
    throw new AppError('Choose a file up to 20 MB. For larger files, add a link.', 413);
  const boundary = 'studio-' + crypto.randomUUID();
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: filename, parents: [folderId] }) +
      `\r\n--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + content.byteLength + tail.length);
  body.set(head, 0);
  body.set(new Uint8Array(content), head.length);
  body.set(tail, head.length + content.byteLength);
  const file = await googleRequest<DriveFile>(
    DRIVE_UPLOAD,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body,
    },
    fetcher,
  );
  if (!file.id) throw new AppError('Google Drive did not confirm the upload.', 502);
  return file;
}

// Search existing Drive files. Requires the read grant; with upload-only
// access the caller must say so instead of showing an empty result as truth.
export async function searchDriveFiles(
  token: string,
  query: string,
  fetcher: typeof fetch = fetch,
) {
  const clean = query.trim().slice(0, 200);
  const q = clean
    ? `(name contains '${escapeQuery(clean)}' or fullText contains '${escapeQuery(clean)}') and trashed = false`
    : 'trashed = false';
  const found = await googleRequest<{ files?: DriveFile[] }>(
    DRIVE_FILES +
      '?' +
      new URLSearchParams({
        q,
        fields: 'files(id,name,mimeType,size,webViewLink,iconLink,modifiedTime)',
        pageSize: '20',
        orderBy: 'modifiedTime desc',
        corpora: 'user',
      }),
    { headers: { Authorization: 'Bearer ' + token } },
    fetcher,
  );
  return (found.files || []).filter((f) => f.mimeType !== FOLDER_MIME);
}

export async function getDriveFile(
  token: string,
  fileId: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^[\w-]{10,120}$/.test(fileId)) throw new AppError('Invalid Drive file.');
  const file = await googleRequest<DriveFile>(
    DRIVE_FILES +
      '/' +
      encodeURIComponent(fileId) +
      '?fields=id,name,mimeType,size,webViewLink,iconLink,trashed',
    { headers: { Authorization: 'Bearer ' + token } },
    fetcher,
  );
  if (!file.id || file.trashed) throw new AppError('This Drive file is unavailable.', 404);
  return file;
}

// Remove an app-created file after a lost database race, mirroring the R2
// cleanup semantics: only our own just-uploaded file is ever deleted.
export async function deleteDriveFile(
  token: string,
  fileId: string,
  fetcher: typeof fetch = fetch,
) {
  try {
    await googleRequest<undefined>(
      DRIVE_FILES + '/' + encodeURIComponent(fileId),
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } },
      fetcher,
    );
  } catch {
    /* Cleanup is best effort; the canonical record decides what exists. */
  }
}

// Convenience: resolve a connected token or explain what is missing.
export async function requireDriveToken(
  c: Context,
  config: GoogleConfig,
  need: 'upload' | 'full',
  fetcher: typeof fetch = fetch,
) {
  const connection = await googleConnection(c);
  const access = driveAccess(connection ?? null);
  if (!access)
    throw new AppError(
      'Connect Google Drive first: Calendar → Google account → include Drive access.',
      503,
    );
  if (need === 'full' && access !== 'full')
    throw new AppError(
      'This Google connection covers uploads only. Reconnect and approve Drive browsing to attach existing files.',
      403,
    );
  return {
    token: await accessToken(c, config, connection!, fetcher),
    connection: connection!,
    access,
  };
}
