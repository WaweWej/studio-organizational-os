import { AppError } from './validation';
import { env } from 'cloudflare:workers';

export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export function apiFailure(error: unknown) {
  if (!(error instanceof AppError))
    console.error('unexpected api failure', error);
  return json(
    {
      error:
        error instanceof AppError
          ? error.message
          : 'The operation could not be completed. Please try again.',
    },
    error instanceof AppError ? error.status : 500,
  );
}
// Browser mutations must come from the app's own origin. Behind a tunnel or
// proxy the server sees a local URL while the browser sends the public origin,
// so a single additional origin can be blessed explicitly through the
// STUDIO_PREVIEW_ORIGIN runtime setting. Nothing is inferred from forwarded
// headers, which a direct caller could forge.
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const blessed = (
    (env as { STUDIO_PREVIEW_ORIGIN?: string }).STUDIO_PREVIEW_ORIGIN || ''
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin && blessed.includes(origin)) return;
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new AppError('This request came from another origin.', 403);
}
export async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length') || 0) > max)
    throw new AppError('File or request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('A request body is required.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new AppError('File or request is too large.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
