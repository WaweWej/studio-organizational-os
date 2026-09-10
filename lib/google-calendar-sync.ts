import type { Context } from './store';
import type { Workspace, CalendarEvent } from './model';
import type {
  GoogleCalendarStatus,
  GoogleEvent,
} from './google-calendar-types';
import {
  accessToken,
  digest,
  googleConfigured,
  googleConnection,
  GoogleError,
  googleRequest,
  listGoogleCalendars,
  type GoogleConfig,
} from './google-calendar-auth';
import { AppError } from './validation';
import { calendarEntries } from './calendar-model';

export async function googleStatus(
  c: Context,
  config: GoogleConfig,
): Promise<GoogleCalendarStatus> {
  const row = await googleConnection(c);
  return {
    configured: googleConfigured(config),
    connected: !!row?.token,
    status: row?.status || 'disconnected',
    account: row?.account || '',
    calendarId: row?.calendarId || '',
    selected: row ? JSON.parse(row.selected) : [],
    timeZone: row?.timeZone || 'UTC',
    lastSync: row?.lastSync || '',
    error: row?.error || '',
  };
}
export function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100)
    throw new AppError('Choose a time zone.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
  } catch {
    throw new AppError('Choose a valid time zone.');
  }
  return value;
}
export function inZone(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
export function windowFor(now = new Date()) {
  return {
    timeMin: new Date(now.getTime() - 90 * 86400000).toISOString(),
    timeMax: new Date(now.getTime() + 366 * 86400000).toISOString(),
  };
}
export function normalizeGoogleEvent(event: GoogleEvent, zone: string) {
  if (!event.id || event.id.length > 1024)
    throw new AppError('Google returned an invalid event.', 502);
  if (
    event.status === 'cancelled' ||
    event.attendees?.some((a) => a.self && a.responseStatus === 'declined')
  )
    return null;
  const start = event.start?.dateTime || event.start?.date,
    end = event.end?.dateTime || event.end?.date;
  if (
    !start ||
    !end ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end))
  )
    throw new AppError('Google returned an event without valid dates.', 502);
  const local = event.start?.date
    ? { date: start, time: '' }
    : inZone(start, zone);
  let url = '';
  try {
    const parsed = new URL(event.htmlLink || '');
    if (
      parsed.protocol === 'https:' &&
      ['www.google.com', 'calendar.google.com'].includes(parsed.hostname)
    )
      url = parsed.href;
  } catch {
    /* No external link. */
  }
  return {
    title: (event.summary || 'Busy').slice(0, 180),
    description: (event.description || '').slice(0, 10000),
    ...local,
    googleStart: start,
    googleEnd: end,
    googleUrl: url,
  };
}
// Fetch the complete rolling window before changing stored events. A failed page
// never implies an event was deleted. Expansion handles recurring exceptions.
export async function fetchGoogleEvents(
  token: string,
  calendarId: string,
  zone: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  let page = '',
    pageCount = 0;
  const items: GoogleEvent[] = [];
  do {
    if (++pageCount > 40)
      throw new AppError(
        'Google returned too many calendar pages. Select a smaller calendar.',
        502,
      );
    const query = new URLSearchParams({
      ...windowFor(now),
      singleEvents: 'true',
      showDeleted: 'true',
      maxResults: '100',
      timeZone: zone,
      ...(page ? { pageToken: page } : {}),
    });
    const result = await googleRequest<{
      items?: GoogleEvent[];
      nextPageToken?: string;
    }>(
      'https://www.googleapis.com/calendar/v3/calendars/' +
        encodeURIComponent(calendarId) +
        '/events?' +
        query,
      { headers: { Authorization: 'Bearer ' + token } },
      fetcher,
    );
    items.push(...(result.items || []));
    page = result.nextPageToken || '';
    if (items.length > 3000)
      throw new AppError(
        'This calendar has too many events in the sync window. Select a smaller calendar.',
        502,
      );
  } while (page);
  return items;
}
export async function importGoogleEvents(
  c: Context,
  calendarId: string,
  events: GoogleEvent[],
  zone: string,
  now = new Date(),
) {
  const current = (
    await c.db
      .prepare(
        'SELECT * FROM calendarEvents WHERE org=? AND actor=? AND googleCalendarId=?',
      )
      .bind(c.org, c.actor, calendarId)
      .all<CalendarEvent>()
  ).results;
  const remaining = new Map(current.map((e) => [e.googleEventId, e]));
  const writes: D1PreparedStatement[] = [],
    timestamp = now.toISOString();
  for (const event of events) {
    const old = remaining.get(event.id);
    remaining.delete(event.id);
    const value = normalizeGoogleEvent(event, zone);
    if (!value) {
      if (old && !old.archived) archive(old);
      continue;
    }
    const id =
      old?.id ||
      'g' +
        (await digest(JSON.stringify([c.org, c.actor, calendarId, event.id])));
    const fingerprint = JSON.stringify(value);
    if (
      old &&
      !old.archived &&
      old.title === value.title &&
      old.description === value.description &&
      old.googleStart === value.googleStart &&
      old.googleEnd === value.googleEnd &&
      old.googleUrl === value.googleUrl &&
      old.date === value.date &&
      old.time === value.time
    )
      continue;
    const nonce = crypto.randomUUID();
    writes.push(
      c.db
        .prepare(`INSERT INTO calendarEvents (org,id,title,kind,date,time,description,revision,archived,actor,createdAt,updatedAt,fingerprint,lastMutation,googleCalendarId,googleEventId,googleUrl,googleStart,googleEnd)
      VALUES (?,?,?,'meeting',?,?,?,0,0,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(org,id) DO UPDATE SET title=excluded.title,date=excluded.date,time=excluded.time,description=excluded.description,archived=0,revision=calendarEvents.revision+1,updatedAt=excluded.updatedAt,fingerprint=excluded.fingerprint,lastMutation=excluded.lastMutation,googleUrl=excluded.googleUrl,googleStart=excluded.googleStart,googleEnd=excluded.googleEnd`)
        .bind(
          c.org,
          id,
          value.title,
          value.date,
          value.time,
          value.description,
          c.actor,
          timestamp,
          timestamp,
          fingerprint,
          nonce,
          calendarId,
          event.id,
          value.googleUrl,
          value.googleStart,
          value.googleEnd,
        ),
    );
    writes.push(
      c.db
        .prepare(
          `INSERT INTO calendarHistory (org,id,eventId,snapshot,actor,createdAt) VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          id,
          JSON.stringify({
            action: 'google-sync',
            previous: old || null,
            ...value,
          }),
          c.actor,
          timestamp,
        ),
    );
    // Notes, decisions, participants, client/prospect links and meeting IDs stay
    // canonical. SQL reads their latest values; a concurrent note save is not lost.
    if (old?.meetingId) {
      writes.push(meetingHistory(old, 'Google updated the meeting schedule'));
      writes.push(
        c.db
          .prepare(
            `UPDATE meetings SET title=?,startsAt=?,status=CASE WHEN status='Cancelled' THEN 'Planned' ELSE status END,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=?`,
          )
          .bind(
            value.title,
            event.start?.dateTime
              ? new Date(value.googleStart).toISOString()
              : oldMeetingStart(value.date),
            timestamp,
            nonce,
            c.org,
            old.meetingId,
          ),
      );
    }
  }
  const bounds = windowFor(now);
  for (const old of remaining.values()) {
    if (
      !old.archived &&
      old.googleStart &&
      old.googleStart >= bounds.timeMin.slice(0, 10) &&
      old.googleStart < bounds.timeMax
    )
      archive(old);
  }
  function oldMeetingStart(date: string) {
    return new Date(date + 'T12:00:00Z').toISOString();
  }
  function meetingHistory(old: CalendarEvent, body: string) {
    return c.db
      .prepare(
        `INSERT INTO spaceEvents (org,id,spaceId,prospectId,meetingId,body,snapshot,actor,createdAt) SELECT org,?,spaceId,prospectId,id,?,json_object('title',title,'startsAt',startsAt,'status',status,'notes',notes,'decisions',decisions),?,? FROM meetings WHERE org=? AND id=?`,
      )
      .bind(
        crypto.randomUUID(),
        body,
        c.actor,
        timestamp,
        c.org,
        old.meetingId!,
      );
  }
  function archive(old: CalendarEvent) {
    writes.push(
      c.db
        .prepare(
          'UPDATE calendarEvents SET archived=1,revision=revision+1,updatedAt=? WHERE org=? AND id=? AND actor=?',
        )
        .bind(timestamp, c.org, old.id, c.actor),
    );
    writes.push(
      c.db
        .prepare(
          'INSERT INTO calendarHistory (org,id,eventId,snapshot,actor,createdAt) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          old.id,
          JSON.stringify({ action: 'google-cancelled', previous: old }),
          c.actor,
          timestamp,
        ),
    );
    if (old.meetingId) {
      writes.push(
        meetingHistory(old, 'Google cancelled the meeting; notes retained'),
      );
      writes.push(
        c.db
          .prepare(
            "UPDATE meetings SET status='Cancelled',revision=revision+1,updatedAt=? WHERE org=? AND id=? AND status='Planned'",
          )
          .bind(timestamp, c.org, old.meetingId),
      );
    }
  }
  if (writes.length) await c.db.batch(writes);
  return writes.length > 0;
}

// Native Studio records own their exported copies. No notes, task briefs,
// attendees or decisions are exported and no invitations are generated.
export function studioExports(data: Workspace, zone: string, origin: string) {
  const importedMeetings = new Set(
    data.calendarEvents
      ?.filter((e) => e.googleEventId && e.meetingId)
      .map((e) => e.meetingId),
  );
  return calendarEntries(data)
    .filter(
      (e) =>
        e.due &&
        !e.complete &&
        !e.googleUrl &&
        !(
          e.source === 'calendar' &&
          data.calendarEvents?.find((g) => g.id === e.id)?.googleEventId
        ) &&
        !(e.source === 'meeting' && importedMeetings.has(e.id)) &&
        (e.kind !== 'task' || e.ownerId === data.currentMember),
    )
    .map((e) => {
      const meeting =
        e.source === 'meeting'
          ? data.meetings.find((m) => m.id === e.id)
          : undefined;
      let start: Record<string, string>, end: Record<string, string>;
      if (meeting) {
        start = { dateTime: meeting.startsAt };
        end = {
          dateTime: new Date(
            Date.parse(meeting.startsAt) + 3600000,
          ).toISOString(),
        };
      } else if (e.time) {
        // Google resolves wall-clock values using the explicit IANA time zone.
        start = { dateTime: e.due + 'T' + e.time + ':00', timeZone: zone };
        const next = new Date(e.due + 'T' + e.time + ':00Z');
        next.setUTCMinutes(
          next.getUTCMinutes() +
            (e.kind === 'meeting' || e.kind === 'event' ? 60 : 15),
        );
        end = { dateTime: next.toISOString().slice(0, 19), timeZone: zone };
      } else {
        start = { date: e.due };
        end = {
          date: new Date(Date.parse(e.due + 'T12:00:00Z') + 86400000)
            .toISOString()
            .slice(0, 10),
        };
      }
      const url = new URL('/?view=calendar', origin);
      if (e.kind === 'task') url.searchParams.set('task', e.id);
      if (e.kind === 'project') url.searchParams.set('project', e.id);
      return {
        key: e.key,
        payload: {
          summary: e.title,
          start,
          end,
          description:
            'Open in Studio: ' +
            url.href +
            '\nEdit this item in Studio to keep its connected work up to date.',
          transparency:
            e.kind === 'task' || e.kind === 'project' || e.kind === 'deadline'
              ? 'transparent'
              : 'opaque',
          reminders: { useDefault: false },
          extendedProperties: { private: { studioKey: e.key } },
        },
      };
    });
}
export async function syncGoogle(
  c: Context,
  config: GoogleConfig,
  data: Workspace,
  origin: string,
  force = false,
  fetcher: typeof fetch = fetch,
) {
  const connection = await googleConnection(c);
  if (
    !connection?.token ||
    connection.status === 'reconnect' ||
    !googleConfigured(config)
  )
    return false;
  if (
    !force &&
    Date.now() - Date.parse(connection.lastSync || '1970-01-01') < 60000
  )
    return false;
  const lease = crypto.randomUUID();
  const claim = await c.db
    .prepare(
      "UPDATE googleConnections SET lease=?,leaseUntil=? WHERE org=? AND actor=? AND leaseUntil<? AND token=? AND selected=? AND timeZone=? AND status='connected'",
    )
    .bind(
      lease,
      Date.now() + 240000,
      c.org,
      c.actor,
      Date.now(),
      connection.token,
      connection.selected,
      connection.timeZone,
    )
    .run();
  if (!claim.meta.changes) return false;
  const began = Date.now();
  async function ownLease() {
    if (Date.now() - began > 180000)
      throw new AppError(
        'Sync is taking longer than expected. Try again to continue.',
        502,
      );
    const live = await googleConnection(c);
    if (live?.lease !== lease)
      throw new AppError(
        'The calendar connection changed. Please refresh.',
        409,
      );
  }
  try {
    const token = await accessToken(c, config, connection, fetcher);
    const headers = {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    };
    const calendars = await listGoogleCalendars(token, fetcher);
    const marker =
      'Studio sync ' + (await digest(JSON.stringify([c.org, c.actor])));
    if (!connection.calendarId) {
      const existing = calendars.find(
        (g) => g.description === marker && g.accessRole === 'owner',
      );
      if (existing) connection.calendarId = existing.id;
      else {
        if (connection.createAttempt)
          throw new AppError(
            'The Studio calendar creation could not be confirmed. Check Google Calendar before trying setup again.',
            409,
          );
        await ownLease();
        await c.db
          .prepare(
            'UPDATE googleConnections SET createAttempt=? WHERE org=? AND actor=? AND lease=?',
          )
          .bind(Date.now(), c.org, c.actor, lease)
          .run();
        const created = await googleRequest<{ id: string }>(
          'https://www.googleapis.com/calendar/v3/calendars',
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              summary: 'Studio',
              description: marker,
              timeZone: connection.timeZone,
            }),
          },
          fetcher,
        );
        if (!created.id) throw new GoogleError(0);
        connection.calendarId = created.id;
      }
      await c.db
        .prepare(
          'UPDATE googleConnections SET calendarId=?,createAttempt=0 WHERE org=? AND actor=? AND lease=?',
        )
        .bind(connection.calendarId, c.org, c.actor, lease)
        .run();
    }
    const selected = JSON.parse(connection.selected) as string[];
    let changed = false;
    for (const calendarId of selected) {
      if (calendarId === connection.calendarId) continue;
      if (
        !calendars.some(
          (g) =>
            g.id === calendarId &&
            ['reader', 'writer', 'owner'].includes(g.accessRole || ''),
        )
      )
        throw new AppError(
          'A selected Google calendar is no longer accessible. Update your calendar selection.',
          409,
        );
      const events = await fetchGoogleEvents(
        token,
        calendarId,
        connection.timeZone,
        fetcher,
      );
      await ownLease();
      changed =
        (await importGoogleEvents(
          c,
          calendarId,
          events,
          connection.timeZone,
        )) || changed;
    }
    // Refresh provenance after imports/linking. This prevents a notes-bearing
    // Google meeting from being exported back as a duplicate Studio meeting.
    const sources = (
      await c.db
        .prepare(
          "SELECT * FROM calendarEvents WHERE org=? AND googleEventId<>''",
        )
        .bind(c.org)
        .all<CalendarEvent>()
    ).results;
    const exportData = {
      ...data,
      calendarEvents: [
        ...(data.calendarEvents || []).filter((e) => !e.googleEventId),
        ...sources,
      ],
    };
    const desired = studioExports(exportData, connection.timeZone, origin);
    const links = (
      await c.db
        .prepare('SELECT * FROM googleExports WHERE org=? AND actor=?')
        .bind(c.org, c.actor)
        .all<{
          sourceKey: string;
          calendarId: string;
          eventId: string;
          fingerprint: string;
        }>()
    ).results;
    const remaining = new Map(links.map((l) => [l.sourceKey, l]));
    if (desired.length > 1000)
      throw new AppError(
        'There are too many Studio entries for one sync.',
        502,
      );
    for (const entry of desired) {
      const previous = remaining.get(entry.key);
      remaining.delete(entry.key);
      const fingerprint = await digest(JSON.stringify(entry.payload));
      if (
        previous?.fingerprint === fingerprint &&
        previous.calendarId === connection.calendarId
      )
        continue;
      await ownLease();
      const restoring = previous?.fingerprint === 'removed';
      const eventId = restoring
        ? crypto.randomUUID().replaceAll('-', '')
        : previous?.eventId ||
          (await digest(JSON.stringify([c.org, c.actor, entry.key])));
      const base =
        'https://www.googleapis.com/calendar/v3/calendars/' +
        encodeURIComponent(connection.calendarId) +
        '/events';
      // Persist new IDs before sending. Restoring completed/archived work must
      // use a fresh ID because Google retains tombstones for deleted events.
      if (!previous || restoring)
        await c.db
          .prepare(
            'INSERT INTO googleExports (org,actor,sourceKey,calendarId,eventId,fingerprint) VALUES (?,?,?,?,?,?) ON CONFLICT(org,actor,sourceKey) DO UPDATE SET calendarId=excluded.calendarId,eventId=excluded.eventId,fingerprint=excluded.fingerprint',
          )
          .bind(
            c.org,
            c.actor,
            entry.key,
            connection.calendarId,
            eventId,
            'pending',
          )
          .run();
      if (!previous || restoring || previous.fingerprint === 'pending') {
        try {
          await googleRequest(
            base + '?sendUpdates=none',
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ id: eventId, ...entry.payload }),
            },
            fetcher,
          );
        } catch (error) {
          if (!(error instanceof GoogleError) || error.googleStatus !== 409)
            throw error;
          await googleRequest(
            base + '/' + eventId + '?sendUpdates=none',
            { method: 'PUT', headers, body: JSON.stringify(entry.payload) },
            fetcher,
          );
        }
      } else
        await googleRequest(
          base + '/' + eventId + '?sendUpdates=none',
          { method: 'PUT', headers, body: JSON.stringify(entry.payload) },
          fetcher,
        );
      await ownLease();
      await c.db
        .prepare(
          'INSERT INTO googleExports (org,actor,sourceKey,calendarId,eventId,fingerprint) VALUES (?,?,?,?,?,?) ON CONFLICT(org,actor,sourceKey) DO UPDATE SET calendarId=excluded.calendarId,eventId=excluded.eventId,fingerprint=excluded.fingerprint',
        )
        .bind(
          c.org,
          c.actor,
          entry.key,
          connection.calendarId,
          eventId,
          fingerprint,
        )
        .run();
    }
    for (const link of remaining.values()) {
      if (link.fingerprint === 'removed') continue;
      await ownLease();
      try {
        await googleRequest(
          'https://www.googleapis.com/calendar/v3/calendars/' +
            encodeURIComponent(link.calendarId) +
            '/events/' +
            encodeURIComponent(link.eventId) +
            '?sendUpdates=none',
          { method: 'DELETE', headers },
          fetcher,
        );
      } catch (error) {
        if (
          !(error instanceof GoogleError) ||
          ![404, 410].includes(error.googleStatus)
        )
          throw error;
      }
      await c.db
        .prepare(
          "UPDATE googleExports SET fingerprint='removed' WHERE org=? AND actor=? AND sourceKey=?",
        )
        .bind(c.org, c.actor, link.sourceKey)
        .run();
    }
    await c.db
      .prepare(
        "UPDATE googleConnections SET lastSync=?,error='',status='connected' WHERE org=? AND actor=? AND lease=?",
      )
      .bind(new Date().toISOString(), c.org, c.actor, lease)
      .run();
    return changed;
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : 'Google sync could not finish. Your Studio work is saved; try again.';
    await c.db
      .prepare(
        'UPDATE googleConnections SET error=? WHERE org=? AND actor=? AND lease=?',
      )
      .bind(message, c.org, c.actor, lease)
      .run();
    throw new AppError(message, 502);
  } finally {
    await c.db
      .prepare(
        "UPDATE googleConnections SET lease='',leaseUntil=0 WHERE org=? AND actor=? AND lease=?",
      )
      .bind(c.org, c.actor, lease)
      .run();
  }
}
