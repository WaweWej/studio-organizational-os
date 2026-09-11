// Sessions for the app's own sign-in. The signing key is generated once and
// kept in the database, so no deployment step has to mint or remember it;
// deleting the row signs everyone out. Tokens are HMAC-SHA256 over the
// identity and expiry, verified with WebCrypto's constant-time verify.
type Context = { db: D1Database };

export type SessionUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const COOKIE = 'studio_session';
const SESSION_DAYS = 30;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (value: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(value.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  ) as Uint8Array<ArrayBuffer>;

async function signingKey(c: Context): Promise<CryptoKey> {
  let row = await c.db
    .prepare("SELECT value FROM authKeys WHERE id='session'")
    .first<{ value: string }>()
    .catch(() => null);
  if (!row) {
    const fresh = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await c.db
      .prepare("INSERT OR IGNORE INTO authKeys (id,value,createdAt) VALUES ('session',?,?)")
      .bind(fresh, new Date().toISOString())
      .run();
    row = await c.db
      .prepare("SELECT value FROM authKeys WHERE id='session'")
      .first<{ value: string }>();
  }
  return crypto.subtle.importKey(
    'raw',
    fromB64url(row!.value),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(c: Context, payload: string): Promise<string> {
  const key = await signingKey(c);
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  return payload + '.' + b64url(new Uint8Array(mac));
}

async function verify(c: Context, token: string): Promise<string | null> {
  const at = token.lastIndexOf('.');
  if (at < 1) return null;
  const payload = token.slice(0, at);
  let mac: Uint8Array<ArrayBuffer>;
  try {
    mac = fromB64url(token.slice(at + 1));
  } catch {
    return null;
  }
  const key = await signingKey(c);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    mac,
    new TextEncoder().encode(payload),
  );
  return valid ? payload : null;
}

// Short-lived signed state for OAuth round trips: nonce, expiry, return path.
export async function signState(c: Context, returnTo: string) {
  const body = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        n: b64url(crypto.getRandomValues(new Uint8Array(12))),
        e: Date.now() + 10 * 60 * 1000,
        r: returnTo,
      }),
    ),
  );
  return sign(c, body);
}

export async function verifyState(
  c: Context,
  state: string,
): Promise<{ returnTo: string } | null> {
  const payload = await verify(c, state);
  if (!payload) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {
      e: number;
      r: string;
    };
    if (typeof data.e !== 'number' || data.e < Date.now()) return null;
    return { returnTo: safeReturnPath(data.r) };
  } catch {
    return null;
  }
}

export async function createSession(
  c: Context,
  user: SessionUser,
): Promise<string> {
  const body = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        u: user.userId,
        d: user.displayName,
        m: user.email,
        f: user.fullName,
        e: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
      }),
    ),
  );
  const token = await sign(c, body);
  return (
    COOKIE +
    '=' +
    token +
    `; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  );
}

export const clearSessionCookie =
  COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export async function sessionUser(
  c: Context,
  cookieHeader: string | null,
): Promise<SessionUser | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE + '='));
  if (!match) return null;
  const payload = await verify(c, match.slice(COOKIE.length + 1));
  if (!payload) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as {
      u: string;
      d: string;
      m: string;
      f: string | null;
      e: number;
    };
    if (typeof data.e !== 'number' || data.e < Date.now()) return null;
    if (!data.u) return null;
    return {
      userId: data.u,
      displayName: data.d || data.m || 'Member',
      email: data.m || '',
      fullName: data.f ?? null,
    };
  } catch {
    return null;
  }
}

// Only same-app relative paths survive the OAuth round trip.
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return '/';
  if (value.startsWith('/api/') || value.startsWith('/signin')) return '/';
  return value;
}
