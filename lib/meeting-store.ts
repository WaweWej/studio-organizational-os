import type { Context } from './store';
import { validRecurrence, nextMeetingStart } from './recurrence';
import type { Meeting, CalendarEvent, Task } from './model';
import { AppError, revisionValue, textValue } from './validation';

function meetingTime(value: unknown) {
  const raw = textValue(value, 'Meeting time', 40, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw) ||
    Number.isNaN(Date.parse(raw)) ||
    new Date(raw).toISOString() !== raw
  )
    throw new AppError('Choose a valid meeting date and time.');
  return raw;
}

async function connection(c: Context, space: unknown, prospect: unknown) {
  let spaceId = textValue(space ?? '', 'Client', 100) || null;
  const prospectId = textValue(prospect ?? '', 'Prospect', 100) || null;
  if (prospectId) {
    const p = await c.db
      .prepare(
        'SELECT clientId,convertedAt FROM prospects WHERE org=? AND id=?',
      )
      .bind(c.org, prospectId)
      .first<{ clientId: string | null; convertedAt: string }>();
    if (!p) throw new AppError('Prospect not found.', 404);
    const clientId = p.convertedAt ? p.clientId : null;
    if (spaceId && spaceId !== clientId)
      throw new AppError('The prospect and client do not match.');
    spaceId = clientId;
  }
  if (
    spaceId &&
    !(await c.db
      .prepare('SELECT id FROM spaces WHERE org=? AND id=?')
      .bind(c.org, spaceId)
      .first())
  )
    throw new AppError('Client not found.', 404);
  return { spaceId, prospectId };
}

// History reads the context from the saved meeting in the same transaction.
// Conversion can therefore never strand a note update in the old sales context.
function history(
  c: Context,
  id: string,
  nonce: string,
  body: string,
  snapshot: object,
) {
  return c.db
    .prepare(`INSERT INTO spaceEvents (org,id,spaceId,prospectId,meetingId,body,snapshot,actor,createdAt)
    SELECT org,?,spaceId,prospectId,id,?,?,?,? FROM meetings WHERE org=? AND id=? AND lastMutation=?`)
    .bind(
      crypto.randomUUID(),
      body,
      JSON.stringify(snapshot),
      c.actor,
      new Date().toISOString(),
      c.org,
      id,
      nonce,
    );
}

async function meetingTask(c: Context, id: string, revision: number) {
  const task = await c.db
    .prepare(`SELECT t.*,COALESCE(p.spaceId,t.spaceId,CASE WHEN s.convertedAt<>'' THEN s.clientId END) AS contextSpace
    FROM tasks t LEFT JOIN projects p ON p.org=t.org AND p.id=t.projectId LEFT JOIN prospects s ON s.org=t.org AND s.id=t.prospectId WHERE t.org=? AND t.id=?`)
    .bind(c.org, id)
    .first<Task & { contextSpace: string | null }>();
  if (!task || task.archived) throw new AppError('Task not found.', 404);
  if (task.revision !== revision && !task.meetingId)
    throw new AppError('This task changed. Reopen it to refresh.', 409);
  return task;
}
function matchTaskMeeting(
  task: Task & { contextSpace: string | null },
  meeting: Pick<Meeting, 'spaceId' | 'prospectId'>,
) {
  if (
    (task.contextSpace &&
      meeting.spaceId &&
      task.contextSpace !== meeting.spaceId) ||
    (task.prospectId &&
      meeting.prospectId &&
      task.prospectId !== meeting.prospectId &&
      !(task.contextSpace && task.contextSpace === meeting.spaceId)) ||
    (task.contextSpace && meeting.prospectId && !meeting.spaceId) ||
    (task.prospectId && !task.contextSpace && meeting.spaceId) ||
    (task.projectId &&
      !task.contextSpace &&
      (meeting.spaceId || meeting.prospectId))
  )
    throw new AppError(
      'Choose a meeting for the same prospect or client as this task.',
    );
}

export async function mutateMeeting(
  c: Context,
  input: Record<string, unknown>,
) {
  const type = String(input.type),
    nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  const id =
    type === 'meeting-create'
      ? nonce
      : textValue(input.id, 'Meeting', 100, true);
  if (type === 'meeting-link-task') {
    const taskId = textValue(input.taskId, 'Task', 100, true);
    const taskRevision = revisionValue(input.taskRevision);
    const revision = revisionValue(input.revision);
    const task = await meetingTask(c, taskId, taskRevision);
    const meeting = await c.db
      .prepare('SELECT * FROM meetings WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<Meeting>();
    if (!meeting) throw new AppError('Meeting not found.', 404);
    if (task.meetingId === id) return;
    if (task.meetingId)
      throw new AppError(
        'This task is already connected to another meeting.',
        409,
      );
    if (meeting.revision !== revision)
      throw new AppError('This meeting changed. Reopen it to refresh.', 409);
    matchTaskMeeting(task, meeting);
    const result = await c.db.batch([
      c.db
        .prepare(`UPDATE tasks SET meetingId=?,spaceId=CASE WHEN projectId IS NULL THEN COALESCE((SELECT spaceId FROM meetings WHERE org=? AND id=?),spaceId) ELSE spaceId END,
        prospectId=COALESCE(prospectId,(SELECT prospectId FROM meetings WHERE org=? AND id=?)),revision=revision+1,updatedAt=?,lastMutation=?
        WHERE org=? AND id=? AND revision=? AND archived=0 AND meetingId IS NULL AND EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=? AND revision=?)`)
        .bind(
          id,
          c.org,
          id,
          c.org,
          id,
          now,
          nonce,
          c.org,
          taskId,
          taskRevision,
          c.org,
          id,
          revision,
        ),
      c.db
        .prepare(`UPDATE meetings SET spaceId=COALESCE(spaceId,(SELECT COALESCE(p.spaceId,t.spaceId,CASE WHEN s.convertedAt<>'' THEN s.clientId END) FROM tasks t LEFT JOIN projects p ON p.org=t.org AND p.id=t.projectId LEFT JOIN prospects s ON s.org=t.org AND s.id=t.prospectId WHERE t.org=? AND t.id=?)),
        prospectId=COALESCE(prospectId,(SELECT prospectId FROM tasks WHERE org=? AND id=?)),revision=revision+1,updatedAt=?,lastMutation=?
        WHERE org=? AND id=? AND EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)`)
        .bind(
          c.org,
          taskId,
          c.org,
          taskId,
          now,
          nonce,
          c.org,
          id,
          c.org,
          taskId,
          nonce,
        ),
      c.db
        .prepare(
          `UPDATE spaceEvents SET spaceId=(SELECT spaceId FROM meetings WHERE org=? AND id=?),prospectId=(SELECT prospectId FROM meetings WHERE org=? AND id=?) WHERE org=? AND meetingId=? AND EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=? AND lastMutation=?)`,
        )
        .bind(c.org, id, c.org, id, c.org, id, c.org, id, nonce),
      history(c, id, nonce, 'Connected task: ' + task.title, { taskId }),
      c.db
        .prepare(
          `INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT org,?,id,?,?,? FROM tasks WHERE org=? AND id=? AND lastMutation=?`,
        )
        .bind(
          crypto.randomUUID(),
          'Connected meeting: ' + meeting.title,
          c.actor,
          now,
          c.org,
          taskId,
          nonce,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(
        'The task or meeting changed. Reopen it to refresh.',
        409,
      );
    return;
  }
  if (type === 'meeting-plan' || type === 'meeting-create') {
    const calendarId =
      textValue(input.calendarId ?? '', 'Calendar meeting', 100) || null;
    let linked = await connection(
      c,
      type === 'meeting-create' ? input.id : input.spaceId,
      input.prospectId,
    );
    const fields = {
      title: textValue(input.title, 'Meeting title', 180, true),
      startsAt: meetingTime(input.startsAt),
      agenda: textValue(input.agenda ?? '', 'Agenda', 15000),
      notes: textValue(input.notes ?? '', 'Meeting notes', 30000),
      decisions: textValue(input.decisions ?? '', 'Decisions', 15000),
      participants: textValue(input.participants ?? '', 'Participants', 3000),
      recurrence: (() => {
        const value = input.recurrence ?? '';
        if (!validRecurrence(value))
          throw new AppError('Choose a supported meeting rhythm.');
        return value;
      })(),
    };
    const calendarRevision = calendarId
      ? revisionValue(input.calendarRevision)
      : null;
    const taskId = textValue(input.taskId ?? '', 'Task', 100) || null;
    const taskRevision = taskId ? revisionValue(input.taskRevision) : null;
    const fingerprint = JSON.stringify({
      fields,
      spaceId: input.spaceId ?? (type === 'meeting-create' ? input.id : null),
      prospectId: input.prospectId ?? null,
      calendarId,
      calendarRevision,
      taskId,
      taskRevision,
    });
    const existing = await c.db
      .prepare('SELECT fingerprint FROM meetings WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ fingerprint: string }>();
    if (existing) {
      if (existing.fingerprint === fingerprint) return;
      throw new AppError(
        'This meeting already exists. Reopen it to edit.',
        409,
      );
    }
    if (taskId) {
      const task = await meetingTask(c, taskId, taskRevision!);
      if (task.meetingId)
        throw new AppError('This task is already connected to a meeting.', 409);
      matchTaskMeeting(task, linked);
      if (!linked.spaceId && !linked.prospectId)
        linked = await connection(c, task.contextSpace, task.prospectId);
    }
    if (calendarId) {
      const event = await c.db
        .prepare('SELECT * FROM calendarEvents WHERE org=? AND id=?')
        .bind(c.org, calendarId)
        .first<CalendarEvent>();
      if (
        !event ||
        event.kind !== 'meeting' ||
        event.archived ||
        (event.googleEventId && event.actor !== c.actor)
      )
        throw new AppError('Calendar meeting not found.', 404);
      if (event.meetingId || event.revision !== calendarRevision)
        throw new AppError(
          'This calendar meeting changed. Reopen it to refresh.',
          409,
        );
      if (event.googleEventId) {
        fields.title = event.title;
        fields.startsAt = event.googleStart?.includes('T')
          ? new Date(event.googleStart).toISOString()
          : new Date(event.date + 'T12:00:00Z').toISOString();
      }
    }
    // Resolve the client inside the batch as well, in case conversion committed
    // after validation. Exact scoped references are required for every insert.
    const contextGuard = linked.prospectId
      ? 'EXISTS (SELECT 1 FROM prospects WHERE org=? AND id=?)'
      : linked.spaceId
        ? 'EXISTS (SELECT 1 FROM spaces WHERE org=? AND id=?)'
        : '1';
    const contextArgs =
      linked.prospectId || linked.spaceId
        ? [c.org, linked.prospectId || linked.spaceId]
        : [];
    const spaceSql = linked.prospectId
      ? "(SELECT CASE WHEN convertedAt<>'' THEN clientId ELSE NULL END FROM prospects WHERE org=? AND id=?)"
      : '?';
    const work = [
      c.db
        .prepare(`INSERT OR IGNORE INTO meetings (org,id,spaceId,prospectId,title,startsAt,agenda,notes,decisions,participants,recurrence,status,revision,updatedAt,lastMutation,fingerprint)
      SELECT ?,?,${spaceSql},?,?,?,?,?,?,?,?,'Planned',0,?,?,? WHERE ${contextGuard}${calendarId ? " AND EXISTS (SELECT 1 FROM calendarEvents WHERE org=? AND id=? AND revision=? AND archived=0 AND kind='meeting' AND meetingId IS NULL)" : ''}${taskId ? ' AND EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND revision=? AND archived=0 AND meetingId IS NULL)' : ''}`)
        .bind(
          c.org,
          id,
          ...(linked.prospectId
            ? [c.org, linked.prospectId]
            : [linked.spaceId]),
          linked.prospectId,
          ...Object.values(fields),
          now,
          nonce,
          fingerprint,
          ...contextArgs,
          ...(calendarId ? [c.org, calendarId, calendarRevision] : []),
          ...(taskId ? [c.org, taskId, taskRevision] : []),
        ),
    ];
    if (taskId)
      work.push(
        c.db
          .prepare(`UPDATE tasks SET meetingId=?,spaceId=CASE WHEN projectId IS NULL THEN COALESCE((SELECT spaceId FROM meetings WHERE org=? AND id=?),spaceId) ELSE spaceId END,
        prospectId=COALESCE(prospectId,(SELECT prospectId FROM meetings WHERE org=? AND id=?)),revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=? AND lastMutation=?)`)
          .bind(
            id,
            c.org,
            id,
            c.org,
            id,
            now,
            nonce,
            c.org,
            taskId,
            taskRevision,
            c.org,
            id,
            nonce,
          ),
        c.db
          .prepare(
            `INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT org,?,id,?,?,? FROM tasks WHERE org=? AND id=? AND lastMutation=?`,
          )
          .bind(
            crypto.randomUUID(),
            'Connected meeting: ' + fields.title,
            c.actor,
            now,
            c.org,
            taskId,
            nonce,
          ),
      );
    if (calendarId) {
      work.push(
        c.db
          .prepare(
            `UPDATE calendarEvents SET meetingId=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=? AND lastMutation=?)`,
          )
          .bind(
            id,
            now,
            nonce,
            c.org,
            calendarId,
            calendarRevision,
            c.org,
            id,
            nonce,
          ),
      );
      work.push(
        c.db
          .prepare(
            `INSERT INTO calendarHistory (org,id,eventId,snapshot,actor,createdAt) SELECT org,?,id,?,?,? FROM calendarEvents WHERE org=? AND id=? AND lastMutation=?`,
          )
          .bind(
            crypto.randomUUID(),
            JSON.stringify({ action: 'meeting-linked', meetingId: id }),
            c.actor,
            now,
            c.org,
            calendarId,
            nonce,
          ),
      );
    }
    work.push(history(c, id, nonce, `Planned “${fields.title}”`, fields));
    const result = await c.db.batch(work);
    if (!result[0].meta.changes) {
      const saved = await c.db
        .prepare('SELECT fingerprint FROM meetings WHERE org=? AND id=?')
        .bind(c.org, id)
        .first<{ fingerprint: string }>();
      if (saved?.fingerprint === fingerprint) return;
      throw new AppError(
        'The meeting or its connection changed. Reopen it to refresh.',
        409,
      );
    }
    return;
  }
  if (type !== 'meeting-edit') throw new AppError('Unknown meeting action.');
  const meeting = await c.db
    .prepare('SELECT * FROM meetings WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Meeting>();
  if (!meeting) throw new AppError('Meeting not found.', 404);
  const revision = revisionValue(input.revision);
  const status = textValue(input.status, 'Meeting status', 20, true);
  if (!['Planned', 'Completed', 'Cancelled'].includes(status))
    throw new AppError('Choose a valid meeting status.');
  const fields = {
    title: textValue(input.title, 'Meeting title', 180, true),
    startsAt: meetingTime(input.startsAt),
    agenda: textValue(input.agenda, 'Agenda', 15000),
    notes: textValue(input.notes, 'Meeting notes', 30000),
    decisions: textValue(input.decisions, 'Decisions', 15000),
    participants: textValue(
      input.participants ?? meeting.participants ?? '',
      'Participants',
      3000,
    ),
    recurrence: (() => {
      const value = input.recurrence ?? meeting.recurrence ?? '';
      if (!validRecurrence(value))
        throw new AppError('Choose a supported meeting rhythm.');
      return value;
    })(),
    status,
  };
  const googleSource = await c.db
    .prepare(
      "SELECT actor FROM calendarEvents WHERE org=? AND meetingId=? AND googleEventId<>''",
    )
    .bind(c.org, id)
    .first<{ actor: string }>();
  if (
    googleSource &&
    (googleSource.actor !== c.actor ||
      fields.title !== meeting.title ||
      fields.startsAt !== meeting.startsAt ||
      ((fields.status === 'Cancelled' || meeting.status === 'Cancelled') &&
        fields.status !== meeting.status))
  )
    throw new AppError(
      'Change this meeting’s title or schedule in Google Calendar. You can save notes and decisions here.',
      409,
    );
  // A previously unconnected meeting may be attached explicitly. Existing
  // relationships are immutable here; client conversion owns that transition.
  const attaching =
    !meeting.spaceId &&
    !meeting.prospectId &&
    (input.spaceId || input.prospectId);
  const linked = attaching
    ? await connection(c, input.spaceId, input.prospectId)
    : null;
  const same = Object.entries(fields).every(
    ([key, value]) => meeting[key as keyof Meeting] === value,
  );
  if (meeting.revision !== revision) {
    if (!attaching && meeting.revision === revision + 1 && same) return;
    throw new AppError(
      'This meeting changed in another session. Your draft is preserved; reopen the meeting to compare before saving.',
      409,
    );
  }
  const contextSql = linked
    ? linked.prospectId
      ? ",prospectId=?,spaceId=(SELECT CASE WHEN convertedAt<>'' THEN clientId ELSE NULL END FROM prospects WHERE org=? AND id=?)"
      : ',spaceId=?'
    : '';
  const contextArgs = linked
    ? linked.prospectId
      ? [linked.prospectId, c.org, linked.prospectId]
      : [linked.spaceId]
    : [];
  const contextGuard = linked
    ? ` AND EXISTS (SELECT 1 FROM ${linked.prospectId ? 'prospects' : 'spaces'} WHERE org=? AND id=?)`
    : '';
  const result = await c.db.batch([
    c.db
      .prepare(
        `UPDATE meetings SET ${Object.keys(fields)
          .map((k) => `"${k}"=?`)
          .join(
            ',',
          )}${contextSql},revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=?${contextGuard}`,
      )
      .bind(
        ...Object.values(fields),
        ...contextArgs,
        now,
        nonce,
        c.org,
        id,
        revision,
        ...(linked ? [c.org, linked.prospectId || linked.spaceId] : []),
      ),
    ...(linked
      ? [
          c.db
            .prepare(
              `UPDATE spaceEvents SET spaceId=(SELECT spaceId FROM meetings WHERE org=? AND id=?),prospectId=(SELECT prospectId FROM meetings WHERE org=? AND id=?) WHERE org=? AND meetingId=? AND EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=? AND lastMutation=?)`,
            )
            .bind(c.org, id, c.org, id, c.org, id, c.org, id, nonce),
        ]
      : []),
    history(
      c,
      id,
      nonce,
      status !== meeting.status
        ? `Marked “${fields.title}” ${status.toLowerCase()}`
        : `Updated “${fields.title}”`,
      Object.fromEntries(
        [...Object.keys(fields), 'revision'].map((key) => [
          key,
          meeting[key as keyof Meeting],
        ]),
      ),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(
      'This meeting changed in another session. Your draft is preserved.',
      409,
    );
}


// Materialize the next occurrence of recurring meetings whose time has passed.
// Runs on workspace reads — the same while-the-app-is-open pattern calendar
// sync uses. One upcoming occurrence per chain: the catch-up math lands in the
// future, the guarded insert makes concurrent reads converge on one row, and a
// cancelled occurrence does not end the rhythm (removing the rhythm does).
export async function materializeRecurringMeetings(c: Context, now = new Date()) {
  const due = await c.db
    .prepare(
      `SELECT * FROM meetings m WHERE org=? AND recurrence<>'' AND startsAt<?
       AND NOT EXISTS (
         SELECT 1 FROM meetings s WHERE s.org=m.org
         AND (CASE WHEN s.recurrenceOf='' THEN s.id ELSE s.recurrenceOf END)
           = (CASE WHEN m.recurrenceOf='' THEN m.id ELSE m.recurrenceOf END)
         AND s.startsAt>m.startsAt
       ) LIMIT 10`,
    )
    .bind(c.org, now.toISOString())
    .all<Meeting & { recurrence: string; recurrenceOf: string }>();
  for (const meeting of due.results || []) {
    const startsAt = nextMeetingStart(meeting.recurrence, meeting.startsAt, now);
    if (!startsAt) continue;
    const chain = meeting.recurrenceOf || meeting.id;
    const id = crypto.randomUUID();
    const stamp = now.toISOString();
    await c.db.batch([
      c.db
        .prepare(
          `INSERT INTO meetings (org,id,spaceId,prospectId,title,startsAt,agenda,notes,decisions,participants,recurrence,recurrenceOf,status,revision,updatedAt,lastMutation,fingerprint)
           SELECT ?,?,?,?,?,?,?,'','',?,?,?,'Planned',0,?,?,'' WHERE NOT EXISTS (
             SELECT 1 FROM meetings WHERE org=? AND recurrenceOf=? AND startsAt=?
           )`,
        )
        .bind(
          c.org,
          id,
          meeting.spaceId,
          meeting.prospectId ?? null,
          meeting.title,
          startsAt,
          meeting.agenda,
          meeting.participants ?? '',
          meeting.recurrence,
          chain,
          stamp,
          crypto.randomUUID(),
          c.org,
          chain,
          startsAt,
        ),
      c.db
        .prepare(
          `INSERT INTO spaceEvents (org,id,spaceId,prospectId,meetingId,body,snapshot,actor,createdAt)
           SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM meetings WHERE org=? AND id=?)`,
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          meeting.spaceId,
          meeting.prospectId ?? null,
          id,
          'Scheduled the next ' + meeting.recurrence + ' meeting',
          JSON.stringify({ title: meeting.title, startsAt }),
          c.actor,
          stamp,
          c.org,
          id,
        ),
    ]);
  }
}
