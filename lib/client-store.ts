import type { Context } from './store';
import type { Meeting, Space } from './model';
import { AppError, dateValue, revisionValue, textValue } from './validation';

function webUrl(value: unknown, label: string, image = false) {
  const raw = textValue(value ?? '', label, 2000);
  if (!raw || (image && raw === '/images/nord-form-cover.png')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw new AppError(`${label} must be a complete HTTPS address.`);
  }
}

function meetingTime(value: unknown) {
  const raw = textValue(value, 'Meeting time', 40, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw) ||
    Number.isNaN(Date.parse(raw)) ||
    new Date(raw).toISOString() !== raw
  ) {
    throw new AppError('Choose a valid meeting date and time.');
  }
  return raw;
}

type Fields = Record<string, string | number | null>;
function event(
  c: Context,
  spaceId: string,
  meetingId: string | null,
  body: string,
  snapshot: object,
  guard?: { table: 'spaces' | 'meetings'; id: string; nonce: string },
) {
  return c.db
    .prepare(`INSERT INTO spaceEvents (org,id,spaceId,meetingId,body,snapshot,actor,createdAt)
    SELECT ?,?,?,?,?,?,?,? ${guard ? `WHERE EXISTS (SELECT 1 FROM ${guard.table} WHERE org=? AND id=? AND lastMutation=?)` : ''}`)
    .bind(
      c.org,
      crypto.randomUUID(),
      spaceId,
      meetingId,
      body,
      JSON.stringify(snapshot),
      c.actor,
      new Date().toISOString(),
      ...(guard ? [c.org, guard.id, guard.nonce] : []),
    );
}

export async function mutateClient(c: Context, input: Record<string, unknown>) {
  const type = String(input.type);
  const id = textValue(input.id, 'Record', 100, true);
  const nonce = crypto.randomUUID();
  const now = new Date().toISOString();

  if (type === 'client-project-deadline') {
    const project = await c.db
      .prepare('SELECT spaceId,due FROM projects WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ spaceId: string; due: string }>();
    if (!project?.spaceId) throw new AppError('Client project not found.', 404);
    const due = dateValue(input.due),
      previous = dateValue(input.previous);
    const result = await c.db
      .prepare('UPDATE projects SET due=? WHERE org=? AND id=? AND due=?')
      .bind(due, c.org, id, previous)
      .run();
    if (!result.meta.changes)
      throw new AppError(
        'The project deadline changed. Reopen it to refresh.',
        409,
      );
    return;
  }

  if (type === 'meeting-edit') {
    const meeting = await c.db
      .prepare('SELECT * FROM meetings WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<Meeting>();
    if (!meeting) throw new AppError('Meeting not found.', 404);
    const revision = revisionValue(input.revision);
    const status = textValue(input.status, 'Meeting status', 20, true);
    if (!['Planned', 'Completed', 'Cancelled'].includes(status))
      throw new AppError('Choose a valid meeting status.');
    const fields: Fields = {
      title: textValue(input.title, 'Meeting title', 180, true),
      startsAt: meetingTime(input.startsAt),
      agenda: textValue(input.agenda, 'Agenda', 15000),
      notes: textValue(input.notes, 'Meeting notes', 30000),
      decisions: textValue(input.decisions, 'Decisions', 15000),
      status,
      revision: revision + 1,
      updatedAt: now,
      lastMutation: nonce,
    };
    const result = await c.db.batch([
      c.db
        .prepare(
          `UPDATE meetings SET ${Object.keys(fields)
            .map((k) => `"${k}"=?`)
            .join(',')} WHERE org=? AND id=? AND revision=?`,
        )
        .bind(...Object.values(fields), c.org, id, revision),
      event(
        c,
        meeting.spaceId,
        id,
        status !== meeting.status
          ? `Marked “${fields.title}” ${status.toLowerCase()}`
          : `Updated “${fields.title}”`,
        {
          title: meeting.title,
          startsAt: meeting.startsAt,
          agenda: meeting.agenda,
          notes: meeting.notes,
          decisions: meeting.decisions,
          status: meeting.status,
          revision: meeting.revision,
        },
        { table: 'meetings', id, nonce },
      ),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(
        'This meeting changed in another session. Your draft is still here; copy it before closing and reopening to refresh.',
        409,
      );
    return;
  }

  const space = await c.db
    .prepare('SELECT * FROM spaces WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Space>();
  if (!space) throw new AppError('Client space not found.', 404);

  if (type === 'client-edit') {
    const revision = revisionValue(input.revision);
    const color = textValue(input.color, 'Brand color', 7, true);
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
      throw new AppError('Choose a valid brand color.');
    const owner = textValue(input.owner, 'Account lead', 100, true);
    if (
      !(await c.db
        .prepare('SELECT id FROM members WHERE org=? AND id=?')
        .bind(c.org, owner)
        .first())
    )
      throw new AppError('Account lead not found.', 404);
    const brandStyle = textValue(input.brandStyle, 'Typography', 20, true);
    if (!['serif', 'sans', 'editorial'].includes(brandStyle))
      throw new AppError('Choose a typography style.');
    const fields: Fields = {
      name: textValue(input.name, 'Client name', 100, true),
      tagline: textValue(input.tagline, 'Brand line', 180),
      brief: textValue(input.brief, 'Brief', 10000),
      wants: textValue(input.wants, 'Goals', 5000),
      needs: textValue(input.needs, 'Needs', 5000),
      audience: textValue(input.audience, 'Audience', 5000),
      voice: textValue(input.voice, 'Brand voice', 5000),
      website: webUrl(input.website, 'Website'),
      coverUrl: webUrl(input.coverUrl, 'Cover image', true),
      logoUrl: webUrl(input.logoUrl, 'Logo image', true),
      color,
      owner,
      brandStyle,
      revision: revision + 1,
      lastMutation: nonce,
    };
    const previous = Object.fromEntries(
      Object.keys(fields)
        .filter((k) => k !== 'lastMutation')
        .map((k) => [k, space[k as keyof Space]]),
    );
    const result = await c.db.batch([
      c.db
        .prepare(
          `UPDATE spaces SET ${Object.keys(fields)
            .map((k) => `"${k}"=?`)
            .join(',')} WHERE org=? AND id=? AND revision=?`,
        )
        .bind(...Object.values(fields), c.org, id, revision),
      event(c, id, null, 'Updated the brand and client brief', previous, {
        table: 'spaces',
        id,
        nonce,
      }),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(
        'This client brief changed in another session. Your draft is still here; copy it before closing and reopening to refresh.',
        409,
      );
    return;
  }

  if (type === 'meeting-create') {
    const title = textValue(input.title, 'Meeting title', 180, true);
    const startsAt = meetingTime(input.startsAt);
    const agenda = textValue(input.agenda ?? '', 'Agenda', 15000);
    await c.db.batch([
      c.db
        .prepare(
          "INSERT INTO meetings (org,id,spaceId,title,startsAt,agenda,notes,decisions,status,revision,updatedAt) VALUES (?,?,?,?,?,?,'','','Planned',0,?)",
        )
        .bind(c.org, nonce, id, title, startsAt, agenda, now),
      event(c, id, nonce, `Planned “${title}”`, { title, startsAt, agenda }),
    ]);
    return;
  }

  if (type === 'client-project') {
    const name = textValue(input.name, 'Project name', 180, true);
    const description = textValue(
      input.description ?? '',
      'Project description',
      10000,
    );
    const due = dateValue(input.due ?? '');
    await c.db.batch([
      c.db
        .prepare(
          'INSERT INTO projects (org,id,spaceId,name,description,due) VALUES (?,?,?,?,?,?)',
        )
        .bind(c.org, nonce, id, name, description, due),
      event(c, id, null, `Created project “${name}”`, {
        projectId: nonce,
        name,
        due,
      }),
    ]);
    return;
  }
  throw new AppError('Unknown client action.');
}
