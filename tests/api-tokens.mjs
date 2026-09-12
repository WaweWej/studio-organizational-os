import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';

// Scoped API tokens: hashing, header resolution, revocation, the scope gate
// the boundary applies, and the minting commands' refusals.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier === '@/app/chatgpt-auth') return { url: 'data:text/javascript,export async function getChatGPTUser(){return null}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const {
  generateTokenSecret,
  hashToken,
  tokenFromHeader,
  enforceTokenScopes,
  createToken,
  revokeToken,
  listTokens,
  tokenScopeVocabulary,
  validateScopes,
} = await import('../lib/api-tokens.ts');
const { context: c } = testDatabase();

// Secrets are prefixed, high-entropy, and hash deterministically.
const secret = generateTokenSecret();
assert.match(secret, /^studio_[A-Za-z0-9_-]{38,}$/);
assert.notEqual(secret, generateTokenSecret());
assert.equal(await hashToken(secret), await hashToken(secret));
assert.notEqual(await hashToken(secret), await hashToken(secret + 'x'));

// The vocabulary covers reads, the destructive lock, and every group.
for (const scope of ['read', 'destructive', 'capture', 'tasks', 'clients', 'access'])
  assert.ok(tokenScopeVocabulary.includes(scope), scope);
assert.throws(() => validateScopes(['capture', 'nonsense']), /Unknown scope/);
assert.throws(() => validateScopes([]), /at least one/);

// Minting through the command layer stores the hash, never the secret.
const id = crypto.randomUUID();
await createToken(c, {
  id,
  name: 'Viktor',
  tokenHash: await hashToken(secret),
  prefix: secret.slice(0, 15),
  scopes: 'read,capture,tasks',
});
const rows = await listTokens(c);
assert.equal(rows.length, 1);
assert.equal(rows[0].name, 'Viktor');
assert.ok(!JSON.stringify(rows).includes(secret.slice(20)), 'secret absent');

// A Bearer header resolves to the row; wrong or malformed ones do not.
const row = await tokenFromHeader(c, 'Bearer ' + secret);
assert.equal(row.org, c.org);
assert.equal(row.name, 'Viktor');
assert.ok((await listTokens(c))[0].lastUsedAt, 'usage recorded');
assert.equal(await tokenFromHeader(c, 'Bearer studio_' + 'a'.repeat(40)), null);
assert.equal(await tokenFromHeader(c, 'Bearer other_' + 'a'.repeat(40)), null);
assert.equal(await tokenFromHeader(c, null), null);

// The gate: granted groups pass, others refuse truthfully; destructive
// commands need the extra scope; tokens can never manage tokens; and
// uncataloged commands are refused outright.
const scopes = ['read', 'capture', 'tasks'];
assert.doesNotThrow(() => enforceTokenScopes(scopes, 'capture-entry'));
assert.doesNotThrow(() => enforceTokenScopes(scopes, 'quick-create'));
assert.throws(() => enforceTokenScopes(scopes, 'client-create'), /not scoped for clients/);
assert.throws(() => enforceTokenScopes(scopes, 'task-delete'), /destructive/);
assert.doesNotThrow(() =>
  enforceTokenScopes([...scopes, 'destructive'], 'task-delete'),
);
assert.throws(() => enforceTokenScopes(['access', 'destructive'], 'token-create'), /cannot manage API access/);
assert.throws(() => enforceTokenScopes(scopes, 'made-up-thing'), /uncataloged/);

// Token-authenticated contexts cannot mint or revoke even directly.
const tokenContext = { ...c, actor: 'api:Viktor' };
await assert.rejects(
  createToken(tokenContext, { id: crypto.randomUUID(), name: 'x', tokenHash: await hashToken('studio_' + 'b'.repeat(40)), prefix: 'p', scopes: 'read' }),
  /cannot manage API access/,
);
await assert.rejects(revokeToken(tokenContext, { id }), /cannot manage API access/);

// Revocation is immediate and idempotent in its refusal.
await revokeToken(c, { id });
assert.equal(await tokenFromHeader(c, 'Bearer ' + secret), null);
assert.equal((await listTokens(c)).length, 0);
await assert.rejects(revokeToken(c, { id }), /already revoked|not found/);

// Minting validations: name, hash shape, scopes.
const good = { id: crypto.randomUUID(), tokenHash: await hashToken('studio_' + 'c'.repeat(40)), prefix: 'studio_ccc', scopes: 'read' };
await assert.rejects(createToken(c, { ...good, name: '' }), /Name the token/);
await assert.rejects(createToken(c, { ...good, name: 'ok', tokenHash: 'short' }), /malformed/);
await assert.rejects(createToken(c, { ...good, name: 'ok', scopes: 'read,evil' }), /Unknown scope/);

console.log(
  'PASS: api tokens — entropy and hashing, hash-only storage, header resolution with usage stamping, truthful scope refusals with the destructive lock, tokens barred from managing access, immediate revocation, and minting validations.',
);
