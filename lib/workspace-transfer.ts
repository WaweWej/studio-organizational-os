import type { Context } from './store';
import { AppError } from './validation';

// Export/import is a maintenance operation, never a seed or an app update.
export const transferTables = [
  'members',
  'spaces',
  'projects',
  'tasks',
  'meetings',
  'spaceEvents',
  'notes',
  'activities',
  'reviews',
  'notices',
  'tools',
  'documents',
  'resources',
  'resourceLinks',
  'folders',
  'blueprints',
  'prospects',
  'prospectEvents',
  'captureEntries',
  'taskDeletions',
  'calendarEvents',
  'calendarHistory',
  'dailyPlans',
  'dailyPlanTasks',
  'clientRemovals',
  'vaultConfig',
  'vaultEntries',
] as const;
type Row = Record<string, string | number | null>;
export type WorkspaceSnapshot = {
  format: 'studio-workspace-v1';
  sourceOrg: string;
  name: string;
  exportedAt: string;
  tables: Record<(typeof transferTables)[number], Row[]>;
};
const fail = () =>
  new AppError('This is not a supported Studio workspace snapshot.');
export async function importWorkspace(c: Context, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail();
  const snapshot = input as WorkspaceSnapshot;
  if (
    snapshot.format !== 'studio-workspace-v1' ||
    typeof snapshot.sourceOrg !== 'string' ||
    !snapshot.sourceOrg ||
    typeof snapshot.name !== 'string' ||
    snapshot.name.length > 200 ||
    !snapshot.tables ||
    typeof snapshot.tables !== 'object' ||
    Array.isArray(snapshot.tables)
  )
    throw fail();
  if (
    Object.keys(snapshot.tables).length !== transferTables.length ||
    Object.keys(snapshot.tables).some(
      (t) => !transferTables.includes(t as (typeof transferTables)[number]),
    )
  )
    throw fail();
  let recordCount = 0;
  for (const table of transferTables) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows)) throw fail();
    recordCount += rows.length;
    if (recordCount > 400)
      throw new AppError(
        'This workspace needs a larger, separately planned transfer.',
      );
  }
  if (
    snapshot.tables.vaultConfig.length ||
    snapshot.tables.vaultEntries.length ||
    snapshot.tables.resources.some((r) => r.fileKey || r.source === 'upload')
  )
    throw new AppError(
      'Files and encrypted vault records require a separate transfer. Nothing was imported.',
    );
  if (snapshot.tables.members.filter((r) => r.id === 'me').length !== 1)
    throw fail();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(snapshot)),
      ),
    ),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const previous = await c.db
    .prepare('SELECT digest,recordCount FROM workspaceTransfers WHERE org=?')
    .bind(c.org)
    .first<{ digest: string; recordCount: number }>();
  if (previous) {
    if (previous.digest === digest)
      return {
        recordCount: previous.recordCount,
        alreadyImported: true,
        digest,
      };
    throw new AppError(
      'This workspace has already received a transfer. Nothing was overwritten.',
      409,
    );
  }
  // All records carry their original IDs. Only the scoped organization changes.
  // Validate identifiers against actual schema columns before composing SQL.
  const validated: { table: string; rows: Row[] }[] = [];
  for (const table of transferTables) {
    const { results: columns } = await c.db
      .prepare(`PRAGMA table_info("${table}")`)
      .all<{ name: string; notnull: number; dflt_value: unknown }>();
    const names = new Set(columns.map((c) => c.name));
    for (const row of snapshot.tables[table]) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        row.org !== snapshot.sourceOrg
      )
        throw fail();
      for (const [key, value] of Object.entries(row)) {
        if (
          !names.has(key) ||
          !(
            value === null ||
            typeof value === 'string' ||
            (typeof value === 'number' && Number.isFinite(value))
          )
        )
          throw fail();
        if (typeof value === 'string' && value.length > 100000) throw fail();
      }
      if (
        columns.some(
          (col) =>
            col.notnull &&
            col.dflt_value === null &&
            (row[col.name] === undefined || row[col.name] === null),
        )
      )
        throw fail();
    }
    validated.push({ table, rows: snapshot.tables[table] });
  }
  const nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  const empty = transferTables
    .map(
      (table) =>
        `NOT EXISTS (SELECT 1 FROM "${table}" WHERE org=?${table === 'members' ? " AND id<>'me'" : ''})`,
    )
    .join(' AND ');
  const guard =
    'EXISTS (SELECT 1 FROM workspaceTransfers WHERE org=? AND mutation=?)';
  const work = [
    c.db
      .prepare(
        `INSERT OR IGNORE INTO workspaceTransfers (org,digest,recordCount,createdAt,mutation) SELECT ?,?,?,?,? WHERE ${empty}`,
      )
      .bind(
        c.org,
        digest,
        recordCount,
        now,
        nonce,
        ...transferTables.map(() => c.org),
      ),
  ];
  for (const { table, rows } of validated)
    for (const row of rows) {
      const { org: _source, ...record } = row;
      void _source;
      const columns = Object.keys(record);
      if (table === 'members' && record.id === 'me') {
        work.push(
          c.db
            .prepare(
              `UPDATE members SET name=?,role=?,color=? WHERE org=? AND id='me' AND ${guard}`,
            )
            .bind(record.name, record.role, record.color, c.org, c.org, nonce),
        );
      } else {
        work.push(
          c.db
            .prepare(
              `INSERT INTO "${table}" (org,${columns.map((k) => `"${k}"`).join(',')}) SELECT ?,${columns.map(() => '?').join(',')} WHERE ${guard}`,
            )
            .bind(c.org, ...Object.values(record), c.org, nonce),
        );
      }
    }
  work.push(
    c.db
      .prepare(`UPDATE organizations SET name=? WHERE id=? AND ${guard}`)
      .bind(snapshot.name, c.org, c.org, nonce),
  );
  const result = await c.db.batch(work);
  if (!result[0].meta.changes) {
    const raced = await c.db
      .prepare('SELECT digest,recordCount FROM workspaceTransfers WHERE org=?')
      .bind(c.org)
      .first<{ digest: string; recordCount: number }>();
    if (raced?.digest === digest)
      return { recordCount: raced.recordCount, alreadyImported: true, digest };
    throw new AppError(
      'The online workspace contains work. Nothing was overwritten.',
      409,
    );
  }
  return { recordCount, alreadyImported: false, digest };
}
