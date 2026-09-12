// Scoped API tokens — the external door to the command boundary. A token
// speaks as its workspace with truthful provenance (actor api:<name>), only
// within its granted scopes, and destructive commands additionally require
// the 'destructive' scope. Secrets are shown once at minting; only SHA-256
// hashes are stored, and lookup is by hash so a database read alone cannot
// impersonate anyone.
import { AppError } from './validation';
import { commandCatalog, catalogByName } from './command-catalog';

type Db = { db: D1Database };

export const tokenScopeVocabulary = [
  'read',
  'destructive',
  ...Array.from(new Set(commandCatalog.map((c) => c.group))),
];

export type ApiTokenRow = {
  org: string;
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string;
};

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export function generateTokenSecret() {
  return 'studio_' + b64url(crypto.getRandomValues(new Uint8Array(30)));
}

export async function hashToken(secret: string) {
  return b64url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    ),
  );
}

export function parseScopes(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateScopes(scopes: string[]) {
  if (!scopes.length)
    throw new AppError('Grant at least one scope to the token.');
  for (const scope of scopes)
    if (!tokenScopeVocabulary.includes(scope))
      throw new AppError(`Unknown scope: ${scope}.`);
}

// Resolve a Bearer token to its row; touches lastUsedAt without blocking.
export async function tokenFromHeader(
  c: Db,
  authorization: string | null,
): Promise<ApiTokenRow | null> {
  const match = /^Bearer\s+(studio_[A-Za-z0-9_-]{20,80})$/.exec(
    authorization || '',
  );
  if (!match) return null;
  const row = await c.db
    .prepare(
      "SELECT org,id,name,prefix,scopes,createdBy,createdAt,lastUsedAt,revokedAt FROM apiTokens WHERE tokenHash=? AND revokedAt=''",
    )
    .bind(await hashToken(match[1]))
    .first<ApiTokenRow>();
  if (!row) return null;
  try {
    await c.db
      .prepare('UPDATE apiTokens SET lastUsedAt=? WHERE org=? AND id=?')
      .bind(new Date().toISOString(), row.org, row.id)
      .run();
  } catch {
    /* Usage bookkeeping never blocks the request. */
  }
  return row;
}

// The scope gate mutate() applies to token-authenticated contexts. The
// catalog is the map of the boundary; here it also guards it.
export function enforceTokenScopes(scopes: string[], commandType: string) {
  if (commandType === 'token-create' || commandType === 'token-revoke')
    throw new AppError('API tokens cannot manage API access. Sign in.', 403);
  const descriptor = catalogByName(commandType);
  if (!descriptor)
    throw new AppError(
      `This token cannot use uncataloged commands (${commandType}).`,
      403,
    );
  if (!scopes.includes(descriptor.group))
    throw new AppError(
      `This token is not scoped for ${descriptor.group} commands.`,
      403,
    );
  if (descriptor.risk === 'destructive' && !scopes.includes('destructive'))
    throw new AppError(
      `${commandType} is destructive and needs the 'destructive' scope.`,
      403,
    );
}

export async function createToken(
  c: Db & { org: string; actor: string },
  input: Record<string, unknown>,
) {
  if (c.actor.startsWith('api:'))
    throw new AppError('API tokens cannot manage API access. Sign in.', 403);
  const read = (value: unknown) => (typeof value === 'string' ? value : '');
  const id = read(input.id);
  const name = read(input.name).trim();
  const tokenHash = read(input.tokenHash);
  const prefix = read(input.prefix);
  const scopes = parseScopes(read(input.scopes));
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError('Token id is required.');
  if (!name || name.length > 60)
    throw new AppError('Name the token (up to 60 characters).');
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(tokenHash))
    throw new AppError('Token hash is malformed.');
  validateScopes(scopes);
  await c.db
    .prepare(
      'INSERT INTO apiTokens (org,id,name,tokenHash,prefix,scopes,createdBy,createdAt) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(
      c.org,
      id,
      name,
      tokenHash,
      prefix.slice(0, 15),
      scopes.join(','),
      c.actor,
      new Date().toISOString(),
    )
    .run();
}

export async function revokeToken(
  c: Db & { org: string; actor: string },
  input: Record<string, unknown>,
) {
  if (c.actor.startsWith('api:'))
    throw new AppError('API tokens cannot manage API access. Sign in.', 403);
  const id = typeof input.id === 'string' ? input.id : '';
  const done = await c.db
    .prepare(
      "UPDATE apiTokens SET revokedAt=? WHERE org=? AND id=? AND revokedAt=''",
    )
    .bind(new Date().toISOString(), c.org, id)
    .run();
  if (!done.meta.changes)
    throw new AppError('That token was not found or is already revoked.', 404);
}

export async function listTokens(c: Db & { org: string }) {
  const rows = await c.db
    .prepare(
      "SELECT org,id,name,prefix,scopes,createdBy,createdAt,lastUsedAt,revokedAt FROM apiTokens WHERE org=? AND revokedAt='' ORDER BY createdAt DESC",
    )
    .bind(c.org)
    .all<ApiTokenRow>();
  return rows.results;
}
