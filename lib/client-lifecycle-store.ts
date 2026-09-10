import type { Context } from './store';
import type { Space } from './model';
import { AppError, textValue, revisionValue } from './validation';
import { prospectNameKey } from './sales-model';

export async function mutateClientLifecycle(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.id, 'Client', 100, true);
  const revision = revisionValue(input.revision);
  const action = input.type === 'client-to-prospect' ? 'sales' : 'delete';
  const previous = await c.db
    .prepare('SELECT revision,action FROM clientRemovals WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<{ revision: number; action: string }>();
  if (previous) {
    if (previous.revision === revision && previous.action === action) return;
    throw new AppError('This client has already been removed.', 409);
  }
  const space = await c.db
    .prepare('SELECT * FROM spaces WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Space>();
  if (!space) throw new AppError('Client not found.', 404);
  if (space.revision !== revision)
    throw new AppError('This client changed. Refresh and try again.', 409);
  if (
    action === 'sales' &&
    (await c.db
      .prepare('SELECT id FROM meetings WHERE org=? AND spaceId=?')
      .bind(c.org, id)
      .first())
  )
    throw new AppError(
      'This client has meeting records. Move to Sales is available for clients without meetings; keep this space to preserve its meeting history.',
    );
  const nameKey = prospectNameKey(space.name);
  const existing =
    action === 'sales'
      ? await c.db
          .prepare(
            'SELECT id FROM prospects WHERE org=? AND (clientId=? OR nameKey=?) ORDER BY CASE WHEN clientId=? THEN 0 ELSE 1 END LIMIT 1',
          )
          .bind(c.org, id, nameKey, id)
          .first<{ id: string }>()
      : null;
  const prospectId =
    action === 'sales' ? existing?.id || crypto.randomUUID() : null;
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const guard =
    'EXISTS (SELECT 1 FROM clientRemovals WHERE org=? AND id=? AND mutation=?)';
  const affected =
    '(spaceId=? OR projectId IN (SELECT id FROM projects WHERE org=? AND spaceId=?))';
  const work = [
    c.db
      .prepare(`INSERT OR IGNORE INTO clientRemovals (org,id,revision,action,prospectId,actor,createdAt,mutation)
    SELECT org,id,revision,?,?,?,?,? FROM spaces WHERE org=? AND id=? AND revision=? ${action === 'sales' ? 'AND NOT EXISTS (SELECT 1 FROM meetings WHERE org=? AND spaceId=?)' : ''}`)
      .bind(
        action,
        prospectId,
        c.actor,
        now,
        mutation,
        c.org,
        id,
        revision,
        ...(action === 'sales' ? [c.org, id] : []),
      ),
  ];
  const add = (sql: string, values: unknown[]) =>
    work.push(
      c.db.prepare(sql + ' AND ' + guard).bind(...values, c.org, id, mutation),
    );
  if (prospectId) {
    if (!existing)
      add(
        `INSERT INTO prospects (org,id,name,nameKey,owner,stage,revision,createdAt,updatedAt,lastMutation)
      SELECT ?,?,?,?,?,'New',0,?,?,? WHERE 1`,
        [
          c.org,
          prospectId,
          space.name,
          nameKey,
          space.owner,
          now,
          now,
          mutation,
        ],
      );
    add(
      `INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt)
      SELECT ?,?,?,NULL,?,'context',?,? WHERE 1`,
      [
        c.org,
        crypto.randomUUID(),
        prospectId,
        'Moved from Clients to Sales.\n' +
          Object.entries(space)
            .filter(
              ([key, value]) =>
                !['id', 'revision', 'lastMutation', 'org'].includes(key) &&
                value,
            )
            .map(([key, value]) => key + ': ' + value)
            .join('\n'),
        c.actor,
        now,
      ],
    );
    add(
      `INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt)
      SELECT org,lower(hex(randomblob(16))),?,id,'Linked task: '||title,'task',?,? FROM tasks WHERE org=? AND ${affected}`,
      [prospectId, c.actor, now, c.org, id, c.org, id],
    );
  }
  add(
    `INSERT INTO activities (org,id,taskId,body,actor,createdAt)
    SELECT org,lower(hex(randomblob(16))),id,?,?,? FROM tasks WHERE org=? AND ${affected}`,
    [
      prospectId
        ? 'Client moved to Sales; task linked to prospect.'
        : 'Client removed; task retained.',
      c.actor,
      now,
      c.org,
      id,
      c.org,
      id,
    ],
  );
  add(
    `UPDATE tasks SET spaceId=NULL,${prospectId ? 'prospectId=?,' : ''} meetingId=CASE WHEN meetingId IN (SELECT id FROM meetings WHERE org=? AND spaceId=?) THEN NULL ELSE meetingId END,
    revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND (${affected} OR meetingId IN (SELECT id FROM meetings WHERE org=? AND spaceId=?))`,
    [
      ...(prospectId ? [prospectId] : []),
      c.org,
      id,
      now,
      mutation,
      c.org,
      id,
      c.org,
      id,
      c.org,
      id,
    ],
  );
  // Standalone notes stay searchable in Desk history; receipts lose deleted destinations.
  add(
    `UPDATE captureEntries SET spaceId=NULL,targetType=CASE WHEN targetType IN ('space','meeting') THEN 'note' ELSE targetType END,
    targetId=CASE WHEN targetType IN ('space','meeting') THEN id ELSE targetId END WHERE org=? AND (spaceId=? OR (targetType='space' AND targetId=?) OR (targetType='meeting' AND targetId IN (SELECT id FROM meetings WHERE org=? AND spaceId=?)))`,
    [c.org, id, id, c.org, id],
  );
  add(
    `DELETE FROM resourceLinks WHERE org=? AND ((targetType='space' AND targetId=?) OR (targetType='meeting' AND targetId IN (SELECT id FROM meetings WHERE org=? AND spaceId=?)))`,
    [c.org, id, c.org, id],
  );
  for (const table of ['projects', 'blueprints'])
    add(`UPDATE ${table} SET spaceId=NULL WHERE org=? AND spaceId=?`, [
      c.org,
      id,
    ]);
  add(
    `UPDATE calendarEvents SET archived=1,meetingId=NULL,revision=revision+1,updatedAt=? WHERE org=? AND meetingId IN (SELECT id FROM meetings WHERE org=? AND spaceId=?)`,
    [now, c.org, c.org, id],
  );
  for (const table of ['spaceEvents', 'meetings'])
    add(`DELETE FROM ${table} WHERE org=? AND spaceId=?`, [c.org, id]);
  add(
    `UPDATE prospects SET clientId=NULL,convertedAt='',conversionFingerprint='',${action === 'sales' ? "stage='New'," : ''}revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND clientId=?`,
    [now, mutation, c.org, id],
  );
  add('DELETE FROM spaces WHERE org=? AND id=? AND revision=?', [
    c.org,
    id,
    revision,
  ]);
  const results = await c.db.batch(work);
  if (!results[0].meta.changes) {
    const raced = await c.db
      .prepare(
        'SELECT revision,action FROM clientRemovals WHERE org=? AND id=?',
      )
      .bind(c.org, id)
      .first<{ revision: number; action: string }>();
    if (raced?.revision === revision && raced.action === action) return;
    throw new AppError('This client changed. Refresh and try again.', 409);
  }
}
