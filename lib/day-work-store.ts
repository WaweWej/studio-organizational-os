import type { Context } from './store';
import type { Task } from './model';
import { AppError, dateValue, textValue, revisionValue } from './validation';

export async function changeDayWork(
  c: Context,
  input: Record<string, unknown>,
) {
  const mode = textValue(input.mode, 'Planning action', 20, true);
  if (!['plan', 'focus', 'waiting'].includes(mode))
    throw new AppError('Unknown planning action.');
  const day = dateValue(input.day);
  if (!day) throw new AppError('Choose a planning day.');
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 100
  )
    throw new AppError('Choose 1–100 tasks.');
  if (mode !== 'plan' && input.items.length !== 1)
    throw new AppError('Choose one task.');
  const items = input.items.map((raw) => {
    if(!raw || typeof raw!=='object') throw new AppError('Choose a valid task.');
    return {id:textValue(raw.id,'Task',100,true),revision:revisionValue(raw.revision)};
  });
  if(mode==='focus' && typeof input.focus!=='boolean') throw new AppError('Choose whether this task is a priority.');
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new AppError('Choose each task once.');
  const plannedFor = mode === 'plan' ? dateValue(input.plannedFor) : day;
  const restoredFocus = mode === 'plan' ? dateValue(input.focusFor || '') : '';
  if (restoredFocus && (restoredFocus !== plannedFor || items.length !== 1))
    throw new AppError('Restore a priority to its planning day.');
  const focus = mode === 'focus' && input.focus === true;
  const blocked =
    mode === 'waiting' ? textValue(input.blocked, 'Waiting for', 500) : '';
  const now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  const checks: string[] = [],
    bindings: unknown[] = [];
  const rows: Task[] = [];
  for (const item of items) {
    const task = await c.db
      .prepare('SELECT * FROM tasks WHERE org=? AND id=?')
      .bind(c.org, item.id)
      .first<Task>();
    if (!task || task.assignee !== c.actor)
      throw new AppError('Choose one of your tasks.', 404);
    if (task.archived || task.stage === 'Done')
      throw new AppError('Choose unfinished active work.');
    rows.push(task);
    checks.push(
      "EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND revision=? AND assignee=? AND archived=0 AND stage<>'Done')",
    );
    bindings.push(c.org, item.id, item.revision, c.actor);
  }
  const same = (t: Task) =>
    mode === 'plan'
      ? t.plannedFor === plannedFor && (t.focusFor || '') === restoredFocus
      : mode === 'focus'
        ? t.focusFor === (focus ? day : '')
        : t.blocked === blocked;
  if (rows.every((t, i) => t.revision === items[i].revision + 1 && same(t)))
    return;
  if (rows.some((t, i) => t.revision !== items[i].revision))
    throw new AppError('A task changed. Refresh before planning again.', 409);
  if (focus || restoredFocus) {
    checks.push(
      "(SELECT count(*) FROM tasks WHERE org=? AND assignee=? AND focusFor=? AND id<>? AND archived=0 AND stage<>'Done')<3",
    );
    bindings.push(c.org, c.actor, restoredFocus || day, items[0].id);
  }
  const first = items[0].id;
  const work: D1PreparedStatement[] = [];
  for (const [index, item] of items.entries()) {
    const fields =
      mode === 'plan'
        ? { plannedFor, focusFor: restoredFocus }
        : mode === 'focus'
          ? {
              plannedFor: focus ? day : rows[index].plannedFor || '',
              focusFor: focus ? day : '',
            }
          : { blocked };
    const guard =
      index === 0
        ? checks.join(' AND ')
        : 'EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)';
    work.push(
      c.db
        .prepare(
          'UPDATE tasks SET ' +
            Object.keys(fields)
              .map((k) => k + '=?')
              .join(',') +
            ',revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND ' +
            guard,
        )
        .bind(
          ...Object.values(fields),
          now,
          nonce,
          c.org,
          item.id,
          item.revision,
          ...(index === 0 ? bindings : [c.org, first, nonce]),
        ),
    );
  }
  for (const item of items) {
    const body =
      mode === 'plan'
        ? plannedFor
          ? 'Planned for ' + plannedFor
          : 'Removed from the daily plan'
        : mode === 'focus'
          ? focus
            ? 'Chosen as a priority for ' + day
            : 'Removed from daily priorities'
          : blocked
            ? 'Waiting: ' + blocked
            : 'No longer waiting';
    work.push(
      c.db
        .prepare(
          'INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)',
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          item.id,
          body,
          c.actor,
          now,
          c.org,
          item.id,
          nonce,
        ),
    );
    if (mode === 'waiting')
      work.push(
        c.db
          .prepare(
            'INSERT INTO notes (org,id,taskId,body,actor,createdAt) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)',
          )
          .bind(
            c.org,
            crypto.randomUUID(),
            item.id,
            body,
            c.actor,
            now,
            c.org,
            item.id,
            nonce,
          ),
      );
  }
  const result = await c.db.batch(work);
  if (!result[0].meta.changes)
    throw new AppError(
      focus
        ? 'Choose at most three priorities. Refresh if the task changed.'
        : 'A task changed. Refresh before planning again.',
      409,
    );
}
