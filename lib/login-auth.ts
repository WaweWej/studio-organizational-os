// The app's own sign-in: GitHub for the owner, Google for the team. Both are
// standard authorization-code flows with signed state, exchanged server-side;
// nobody gets a session without passing the explicit allowlists:
//
//   STUDIO_GITHUB_CLIENT_ID / STUDIO_GITHUB_CLIENT_SECRET
//   STUDIO_ALLOWED_LOGINS   GitHub usernames, comma-separated
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   (shared with Calendar/Drive)
//   STUDIO_ALLOWED_EMAILS   exact addresses and/or @domain entries
//
// A provider is offered only when its settings exist, and an authenticated
// identity outside the allowlist is told so truthfully.
import { env } from 'cloudflare:workers';
import { AppError } from './validation';
import type { SessionUser } from './session';

type LoginConfig = {
  STUDIO_GITHUB_CLIENT_ID?: string;
  STUDIO_GITHUB_CLIENT_SECRET?: string;
  STUDIO_ALLOWED_LOGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  STUDIO_ALLOWED_EMAILS?: string;
};

const config = () => env as LoginConfig;
const list = (value?: string) =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export function githubLoginConfigured() {
  const c = config();
  return !!(
    c.STUDIO_GITHUB_CLIENT_ID &&
    c.STUDIO_GITHUB_CLIENT_SECRET &&
    list(c.STUDIO_ALLOWED_LOGINS).length
  );
}

export function googleLoginConfigured() {
  const c = config();
  return !!(
    c.GOOGLE_CLIENT_ID &&
    c.GOOGLE_CLIENT_SECRET &&
    list(c.STUDIO_ALLOWED_EMAILS).length
  );
}

export function allowedGitHubLogin(login: string) {
  return list(config().STUDIO_ALLOWED_LOGINS).includes(login.toLowerCase());
}

// Exact addresses match themselves; entries starting with @ admit the domain.
export function allowedEmail(email: string) {
  const normalized = email.toLowerCase();
  const domain = normalized.slice(normalized.indexOf('@'));
  return list(config().STUDIO_ALLOWED_EMAILS).some(
    (entry) => entry === normalized || (entry.startsWith('@') && entry === domain),
  );
}

export function githubAuthorizeUrl(origin: string, state: string) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config().STUDIO_GITHUB_CLIENT_ID!);
  url.searchParams.set('redirect_uri', origin + '/api/auth/github/callback');
  url.searchParams.set('state', state);
  return url.toString();
}

export function googleAuthorizeUrl(origin: string, state: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config().GOOGLE_CLIENT_ID!);
  url.searchParams.set('redirect_uri', origin + '/api/auth/google/callback');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function githubUserFromCode(
  origin: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<SessionUser> {
  const c = config();
  const exchange = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: c.STUDIO_GITHUB_CLIENT_ID,
      client_secret: c.STUDIO_GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: origin + '/api/auth/github/callback',
    }),
  });
  const grant = (await exchange.json()) as { access_token?: string };
  if (!exchange.ok || !grant.access_token)
    throw new AppError('GitHub did not accept the sign-in.', 401);
  const profile = await fetcher('https://api.github.com/user', {
    headers: {
      Authorization: 'Bearer ' + grant.access_token,
      'User-Agent': 'studio',
      Accept: 'application/vnd.github+json',
    },
  });
  const user = (await profile.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
  };
  if (!profile.ok || !user.id || !user.login)
    throw new AppError('GitHub did not accept the sign-in.', 401);
  if (!allowedGitHubLogin(user.login))
    throw new AppError(
      `${user.login} is not on this workspace's sign-in list.`,
      403,
    );
  return {
    userId: 'github:' + user.id,
    displayName: user.login,
    email: '',
    fullName: user.name ?? null,
  };
}

export async function googleUserFromCode(
  origin: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<SessionUser> {
  const c = config();
  const exchange = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.GOOGLE_CLIENT_ID!,
      client_secret: c.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: origin + '/api/auth/google/callback',
    }),
  });
  const grant = (await exchange.json()) as { id_token?: string };
  if (!exchange.ok || !grant.id_token)
    throw new AppError('Google did not accept the sign-in.', 401);
  // The ID token arrives directly from Google's token endpoint over TLS in
  // exchange for our client secret, so its claims are trusted here.
  const claims = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(grant.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        (ch) => ch.charCodeAt(0),
      ),
    ),
  ) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!claims.sub || !claims.email || claims.email_verified !== true)
    throw new AppError('Google did not accept the sign-in.', 401);
  if (!allowedEmail(claims.email))
    throw new AppError(
      `${claims.email} is not on this workspace's sign-in list.`,
      403,
    );
  return {
    userId: 'google:' + claims.sub,
    displayName: claims.email.split('@')[0],
    email: claims.email,
    fullName: claims.name ?? null,
  };
}

export function loginProviders() {
  return {
    github: githubLoginConfigured(),
    google: googleLoginConfigured(),
  };
}

