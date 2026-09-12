import type { Context } from './store';
import type { GoogleCalendar, GoogleConnection } from './google-calendar-types';
import { AppError } from './validation';

export type GoogleConfig = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_TOKEN_KEY?: string;
  GOOGLE_REDIRECT_URI?: string;
};
export const googleScopes = [
  'calendar.calendarlist.readonly',
  'calendar.events.readonly',
  'calendar.app.created',
].map((s) => 'https://www.googleapis.com/auth/' + s);
// Drive access is a separately approved extension of the same account link.
// drive.file covers the Studio folder tree and uploads; drive.readonly covers
// browsing and attaching existing files.
export const driveScopes = [
  'drive.file',
  'drive.readonly',
].map((s) => 'https://www.googleapis.com/auth/' + s);
const encoder = new TextEncoder();
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unbase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const url64 = (bytes: Uint8Array) =>
  base64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const randomSecret = () =>
  url64(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function googleConfigured(config: GoogleConfig) {
  try {
    return !!(
      config.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com') &&
      config.GOOGLE_CLIENT_SECRET &&
      unbase64(config.GOOGLE_TOKEN_KEY || '').length === 32 &&
      new URL(config.GOOGLE_REDIRECT_URI || '').pathname ===
        '/api/google-calendar/callback'
    );
  } catch {
    return false;
  }
}
export function requireGoogleConfig(config: GoogleConfig) {
  if (!googleConfigured(config))
    throw new AppError(
      'Google Calendar setup is not finished. Configure Studio’s Google connection first.',
      503,
    );
}
export async function seal(config: GoogleConfig, value: string, scope: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    unbase64(config.GOOGLE_TOKEN_KEY!),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(scope) },
    key,
    encoder.encode(value),
  );
  return base64(iv) + '.' + base64(new Uint8Array(encrypted));
}
export async function unseal(
  config: GoogleConfig,
  value: string,
  scope: string,
) {
  const [iv, body] = value.split('.');
  const key = await crypto.subtle.importKey(
    'raw',
    unbase64(config.GOOGLE_TOKEN_KEY!),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unbase64(iv),
        additionalData: encoder.encode(scope),
      },
      key,
      unbase64(body),
    ),
  );
}
export const tokenScope = (c: Pick<Context, 'org' | 'actor'>) =>
  JSON.stringify(['google-token-v1', c.org, c.actor]);
export async function googleConnection(c: Context) {
  return c.db
    .prepare('SELECT * FROM googleConnections WHERE org=? AND actor=?')
    .bind(c.org, c.actor)
    .first<GoogleConnection>();
}
export class GoogleError extends AppError {
  googleStatus: number;
  oauthCode?: string;
  constructor(googleStatus: number, oauthCode?: string) {
    super(
      googleStatus === 401
        ? 'Google access expired. Reconnect Google Calendar.'
        : googleStatus === 403
          ? 'Google refused access. Check Calendar API access and the permissions you approved.'
          : googleStatus === 429
            ? 'Google is busy. Try syncing again shortly.'
            : oauthCode === 'invalid_client'
              ? 'Google rejected this app\u2019s credentials (invalid_client). Check GOOGLE_CLIENT_ID and re-enter GOOGLE_CLIENT_SECRET.'
              : oauthCode === 'redirect_uri_mismatch'
                ? 'Google rejected the redirect address (redirect_uri_mismatch). GOOGLE_REDIRECT_URI must exactly match an authorized redirect URI in Google Cloud.'
                : oauthCode === 'invalid_grant'
                  ? 'The Google sign-in code expired or was already used (invalid_grant). Start the connection again.'
                  : oauthCode
                    ? `Google refused the connection (${oauthCode}).`
                    : 'Google Calendar could not be reached. Your Studio work is saved; try syncing again.',
      502,
    );
    this.googleStatus = googleStatus;
    this.oauthCode = oauthCode;
  }
}
// Fixed origins, no redirects, bounded responses, and no provider response bodies in errors/logs.
export async function googleRequest<T>(
  url: string,
  init: RequestInit & { oauthErrorCode?: boolean } = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !['oauth2.googleapis.com', 'www.googleapis.com'].includes(parsed.hostname)
  )
    throw new AppError('Invalid Google endpoint.');
  const { oauthErrorCode, ...requestInit } = init;
  let response: Response;
  try {
    response = await fetcher(url, {
      ...requestInit,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GoogleError(0);
  }
  if (!response.ok) {
    if (oauthErrorCode) {
      // The OAuth token endpoint's error code (invalid_client,
      // redirect_uri_mismatch, ...) is a short fixed identifier, not
      // provider payload; surfacing it makes configuration mistakes
      // answerable. Anything unexpected is discarded as before.
      try {
        const body = (await response.json()) as { error?: string };
        if (typeof body.error === 'string' && /^[a-z_]{1,40}$/.test(body.error))
          throw new GoogleError(response.status, body.error);
      } catch (e) {
        if (e instanceof GoogleError) throw e;
      }
    } else await response.body?.cancel();
    throw new GoogleError(response.status);
  }
  if (response.status === 204) return undefined as T;
  const reader = response.body?.getReader();
  if (!reader) throw new GoogleError(0);
  let text = '',
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4_000_000) {
      await reader.cancel();
      throw new AppError(
        'This calendar response is too large. Select fewer calendars.',
        502,
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode()) as T;
  } catch {
    throw new GoogleError(0);
  }
}
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};
const tokenRequest = (
  config: GoogleConfig,
  fields: Record<string, string>,
  fetcher: typeof fetch,
) =>
  googleRequest<TokenResponse>(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      oauthErrorCode: true,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID!,
        client_secret: config.GOOGLE_CLIENT_SECRET!,
        ...fields,
      }),
    },
    fetcher,
  );
export async function startGoogle(
  c: Context,
  config: GoogleConfig,
  browserSecret: string,
  withDrive = false,
) {
  requireGoogleConfig(config);
  const state = randomSecret(),
    verifier = randomSecret();
  const challenge = url64(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(verifier)),
    ),
  );
  await c.db.batch([
    c.db
      .prepare(
        'DELETE FROM googleOAuthStates WHERE expires<? OR (org=? AND actor=?)',
      )
      .bind(Date.now(), c.org, c.actor),
    c.db
      .prepare(
        'INSERT INTO googleOAuthStates (org,actor,id,browserHash,verifier,expires) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        c.org,
        c.actor,
        await digest(state),
        await digest(browserSecret),
        await seal(config, verifier, tokenScope(c)),
        Date.now() + 600_000,
      ),
  ]);
  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID!,
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
      response_type: 'code',
      scope: (withDrive ? [...googleScopes, ...driveScopes] : googleScopes).join(
        ' ',
      ),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
  );
}
export async function finishGoogle(
  c: Context,
  config: GoogleConfig,
  state: string,
  browserSecret: string,
  code: string,
  fetcher: typeof fetch = fetch,
) {
  requireGoogleConfig(config);
  if (
    !state ||
    !browserSecret ||
    !code ||
    state.length > 200 ||
    code.length > 4096
  )
    throw new AppError('Google connection expired. Start again.', 403);
  const id = await digest(state);
  const row = await c.db
    .prepare(
      'SELECT * FROM googleOAuthStates WHERE org=? AND actor=? AND id=? AND browserHash=? AND expires>?',
    )
    .bind(c.org, c.actor, id, await digest(browserSecret), Date.now())
    .first<{ verifier: string }>();
  if (!row) throw new AppError('Google connection expired. Start again.', 403);
  const claim = await c.db
    .prepare('DELETE FROM googleOAuthStates WHERE org=? AND actor=? AND id=?')
    .bind(c.org, c.actor, id)
    .run();
  if (!claim.meta.changes)
    throw new AppError('This connection was already used. Start again.', 409);
  const tokens = await tokenRequest(
    config,
    {
      code,
      code_verifier: await unseal(config, row.verifier, tokenScope(c)),
      grant_type: 'authorization_code',
      redirect_uri: config.GOOGLE_REDIRECT_URI!,
    },
    fetcher,
  );
  if (
    !tokens.refresh_token ||
    !tokens.access_token ||
    !googleScopes.every((s) => tokens.scope?.split(' ').includes(s))
  )
    throw new AppError(
      'Approve all three calendar permissions to connect Studio. Please reconnect.',
      403,
    );
  const calendars = await listGoogleCalendars(tokens.access_token, fetcher);
  const primary = calendars.find((g) => g.primary);
  if (!primary)
    throw new AppError('Google did not return your primary calendar.', 502);
  const previous = await googleConnection(c);
  if (previous && previous.account !== primary.id)
    throw new AppError(
      'This workspace is linked to another Google account. Reconnect the same account to preserve its calendar links.',
      409,
    );
  if (previous && previous.leaseUntil > Date.now())
    throw new AppError('A sync is running. Wait before reconnecting.', 409);
  const grantedScopes = (tokens.scope || '')
    .split(' ')
    .filter((s) => s.startsWith('https://www.googleapis.com/auth/'))
    .sort()
    .join(' ');
  const saved = await c.db
    .prepare(`INSERT INTO googleConnections (org,actor,token,account,selected,timeZone,scopes) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(org,actor) DO UPDATE SET token=excluded.token,status='connected',error='',scopes=excluded.scopes WHERE googleConnections.leaseUntil<?`)
    .bind(
      c.org,
      c.actor,
      await seal(config, tokens.refresh_token, tokenScope(c)),
      primary.id,
      JSON.stringify([primary.id]),
      primary.timeZone || 'UTC',
      grantedScopes,
      Date.now(),
    )
    .run();
  if (!saved.meta.changes)
    throw new AppError('A sync is running. Wait before reconnecting.', 409);
}
export async function accessToken(
  c: Context,
  config: GoogleConfig,
  connection: GoogleConnection,
  fetcher: typeof fetch = fetch,
) {
  requireGoogleConfig(config);
  try {
    const tokens = await tokenRequest(
      config,
      {
        refresh_token: await unseal(config, connection.token, tokenScope(c)),
        grant_type: 'refresh_token',
      },
      fetcher,
    );
    if (!tokens.access_token) throw new GoogleError(401);
    return tokens.access_token;
  } catch (error) {
    if (
      error instanceof GoogleError &&
      [400, 401].includes(error.googleStatus)
    ) {
      await c.db
        .prepare(
          "UPDATE googleConnections SET status='reconnect',error=? WHERE org=? AND actor=? AND token=?",
        )
        .bind(
          'Google access expired. Reconnect Google Calendar.',
          c.org,
          c.actor,
          connection.token,
        )
        .run();
      throw new GoogleError(401);
    }
    throw error;
  }
}
export async function listGoogleCalendars(
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const items: GoogleCalendar[] = [];
  let page = '';
  do {
    const result = await googleRequest<{
      items?: GoogleCalendar[];
      nextPageToken?: string;
    }>(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?' +
        new URLSearchParams({
          maxResults: '100',
          ...(page ? { pageToken: page } : {}),
        }),
      { headers: { Authorization: 'Bearer ' + token } },
      fetcher,
    );
    items.push(...(result.items || []));
    page = result.nextPageToken || '';
    if (items.length > 500)
      throw new AppError('Too many Google calendars to load.', 502);
  } while (page);
  return items;
}
