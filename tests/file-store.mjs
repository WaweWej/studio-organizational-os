import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';

// The database-backed file store used by card-free deployments (no R2
// binding): fingerprint round-trips, the small-file cap, tenant isolation.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier === '@/app/chatgpt-auth') return { url: 'data:text/javascript,export async function getChatGPTUser(){return null}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { studioStore, DB_FILE_LIMIT } = await import('../lib/file-store.ts');
const { context: c, sqlite } = testDatabase();
const store = studioStore(c);

// Put, head, get round-trip with the capture fingerprint.
const bytes = new TextEncoder().encode('<html>tiny tool</html>');
await store.put('a/tool.html', bytes, {
  customMetadata: { captureFingerprint: 'fp-1' },
});
const head = await store.head('a/tool.html');
assert.equal(head.customMetadata.captureFingerprint, 'fp-1');
const got = await store.get('a/tool.html');
assert.equal(new TextDecoder().decode(got.body), '<html>tiny tool</html>');
assert.equal(got.customMetadata.captureFingerprint, 'fp-1');

// Re-put replaces content and fingerprint (retry semantics live above this
// layer; the store itself is a plain byte shelf).
await store.put('a/tool.html', new TextEncoder().encode('v2'), {
  customMetadata: { captureFingerprint: 'fp-2' },
});
assert.equal(
  (await store.head('a/tool.html')).customMetadata.captureFingerprint,
  'fp-2',
);

// Missing keys answer null; delete removes.
assert.equal(await store.head('a/missing'), null);
assert.equal(await store.get('a/missing'), null);
await store.delete('a/tool.html');
assert.equal(await store.head('a/tool.html'), null);

// The cap refuses oversized files with the truthful message.
await assert.rejects(
  store.put('a/big.bin', new Uint8Array(DB_FILE_LIMIT + 1), {
    customMetadata: { captureFingerprint: 'fp-3' },
  }),
  /up to 1 MB.*Google Drive/,
);

// Tenant isolation: another organization cannot read this one's bytes.
await store.put('shared-key', bytes, {
  customMetadata: { captureFingerprint: 'fp-4' },
});
const other = studioStore({ ...c, org: 'test-b' });
assert.equal(await other.head('shared-key'), null);
assert.equal(await other.get('shared-key'), null);
await other.delete('shared-key');
assert.ok(await store.head('shared-key'), 'foreign delete does not remove');
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM fileBlobs').get().n,
  1,
);

console.log(
  'PASS: database file store — fingerprint round-trip, replacement, missing keys, deletion, the 1 MB cap with a truthful message, and tenant isolation.',
);
