import type { Context } from './store';
import type { Resource, ResourceTarget } from './resource-model';
import { AppError, textValue, revisionValue } from './validation';
export const MAX_FILE_SIZE = 20 * 1024 * 1024;
export async function upgradeResources(c: Context) {
  if (
    await c.db
      .prepare('SELECT org FROM resourceUpgrades WHERE org=? AND version>=2')
      .bind(c.org)
      .first()
  )
    return;
  const now = new Date().toISOString();
  await c.db.batch([
    c.db
      .prepare(
        "INSERT OR IGNORE INTO resources (org,id,title,kind,source,description,url,owner,createdAt,updatedAt) SELECT org,'tool-'||id,name,'tool','link',description,url,owner,?,? FROM tools WHERE org=?",
      )
      .bind(now, now, c.org),
    c.db
      .prepare(
        "INSERT OR IGNORE INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT org,'legacy-'||id,'tool-'||id,'project',projectId FROM tools WHERE org=? AND projectId<>''",
      )
      .bind(c.org),
    c.db
      .prepare(
        'INSERT INTO resourceUpgrades (org,version) VALUES (?,2) ON CONFLICT(org) DO UPDATE SET version=2',
      )
      .bind(c.org),
  ]);
}
export async function recordExists(
  c: Context,
  table: 'spaces' | 'projects' | 'tasks' | 'blueprints' | 'folders' | 'members',
  id: string,
) {
  if (
    !(await c.db
      .prepare(`SELECT id FROM ${table} WHERE org=? AND id=?`)
      .bind(c.org, id)
      .first())
  )
    throw new AppError('The selected record no longer exists.', 404);
}
export function resourceUrl(value: unknown) {
  const url = textValue(value ?? '', 'URL', 2000);
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Enter a complete https:// link.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
    throw new AppError('Use an HTTPS link without embedded credentials.');
  return parsed.href;
}
export async function validateTargets(
  c: Context,
  value: unknown,
): Promise<ResourceTarget[]> {
  if (!Array.isArray(value) || value.length > 100)
    throw new AppError('Choose up to 100 connections.');
  const targets: ResourceTarget[] = [];
  const table = {
    space: 'spaces',
    project: 'projects',
    task: 'tasks',
    blueprint: 'blueprints',
  } as const;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || !Object.hasOwn(table, raw.type))
      throw new AppError('Invalid connection.');
    const type = raw.type as ResourceTarget['type'],
      id = textValue(raw.id, 'Connection', 100, true);
    await recordExists(c, table[type], id);
    if (!targets.some((t) => t.type === type && t.id === id))
      targets.push({ type, id });
  }
  return targets;
}
export function sealedValue(value: unknown): string {
  if (!value || typeof value !== 'object')
    throw new AppError('Encrypted credentials are required.');
  const v = value as Record<string, unknown>;
  const valid = (x: unknown, min: number, max: number) => {
    if (
      typeof x !== 'string' ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(x) ||
      x.length % 4 ||
      x.length > max * 2
    )
      return false;
    try {
      const bytes = atob(x);
      return bytes.length >= min && bytes.length <= max;
    } catch {
      return false;
    }
  };
  if (
    v.version !== 1 ||
    !valid(v.iv, 12, 12) ||
    !valid(v.ciphertext, 16, 50000)
  )
    throw new AppError('Invalid encrypted payload.');
  return JSON.stringify({ version: 1, iv: v.iv, ciphertext: v.ciphertext });
}
export async function mutateResource(
  c: Context,
  input: Record<string, unknown>,
) {
  const type = input.type,
    now = new Date().toISOString();
  if (type === 'folder-create') {
    const name = textValue(input.name, 'Folder name', 100, true),
      parentId = textValue(input.parentId ?? '', 'Parent folder', 100) || null;
    if (parentId) await recordExists(c, 'folders', parentId);
    await c.db
      .prepare('INSERT INTO folders (org,id,name,parentId) VALUES (?,?,?,?)')
      .bind(c.org, crypto.randomUUID(), name, parentId)
      .run();
    return;
  }
  if (type === 'blueprint-create') {
    const name = textValue(input.name, 'Blueprint name', 180, true),
      description = textValue(input.description ?? '', 'Description', 10000),
      projectId = textValue(input.projectId ?? '', 'Project', 100) || null,
      spaceId = textValue(input.spaceId ?? '', 'Client', 100) || null;
    if (projectId) await recordExists(c, 'projects', projectId);
    if (spaceId) await recordExists(c, 'spaces', spaceId);
    await c.db
      .prepare(
        'INSERT INTO blueprints (org,id,name,description,projectId,spaceId) VALUES (?,?,?,?,?,?)',
      )
      .bind(c.org, crypto.randomUUID(), name, description, projectId, spaceId)
      .run();
    return;
  }
  const id = textValue(input.id, 'Resource', 100, true);
  const existing = await c.db
    .prepare('SELECT * FROM resources WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Resource & { fileKey: string }>();
  if (type === 'resource-archive') {
    if (!existing) throw new AppError('Resource not found.', 404);
    const revision = revisionValue(input.revision);
    const archived = input.archived === true ? 1 : 0;
    const result = await c.db
      .prepare(
        'UPDATE resources SET archived=?,revision=revision+1,updatedAt=? WHERE org=? AND id=? AND revision=?',
      )
      .bind(archived, now, c.org, id, revision)
      .run();
    if (!result.meta.changes)
      throw new AppError(
        'This resource changed. Reopen it and try again.',
        409,
      );
    return;
  }
  if (type !== 'resource-save') throw new AppError('Unknown resource action.');
  if (existing && existing.revision !== revisionValue(input.revision))
    throw new AppError(
      'This resource changed. Reopen it to get the latest version.',
      409,
    );
  if (!existing && input.revision !== undefined)
    throw new AppError('Resource not found.', 404);
  const kind = textValue(input.kind, 'Resource type', 20, true),
    source = existing?.source || textValue(input.source, 'Source', 20, true);
  if (
    !['asset', 'tool', 'template', 'vault'].includes(kind) ||
    !['link', 'text', 'vault', 'file', 'html'].includes(source)
  )
    throw new AppError('Invalid resource type.');
  if (existing && kind !== existing.kind)
    throw new AppError('A resource’s type cannot be changed.');
  if (!existing && ['file', 'html'].includes(source))
    throw new AppError('Upload the file first.');
  if (
    (kind === 'vault') !== (source === 'vault') ||
    (source === 'html' && kind !== 'tool')
  )
    throw new AppError('Invalid resource source.');
  const title = textValue(input.title, 'Title', 180, true),
    description = textValue(input.description ?? '', 'Description', 10000),
    category = textValue(input.category ?? '', 'Category', 100),
    owner = textValue(input.owner ?? c.actor, 'Owner', 100, true),
    folderId = textValue(input.folderId ?? '', 'Folder', 100) || null;
  await recordExists(c, 'members', owner);
  if (folderId) await recordExists(c, 'folders', folderId);
  const url = kind === 'vault' ? '' : resourceUrl(input.url),
    content =
      kind === 'vault'
        ? ''
        : textValue(input.content ?? '', 'Template content', 40000);
  if (source === 'link' && !url && !existing)
    throw new AppError('Add the destination link.');
  if (source === 'text' && !content)
    throw new AppError('Add some template content.');
  const targets = await validateTargets(c, input.targets ?? []),
    nonce = crypto.randomUUID(),
    shared = input.shared === true ? 1 : 0;
  const sealed =
    kind === 'vault' && input.sealed ? sealedValue(input.sealed) : null;
  if (
    kind === 'vault' &&
    ((!existing && !sealed) ||
      !(await c.db
        .prepare('SELECT org FROM vaultConfig WHERE org=?')
        .bind(c.org)
        .first()))
  )
    throw new AppError('Unlock or set up the vault before saving credentials.');
  const update = existing
    ? c.db
        .prepare(
          'UPDATE resources SET title=?,description=?,url=?,content=?,category=?,folderId=?,owner=?,shared=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=?',
        )
        .bind(
          title,
          description,
          url,
          content,
          category,
          folderId,
          owner,
          shared,
          now,
          nonce,
          c.org,
          id,
          existing.revision,
        )
    : c.db
        .prepare(
          'INSERT OR IGNORE INTO resources (org,id,title,kind,source,description,url,content,category,folderId,owner,shared,createdAt,updatedAt,lastMutation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          c.org,
          id,
          title,
          kind,
          source,
          description,
          url,
          content,
          category,
          folderId,
          owner,
          shared,
          now,
          now,
          nonce,
        );
  const guard =
    'EXISTS (SELECT 1 FROM resources WHERE org=? AND id=? AND lastMutation=?)';
  const statements = [
    update,
    c.db
      .prepare(
        `DELETE FROM resourceLinks WHERE org=? AND resourceId=? AND ${guard}`,
      )
      .bind(c.org, id, c.org, id, nonce),
    ...targets.map((t) =>
      c.db
        .prepare(
          `INSERT OR IGNORE INTO resourceLinks (org,id,resourceId,targetType,targetId) SELECT ?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          c.org,
          `${id}:${t.type}:${t.id}`,
          id,
          t.type,
          t.id,
          c.org,
          id,
          nonce,
        ),
    ),
  ];
  if (sealed)
    statements.push(
      c.db
        .prepare(
          `INSERT INTO vaultEntries (org,id,sealed) SELECT ?,?,? WHERE ${guard} ON CONFLICT(org,id) DO UPDATE SET sealed=excluded.sealed`,
        )
        .bind(c.org, id, sealed, c.org, id, nonce),
    );
  const result = await c.db.batch(statements);
  if (!result[0].meta.changes)
    throw new AppError('This resource changed. Reopen it and try again.', 409);
}
