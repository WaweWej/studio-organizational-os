import { context } from '@/lib/store';
import { json, apiFailure, sameOrigin, boundedBody } from '@/lib/api-safety';
import { sealedValue } from '@/lib/resource-store';
import { AppError } from '@/lib/validation';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const c = await context(),
      id = new URL(request.url).searchParams.get('id');
    if (id) {
      const row = await c.db
        .prepare(
          'SELECT v.sealed FROM vaultEntries v JOIN resources r ON r.org=v.org AND r.id=v.id WHERE v.org=? AND v.id=? AND r.archived=0',
        )
        .bind(c.org, id)
        .first<{ sealed: string }>();
      if (!row) throw new AppError('Credential not found.', 404);
      return json({ sealed: JSON.parse(row.sealed) });
    }
    const config = await c.db
      .prepare(
        'SELECT id,salt,verifier,iterations,version FROM vaultConfig WHERE org=?',
      )
      .bind(c.org)
      .first<{ verifier: string }>();
    return json({
      config: config
        ? { ...config, verifier: JSON.parse(config.verifier) }
        : null,
    });
  } catch (e) {
    return apiFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const c = await context(),
      input = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 10000)),
      );
    if (
      input.version !== 1 ||
      input.iterations !== 600000 ||
      typeof input.id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(input.id) ||
      typeof input.salt !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/.test(input.salt) ||
      atob(input.salt).length !== 16
    )
      throw new AppError('Invalid vault configuration.');
    const verifier = sealedValue(input.verifier);
    const result = await c.db
      .prepare(
        'INSERT OR IGNORE INTO vaultConfig (org,id,salt,verifier,iterations,version) VALUES (?,?,?,?,?,?)',
      )
      .bind(c.org, input.id, input.salt, verifier, 600000, 1)
      .run();
    if (!result.meta.changes)
      throw new AppError('A vault already exists. Reload and unlock it.', 409);
    return json({ ok: true });
  } catch (e) {
    return apiFailure(e);
  }
}
