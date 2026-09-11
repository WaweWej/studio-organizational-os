import assert from 'node:assert/strict';
import { testDatabase } from './sqlite-context.mjs';
import {
  driveAccess,
  ensureDriveFolder,
  uploadDriveFile,
  searchDriveFiles,
  getDriveFile,
  MAX_DRIVE_FILE,
} from '../lib/google-drive.ts';
import { driveScopes } from '../lib/google-calendar-auth.ts';

const [FILE_SCOPE, READ_SCOPE] = driveScopes;
const connection = (scopes, status = 'connected') => ({
  org: 'test-a',
  actor: 'me',
  token: 'sealed',
  account: 'owner@example.invalid',
  calendarId: '',
  selected: '[]',
  timeZone: 'UTC',
  status,
  lastSync: '',
  error: '',
  lease: '',
  leaseUntil: 0,
  createAttempt: 0,
  scopes,
});

// Scope gating: no drive.file means no Drive; readonly alone is not enough;
// both grants unlock browsing; a broken connection unlocks nothing.
assert.equal(driveAccess(null), null);
assert.equal(driveAccess(connection('')), null);
assert.equal(driveAccess(connection(READ_SCOPE)), null);
assert.equal(driveAccess(connection(FILE_SCOPE)), 'upload');
assert.equal(driveAccess(connection(`${FILE_SCOPE} ${READ_SCOPE}`)), 'full');
assert.equal(
  driveAccess(connection(`${FILE_SCOPE} ${READ_SCOPE}`, 'error')),
  null,
);

const href = (url) =>
  typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Folder resolution: creates Studio root and the client folder, caches both,
// and a second call verifies the cache without creating anything new.
{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Owner' };
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url: href(url), method: init.method || 'GET' });
    const u = href(url);
    if (u.includes('/drive/v3/files?') && !init.method)
      return jsonResponse({ files: [] });
    if (init.method === 'POST') {
      const name = JSON.parse(init.body).name;
      return jsonResponse({ id: 'folder-' + name.toLowerCase().replaceAll(' ', '-'), name });
    }
    if (/\/drive\/v3\/files\/folder-/.test(u))
      return jsonResponse({ id: u.split('/').pop().split('?')[0], trashed: false });
    return jsonResponse({}, 404);
  };
  const folder = await ensureDriveFolder(
    c,
    'token',
    { id: 'nord', name: 'Nord & Form' },
    fetcher,
  );
  assert.equal(folder, 'folder-nord-&-form');
  assert.equal(calls.filter((x) => x.method === 'POST').length, 2);
  const cached = await ensureDriveFolder(
    c,
    'token',
    { id: 'nord', name: 'Nord & Form' },
    fetcher,
  );
  assert.equal(cached, folder);
  assert.equal(calls.filter((x) => x.method === 'POST').length, 2);
  // Another organization never sees this cache.
  const other = { db, org: 'test-b', actor: 'me', name: 'Other' };
  const otherCalls = [];
  await ensureDriveFolder(other, 'token', null, async (url, init = {}) => {
    otherCalls.push(init.method || 'GET');
    if (!init.method) return jsonResponse({ files: [] });
    return jsonResponse({ id: 'other-root', name: 'Studio' });
  });
  assert.ok(otherCalls.includes('POST'));
}

// A trashed cached folder is reconciled by search before any new creation, so
// lost responses and manual deletions never produce duplicate folders.
{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Owner' };
  await db
    .prepare(
      "INSERT INTO driveFolders (org,id,spaceId,folderId,name,createdAt) VALUES ('test-a','r1','','dead-root','Studio','2026-01-01')",
    )
    .run();
  let searched = false;
  const folder = await ensureDriveFolder(c, 'token', null, async (url, init = {}) => {
    const u = href(url);
    if (u.includes('/files/dead-root')) return jsonResponse({ id: 'dead-root', trashed: true });
    if (!init.method) {
      searched = true;
      return jsonResponse({ files: [{ id: 'found-root', name: 'Studio' }] });
    }
    throw new Error('should not create when search finds the folder');
  });
  assert.equal(folder, 'found-root');
  assert.equal(searched, true);
  const cached = await db
    .prepare("SELECT folderId FROM driveFolders WHERE org='test-a' AND spaceId=''")
    .first();
  assert.equal(cached.folderId, 'found-root');
}

// A renamed client gets a fresh folder under the new name.
{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Owner' };
  await db
    .prepare(
      "INSERT INTO driveFolders (org,id,spaceId,folderId,name,createdAt) VALUES ('test-a','r1','','root-id','Studio','2026-01-01'),('test-a','r2','nord','old-folder','Old Name','2026-01-01')",
    )
    .run();
  const folder = await ensureDriveFolder(
    c,
    'token',
    { id: 'nord', name: 'New Name' },
    async (url, init = {}) => {
      const u = href(url);
      if (u.includes('/files/root-id')) return jsonResponse({ id: 'root-id', trashed: false });
      if (!init.method) return jsonResponse({ files: [] });
      return jsonResponse({ id: 'new-folder', name: JSON.parse(init.body).name });
    },
  );
  assert.equal(folder, 'new-folder');
}

// Upload: multipart body carries metadata with the parent folder and the raw
// bytes; the confirmed file is returned; oversized files are refused locally.
{
  const bytes = new TextEncoder().encode('studio-bytes').buffer;
  let seen;
  const file = await uploadDriveFile(
    'token',
    'folder-1',
    'brief.pdf',
    'application/pdf',
    bytes,
    async (url, init) => {
      seen = { url: href(url), init };
      return jsonResponse({
        id: 'file-1',
        name: 'brief.pdf',
        webViewLink: 'https://drive.google.com/file/d/file-1/view',
      });
    },
  );
  assert.equal(file.id, 'file-1');
  assert.match(seen.url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  const raw = new TextDecoder().decode(seen.init.body);
  assert.match(raw, /"parents":\["folder-1"\]/);
  assert.match(raw, /Content-Type: application\/pdf/);
  assert.match(raw, /studio-bytes/);
  await assert.rejects(
    uploadDriveFile('token', 'f', 'big.bin', 'application/octet-stream', new ArrayBuffer(MAX_DRIVE_FILE + 1)),
    /up to 20 MB/,
  );
}

// Search: quotes are escaped into the query, folders are filtered out, and the
// page stays bounded.
{
  let seenUrl = '';
  const files = await searchDriveFiles(
    'token',
    "Gab's 'brief'",
    async (url) => {
      seenUrl = href(url);
      return jsonResponse({
        files: [
          { id: 'f1', name: 'Brief.pdf', mimeType: 'application/pdf' },
          { id: 'f2', name: 'Folder', mimeType: 'application/vnd.google-apps.folder' },
        ],
      });
    },
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].id, 'f1');
  const q = new URL(seenUrl).searchParams.get('q');
  assert.match(q, /Gab\\'s \\'brief\\'/);
  assert.equal(new URL(seenUrl).searchParams.get('pageSize'), '20');
}

// File lookup: identifier shape is validated locally and trashed files are
// reported unavailable rather than attached.
await assert.rejects(getDriveFile('token', '../evil'), /Invalid Drive file/);
await assert.rejects(
  getDriveFile('token', 'trashed-file-id', async () =>
    jsonResponse({ id: 'trashed-file-id', trashed: true }),
  ),
  /unavailable/,
);

console.log(
  'PASS: Drive scope gating, folder creation/caching/reconciliation, tenant isolation, client renames, multipart upload shape and size cap, search escaping and folder filtering, and file lookup validation. No external requests or real records used.',
);
