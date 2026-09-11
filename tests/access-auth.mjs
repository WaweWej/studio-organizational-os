import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';

// Verify the Cloudflare Access identity module against a real RSA keypair:
// signatures, audience, issuer, expiry, configuration gating.
const settings = { STUDIO_ACCESS_TEAM: 'teststudio', STUDIO_ACCESS_AUD: 'aud-tag-1' };
globalThis.__testEnv = settings;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__testEnv', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { getAccessUser, resetAccessKeyCache } = await import('../lib/access-auth.ts');

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const jwk = await webcrypto.subtle.exportKey('jwk', publicKey);
const b64url = (data) =>
  Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sign = async (payload, kid = 'k1') => {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = await webcrypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
};
const certs = async (url) => {
  assert.equal(url, 'https://teststudio.cloudflareaccess.com/cdn-cgi/access/certs');
  return new Response(JSON.stringify({ keys: [{ kid: 'k1', kty: jwk.kty, n: jwk.n, e: jwk.e }] }));
};
const request = (token) => ({
  headers: { get: (name) => (name === 'cf-access-jwt-assertion' ? token : null) },
});
const now = Math.floor(Date.now() / 1000);
const claims = {
  aud: ['aud-tag-1'],
  iss: 'https://teststudio.cloudflareaccess.com',
  exp: now + 300,
  nbf: now - 10,
  email: 'Gab@Wawe.dk',
};

// A valid token yields the verified identity, normalized.
resetAccessKeyCache();
const user = await getAccessUser(request(await sign(claims)), certs);
assert.ok(user, 'valid token verifies');
assert.equal(user.userId, 'access:gab@wawe.dk');
assert.equal(user.email, 'Gab@Wawe.dk');
assert.equal(user.displayName, 'Gab');

// Wrong audience, wrong issuer, expiry, and future nbf are all refused.
for (const bad of [
  { ...claims, aud: ['other-app'] },
  { ...claims, iss: 'https://evil.cloudflareaccess.com' },
  { ...claims, exp: now - 5 },
  { ...claims, nbf: now + 300 },
  { ...claims, email: undefined },
]) {
  resetAccessKeyCache();
  assert.equal(await getAccessUser(request(await sign(bad)), certs), null);
}

// A tampered signature is refused.
resetAccessKeyCache();
const good = await sign(claims);
const tampered = good.slice(0, -6) + 'AAAAAA';
assert.equal(await getAccessUser(request(tampered), certs), null);

// A token signed by an unknown key is refused.
resetAccessKeyCache();
assert.equal(await getAccessUser(request(await sign(claims, 'unknown-kid')), certs), null);

// No token, or missing configuration, yields no user rather than an error.
resetAccessKeyCache();
assert.equal(await getAccessUser(request(null), certs), null);
// The env binding is captured at import, so gate by mutating the same object.
delete settings.STUDIO_ACCESS_TEAM;
resetAccessKeyCache();
assert.equal(await getAccessUser(request(await sign(claims)), certs), null);
settings.STUDIO_ACCESS_TEAM = 'teststudio';

console.log(
  'PASS: Access JWT verification — valid identity normalized, audience/issuer/expiry/nbf/email enforcement, tampered signatures and unknown keys refused, and unconfigured deployments yield no user.',
);
