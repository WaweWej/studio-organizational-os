import assert from 'node:assert/strict';
import { testDatabase } from './sqlite-context.mjs';
import { transferTables, importWorkspace } from '../lib/workspace-transfer.ts';
import { initialWorkspace } from '../lib/model.ts';
const { sqlite, context: c } = testDatabase();
sqlite
  .prepare("INSERT INTO organizations VALUES (?,'Empty workspace','')")
  .run(c.org);
sqlite
  .prepare(
    "INSERT INTO members VALUES (?,'me','Signed-in owner','Owner','#000000')",
  )
  .run(c.org);
const snapshot = {
  format: 'studio-workspace-v1',
  sourceOrg: 'source',
  name: 'My Studio',
  exportedAt: new Date().toISOString(),
  tables: Object.fromEntries(transferTables.map((t) => [t, []])),
};
snapshot.tables.members = [
  { org: 'source', id: 'me', name: 'Owner', role: 'Owner', color: '#123456' },
];
snapshot.tables.prospects = [
  {
    org: 'source',
    id: 'lead',
    name: 'Prospect',
    nameKey: 'prospect',
    owner: 'me',
    stage: 'Discovery',
    revision: 0,
    createdAt: '',
    updatedAt: '',
  },
];
snapshot.tables.meetings = [
  {
    org: 'source',
    id: 'meeting',
    spaceId: null,
    prospectId: 'lead',
    title: 'Call',
    startsAt: '2026-09-10T09:00:00.000Z',
    agenda: '',
    notes: 'Important meeting notes.',
    decisions: 'Send a proposal.',
    status: 'Completed',
    revision: 1,
    updatedAt: '',
  },
];
snapshot.tables.tasks = [
  {
    ...initialWorkspace().tasks[0],
    org: 'source',
    id: 'proposal',
    spaceId: null,
    projectId: null,
    prospectId: 'lead',
    meetingId: 'meeting',
    title: 'Send proposal',
  },
];
await assert.rejects(
  importWorkspace(c, { ...snapshot, tables: { ...snapshot.tables, evil: [] } }),
  /supported/,
);
await assert.rejects(
  importWorkspace(c, {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      vaultEntries: [{ org: 'source', id: 'secret', sealed: 'ciphertext' }],
    },
  }),
  /separate transfer/,
);
await assert.rejects(
  importWorkspace(c, {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      members: [{ ...snapshot.tables.members[0], org: 'foreign' }],
    },
  }),
  /supported/,
);
await assert.rejects(
  importWorkspace(c, {
    ...snapshot,
    tables: {
      ...snapshot.tables,
      tasks: [{ ...snapshot.tables.tasks[0], 'id) SELECT 1; --': 'attack' }],
    },
  }),
  /supported/,
);
sqlite.exec(
  "CREATE TRIGGER reject_transfer BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'rollback'); END",
);
await assert.rejects(importWorkspace(c, snapshot), /rollback/);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM workspaceTransfers').get().n,
  0,
);
assert.equal(sqlite.prepare('SELECT count(*) n FROM prospects').get().n, 0);
assert.equal(
  sqlite.prepare('SELECT name FROM members').get().name,
  'Signed-in owner',
);
sqlite.exec('DROP TRIGGER reject_transfer');
const imported = await importWorkspace(c, snapshot);
assert.equal(imported.recordCount, 4);
assert.equal(imported.alreadyImported, false);
assert.equal((await importWorkspace(c, snapshot)).alreadyImported, true);
assert.equal(sqlite.prepare('SELECT org FROM tasks').get().org, c.org);
assert.equal(
  sqlite.prepare('SELECT meetingId FROM tasks').get().meetingId,
  'meeting',
);
assert.equal(
  sqlite.prepare('SELECT notes FROM meetings').get().notes,
  'Important meeting notes.',
);
assert.equal(
  sqlite.prepare('SELECT name FROM organizations').get().name,
  'My Studio',
);
await assert.rejects(
  importWorkspace(c, { ...snapshot, name: 'Replace' }),
  /already received/,
);
const other = { ...c, org: 'other' };
sqlite
  .prepare("INSERT INTO organizations VALUES (?,'Other','')")
  .run(other.org);
sqlite
  .prepare(
    "INSERT INTO members VALUES (?,'me','Other owner','Owner','#000000')",
  )
  .run(other.org);
sqlite
  .prepare(
    "INSERT INTO documents VALUES (?,'existing','User work','Notes','Keep this')",
  )
  .run(other.org);
await assert.rejects(importWorkspace(other, snapshot), /contains work/);
assert.equal(
  sqlite.prepare('SELECT body FROM documents WHERE org=?').get(other.org).body,
  'Keep this',
);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM tasks WHERE org=?').get(other.org).n,
  0,
);
console.log(
  'PASS: transfer preserves IDs/context/notes, remaps only organization, rejects unsupported records and nonempty targets, rolls back atomically, and deduplicates retries.',
);
