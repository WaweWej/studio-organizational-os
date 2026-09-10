import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './sqlite-context.mjs';
import { emptyWorkspace } from '../lib/model.ts';
import { parseDailyPlan } from '../lib/daily-plan.ts';
import { commitDailyPlan } from '../lib/daily-plan-store.ts';
import { mutateClientLifecycle } from '../lib/client-lifecycle-store.ts';
const { sqlite, context: c } = testDatabase();
const workspace = () => {
  const data = emptyWorkspace();
  for (const key of ['tasks', 'projects', 'spaces', 'prospects'])
    data[key] = sqlite
      .prepare('SELECT * FROM ' + key + ' WHERE org=?')
      .all(c.org);
  return data;
};
const command = (items) => ({
  id: randomUUID(),
  day: '2026-09-10',
  sourceText: 'Daily work',
  items,
});
const item = {
  source: 'Create proposal',
  title: 'Create proposal',
  due: '2026-09-11',
  dueTime: '12:00',
};
const sales = command([
  { ...item, newProspect: 'Credenta' },
  { ...item, title: 'Call Credenta', newProspect: ' credenta ' },
]);
await commitDailyPlan(c, sales, workspace(), false);
await commitDailyPlan(c, sales, workspace(), false);
let data = workspace();
assert.equal(data.prospects.length, 1);
assert.equal(data.spaces.length, 0);
assert.equal(data.tasks.length, 2);
assert(data.tasks.every((t) => t.prospectId === data.prospects[0].id));
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM prospectEvents').get().n,
  2,
);
assert.equal(
  parseDailyPlan('Create proposal @Credenta', data, '2026-09-10')[0].taskId,
  data.tasks[0].id,
);
assert.equal(
  parseDailyPlan('Another task for Credenta', data, '2026-09-10')[0].prospectId,
  data.prospects[0].id,
);
await assert.rejects(
  commitDailyPlan(
    c,
    command([{ ...item, prospectId: 'other-org' }]),
    data,
    false,
  ),
  /unavailable/,
);
await assert.rejects(
  commitDailyPlan(
    c,
    command([{ ...item, newProspect: 'Wrong', newSpace: 'Wrong' }]),
    data,
    false,
  ),
  /Choose sales/,
);
const existing = data.tasks[0];
await commitDailyPlan(
  c,
  command([
    {
      ...item,
      taskId: existing.id,
      revision: existing.revision,
      prospectId: existing.prospectId,
    },
  ]),
  data,
  false,
);
assert.equal(workspace().tasks.length, 2);
// Convert an accidentally created client and retain its canonical task/project.
await commitDailyPlan(
  c,
  command([
    {
      ...item,
      title: 'Client proposal',
      newSpace: 'Credenta',
      newProject: 'Pitch',
    },
  ]),
  workspace(),
  false,
);
data = workspace();
let client = data.spaces[0];
const task = data.tasks.find((t) => t.title === 'Client proposal');
const move = {
  type: 'client-to-prospect',
  id: client.id,
  revision: client.revision,
};
await assert.rejects(
  mutateClientLifecycle({ ...c, org: 'other' }, move),
  /not found/,
);
await assert.rejects(
  mutateClientLifecycle(c, { ...move, revision: 99 }),
  /changed/,
);
await mutateClientLifecycle(c, move);
await mutateClientLifecycle(c, move);
data = workspace();
assert.equal(data.spaces.length, 0);
assert.equal(data.prospects.length, 1);
assert.equal(
  data.tasks.find((t) => t.id === task.id).prospectId,
  data.prospects[0].id,
);
assert.equal(
  data.tasks.find((t) => t.id === task.id).projectId,
  task.projectId,
);
assert.equal(data.projects[0].spaceId, null);
assert.equal(data.tasks.find((t) => t.id === task.id).plannedFor, '2026-09-10');
// Remove profile and owned meeting history, retaining notes, files and tasks.
await commitDailyPlan(
  c,
  command([{ ...item, newSpace: 'Remove me' }]),
  data,
  false,
);
data = workspace();
client = data.spaces[0];
const insert = (table, row) => {
  const r = { org: c.org, ...row },
    keys = Object.keys(r);
  sqlite
    .prepare(
      'INSERT INTO ' +
        table +
        ' (' +
        keys.join(',') +
        ') VALUES (' +
        keys.map(() => '?').join(',') +
        ')',
    )
    .run(...Object.values(r));
};
insert('meetings', {
  id: 'meeting',
  spaceId: client.id,
  title: 'Meeting',
  startsAt: '2026-09-11T12:00:00.000Z',
  agenda: 'Agenda',
  notes: 'Notes',
  decisions: '',
  status: 'Planned',
  revision: 0,
  updatedAt: 'now',
});
insert('captureEntries', {
  id: 'note',
  kind: 'note',
  sourceText: 'Important note',
  title: 'Note',
  body: 'Keep this',
  targetType: 'note',
  targetId: 'note',
  spaceId: client.id,
  actor: 'me',
  createdAt: 'now',
});
insert('resourceLinks', {
  id: 'link',
  resourceId: 'file',
  targetType: 'space',
  targetId: client.id,
});
await assert.rejects(
  mutateClientLifecycle(c, {
    type: 'client-to-prospect',
    id: client.id,
    revision: 0,
  }),
  /meeting records/,
);
const removal = { type: 'client-delete', id: client.id, revision: 0 };
sqlite.exec(
  "CREATE TRIGGER fail_remove BEFORE DELETE ON spaces BEGIN SELECT RAISE(ABORT,'rollback proof'); END;",
);
await assert.rejects(mutateClientLifecycle(c, removal), /rollback proof/);
assert.equal(workspace().spaces.length, 1);
assert.equal(sqlite.prepare('SELECT count(*) n FROM meetings').get().n, 1);
sqlite.exec('DROP TRIGGER fail_remove');
const count = workspace().tasks.length;
await mutateClientLifecycle(c, removal);
await mutateClientLifecycle(c, removal);
assert.equal(workspace().spaces.length, 0);
assert.equal(workspace().tasks.length, count);
assert.equal(sqlite.prepare('SELECT count(*) n FROM meetings').get().n, 0);
assert.equal(
  sqlite
    .prepare('SELECT spaceId,body FROM captureEntries WHERE id=?')
    .get('note').body,
  'Keep this',
);
assert.equal(
  sqlite.prepare('SELECT spaceId FROM captureEntries WHERE id=?').get('note')
    .spaceId,
  null,
);
assert.equal(sqlite.prepare('SELECT count(*) n FROM resourceLinks').get().n, 0);
console.log(
  'PASS: prospect planning, reuse, Sales conversion, scoped removal, preserved work, retry safety and atomic rollback.',
);
