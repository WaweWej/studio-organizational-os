import { env } from 'cloudflare:workers';
import { context } from '@/lib/store';
import { importWorkspace } from '@/lib/workspace-transfer';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  try {
    const expected = (env as unknown as { STUDIO_TRANSFER_KEY?: string })
      .STUDIO_TRANSFER_KEY;
    const provided = request.headers.get('x-studio-transfer-key') || '';
    if (
      !expected ||
      expected.length < 32 ||
      provided.length !== expected.length
    )
      throw new AppError('Transfer is unavailable.', 404);
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++)
      mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    if (mismatch) throw new AppError('Transfer is unavailable.', 404);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new AppError('This request came from another origin.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new AppError('JSON is required.', 415);
    if (Number(request.headers.get('content-length') || 0) > 2000000)
      throw new AppError('Transfer too large.', 413);
    const c = await context();
    const raw = await request.text();
    if (raw.length > 2000000) throw new AppError('Transfer too large.', 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new AppError('Invalid transfer JSON.');
    }
    return response(await importWorkspace(c, input));
  } catch (error) {
    if (error instanceof AppError)
      return response({ error: error.message }, error.status);
    console.error('Workspace transfer failed.');
    return response(
      {
        error:
          'The transfer could not complete. No partial changes were saved.',
      },
      500,
    );
  }
}
