import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';
import { transferTables } from '../lib/workspace-transfer.ts';
const { sqlite, db } = testDatabase();
const runtime = { DB: db, STUDIO_TRANSFER_KEY: 'test-key-'.repeat(8) };
globalThis.transferTestRuntime = runtime;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return { url: 'data:text/javascript,export const env=globalThis.transferTestRuntime', shortCircuit: true };
    if (specifier === '@/lib/store')
      return { url: 'data:text/javascript,import {AppError} from ' + JSON.stringify(pathToFileURL(resolve('lib/validation.ts')).href) + ';export async function context(){throw new AppError("Sign in required",401)}', shortCircuit: true };
    if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
    return next(specifier, context);
  },
});
const { POST } = await import('../app/api/workspace-transfer/route.ts');
const snapshot = { format: 'studio-workspace-v1', sourceOrg: 'local', name: 'Saved Studio', exportedAt: '', tables: Object.fromEntries(transferTables.map((t) => [t, []])) };
snapshot.tables.members = [{ org: 'local', id: 'me', name: 'Owner', role: 'Owner', color: '#123456' }];
const request = (key = runtime.STUDIO_TRANSFER_KEY, origin = 'https://studio.test') => new Request('https://studio.test/api/workspace-transfer', { method: 'POST', headers: { 'content-type': 'application/json', 'x-studio-transfer-key': key, origin }, body: JSON.stringify(snapshot) });
assert.equal((await POST(request('wrong-key'))).status, 404);
assert.equal((await POST(request())).status, 401);
runtime.STUDIO_TRANSFER_ORG = 'verified-owner';
assert.equal((await POST(request())).status, 409);
sqlite.exec("INSERT INTO organizations VALUES ('verified-owner','Empty',''); INSERT INTO members VALUES ('verified-owner','me','Owner','Owner','#000000')");
assert.equal((await POST(request(undefined, 'https://other.test'))).status, 403);
assert.equal((await POST(request())).status, 200);
assert.equal(sqlite.prepare('SELECT org FROM workspaceTransfers').get().org, 'verified-owner');
assert.equal((await (await POST(request())).json()).alreadyImported, true);
runtime.STUDIO_TRANSFER_KEY = undefined;
assert.equal((await POST(request('test-key-'.repeat(8)))).status, 404);
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM workspaceTransfers').get().n, 1);
sqlite.close();
delete globalThis.transferTestRuntime;
console.log('Transfer route: key, origin, authenticated fallback, fixed existing target, retry and disable checks passed.');
