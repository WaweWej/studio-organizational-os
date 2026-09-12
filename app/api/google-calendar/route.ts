import { env } from 'cloudflare:workers';
import { context, readWorkspace } from '@/lib/store';
import { apiFailure, boundedBody, json, sameOrigin } from '@/lib/api-safety';
import { AppError } from '@/lib/validation';
import {
  accessToken,
  googleConnection,
  listGoogleCalendars,
  randomSecret,
  startGoogle,
  type GoogleConfig,
} from '@/lib/google-calendar-auth';
import {
  googleStatus,
  syncGoogle,
  validTimeZone,
} from '@/lib/google-calendar-sync';
export const dynamic = 'force-dynamic';
const config = () => env as unknown as GoogleConfig;
export async function GET(request: Request) {
  try {
    const c = await context(),
      status = await googleStatus(c, config());
    // Signed-in self-examination of the Google plumbing. Reports shapes and
    // reachability truthfully; never echoes secrets. The token endpoint is
    // probed with a deliberately invalid grant, so a healthy answer is
    // Google's own 400/invalid_grant.
    if (new URL(request.url).searchParams.get('action') === 'diagnose') {
      const raw = config();
      const { cleanGoogleConfig, googleConfigured } = await import(
        '@/lib/google-calendar-auth'
      );
      const cleaned = cleanGoogleConfig(raw);
      const report: Record<string, unknown> = {
        configured: googleConfigured(raw),
        clientIdShape: cleaned.GOOGLE_CLIENT_ID
          ? cleaned.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')
            ? 'ok'
            : 'does not end with .apps.googleusercontent.com'
          : 'missing',
        clientSecret: cleaned.GOOGLE_CLIENT_SECRET ? 'present' : 'missing',
        redirectUri: cleaned.GOOGLE_REDIRECT_URI || 'missing',
        tokenKey: (() => {
          try {
            const bytes = atob(
              (cleaned.GOOGLE_TOKEN_KEY || '')
                .replace(/-/g, '+')
                .replace(/_/g, '/'),
            ).length;
            return bytes === 32 ? 'ok (32 bytes)' : `wrong length (${bytes} bytes)`;
          } catch {
            return 'not valid base64';
          }
        })(),
      };
      try {
        const { seal, unseal } = await import('@/lib/google-calendar-auth');
        const sealed = await seal(cleaned, 'diagnostic-probe', 'diag');
        report.tokenKeyCrypto =
          (await unseal(cleaned, sealed, 'diag')) === 'diagnostic-probe'
            ? 'ok'
            : 'round-trip mismatch';
      } catch (e) {
        report.tokenKeyCrypto =
          'failed: ' + (e instanceof Error ? e.name + ' ' + e.message : String(e));
      }
      try {
        const probe = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cleaned.GOOGLE_CLIENT_ID || 'missing',
            client_secret: cleaned.GOOGLE_CLIENT_SECRET || 'missing',
            grant_type: 'authorization_code',
            code: 'diagnostic-probe',
            redirect_uri: cleaned.GOOGLE_REDIRECT_URI || 'https://example.com',
          }),
          signal: AbortSignal.timeout(10000),
        });
        const body = (await probe.json().catch(() => ({}))) as {
          error?: string;
        };
        report.tokenEndpoint = {
          status: probe.status,
          error: body.error || null,
          verdict:
            probe.status === 400 && body.error === 'invalid_grant'
              ? 'healthy: Google reachable and this client is recognized'
              : body.error === 'invalid_client'
                ? 'Google does not recognize GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET'
                : 'unexpected',
        };
      } catch (e) {
        report.tokenEndpoint = {
          status: 0,
          verdict:
            'unreachable from this worker: ' +
            (e instanceof Error ? e.name + ' ' + e.message : String(e)),
        };
      }
      try {
        const reach = await fetch(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList',
          {
            headers: { Authorization: 'Bearer diagnostic-probe' },
            signal: AbortSignal.timeout(10000),
          },
        );
        await reach.body?.cancel();
        report.calendarApi = {
          status: reach.status,
          verdict:
            reach.status === 401
              ? 'healthy: reachable (rejects the probe token as expected)'
              : 'unexpected',
        };
      } catch (e) {
        report.calendarApi = {
          status: 0,
          verdict:
            'unreachable from this worker: ' +
            (e instanceof Error ? e.name + ' ' + e.message : String(e)),
        };
      }
      return json(report);
    }
    if (
      new URL(request.url).searchParams.get('calendars') === '1' &&
      status.connected
    ) {
      const connection = (await googleConnection(c))!;
      const token = await accessToken(c, config(), connection);
      const calendars = (await listGoogleCalendars(token))
        .filter(
          (g) =>
            g.id !== connection.calendarId &&
            ['owner', 'writer', 'reader'].includes(g.accessRole || ''),
        )
        .map((g) => ({
          id: g.id,
          summary: g.summary || g.id,
          primary: g.primary || false,
        }));
      return json({ ...status, calendars });
    }
    return json(status);
  } catch (error) {
    return apiFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw new AppError('JSON is required.', 415);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 20000)),
      );
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Invalid request.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new AppError('Invalid request.');
    const c = await context(),
      cfg = config();
    if (input.action === 'connect') {
      const redirect = new URL(
        cfg.GOOGLE_REDIRECT_URI || 'https://invalid.invalid',
      );
      if (
        redirect.origin !== new URL(request.url).origin ||
        (redirect.protocol !== 'https:' && !import.meta.env.DEV)
      )
        throw new AppError(
          'Google’s redirect address does not match this Studio site.',
          503,
        );
      const secret = randomSecret(),
        url = await startGoogle(c, cfg, secret, input.drive === true);
      const response = json({ url });
      response.headers.set(
        'Set-Cookie',
        `studio_google=${secret}; HttpOnly; SameSite=Lax; Path=/api/google-calendar; Max-Age=600${redirect.protocol === 'https:' ? '; Secure' : ''}`,
      );
      return response;
    }
    const connection = await googleConnection(c);
    if (!connection) throw new AppError('Connect Google Calendar first.', 409);
    if (input.action === 'sync') {
      await syncGoogle(
        c,
        cfg,
        await readWorkspace(c),
        new URL(request.url).origin,
        input.force === true,
      );
      return json(await googleStatus(c, cfg));
    }
    if (connection.leaseUntil > Date.now())
      throw new AppError('A sync is running. Try again when it finishes.', 409);
    if (input.action === 'preferences') {
      if (
        !Array.isArray(input.selected) ||
        input.selected.length > 10 ||
        !input.selected.every(
          (id) => typeof id === 'string' && id.length <= 1024,
        )
      )
        throw new AppError('Select up to 10 calendars.');
      const selected = [...new Set(input.selected as string[])],
        timeZone = validTimeZone(input.timeZone);
      const token = await accessToken(c, cfg, connection),
        available = await listGoogleCalendars(token);
      if (
        selected.some(
          (id) =>
            id === connection.calendarId ||
            !available.some(
              (g) =>
                g.id === id &&
                ['owner', 'writer', 'reader'].includes(g.accessRole || ''),
            ),
        )
      )
        throw new AppError(
          'Choose calendars available to this Google account.',
        );
      const result = await c.db
        .prepare(
          "UPDATE googleConnections SET selected=?,timeZone=?,lastSync='' WHERE org=? AND actor=? AND leaseUntil<?",
        )
        .bind(JSON.stringify(selected), timeZone, c.org, c.actor, Date.now())
        .run();
      if (!result.meta.changes)
        throw new AppError('A sync started. Try again when it finishes.', 409);
      // Deselecting hides a feed but does not cancel meetings or erase notes.
      return json(await googleStatus(c, cfg));
    }
    if (input.action === 'disconnect') {
      // Serialize against sync. Imported sources and notes remain locally so
      // reconnection retains their canonical IDs; disconnected feeds are hidden.
      const result = await c.db
        .prepare(
          "UPDATE googleConnections SET token='',status='disconnected',error='',lastSync='' WHERE org=? AND actor=? AND leaseUntil<?",
        )
        .bind(c.org, c.actor, Date.now())
        .run();
      if (!result.meta.changes)
        throw new AppError('A sync started. Try again when it finishes.', 409);
      await c.db
        .prepare('DELETE FROM googleOAuthStates WHERE org=? AND actor=?')
        .bind(c.org, c.actor)
        .run();
      return json(await googleStatus(c, cfg));
    }
    throw new AppError('Unknown Google Calendar action.');
  } catch (error) {
    return apiFailure(error);
  }
}
