import { context } from '@/lib/store';
import { mutate } from '@/lib/store';
import { apiFailure, json, sameOrigin } from '@/lib/api-safety';
import { AppError } from '@/lib/validation';
import {
  generateTokenSecret,
  hashToken,
  listTokens,
  tokenScopeVocabulary,
} from '@/lib/api-tokens';
export const dynamic = 'force-dynamic';

// API access management: session identities only. Minting generates the
// secret here — server entropy — passes only its hash through the command
// boundary, and returns the secret exactly once.
export async function GET() {
  try {
    const c = await context();
    if (c.tokenScopes)
      throw new AppError('API tokens cannot manage API access. Sign in.', 403);
    return json({ tokens: await listTokens(c), scopes: tokenScopeVocabulary });
  } catch (e) {
    return apiFailure(e);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const c = await context();
    if (c.tokenScopes)
      throw new AppError('API tokens cannot manage API access. Sign in.', 403);
    const input = (await request.json()) as Record<string, unknown>;
    if (input.action === 'revoke') {
      await mutate(c, { type: 'token-revoke', id: input.id });
      return json({ ok: true });
    }
    const secret = generateTokenSecret();
    const id = crypto.randomUUID();
    await mutate(c, {
      type: 'token-create',
      id,
      name: input.name,
      scopes: input.scopes,
      tokenHash: await hashToken(secret),
      prefix: secret.slice(0, 15),
    });
    return json({ id, secret, prefix: secret.slice(0, 15) });
  } catch (e) {
    return apiFailure(e);
  }
}
