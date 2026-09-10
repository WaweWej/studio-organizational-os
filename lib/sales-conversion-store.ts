import type { Context } from './store';
import type { Prospect } from './sales-model';
import { prospectNameKey } from './sales-model';
import { AppError, textValue, revisionValue } from './validation';

export async function convertProspect(
  c: Context,
  input: Record<string, unknown>,
) {
  const id = textValue(input.id, 'Prospect', 100, true),
    revision = revisionValue(input.revision);
  const fields = {
    name: textValue(input.name, 'Client name', 100, true),
    brief: textValue(input.brief || '', 'Brief', 10000),
    wants: textValue(input.wants || '', 'Goals', 5000),
    needs: textValue(input.needs || '', 'Needs', 5000),
    website: textValue(input.website || '', 'Website', 2000),
    owner: textValue(input.owner, 'Account lead', 100, true),
  };
  if (fields.website) {
    try {
      const u = new URL(fields.website);
      if (u.protocol !== 'https:' || u.username || u.password)
        throw new Error();
    } catch {
      throw new AppError('Website must be a complete HTTPS address.');
    }
  }
  const fingerprint = JSON.stringify({ revision, fields });
  const p = await c.db
    .prepare('SELECT * FROM prospects WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Prospect>();
  if (!p) throw new AppError('Prospect not found.', 404);
  if (p.convertedAt) {
    if (p.conversionFingerprint === fingerprint) return;
    throw new AppError(
      'This prospect already became a client. Open the client to edit its details.',
      409,
    );
  }
  if (p.revision !== revision || p.stage !== 'Won')
    throw new AppError(
      'Mark this prospect Won and refresh before creating its client record.',
      409,
    );
  if (
    !(await c.db
      .prepare('SELECT id FROM members WHERE org=? AND id=?')
      .bind(c.org, fields.owner)
      .first())
  )
    throw new AppError('Choose an available account lead.');
  const { results: clients } = await c.db
    .prepare(
      "SELECT id,name,revision FROM spaces WHERE org=? AND type='Client'",
    )
    .bind(c.org)
    .all<{ id: string; name: string; revision: number }>();
  const linked = clients.find((s) => s.id === p.clientId);
  if (
    clients.some(
      (s) =>
        s.id !== linked?.id &&
        prospectNameKey(s.name) === prospectNameKey(fields.name),
    )
  )
    throw new AppError(
      'A client with this name already exists. Use a distinct client name.',
    );
  const clientRevision = linked ? revisionValue(input.clientRevision) : null;
  if (linked && linked.revision !== clientRevision)
    throw new AppError('The client details changed. Reopen the form.', 409);
  const clientId = linked?.id || crypto.randomUUID(),
    nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  const guard =
    'EXISTS (SELECT 1 FROM prospects WHERE org=? AND id=? AND lastMutation=?)';
  const work = [
    c.db
      .prepare(
        `UPDATE prospects SET clientId=?,convertedAt=?,conversionFingerprint=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND stage='Won' AND convertedAt=''${linked ? ' AND EXISTS (SELECT 1 FROM spaces WHERE org=? AND id=? AND revision=?)' : ''}`,
      )
      .bind(
        clientId,
        now,
        fingerprint,
        now,
        nonce,
        c.org,
        id,
        revision,
        ...(linked ? [c.org, clientId, clientRevision] : []),
      ),
  ];
  if (linked)
    work.push(
      c.db
        .prepare(
          `UPDATE spaces SET name=?,brief=?,wants=?,needs=?,website=?,owner=?,revision=revision+1,lastMutation=? WHERE org=? AND id=? AND revision=? AND ${guard}`,
        )
        .bind(
          ...Object.values(fields),
          nonce,
          c.org,
          clientId,
          clientRevision,
          c.org,
          id,
          nonce,
        ),
    );
  else
    work.push(
      c.db
        .prepare(`INSERT INTO spaces (org,id,name,brief,wants,needs,website,owner,type,color,meeting)
    SELECT ?,?,?,?,?,?,?,?,'Client','#6471bf','' WHERE ${guard}`)
        .bind(c.org, clientId, ...Object.values(fields), c.org, id, nonce),
    );
  work.push(
    c.db
      .prepare(`INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt)
    SELECT ?,?,?,NULL,?,'client',?,? WHERE ${guard}`)
      .bind(
        c.org,
        crypto.randomUUID(),
        id,
        'Confirmed client record: ' + fields.name,
        c.actor,
        now,
        c.org,
        id,
        nonce,
      ),
  );
  work.push(
    c.db
      .prepare(`INSERT INTO spaceEvents (org,id,spaceId,meetingId,body,snapshot,actor,createdAt)
    SELECT ?,?,?,NULL,?,'{}',?,? WHERE ${guard}`)
      .bind(
        c.org,
        crypto.randomUUID(),
        clientId,
        'Client created from won prospect: ' + p.name,
        c.actor,
        now,
        c.org,
        id,
        nonce,
      ),
  );
  work.push(
    c.db
      .prepare(
        `UPDATE meetings SET spaceId=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND prospectId=? AND ${guard}`,
      )
      .bind(clientId, now, nonce, c.org, id, c.org, id, nonce),
    c.db
      .prepare(
        `UPDATE spaceEvents SET spaceId=? WHERE org=? AND prospectId=? AND ${guard}`,
      )
      .bind(clientId, c.org, id, c.org, id, nonce),
  );
  const results = await c.db.batch(work);
  if (!results[0].meta.changes) {
    const saved = await c.db
      .prepare(
        'SELECT conversionFingerprint FROM prospects WHERE org=? AND id=?',
      )
      .bind(c.org, id)
      .first<{ conversionFingerprint: string }>();
    if (saved?.conversionFingerprint === fingerprint) return;
    throw new AppError('The prospect changed. Reopen the form.', 409);
  }
}
