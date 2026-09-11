import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';

// The app's own sign-in: session tokens, OAuth state, allowlists, and both
// provider exchanges with mocked upstreams.
const settings = {
  STUDIO_GITHUB_CLIENT_ID: 'gh-id',
  STUDIO_GITHUB_CLIENT_SECRET: 'gh-secret',
  STUDIO_ALLOWED_LOGINS: 'WaweWej, partner-dev',
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  STUDIO_ALLOWED_EMAILS: 'gabriel@wawe.dk, @homeymedia.dk',
};
globalThis.__testEnv = settings;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env=globalThis.__testEnv', shortCircuit: true };
  if (specifier === '@/app/chatgpt-auth') return { url: 'data:text/javascript,export async function getChatGPTUser(){return null}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { createSession, sessionUser, signState, verifyState, safeReturnPath } =
  await import('../lib/session.ts');
const {
  allowedEmail,
  allowedGitHubLogin,
  githubUserFromCode,
  googleUserFromCode,
  githubAuthorizeUrl,
  loginProviders,
} = await import('../lib/login-auth.ts');
const { context: c } = testDatabase();
const db = { db: c.db };

// Session round trip through the cookie header.
const cookie = await createSession(db, {
  userId: 'github:1234',
  displayName: 'WaweWej',
  email: '',
  fullName: 'Gabriel',
});
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /Secure/);
assert.match(cookie, /SameSite=Lax/);
const token = cookie.split(';')[0];
const user = await sessionUser(db, 'other=1; ' + token);
assert.equal(user.userId, 'github:1234');
assert.equal(user.displayName, 'WaweWej');

// Tampered tokens and absent cookies yield no user.
assert.equal(await sessionUser(db, token.slice(0, -4) + 'AAAA'), null);
assert.equal(await sessionUser(db, null), null);
assert.equal(await sessionUser(db, 'studio_session=garbage'), null);

// OAuth state round trip with return-path safety.
const state = await verifyState(db, await signState(db, '/spaces?x=1'));
assert.equal(state.returnTo, '/spaces?x=1');
assert.equal((await verifyState(db, 'forged.state')) , null);
assert.equal(safeReturnPath('https://evil.example'), '/');
assert.equal(safeReturnPath('//evil.example'), '/');
assert.equal(safeReturnPath('/api/auth/github'), '/');
assert.equal(safeReturnPath('/signin'), '/');

// Allowlists: usernames case-insensitively; emails exactly or by domain.
assert.equal(allowedGitHubLogin('wawewej'), true);
assert.equal(allowedGitHubLogin('PARTNER-DEV'), true);
assert.equal(allowedGitHubLogin('stranger'), false);
assert.equal(allowedEmail('Gabriel@Wawe.dk'), true);
assert.equal(allowedEmail('viktor@homeymedia.dk'), true);
assert.equal(allowedEmail('gabriel@evil.dk'), false);
assert.equal(allowedEmail('wawe.dk@evil.dk'), false);
assert.equal(loginProviders().github, true);
assert.equal(loginProviders().google, true);

// GitHub exchange: allowlisted login becomes a session identity.
const ghFetch = async (url) => {
  if (String(url).includes('access_token'))
    return Response.json({ access_token: 'tok' });
  return Response.json({ id: 77, login: 'WaweWej', name: 'Gabriel E.' });
};
const gh = await githubUserFromCode('https://studio.example', 'code', ghFetch);
assert.equal(gh.userId, 'github:77');
assert.equal(gh.fullName, 'Gabriel E.');

// A stranger authenticates with GitHub but is refused by the allowlist.
const strangerFetch = async (url) =>
  String(url).includes('access_token')
    ? Response.json({ access_token: 'tok' })
    : Response.json({ id: 1, login: 'stranger' });
await assert.rejects(
  githubUserFromCode('https://studio.example', 'code', strangerFetch),
  /not on this workspace's sign-in list/,
);

// Google exchange: the ID token's verified email becomes the identity.
const idToken = (claims) =>
  'x.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.y';
const gFetch = (claims) => async () =>
  Response.json({ id_token: idToken(claims) });
const g = await googleUserFromCode(
  'https://studio.example',
  'code',
  gFetch({ sub: '555', email: 'viktor@homeymedia.dk', email_verified: true, name: 'Viktor' }),
);
assert.equal(g.userId, 'google:555');
assert.equal(g.displayName, 'viktor');

// Unverified emails and off-list addresses are refused.
await assert.rejects(
  googleUserFromCode('https://studio.example', 'code',
    gFetch({ sub: '556', email: 'viktor@homeymedia.dk', email_verified: false })),
  /did not accept/,
);
await assert.rejects(
  googleUserFromCode('https://studio.example', 'code',
    gFetch({ sub: '557', email: 'someone@gmail.com', email_verified: true })),
  /not on this workspace's sign-in list/,
);

// Authorize URLs carry the exact callback and state.
const authorize = new URL(githubAuthorizeUrl('https://studio.example', 'st4te'));
assert.equal(
  authorize.searchParams.get('redirect_uri'),
  'https://studio.example/api/auth/github/callback',
);
assert.equal(authorize.searchParams.get('state'), 'st4te');

console.log(
  "PASS: session cookies round-trip with tamper refusal, OAuth state with return-path safety, username and email/domain allowlists, both provider exchanges with stranger and unverified-email refusals, and exact callback URLs.",
);
