import { env } from 'cloudflare:workers';
import { context, readWorkspace } from '@/lib/store';
import { studioStore } from '@/lib/file-store';
import { json, apiFailure, sameOrigin, boundedBody } from '@/lib/api-safety';
import {
  MAX_FILE_SIZE,
  validateTargets,
  recordExists,
} from '@/lib/resource-store';
import type { ResourceTarget } from '@/lib/resource-model';
import type { Context } from '@/lib/store';
import {
  driveAccess,
  ensureDriveFolder,
  uploadDriveFile,
  deleteDriveFile,
} from '@/lib/google-drive';
import {
  accessToken,
  googleConnection,
  type GoogleConfig,
} from '@/lib/google-calendar-auth';
import { AppError, textValue } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const c = await context();
    const store = studioStore(c);
    const bytes = await boundedBody(request, MAX_FILE_SIZE + 65536),
      form = await new Response(bytes, {
        headers: { 'Content-Type': request.headers.get('content-type') || '' },
      }).formData(),
      file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE)
      throw new AppError(
        'Choose a file up to 20 MB. For larger files, add a link.',
        413,
      );
    const kind = textValue(form.get('kind') ?? 'asset', 'Type', 20);
    if (!['asset', 'template', 'tool'].includes(kind))
      throw new AppError('Invalid file type.');
    const html = kind === 'tool';
    if (html && !/\.html?$/i.test(file.name))
      throw new AppError(
        'Upload a self-contained .html tool, or register a hosted tool link.',
      );
    const folderId =
      textValue(form.get('folderId') ?? '', 'Folder', 100) || null;
    if (folderId) await recordExists(c, 'folders', folderId);
    const targets = await validateTargets(
      c,
      JSON.parse(textValue(form.get('targets') || '[]', 'Connections', 20000)),
    );
    const uploadId = textValue(form.get('uploadId') ?? '', 'Upload ID', 36);
    if (
      uploadId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        uploadId,
      )
    )
      throw new AppError('Invalid upload ID.');
    // Where the bytes live. 'drive' requires a connected Google account with
    // Drive access; without a choice, Drive is used when available for assets
    // and templates, and Studio storage otherwise. Tools always stay in Studio
    // storage because they are served and executed from here.
    const storage = textValue(form.get('storage') ?? '', 'Storage', 10);
    if (storage && !['drive', 'studio'].includes(storage))
      throw new AppError('Invalid storage destination.');
    const driveConn = html || storage === 'studio' ? null : await googleConnection(c);
    const access = driveAccess(driveConn ?? null);
    if (storage === 'drive' && (html || !access))
      throw new AppError(
        html
          ? 'Tools are stored in Studio so they can run here.'
          : 'Connect Google Drive first to upload files there.',
        503,
      );
    const useDrive = !html && storage !== 'studio' && !!access;
    const id = uploadId || crypto.randomUUID(),
      fileKey = c.org + '/' + id + '/' + crypto.randomUUID(),
      now = new Date().toISOString(),
      filename = Array.from(file.name)
        .filter(
          (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
        )
        .join('')
        .slice(0, 220),
      content = await file.arrayBuffer(),
      digest = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', content)),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
      fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(
              JSON.stringify({
                digest,
                filename,
                kind,
                mime: file.type.slice(0, 150),
                folderId,
                targets: targets.map((t) => t.type + ':' + t.id).sort(),
              }),
            ),
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    const find = () =>
      c.db
        .prepare(
          'SELECT fileKey,driveFileId,filename,mime,size FROM resources WHERE org=? AND id=?',
        )
        .bind(c.org, id)
        .first<{
          fileKey: string;
          driveFileId: string;
          filename: string;
          mime: string;
          size: number;
        }>();
    if (useDrive) {
      const existingDrive = await find();
      if (existingDrive) {
        if (
          existingDrive.filename !== filename ||
          existingDrive.mime !== file.type.slice(0, 150) ||
          existingDrive.size !== file.size
        )
          throw new AppError(
            'This upload was already saved with different details.',
            409,
          );
        return json(await readWorkspace(c));
      }
      const token = await accessToken(
        c,
        env as unknown as GoogleConfig,
        driveConn!,
      );
      const space = await targetSpace(c, targets);
      const folder = await ensureDriveFolder(c, token, space);
      const uploaded = await uploadDriveFile(
        token,
        folder,
        filename,
        file.type.slice(0, 150),
        content,
      );
      try {
        const result = await c.db.batch([
          c.db
            .prepare(
              'INSERT OR IGNORE INTO resources (org,id,title,kind,source,owner,filename,mime,size,driveFileId,url,folderId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .bind(
              c.org,
              id,
              filename.slice(0, 180),
              kind,
              'drive',
              c.actor,
              filename,
              file.type.slice(0, 150),
              file.size,
              uploaded.id,
              uploaded.webViewLink || '',
              folderId,
              now,
              now,
            ),
          ...targets.map((t) =>
            c.db
              .prepare(
                'INSERT INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM resources WHERE org=? AND id=? AND driveFileId=?)',
              )
              .bind(
                c.org,
                id + ':' + t.type + ':' + t.id,
                id,
                t.type,
                t.id,
                c.org,
                id,
                uploaded.id,
              ),
          ),
        ]);
        if (!result[0].meta.changes) {
          const winner = await find();
          if (winner?.driveFileId !== uploaded.id)
            await deleteDriveFile(token, uploaded.id);
          if (!winner)
            throw new AppError('The file could not be saved. Try again.', 409);
        }
      } catch (error) {
        const committed = await find();
        if (committed?.driveFileId !== uploaded.id)
          await deleteDriveFile(token, uploaded.id);
        else return json(await readWorkspace(c));
        if (error instanceof AppError) throw error;
        throw new AppError('The file could not be saved. Try again.', 502);
      }
      return json(await readWorkspace(c));
    }
    const checkRetry = async (existing: { fileKey: string }) => {
      const object = await store.head(existing.fileKey);
      if (object?.customMetadata?.captureFingerprint !== fingerprint)
        throw new AppError(
          'This upload was already saved with different details.',
          409,
        );
    };
    const existing = await find();
    if (existing) {
      await checkRetry(existing);
      return json(await readWorkspace(c));
    }
    await store.put(fileKey, content, {
      customMetadata: { captureFingerprint: fingerprint },
    });
    try {
      const result = await c.db.batch([
        c.db
          .prepare(
            'INSERT OR IGNORE INTO resources (org,id,title,kind,source,owner,filename,mime,size,fileKey,folderId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            c.org,
            id,
            filename.slice(0, 180),
            kind,
            html ? 'html' : 'file',
            c.actor,
            filename,
            file.type.slice(0, 150),
            file.size,
            fileKey,
            folderId,
            now,
            now,
          ),
        ...targets.map((t) =>
          c.db
            .prepare(
              'INSERT INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM resources WHERE org=? AND id=? AND fileKey=?)',
            )
            .bind(
              c.org,
              id + ':' + t.type + ':' + t.id,
              id,
              t.type,
              t.id,
              c.org,
              id,
              fileKey,
            ),
        ),
      ]);
      if (!result[0].meta.changes) {
        await store.delete(fileKey);
        const winner = await find();
        if (!winner)
          throw new AppError('The file could not be saved. Try again.', 409);
        await checkRetry(winner);
      }
    } catch (error) {
      // Do not remove a committed object's bytes after an uncertain database response.
      const committed = await find();
      if (committed?.fileKey !== fileKey) await store.delete(fileKey);
      else {
        await checkRetry(committed);
        return json(await readWorkspace(c));
      }
      throw error;
    }
    return json(await readWorkspace(c));
  } catch (e) {
    return apiFailure(e);
  }
}
export async function GET(request: Request) {
  try {
    const c = await context(),
      url = new URL(request.url),
      id = url.searchParams.get('id');
    const r = await c.db
      .prepare(
        'SELECT fileKey,filename,mime,source FROM resources WHERE org=? AND id=? AND archived=0',
      )
      .bind(c.org, id || '')
      .first<{
        fileKey: string;
        filename: string;
        mime: string;
        source: string;
      }>();
    if (!r?.fileKey) throw new AppError('File not found.', 404);
    const object = await studioStore(c).get(r.fileKey);
    if (!object) throw new AppError('File not found.', 404);
    const run = url.searchParams.get('run') === '1' && r.source === 'html',
      preview =
        url.searchParams.get('preview') === '1' &&
        ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(r.mime);
    const headers = new Headers({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': run
        ? 'text/html; charset=utf-8'
        : preview
          ? r.mime
          : 'application/octet-stream',
      'Content-Disposition':
        run || preview
          ? 'inline'
          : `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
    });
    headers.set(
      'Content-Security-Policy',
      run
        ? "sandbox allow-scripts allow-forms allow-downloads; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src data: blob: https:; connect-src https:; font-src data: https:; form-action https:; base-uri 'none'"
        : "default-src 'none'; sandbox",
    );
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(object.body, { headers });
  } catch (e) {
    return apiFailure(e);
  }
}

async function targetSpace(c: Context, targets: ResourceTarget[]) {
  const direct = targets.find((t) => t.type === 'space');
  const lookup = async (sql: string, id: string) =>
    c.db.prepare(sql).bind(c.org, id).first<{ id: string; name: string }>();
  if (direct)
    return lookup('SELECT id,name FROM spaces WHERE org=? AND id=?', direct.id);
  const project = targets.find((t) => t.type === 'project');
  if (project)
    return lookup(
      'SELECT s.id,s.name FROM spaces s JOIN projects p ON p.org=s.org AND p.spaceId=s.id WHERE p.org=? AND p.id=?',
      project.id,
    );
  const task = targets.find((t) => t.type === 'task');
  if (task)
    return lookup(
      "SELECT s.id,s.name FROM spaces s JOIN tasks t ON t.org=s.org AND (t.spaceId=s.id OR t.projectId IN (SELECT id FROM projects p WHERE p.org=s.org AND p.spaceId=s.id)) WHERE t.org=? AND t.id=?",
      task.id,
    );
  return null;
}
