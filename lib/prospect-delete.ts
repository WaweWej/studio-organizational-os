// Deleting a prospect: refused for converted ones, tasks detached, the
// timeline removed, and source calendar events marked ignored so the
// sales automation never resurrects the deleted ticket.
import { AppError, textValue } from './validation';

type DeleteContext = { db: D1Database; org: string };

// Delete a prospect from the pipeline. A converted prospect is a
// client's history and is refused — remove the client instead. Tasks
// referencing the prospect are detached, not destroyed. Calendar events
// that produced or point at the prospect are marked ignored so the sales
// automation never resurrects the deleted ticket.
export async function deleteProspect(c: DeleteContext, input: Record<string, unknown>) {
  const id = textValue(input.id, 'Prospect', 100, true);
  const row = await c.db
    .prepare(
      'SELECT id,clientId,convertedAt FROM prospects WHERE org=? AND id=?',
    )
    .bind(c.org, id)
    .first<{ id: string; clientId: string | null; convertedAt: string }>();
  if (!row) throw new AppError('That prospect was not found.', 404);
  if (row.clientId || row.convertedAt)
    throw new AppError(
      'This prospect became a client. Remove the client instead.',
      409,
    );
  await c.db.batch([
    c.db
      .prepare(
        "UPDATE calendarEvents SET prospectId='', prospectLink='ignored' WHERE org=? AND prospectId=?",
      )
      .bind(c.org, id),
    c.db
      .prepare(
        'UPDATE tasks SET prospectId=NULL WHERE org=? AND prospectId=?',
      )
      .bind(c.org, id),
    c.db
      .prepare('DELETE FROM prospectEvents WHERE org=? AND prospectId=?')
      .bind(c.org, id),
    c.db
      .prepare('DELETE FROM prospects WHERE org=? AND id=?')
      .bind(c.org, id),
  ]);
}
