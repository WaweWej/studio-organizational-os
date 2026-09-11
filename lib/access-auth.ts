// Identity for self-hosted deployments behind Cloudflare Access. Access
// authenticates the visitor at the edge and attaches a signed JWT; this module
// verifies that signature against the team's published keys and the
// application audience before trusting any identity. Both settings must be
// configured explicitly — nothing is inferred from forwardable headers — and
// without them self-hosted requests simply have no user, which the workspace
// treats as signed out.
//
//   STUDIO_ACCESS_TEAM  team domain, e.g. mystudio (of mystudio.cloudflareaccess.com)
//   STUDIO_ACCESS_AUD   the Access application's audience tag
import { env } from 'cloudflare:workers';

export type AccessUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

type AccessConfig = {
  STUDIO_ACCESS_TEAM?: string;
  STUDIO_ACCESS_AUD?: string;
};

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };

// Published signing keys, cached per isolate with a modest lifetime so key
// rotation is picked up without fetching on every request.
let cachedKeys: { fetched: number; keys: Jwk[] } | null = null;
const KEY_LIFETIME = 10 * 60 * 1000;

async function signingKeys(
  team: string,
  fetchCerts: typeof fetch,
): Promise<Jwk[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetched < KEY_LIFETIME)
    return cachedKeys.keys;
  const response = await fetchCerts(
    `https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`,
  );
  if (!response.ok) return cachedKeys?.keys ?? [];
  const body = (await response.json()) as { keys?: Jwk[] };
  cachedKeys = { fetched: Date.now(), keys: body.keys ?? [] };
  return cachedKeys.keys;
}

const decode = (part: string) =>
  Uint8Array.from(
    atob(part.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );

export async function getAccessUser(
  request: { headers: { get(name: string): string | null } },
  fetchCerts: typeof fetch = fetch,
): Promise<AccessUser | null> {
  const config = env as AccessConfig;
  const team = (config.STUDIO_ACCESS_TEAM || '').trim();
  const audience = (config.STUDIO_ACCESS_AUD || '').trim();
  if (!team || !audience) return null;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;
  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(headerPart))) as {
      kid?: string;
      alg?: string;
    };
    if (header.alg !== 'RS256') return null;
    const keys = await signingKeys(team, fetchCerts);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      decode(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;
    const claims = JSON.parse(
      new TextDecoder().decode(decode(payloadPart)),
    ) as {
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
      email?: string;
      sub?: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud)
      ? claims.aud
      : claims.aud
        ? [claims.aud]
        : [];
    if (
      !audiences.includes(audience) ||
      claims.iss !== `https://${team}.cloudflareaccess.com` ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now ||
      (typeof claims.nbf === 'number' && claims.nbf > now) ||
      !claims.email
    )
      return null;
    return {
      userId: 'access:' + claims.email.toLowerCase(),
      displayName: claims.email.split('@')[0],
      email: claims.email,
      fullName: null,
    };
  } catch {
    return null;
  }
}

// Test seam: reset the per-isolate key cache.
export function resetAccessKeyCache() {
  cachedKeys = null;
}
