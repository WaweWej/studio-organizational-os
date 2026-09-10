// Export one organization from a consistent local SQLite backup. No writes to source.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transferTables } from '../lib/workspace-transfer.ts';
const [source, output, organization] = process.argv.slice(2);
if (!source || !output)
  throw new Error(
    'Usage: node --import ./tests/ts-loader.mjs scripts/export-workspace.mjs BACKUP.sqlite OUTPUT.json [ORGANIZATION]',
  );
const db = new DatabaseSync(resolve(source), { readOnly: true });
const organizations = db.prepare('SELECT id,name FROM organizations').all();
const org = organization
  ? organizations.find((o) => o.id === organization)
  : organizations.length === 1
    ? organizations[0]
    : undefined;
if (!org) throw new Error('Choose exactly one source organization.');
const tables = Object.fromEntries(
  transferTables.map((t) => [
    t,
    db.prepare('SELECT * FROM "' + t + '" WHERE org=?').all(org.id),
  ]),
);
if (
  tables.vaultConfig.length ||
  tables.vaultEntries.length ||
  tables.resources.some((r) => r.fileKey || r.source === 'upload')
)
  throw new Error(
    'Files and vault records require a separate transfer; export stopped.',
  );
const snapshot = {
  format: 'studio-workspace-v1',
  sourceOrg: org.id,
  name: org.name,
  exportedAt: new Date().toISOString(),
  tables,
};
writeFileSync(resolve(output), JSON.stringify(snapshot), {
  mode: 0o600,
  flag: 'wx',
});
console.log(
  JSON.stringify({
    path: resolve(output),
    counts: Object.fromEntries(
      Object.entries(tables).map(([k, v]) => [k, v.length]),
    ),
  }),
);
db.close();
