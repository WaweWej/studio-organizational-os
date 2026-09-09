import type { Context } from './store';
import { AppError, textValue, revisionValue, dateValue } from './validation';
import { parseSalesCapture, salesStages, type Prospect } from './sales-model';

export async function mutateSales(c: Context, input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const nonce = crypto.randomUUID();
  if (input.type === 'sales-capture') {
    const id = textValue(input.captureId, 'Capture ID', 36, true);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new AppError('Invalid capture ID.');
    const text = textValue(input.captureText, 'Sales note', 2000, true);
    const day = dateValue(input.captureDay);
    if (!day) throw new AppError('Capture date is required.');
    const draft = parseSalesCapture(text, new Date(`${day}T12:00:00`));
    if (!draft || draft.errors.length)
      throw new AppError(
        draft?.errors[0] || 'Write a sales meeting and its next step.',
      );
    const fingerprint = JSON.stringify({ text, day });
    const existing = await c.db
      .prepare('SELECT fingerprint FROM prospectEvents WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ fingerprint: string }>();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new AppError(
          'This capture was already saved with different details.',
          409,
        );
      return;
    }
    // One D1 transaction creates/locates the prospect, records the conversation,
    // and attaches one canonical task. The nonce prevents duplicate retry effects.
    const results = await c.db.batch([
      c.db
        .prepare(`INSERT OR IGNORE INTO prospects (org,id,name,nameKey,owner,stage,revision,createdAt,updatedAt,lastMutation)
        SELECT ?,?,?,?,?,'Discovery',0,?,?,? WHERE NOT EXISTS (SELECT 1 FROM prospectEvents WHERE org=? AND id=?)`)
        .bind(
          c.org,
          crypto.randomUUID(),
          draft.name,
          draft.nameKey,
          c.actor,
          now,
          now,
          nonce,
          c.org,
          id,
        ),
      c.db
        .prepare(`INSERT OR IGNORE INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt,fingerprint,lastMutation)
        SELECT ?,?,id,?,?,'meeting',?,?,?,? FROM prospects WHERE org=? AND nameKey=?`)
        .bind(
          c.org,
          id,
          id,
          text,
          c.actor,
          now,
          fingerprint,
          nonce,
          c.org,
          draft.nameKey,
        ),
      c.db
        .prepare(`INSERT INTO tasks (org,id,title,projectId,spaceId,prospectId,assignee,reviewer,stage,description,due,priority,blocked,deliverable,delivery,version,revision,position,meetingId,updatedAt,lastMutation)
        SELECT ?,?,?,NULL,NULL,prospectId,?,?,'Up next',?,?,'Normal','','','Not configured',0,0,(SELECT COALESCE(MIN(position),0)-1 FROM tasks WHERE org=?),NULL,?,? FROM prospectEvents WHERE org=? AND id=? AND lastMutation=?`)
        .bind(
          c.org,
          id,
          draft.nextStep,
          c.actor,
          c.actor,
          `Next action from the sales meeting with ${draft.name}.\n\n${text}`,
          draft.due,
          c.org,
          now,
          nonce,
          c.org,
          id,
          nonce,
        ),
      c.db
        .prepare(
          `INSERT INTO activities (org,id,taskId,body,actor,createdAt) SELECT ?,?,?,?,?,? FROM prospectEvents WHERE org=? AND id=? AND lastMutation=?`,
        )
        .bind(
          c.org,
          crypto.randomUUID(),
          id,
          `Sales meeting recorded. Next action linked to ${draft.name}.`,
          c.actor,
          now,
          c.org,
          id,
          nonce,
        ),
    ]);
    if (!results[1].meta.changes) {
      const saved = await c.db
        .prepare('SELECT fingerprint FROM prospectEvents WHERE org=? AND id=?')
        .bind(c.org, id)
        .first<{ fingerprint: string }>();
      if (saved?.fingerprint !== fingerprint)
        throw new AppError(
          'This capture was already saved with different details.',
          409,
        );
    }
    return;
  }
  if (input.type === 'sales-stage') {
    const id = textValue(input.id, 'Prospect', 100, true);
    const revision = revisionValue(input.revision);
    const stage = textValue(input.stage, 'Pipeline stage', 30, true);
    if (!salesStages.includes(stage as (typeof salesStages)[number]))
      throw new AppError('Choose a valid pipeline stage.');
    const prospect = await c.db
      .prepare('SELECT * FROM prospects WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<Prospect>();
    if (!prospect) throw new AppError('Prospect not found.', 404);
    if (prospect.revision !== revision)
      throw new AppError(
        'This prospect has changed. Refresh before updating it.',
        409,
      );
    if (prospect.stage === stage) return;
    const result = await c.db.batch([
      c.db
        .prepare(
          'UPDATE prospects SET stage=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=?',
        )
        .bind(stage, now, nonce, c.org, id, revision),
      c.db
        .prepare(`INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt,fingerprint,lastMutation)
        SELECT ?,?,?,NULL,?,'stage',?,?,?,? WHERE EXISTS (SELECT 1 FROM prospects WHERE org=? AND id=? AND lastMutation=?)`)
        .bind(
          c.org,
          crypto.randomUUID(),
          id,
          `Moved from ${prospect.stage} to ${stage}`,
          c.actor,
          now,
          '',
          nonce,
          c.org,
          id,
          nonce,
        ),
    ]);
    if (!result[0].meta.changes)
      throw new AppError(
        'This prospect has changed. Refresh before updating it.',
        409,
      );
    return;
  }
  throw new AppError('Unknown sales action.');
}
