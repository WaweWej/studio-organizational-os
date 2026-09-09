import { readWorkspace, type Context } from './store';
import { captureInsert } from './entry-store';
import { AppError, textValue, dateValue } from './validation';

export async function mutateProjectCapture(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.captureId, 'Capture ID', 36, true);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new AppError('Invalid capture ID.');
  const name = textValue(input.name, 'Project name', 180, true),
    description = textValue(input.description ?? '', 'Project brief', 10000),
    due = dateValue(input.due ?? ''),
    spaceId = textValue(input.spaceId ?? '', 'Client', 100) || null,
    sourceText = textValue(input.captureText, 'Entry', 2000, true);
  if (!Array.isArray(input.resourceIds) || input.resourceIds.length > 30)
    throw new AppError('Choose up to 30 project files.');
  const resourceIds = [
    ...new Set(
      input.resourceIds.map((id) => textValue(id, 'Resource', 100, true)),
    ),
  ].sort();
  const fingerprint = JSON.stringify({
    name,
    description,
    due,
    spaceId,
    sourceText,
    resourceIds,
  });
  const saved = await c.db
    .prepare('SELECT fingerprint FROM captureEntries WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<{ fingerprint: string }>();
  if (saved) {
    if (saved.fingerprint !== fingerprint)
      throw new AppError(
        'This project entry was already saved with different details.',
        409,
      );
    return;
  }
  const data = await readWorkspace(c);
  if (spaceId && !data.spaces.some((s) => s.id === spaceId))
    throw new AppError('This client is no longer available.', 404);
  for (const id of resourceIds)
    if (
      !data.resources.some(
        (r) => r.id === id && !r.archived && r.kind !== 'vault',
      )
    )
      throw new AppError(
        'A selected project resource is no longer available.',
        404,
      );
  const now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  const guard =
    'EXISTS (SELECT 1 FROM captureEntries WHERE org=? AND id=? AND lastMutation=?)';
  const result = await c.db.batch([
    captureInsert(
      c,
      {
        id,
        kind: 'project',
        sourceText,
        title: name,
        body: description,
        targetType: 'project',
        targetId: id,
        spaceId,
        projectId: id,
        taskId: null,
        actor: c.actor,
        createdAt: now,
      },
      nonce,
      fingerprint,
    ),
    c.db
      .prepare(
        'INSERT INTO projects (org,id,name,spaceId,description,due) SELECT ?,?,?,?,?,? WHERE ' +
          guard,
      )
      .bind(c.org, id, name, spaceId, description, due, c.org, id, nonce),
    ...resourceIds.map((resourceId) =>
      c.db
        .prepare(
          'INSERT INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT ?,?,?,?,? WHERE ' +
            guard,
        )
        .bind(
          c.org,
          resourceId + ':project:' + id,
          resourceId,
          'project',
          id,
          c.org,
          id,
          nonce,
        ),
    ),
    ...(spaceId
      ? [
          c.db
            .prepare(
              'INSERT INTO spaceEvents (org,id,spaceId,meetingId,body,snapshot,actor,createdAt) SELECT ?,?,?,NULL,?,?,?,? WHERE ' +
                guard,
            )
            .bind(
              c.org,
              crypto.randomUUID(),
              spaceId,
              'Created project: ' + name,
              JSON.stringify({ captureId: id, projectId: id }),
              c.actor,
              now,
              c.org,
              id,
              nonce,
            ),
        ]
      : []),
  ]);
  if (!result[0].meta.changes) {
    const existing = await c.db
      .prepare('SELECT fingerprint FROM captureEntries WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ fingerprint: string }>();
    if (existing?.fingerprint !== fingerprint)
      throw new AppError('This entry was saved with different details.', 409);
  }
}
