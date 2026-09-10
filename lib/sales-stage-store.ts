import type { Context } from './store';
import { AppError, textValue, revisionValue } from './validation';
import { salesStages, type Prospect } from './sales-model';

export async function changeSalesStage(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.id, 'Prospect', 100, true);
  const revision = revisionValue(input.revision);
  const stage = textValue(input.stage, 'Pipeline stage', 30, true);
  if (!salesStages.includes(stage as (typeof salesStages)[number]))
    throw new AppError('Choose a valid pipeline stage.');
  const p = await c.db
    .prepare('SELECT * FROM prospects WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Prospect>();
  if (!p) throw new AppError('Prospect not found.', 404);
  if (p.convertedAt) throw new AppError('This prospect is now a client.', 409);
  if (p.revision !== revision) {
    if (p.revision === revision + 1 && p.stage === stage) return;
    throw new AppError(
      'This prospect changed. Refresh before updating it.',
      409,
    );
  }
  if (p.stage === stage) return;
  const nonce = crypto.randomUUID(),
    now = new Date().toISOString();

  const guard =
    'EXISTS (SELECT 1 FROM prospects WHERE org=? AND id=? AND lastMutation=?)';
  const work = [
    c.db
      .prepare(
        "UPDATE prospects SET stage=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND convertedAt=''",
      )
      .bind(stage, now, nonce, c.org, id, revision),
    c.db
      .prepare(`INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt,lastMutation)
    SELECT ?,?,?,NULL,?,'stage',?,?,? WHERE ${guard}`)
      .bind(
        c.org,
        crypto.randomUUID(),
        id,
        `Moved from ${p.stage} to ${stage}`,
        c.actor,
        now,
        nonce,
        c.org,
        id,
        nonce,
      ),
  ];
  const result = await c.db.batch(work);
  if (!result[0].meta.changes) {
    const saved = await c.db
      .prepare(
        'SELECT revision,stage,clientId FROM prospects WHERE org=? AND id=?',
      )
      .bind(c.org, id)
      .first<Prospect>();
    if (saved?.revision === revision + 1 && saved.stage === stage) return;
    throw new AppError(
      'This prospect or client changed. Refresh before updating it.',
      409,
    );
  }
}
