import { calendarEntries, filterDeadlines } from '../lib/calendar-model.ts';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { initialWorkspace } from '../lib/model.ts';
import {
  buildDailyBrief,
  buildClientBrief,
  briefMatches,
  localDay,
} from '../lib/workspace-brief.ts';
import { parseSalesCapture, prospectNameKey } from '../lib/sales-model.ts';

const now = new Date(2026, 8, 9, 12),
  data = initialWorkspace();
assert.equal(localDay(now), '2026-09-09');
let daily = buildDailyBrief(data, now);
assert(daily.reviews.some((t) => t.id === 't3'));
assert(daily.blocked.some((t) => t.id === 't6'));
assert.equal(
  new Set(daily.attention.map((a) => a.task.id)).size,
  daily.attention.length,
);
assert(daily.focus[0].stage === 'Doing');
assert(daily.focus.every((t) => t.assignee === data.currentMember));
data.tasks.find((t) => t.id === 't3').version = 2;
assert(
  !buildDailyBrief(data, now).reviews.some((t) => t.id === 't3'),
  'Old review versions must not become current requests.',
);
data.tasks.find((t) => t.id === 't6').stage = 'Done';
assert(!buildDailyBrief(data, now).blocked.some((t) => t.id === 't6'));
data.meetings.push({
  ...data.meetings[0],
  id: 'cancelled',
  startsAt: new Date(now.getTime() + 1000).toISOString(),
  status: 'Cancelled',
});
assert.notEqual(buildDailyBrief(data, now).upcoming[0]?.id, 'cancelled');
data.tasks.push({
  ...data.tasks[0],
  id: 'direct-client',
  projectId: null,
  spaceId: 'harbor',
  blocked: 'Need the source footage',
  due: '2026-09-09',
  stage: 'Doing',
});
assert(
  !buildDailyBrief(data, now).overdue.some((t) => t.id === 'direct-client'),
  'Today is not overdue.',
);
data.activities = [
  {
    id: 'direct-event',
    taskId: 'direct-client',
    body: 'Saved the brief',
    actor: 'me',
    createdAt: new Date(now.getTime() - 1000).toISOString(),
  },
];
assert(
  buildClientBrief(data, 'harbor', now).tasks.some(
    (t) => t.id === 'direct-client',
  ),
);
assert(
  !buildClientBrief(data, 'nord', now).tasks.some(
    (t) => t.id === 'direct-client',
  ),
);
assert(
  buildClientBrief(data, 'harbor', now).changes.some(
    (e) => e.id === 'direct-event',
  ),
);
assert(
  !buildClientBrief(data, 'nord', now).changes.some(
    (e) => e.id === 'direct-event',
  ),
);
assert.equal(briefMatches('prepare me for Nord', data).spaces[0].id, 'nord');
assert.equal(briefMatches('prepare', data).spaces.length, data.spaces.length);
assert.equal(briefMatches('prepare nonexisting client', data).spaces.length, 0);
assert.equal(parseSalesCapture('Edit the launch video', now), null);
let sale = parseSalesCapture(
  'Sales meeting with "New Name", next step: calculate lead price',
  now,
);
assert.deepEqual(sale, {
  name: 'New Name',
  nameKey: 'new name',
  nextStep: 'calculate lead price',
  due: '',
  errors: [],
});
assert.equal(
  parseSalesCapture(
    'Sales meeting with “New Name”, next step: calculate lead price @tomorrow',
    now,
  ).due,
  '2026-09-10',
);
assert.equal(
  parseSalesCapture('Sales meeting with New Name, next step: call again', now)
    .name,
  'New Name',
);
assert(
  parseSalesCapture('Sales meeting with "", next step:', now).errors.length,
);
assert(
  parseSalesCapture(
    'Sales meeting with "New Name", next step: price @31/02',
    now,
  ).errors.length,
);
assert.equal(prospectNameKey('  ACME   studio '), 'acme studio');
assert.equal(prospectNameKey('ＡＣＭＥ'), 'acme');
console.log(
  'PASS: grounded brief sources, review versions, date boundaries, standalone client context, empty states, client intent matching, sales sentences, and date parsing.',
);

const base = 'http://localhost:5173';
const ids = [],
  names = [],
  prospectIds = new Set();
async function api(command, other = false) {
  const r = await fetch(`${base}/api/workspace`, {
    method: command ? 'POST' : 'GET',
    headers: {
      ...(other ? {} : { Cookie: '__sites_local_auth=1' }),
      ...(command ? { 'Content-Type': 'application/json' } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const name = `[Verification] Prospect ${crypto.randomUUID()}`;
names.push(name);
const capture = (
  text = `Sales meeting with "${name}", next step: calculate lead price @tomorrow`,
) => ({
  type: 'sales-capture',
  captureId: crypto.randomUUID(),
  captureText: text,
  captureDay: '2026-09-09',
});
try {
  const first = capture();
  ids.push(first.captureId);
  let r = await api({ ...first, assignee: 'emma', owner: 'emma' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const prospect = r.data.prospects.find((p) => p.name === name);
  assert(prospect);
  prospectIds.add(prospect.id);
  assert.equal(prospect.stage, 'Discovery');
  assert.equal(prospect.owner, r.data.currentMember);
  let task = r.data.tasks.find((t) => t.id === first.captureId);
  assert.equal(task.prospectId, prospect.id);
  assert.equal(task.title, 'calculate lead price');
  assert.equal(task.due, '2026-09-10');
  assert.equal(task.stage, 'Up next');
  assert.equal(task.assignee, r.data.currentMember);
  assert.equal(task.spaceId, null);
  assert.equal(task.projectId, null);
  const entry = calendarEntries(r.data).find((e) => e.id === task.id);
  assert.equal(entry.client, prospect.name + ' · Prospect');
  assert.equal(
    filterDeadlines([entry], {
      kind: 'all',
      space: 'prospects',
      project: 'all',
      completed: false,
    }).length,
    1,
  );
  assert.equal(
    filterDeadlines([entry], {
      kind: 'all',
      space: 'internal',
      project: 'all',
      completed: false,
    }).length,
    0,
  );
  assert.equal(
    r.data.prospectEvents.filter((e) => e.taskId === task.id).length,
    1,
  );
  assert.equal(r.data.activities.filter((e) => e.taskId === task.id).length, 1);
  assert(
    !('fingerprint' in r.data.prospectEvents.find((e) => e.taskId === task.id)),
  );
  const count = r.data.tasks.length;
  r = await api(first);
  assert.equal(r.status, 200);
  assert.equal(r.data.tasks.length, count);
  assert.equal(
    (
      await api({
        ...first,
        captureText: `Sales meeting with "${name}", next step: different action`,
      })
    ).status,
    409,
  );
  const second = capture(
    `Sales meeting with "${name.toUpperCase()}", next step: send the proposal`,
  );
  ids.push(second.captureId);
  r = await api(second);
  assert.equal(r.status, 200);
  assert.equal(
    r.data.prospects.filter((p) => p.nameKey === prospect.nameKey).length,
    1,
  );
  assert.equal(
    r.data.tasks.find((t) => t.id === second.captureId).prospectId,
    prospect.id,
  );
  r = await api({
    type: 'sales-stage',
    id: prospect.id,
    revision: prospect.revision,
    stage: 'Proposal',
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.prospects.find((p) => p.id === prospect.id).stage,
    'Proposal',
  );
  assert.equal(
    r.data.tasks.find((t) => t.id === first.captureId).stage,
    'Up next',
  );
  assert.equal(
    (
      await api({
        type: 'sales-stage',
        id: prospect.id,
        revision: 0,
        stage: 'Won',
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api({
        type: 'sales-stage',
        id: prospect.id,
        revision: 1,
        stage: 'Invented',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        { type: 'sales-stage', id: prospect.id, revision: 1, stage: 'Won' },
        true,
      )
    ).status,
    404,
  );
  assert(
    !(await api(undefined, true)).data.prospects.some(
      (p) => p.id === prospect.id,
    ),
  );
  const raced = capture();
  ids.push(raced.captureId);
  const race = await Promise.all([api(raced), api(raced)]);
  assert(
    race.every((r) => r.status === 200),
    JSON.stringify(race),
  );
  r = await api();
  assert.equal(r.data.tasks.filter((t) => t.id === raced.captureId).length, 1);
  assert.equal(
    r.data.prospectEvents.filter((e) => e.id === raced.captureId).length,
    1,
  );
  assert.equal(
    r.data.activities.filter((e) => e.taskId === raced.captureId).length,
    1,
  );
  const before = r.data.prospects.length;
  assert.equal(
    (
      await api({
        ...capture(),
        captureText: 'Sales meeting with "", next step: ',
      })
    ).status,
    400,
  );
  assert.equal(
    (await api({ ...capture(), captureDay: '2026-02-31' })).status,
    400,
  );
  assert.equal((await api({ ...capture(), captureId: 'wrong' })).status, 400);
  assert.equal((await api()).data.prospects.length, before);
  task = r.data.tasks.find((t) => t.id === first.captureId);
  r = await api({
    type: 'move',
    id: task.id,
    revision: task.revision,
    stage: 'Doing',
  });
  assert.equal(r.status, 200);
  assert.equal(
    r.data.prospects.find((p) => p.id === prospect.id).stage,
    'Proposal',
  );
  assert.equal(
    r.data.tasks.find((t) => t.id === task.id).prospectId,
    prospect.id,
  );
  console.log(
    'PASS: atomic sales capture, saved prospect history, canonical next actions, actor assignment, name matching, retries and concurrent deduplication, stage revisions, task/pipeline independence, invalid input, and tenant isolation.',
  );
} finally {
  // Clean up only this run's explicitly generated IDs and uniquely named prospect.
  const r = await api();
  for (const p of r.data.prospects || [])
    if (names.includes(p.name)) prospectIds.add(p.id);
  for (const id of [...ids, ...prospectIds]) assert.match(id, /^[a-f0-9-]+$/);
  await mkdir('work', { recursive: true });
  await writeFile(
    'work/sales-cleanup.sql',
    [
      ...ids.flatMap((id) => [
        ...['activities', 'notes', 'reviews', 'notices'].map(
          (table) =>
            `DELETE FROM ${table} WHERE org='local_seedy' AND taskId='${id}';`,
        ),
        `DELETE FROM tasks WHERE org='local_seedy' AND id='${id}';`,
        `DELETE FROM prospectEvents WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...[...prospectIds].flatMap((id) => [
        `DELETE FROM prospectEvents WHERE org='local_seedy' AND prospectId='${id}';`,
        `DELETE FROM prospects WHERE org='local_seedy' AND id='${id}';`,
      ]),
    ].join('\n'),
  );
}
