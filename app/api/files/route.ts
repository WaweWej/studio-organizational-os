import { env } from 'cloudflare:workers';
import { context, readWorkspace } from '@/lib/store';
import { json, apiFailure, sameOrigin, boundedBody } from '@/lib/api-safety';
import {
  MAX_FILE_SIZE,
  validateTargets,
  recordExists,
} from '@/lib/resource-store';
import { AppError, textValue } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const c = await context();
    if (!env.ASSETS) throw new AppError('File storage is unavailable.', 503);
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
        JSON.parse(
          textValue(form.get('targets') || '[]', 'Connections', 20000),
        ),
      ),
      id = crypto.randomUUID(),
      fileKey = `${c.org}/${id}`,
      now = new Date().toISOString(),
      filename = Array.from(file.name)
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join('')
        .slice(0, 220);
    await env.ASSETS.put(fileKey, file.stream());
    try {
      await c.db.batch([
        c.db
          .prepare(
            'INSERT INTO resources (org,id,title,kind,source,owner,filename,mime,size,fileKey,folderId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
              'INSERT INTO resourceLinks (org,id,resourceId,targetType,targetId) VALUES (?,?,?,?,?)',
            )
            .bind(c.org, `${id}:${t.type}:${t.id}`, id, t.type, t.id),
        ),
      ]);
    } catch (e) {
      await env.ASSETS.delete(fileKey);
      throw e;
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
    const object = await env.ASSETS.get(r.fileKey);
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
