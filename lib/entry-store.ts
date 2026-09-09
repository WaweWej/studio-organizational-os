import { readWorkspace, mutate, type Context } from './store';
import { AppError, textValue, dateValue, revisionValue } from './validation';
import {
  interpretEntry,
  isTaskUpdate,
  type CaptureEntry,
  type EntryKind,
  type EntryTarget,
} from './entry-model';
import type { CaptureMention } from './task-capture';

export function captureInsert(
  c: Context,
  row: CaptureEntry,
  nonce: string,
  fingerprint = '',
  guard?: { taskId: string },
) {
  const record = { org: c.org, ...row, fingerprint, lastMutation: nonce };
  return c.db
    .prepare(
      `${guard ? 'INSERT' : 'INSERT OR IGNORE'} INTO captureEntries (${Object.keys(
        record,
      )
        .map((k) => `"${k}"`)
        .join(',')}) SELECT ${Object.keys(record)
        .map(() => '?')
        .join(
          ',',
        )} ${guard ? 'WHERE EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)' : ''}`,
    )
    .bind(
      ...Object.values(record),
      ...(guard ? [c.org, guard.taskId, nonce] : []),
    );
}
export async function mutateEntry(c: Context, input: Record<string, unknown>) {
  const id = textValue(input.captureId, 'Capture ID', 36, true);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new AppError('Invalid capture ID.');
  textValue(input.captureText, 'Entry', 2000, true);
  const sourceText = input.captureText as string;
  if (sourceText.length > 2000)
    throw new AppError('Keep the entry under 2,000 characters.');
  const kind = textValue(input.kind, 'Entry kind', 20, true) as EntryKind;
  if (
    !['note', 'meeting', 'deadline', 'progress', 'blocker', 'status'].includes(
      kind,
    )
  )
    throw new AppError('Choose a supported entry type.');
  const day = dateValue(input.captureDay);
  if (!day) throw new AppError('Capture date is required.');
  const defaultSpace =
    textValue(input.contextSpace ?? '', 'Client', 100) || null;
  const defaultProject =
    textValue(input.contextProject ?? '', 'Project', 100) || null;
  const targetType = textValue(input.targetType ?? '', 'Destination type', 20);
  if (targetType && !['space', 'project', 'task'].includes(targetType))
    throw new AppError('Choose a valid destination.');
  const target: EntryTarget | null = targetType
    ? {
        type: targetType as EntryTarget['type'],
        id: textValue(input.targetId, 'Destination', 100, true),
      }
    : null;
  const meetingDate = dateValue(input.meetingDate ?? '');
  const meetingTime = textValue(input.meetingTime ?? '', 'Meeting time', 5);
  const pins = Array.isArray(input.pins)
    ? input.pins.slice(0, 30).map((raw) => {
        if (!raw || typeof raw !== 'object')
          throw new AppError('Invalid connection.');
        const p = raw as Record<string, unknown>;
        if (
          !['space', 'project'].includes(String(p.kind)) ||
          !Number.isSafeInteger(p.start) ||
          !Number.isSafeInteger(p.end) ||
          Number(p.start) < 0 ||
          Number(p.end) <= Number(p.start) ||
          Number(p.end) > sourceText.length
        )
          throw new AppError('Invalid connection.');
        return {
          kind: p.kind,
          id: textValue(p.id, 'Connection', 100, true),
          label: textValue(p.label, 'Connection name', 180, true),
          start: p.start,
          end: p.end,
        } as CaptureMention;
      })
    : [];
  const fingerprint = JSON.stringify({
    sourceText,
    kind,
    day,
    defaultProject,
    defaultSpace,
    target,
    pins,
    meetingDate,
    meetingTime,
    offset: input.meetingOffset ?? null,
    revision: input.revision ?? null,
    previous: input.previous ?? null,
  });
  const existing = await c.db
    .prepare('SELECT fingerprint FROM captureEntries WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<{ fingerprint: string }>();
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new AppError(
        'This entry was already saved with different details.',
        409,
      );
    return;
  }
  const data = await readWorkspace(c);
  const draft = interpretEntry(sourceText, data, {
    kind,
    now: new Date(`${day}T12:00:00`),
    projectId: defaultProject,
    spaceId: defaultSpace,
    target,
    pins,
    meetingDate,
    meetingTime,
  });
  if (draft.errors.length) throw new AppError(draft.errors[0]);
  const now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  const row: CaptureEntry = {
    id,
    kind,
    sourceText,
    title: draft.title,
    body: draft.body,
    targetType:
      kind === 'note'
        ? 'note'
        : kind === 'meeting'
          ? 'meeting'
          : draft.taskId
            ? 'task'
            : 'project',
    targetId:
      kind === 'note' || kind === 'meeting'
        ? id
        : draft.taskId || draft.projectId!,
    spaceId: draft.spaceId,
    projectId: draft.projectId,
    taskId: draft.taskId,
    actor: c.actor,
    createdAt: now,
  };
  if (isTaskUpdate(kind)) {
    try {
      await mutate(
        c,
        {
          type:
            kind === 'status'
              ? 'move'
              : kind === 'blocker'
                ? 'blocker'
                : 'progress',
          id: draft.taskId,
          revision: input.revision,
          body: draft.body,
          clear: draft.clearBlocker,
          stage: draft.nextStage,
        },
        { row, fingerprint },
      );
    } catch (error) {
      // A concurrent identical retry may finish between parsing and the guarded update.
      const saved = await c.db
        .prepare('SELECT fingerprint FROM captureEntries WHERE org=? AND id=?')
        .bind(c.org, id)
        .first<{ fingerprint: string }>();
      if (saved?.fingerprint !== fingerprint) throw error;
    }
    return;
  }
  const guard =
    'EXISTS (SELECT 1 FROM captureEntries WHERE org=? AND id=? AND lastMutation=?)';
  let first = captureInsert(c, row, nonce, fingerprint);
  const work: D1PreparedStatement[] = [];
  if (kind === 'meeting') {
    const offset = input.meetingOffset;
    if (
      typeof offset !== 'number' ||
      !Number.isInteger(offset) ||
      Math.abs(offset) > 840
    )
      throw new AppError('Choose the meeting date and time again.');
    const date = dateValue(draft.meetingDate);
    const startsAt = new Date(
      Date.parse(`${date}T${draft.meetingTime}:00Z`) + offset * 60000,
    ).toISOString();
    work.push(
      c.db
        .prepare(
          `INSERT INTO meetings (org,id,spaceId,title,startsAt,agenda,notes,decisions,status,revision,updatedAt,lastMutation) SELECT ?,?,?,?,?,?,'','','Planned',0,?,? WHERE ${guard}`,
        )
        .bind(
          c.org,
          id,
          row.spaceId,
          row.title,
          startsAt,
          '',
          now,
          nonce,
          c.org,
          id,
          nonce,
        ),
    );
  }
  if (kind === 'deadline') {
    const record = { org: c.org, ...row, fingerprint, lastMutation: nonce };
    if (draft.taskId) {
      const revision = revisionValue(input.revision);
      first = c.db
        .prepare(
          `INSERT OR IGNORE INTO captureEntries (${Object.keys(record)
            .map((k) => `"${k}"`)
            .join(',')}) SELECT ${Object.keys(record)
            .map(() => '?')
            .join(
              ',',
            )} WHERE EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND revision=?)`,
        )
        .bind(...Object.values(record), c.org, draft.taskId, revision);
      work.push(
        c.db
          .prepare(
            `UPDATE tasks SET due=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND ${guard}`,
          )
          .bind(
            draft.due,
            now,
            nonce,
            c.org,
            draft.taskId,
            revision,
            c.org,
            id,
            nonce,
          ),
      );
    } else {
      const previous = dateValue(input.previous);
      first = c.db
        .prepare(
          `INSERT OR IGNORE INTO captureEntries (${Object.keys(record)
            .map((k) => `"${k}"`)
            .join(',')}) SELECT ${Object.keys(record)
            .map(() => '?')
            .join(
              ',',
            )} WHERE EXISTS (SELECT 1 FROM projects WHERE org=? AND id=? AND due=?)`,
        )
        .bind(...Object.values(record), c.org, draft.projectId, previous);
      work.push(
        c.db
          .prepare(
            `UPDATE projects SET due=? WHERE org=? AND id=? AND due=? AND ${guard}`,
          )
          .bind(draft.due, c.org, draft.projectId, previous, c.org, id, nonce),
      );
    }
  }
  const event =
    kind === 'note'
      ? `Captured note: ${row.title}`
      : kind === 'meeting'
        ? `Planned “${row.title}”`
        : `Set deadline for “${row.title}” to ${draft.due}`;
  if (row.taskId)
    work.push(
      c.db
        .prepare(
          `INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          row.taskId,
          event,
          c.actor,
          now,
          c.org,
          id,
          nonce,
        ),
    );
  if (row.spaceId)
    work.push(
      c.db
        .prepare(
          `INSERT INTO spaceEvents (org,id,spaceId,meetingId,body,snapshot,actor,createdAt) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          row.spaceId,
          kind === 'meeting' ? id : null,
          event,
          JSON.stringify({
            captureId: id,
            targetId: row.targetId,
            previous: input.previous ?? null,
            revision: input.revision ?? null,
          }),
          c.actor,
          now,
          c.org,
          id,
          nonce,
        ),
    );
  const results = await c.db.batch([first, ...work]);
  if (!results[0].meta.changes) {
    const saved = await c.db
      .prepare('SELECT fingerprint FROM captureEntries WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ fingerprint: string }>();
    if (saved?.fingerprint !== fingerprint)
      throw new AppError(
        'The destination changed before this entry was saved. Refresh the workspace and try again; your draft is kept.',
        409,
      );
  }
}
