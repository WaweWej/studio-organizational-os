import type { Context } from './store';
import { AppError, textValue, revisionValue } from './validation';

export async function mutateTaskLifecycle(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.id, 'Task', 100, true);
  const revision = revisionValue(input.revision);
  const now = new Date().toISOString();
  const mutation = crypto.randomUUID();
  if (input.type === 'task-delete') {
    // A content-free tombstone gates cleanup and makes identical retries safe.
    const previous = await c.db
      .prepare('SELECT revision FROM taskDeletions WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ revision: number }>();
    if (previous) {
      if (previous.revision === revision) return;
      throw new AppError('This task was already deleted.', 409);
    }
    const guard =
      'EXISTS (SELECT 1 FROM taskDeletions WHERE org=? AND id=? AND mutation=?)';
    const work = [
      c.db
        .prepare(
          'INSERT OR IGNORE INTO taskDeletions (org,id,revision,actor,createdAt,mutation) SELECT org,id,revision,?,?,? FROM tasks WHERE org=? AND id=? AND revision=?',
        )
        .bind(c.actor, now, mutation, c.org, id, revision),
    ];
    for (const table of ['notes', 'activities', 'reviews', 'notices']) {
      work.push(
        c.db
          .prepare(`DELETE FROM ${table} WHERE org=? AND taskId=? AND ${guard}`)
          .bind(c.org, id, c.org, id, mutation),
      );
    }
    work.push(
      c.db
        .prepare(
          `DELETE FROM dailyPlanTasks WHERE org=? AND taskId=? AND ${guard}`,
        )
        .bind(c.org, id, c.org, id, mutation),
      c.db
        .prepare(
          `DELETE FROM captureEntries WHERE org=? AND (taskId=? OR (targetType='task' AND targetId=?)) AND ${guard}`,
        )
        .bind(c.org, id, id, c.org, id, mutation),
      c.db
        .prepare(
          `DELETE FROM resourceLinks WHERE org=? AND targetType='task' AND targetId=? AND ${guard}`,
        )
        .bind(c.org, id, c.org, id, mutation),
      c.db
        .prepare(
          `UPDATE prospectEvents SET taskId=NULL WHERE org=? AND taskId=? AND ${guard}`,
        )
        .bind(c.org, id, c.org, id, mutation),
      c.db
        .prepare(
          `DELETE FROM tasks WHERE org=? AND id=? AND revision=? AND ${guard}`,
        )
        .bind(c.org, id, revision, c.org, id, mutation),
    );
    const results = await c.db.batch(work);
    if (!results[0].meta.changes) {
      const raced = await c.db
        .prepare('SELECT revision FROM taskDeletions WHERE org=? AND id=?')
        .bind(c.org, id)
        .first<{ revision: number }>();
      if (raced?.revision === revision) return;
      throw new AppError(
        'The task changed or no longer exists. Refresh and try again.',
        409,
      );
    }
    return;
  }
  const archived = input.type === 'task-archive' ? 1 : 0;
  const results = await c.db.batch([
    c.db
      .prepare(
        'UPDATE tasks SET archived=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND archived<>?',
      )
      .bind(archived, now, mutation, c.org, id, revision, archived),
    c.db
      .prepare(
        'INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT org,?,id,?,?,? FROM tasks WHERE org=? AND id=? AND lastMutation=?',
      )
      .bind(
        mutation,
        archived ? 'Archived task' : 'Restored task',
        c.actor,
        now,
        c.org,
        id,
        mutation,
      ),
  ]);
  if (!results[0].meta.changes) {
    const current = await c.db
      .prepare('SELECT revision,archived FROM tasks WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ revision: number; archived: number }>();
    // Only the immediately preceding identical operation qualifies as a retry.
    if (current?.archived === archived && current.revision === revision + 1)
      return;
    throw new AppError(
      'The task changed or no longer exists. Refresh and try again.',
      409,
    );
  }
}
