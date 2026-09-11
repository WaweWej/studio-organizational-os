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
