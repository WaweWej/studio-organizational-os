import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './sqlite-context.mjs';
import { emptyWorkspace } from '../lib/model.ts';
import { commitDailyPlan } from '../lib/daily-plan-store.ts';
import { changeSalesStage } from '../lib/sales-stage-store.ts';
import { convertProspect } from '../lib/sales-conversion-store.ts';
import { taskSpaceId } from '../lib/task-context.ts';
const { sqlite, context: c } = testDatabase();
sqlite
  .prepare(
    "INSERT INTO members (org,id,name,role,color) VALUES (?,'me','Owner','Owner','#000000')",
  )
  .run(c.org);
const data = () => {
  const d = emptyWorkspace();
  for (const key of ['spaces', 'projects', 'tasks', 'prospects'])
    d[key] = sqlite.prepare('SELECT * FROM ' + key + ' WHERE org=?').all(c.org);
  return d;
};
await commitDailyPlan(
  c,
  {
    id: randomUUID(),
    day: '2026-09-10',
    sourceText: 'Proposal',
    items: [
      {
        source: 'Proposal',
        title: 'Proposal',
        newProspect: 'Credenta',
        due: '2026-09-11',
      },
    ],
  },
  data(),
  false,
);
let p = data().prospects[0];
const task = data().tasks[0];
await changeSalesStage(c, { id: p.id, revision: 0, stage: 'Won' });
assert.equal(data().spaces.length, 0, 'Won alone must not create a client');
p = data().prospects[0];
await changeSalesStage(c, {
  id: p.id,
  revision: p.revision,
  stage: 'Proposal',
});
assert.equal(data().spaces.length, 0);
p = data().prospects[0];
const details = {
  id: p.id,
  revision: p.revision,
  name: 'Credenta Studio',
  owner: 'me',
  website: 'https://example.com',
  brief: 'Brand brief',
  wants: 'Grow',
  needs: 'Design',
};
await assert.rejects(convertProspect(c, details), /Mark this prospect Won/);
await changeSalesStage(c, { id: p.id, revision: p.revision, stage: 'Won' });
p = data().prospects[0];
details.revision = p.revision;
await assert.rejects(
  convertProspect({ ...c, org: 'other' }, details),
  /not found/,
);
await assert.rejects(
  convertProspect(c, { ...details, website: 'javascript:alert(1)' }),
  /HTTPS/,
);
await assert.rejects(
  convertProspect(c, { ...details, revision: 0 }),
  /refresh/,
);
sqlite.exec(
  "CREATE TRIGGER reject_client BEFORE INSERT ON spaces BEGIN SELECT RAISE(ABORT,'rollback'); END;",
);
await assert.rejects(convertProspect(c, details), /rollback/);
assert.equal(data().prospects[0].convertedAt, '');
assert.equal(data().spaces.length, 0);
sqlite.exec('DROP TRIGGER reject_client');
await convertProspect(c, details);
await convertProspect(c, details);
p = data().prospects[0];
const client = data().spaces[0];
assert(p.convertedAt);
assert.equal(data().prospects.filter((p) => !p.convertedAt).length, 0);
assert.equal(data().spaces.length, 1);
assert.equal(client.name, details.name);
assert.equal(client.brief, details.brief);
assert.equal(client.website, details.website);
assert.equal(client.wants, details.wants);
assert.equal(taskSpaceId(data(), task), client.id);
assert.equal(data().tasks[0].id, task.id);
assert.equal(data().tasks[0].due, task.due);
assert.equal(
  sqlite
    .prepare("SELECT count(*) n FROM prospectEvents WHERE kind='client'")
    .get().n,
  1,
);
await assert.rejects(
  convertProspect(c, { ...details, name: 'Different' }),
  /already became/,
);
await assert.rejects(
  changeSalesStage(c, { id: p.id, revision: p.revision, stage: 'New' }),
  /now a client/,
);
console.log(
  'PASS: Won/reopen creates no client; explicit details, validation, stale/foreign writes, rollback, retry deduplication, pipeline removal and canonical task links.',
);
