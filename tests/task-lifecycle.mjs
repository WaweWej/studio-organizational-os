import assert from 'node:assert/strict';
import { mutateTaskLifecycle } from '../lib/task-lifecycle-store.ts';
import { initialWorkspace, emptyWorkspace } from '../lib/model.ts';
import { testDatabase } from './sqlite-context.mjs';
const { sqlite, context } = testDatabase();
const task = initialWorkspace().tasks[0];
for (const org of ['test-a', 'test-b']) {
  const record = { org, ...task };
  sqlite
    .prepare(
      `INSERT INTO tasks (${Object.keys(record).join(',')}) VALUES (${Object.keys(
        record,
      )
        .map(() => '?')
        .join(',')})`,
    )
    .run(...Object.values(record));
}
const read = () =>
  sqlite
    .prepare('SELECT * FROM tasks WHERE org=? AND id=?')
    .get(context.org, task.id);
const act = (type, revision) =>
  mutateTaskLifecycle(context, { type, id: task.id, revision });
await act('task-archive', 0);
assert.equal(read().archived, 1);
assert.equal(read().stage, task.stage);
await act('task-archive', 0);
assert.equal(sqlite.prepare('SELECT count(*) n FROM activities').get().n, 1);
await assert.rejects(act('task-restore', 0), { status: 409 });
await act('task-restore', 1);
assert.equal(read().archived, 0);
await assert.rejects(act('task-delete', 0), { status: 409 });
assert(read());
sqlite
  .prepare(
    "INSERT INTO notes (org,id,taskId,body,actor,createdAt) VALUES ('test-a','note',?,'private note','me','now')",
  )
  .run(task.id);
sqlite
  .prepare(
    "INSERT INTO resourceLinks (org,id,resourceId,targetType,targetId) VALUES ('test-a','link','shared-file','task',?)",
  )
  .run(task.id);
await act('task-delete', 2);
await act('task-delete', 2);
assert.equal(read(), undefined);
for (const table of ['notes', 'activities', 'resourceLinks'])
  assert.equal(
    sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE org='test-a'`).get()
      .n,
    0,
  );
assert.equal(
  sqlite.prepare("SELECT count(*) n FROM tasks WHERE org='test-b'").get().n,
  1,
);
assert.equal(sqlite.prepare('SELECT count(*) n FROM taskDeletions').get().n, 1);
await assert.rejects(
  mutateTaskLifecycle(context, {
    type: 'task-delete',
    id: 'missing',
    revision: 0,
  }),
  { status: 409 },
);
const empty = emptyWorkspace('Owner');
assert.equal(empty.members.length, 1);
assert.equal(empty.members[0].name, 'Owner');
for (const [key, value] of Object.entries(empty))
  if (Array.isArray(value) && key !== 'members')
    assert.equal(value.length, 0, key);
console.log(
  'PASS: isolated archive/restore, retry deduplication, stale deletion, scoped cleanup, cross-organization preservation and empty workspace.',
);
sqlite.close();
