import type { Context } from './store';
import type { CalendarEvent, Meeting } from './model';
import { AppError, textValue, dateValue, revisionValue } from './validation';
import { mutateClient } from './client-store';

export function timeValue(value: unknown) {
  const time = textValue(value, 'Time', 5);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new AppError('Choose a valid time.');
  return time;
}
export async function mutateCalendar(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.id, 'Calendar entry', 100, true);
  if (input.type === 'calendar-meeting-time') {
    const meeting = await c.db
      .prepare('SELECT * FROM meetings WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<Meeting>();
    if (!meeting) throw new AppError('Meeting not found.', 404);
    await mutateClient(c, {
      ...meeting,
      type: 'meeting-edit',
      revision: input.revision,
      startsAt: input.startsAt,
    });
    return;
  }
  const now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  const existing = await c.db
    .prepare('SELECT * FROM calendarEvents WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<CalendarEvent & { fingerprint: string }>();
  if (existing?.googleEventId)
    throw new AppError(
      'Edit this meeting in Google Calendar. Studio keeps its notes and connections.',
      409,
    );
  if (existing?.meetingId)
    throw new AppError(
      'Open the linked meeting to change its notes or schedule.',
      409,
    );
  if (input.type === 'calendar-remove') {
    const revision = revisionValue(input.revision);
    const result = await c.db.batch([
      c.db
        .prepare(
          'UPDATE calendarEvents SET archived=1,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND archived=0',
        )
        .bind(now, nonce, c.org, id, revision),
      c.db
        .prepare(
          'INSERT INTO calendarHistory (org,id,eventId,snapshot,actor,createdAt) SELECT org,?,id,?,?,? FROM calendarEvents WHERE org=? AND id=? AND lastMutation=?',
        )
        .bind(
          nonce,
          JSON.stringify({ action: 'removed', previous: existing }),
          c.actor,
          now,
          c.org,
          id,
          nonce,
        ),
    ]);
    if (
      !result[0].meta.changes &&
      !(existing?.archived && existing.revision === revision + 1)
    )
      throw new AppError('This entry changed. Reopen it to refresh.', 409);
    return;
  }
  if (input.type !== 'calendar-save')
    throw new AppError('Unknown calendar action.');
  const title = textValue(input.title, 'Title', 180, true);
  const date = dateValue(input.date);
  if (!date) throw new AppError('Choose a date.');
  const time = timeValue(input.time ?? '');
  const kind = textValue(input.kind, 'Entry type', 20, true);
  if (!['event', 'meeting', 'deadline'].includes(kind))
    throw new AppError('Choose an event, meeting or deadline.');
  const description = textValue(input.description ?? '', 'Notes', 10000);
  const fingerprint = JSON.stringify({ title, date, time, kind, description });
  const creating = input.revision === undefined;
  if (creating && existing) {
    if (existing.fingerprint === fingerprint && !existing.archived) return;
    throw new AppError('This entry was already saved. Reopen it to edit.', 409);
  }
  const first = creating
    ? c.db
        .prepare(
          'INSERT OR IGNORE INTO calendarEvents (org,id,title,kind,date,time,description,revision,archived,actor,createdAt,updatedAt,fingerprint,lastMutation) VALUES (?,?,?,?,?,?,?,0,0,?,?,?,?,?)',
        )
        .bind(
          c.org,
          id,
          title,
          kind,
          date,
          time,
          description,
          c.actor,
          now,
          now,
          fingerprint,
          nonce,
        )
    : c.db
        .prepare(
          'UPDATE calendarEvents SET title=?,kind=?,date=?,time=?,description=?,revision=revision+1,updatedAt=?,fingerprint=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND archived=0',
        )
        .bind(
          title,
          kind,
          date,
          time,
          description,
          now,
          fingerprint,
          nonce,
          c.org,
          id,
          revisionValue(input.revision),
        );
  const result = await c.db.batch([
    first,
    c.db
      .prepare(
        'INSERT INTO calendarHistory (org,id,eventId,snapshot,actor,createdAt) SELECT org,?,id,?,?,? FROM calendarEvents WHERE org=? AND id=? AND lastMutation=?',
      )
      .bind(
        nonce,
        JSON.stringify({
          action: creating ? 'created' : 'edited',
          previous: existing,
          title,
          kind,
          date,
          time,
          description,
        }),
        c.actor,
        now,
        c.org,
        id,
        nonce,
      ),
  ]);
  if (!result[0].meta.changes) {
    const current = await c.db
      .prepare(
        'SELECT fingerprint,revision,archived FROM calendarEvents WHERE org=? AND id=?',
      )
      .bind(c.org, id)
      .first<CalendarEvent & { fingerprint: string }>();
    if (
      current &&
      !current.archived &&
      current.fingerprint === fingerprint &&
      (creating || current.revision === Number(input.revision) + 1)
    )
      return;
    throw new AppError('This entry changed. Reopen it to refresh.', 409);
  }
}
