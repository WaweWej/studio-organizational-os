import { env } from 'cloudflare:workers';
import { context, readWorkspace } from '@/lib/store';
import { apiFailure, boundedBody, json, sameOrigin } from '@/lib/api-safety';
import { AppError, textValue } from '@/lib/validation';
import { validateTargets } from '@/lib/resource-store';
import type { GoogleConfig } from '@/lib/google-calendar-auth';
import {
  driveStatus,
  getDriveFile,
  requireDriveToken,
  searchDriveFiles,
} from '@/lib/google-drive';

export const dynamic = 'force-dynamic';
const config = () => env as unknown as GoogleConfig;

// Google Drive: status and browsing. Search requires the read grant; with
// upload-only access the response says so instead of returning an empty list.
export async function GET(request: Request) {
  try {
    const c = await context();
    const url = new URL(request.url);
    if (!url.searchParams.has('q')) return json(await driveStatus(c, config()));
    const { token } = await requireDriveToken(c, config(), 'full');
    const files = await searchDriveFiles(
      token,
      url.searchParams.get('q') || '',
    );
    return json({
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size || 0),
        webViewLink: f.webViewLink || '',
        iconLink: f.iconLink || '',
        modifiedTime: f.modifiedTime || '',
      })),
    });
  } catch (error) {
    return apiFailure(error);
  }
}

// Attach an existing Drive file as a canonical resource. Retries with the same
// attach ID return the saved workspace; the same file attached again gains the
// missing links instead of a duplicate resource record.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new AppError('JSON is required.', 415);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 20000)),
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Invalid request.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new AppError('Invalid request.');
    if (input.action !== 'attach') throw new AppError('Unknown action.');
    const c = await context();
    const attachId = textValue(input.attachId ?? '', 'Attach ID', 36);
    if (
      attachId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        attachId,
      )
    )
      throw new AppError('Invalid attach ID.');
    const fileId = textValue(input.fileId, 'Drive file', 130, true);
    const kind = textValue(input.kind ?? 'asset', 'Type', 20);
    if (!['asset', 'template'].includes(kind))
      throw new AppError('Invalid file type.');
    const targets = await validateTargets(c, input.targets ?? []);
    const { token } = await requireDriveToken(c, config(), 'full');
    const file = await getDriveFile(token, fileId);
    const now = new Date().toISOString();
    const existing = await c.db
      .prepare(
        "SELECT id FROM resources WHERE org=? AND driveFileId=? AND archived=0",
      )
      .bind(c.org, file.id)
      .first<{ id: string }>();
    const id = existing?.id || attachId || crypto.randomUUID();
    await c.db.batch([
      c.db
        .prepare(
          'INSERT OR IGNORE INTO resources (org,id,title,kind,source,owner,filename,mime,size,driveFileId,url,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          c.org,
          id,
          (file.name || 'Drive file').slice(0, 180),
          kind,
          'drive',
          c.actor,
          (file.name || '').slice(0, 220),
          (file.mimeType || '').slice(0, 150),
          Number(file.size || 0),
          file.id,
          file.webViewLink || '',
          now,
          now,
        ),
      ...targets.map((t) =>
        c.db
          .prepare(
            'INSERT OR IGNORE INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM resources WHERE org=? AND id=?)',
          )
          .bind(
            c.org,
            id + ':' + t.type + ':' + t.id,
            id,
            t.type,
            t.id,
            c.org,
            id,
          ),
      ),
    ]);
    return json(await readWorkspace(c));
  } catch (error) {
    return apiFailure(error);
  }
}
