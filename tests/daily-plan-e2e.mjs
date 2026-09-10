import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildDailyBrief, localDay } from '../lib/workspace-brief.ts';
import { calendarEntries } from '../lib/calendar-model.ts';
const base = process.env.STUDIO_TEST_URL;
if (
  !base ||
  new URL(base).port !== '3001' ||
  !['localhost', '127.0.0.1'].includes(new URL(base).hostname)
)
  throw new Error('Run only against the isolated preview on port 3001.');
async function request(command, expected = 200, other = false) {
  const response = await fetch(base + '/api/workspace', {
    method: command ? 'POST' : 'GET',
    headers: {
      ...(command ? { 'Content-Type': 'application/json' } : {}),
      ...(other ? { Cookie: '__sites_local_auth=1' } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
const now = new Date(),
  day = localDay(now),
  yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
let data = await request();
assert.equal(data.tasks.length, 0, 'Use a fresh isolated test database.');
assert.equal(data.spaces.length, 0);
const id = randomUUID(),
  client = 'E2E Client ' + id.slice(0, 6);
const item = {
  source: 'Draft launch copy',
  title: 'Draft launch copy',
  taskId: null,
  spaceId: null,
  projectId: null,
  newSpace: client,
  newProject: 'Launch',
  due: day,
  dueTime: '17:00',
};
const command = {
  type: 'daily-plan-commit',
  id,
  day,
  sourceText: 'Draft launch copy\nEdit launch video',
  items: [
    item,
    { ...item, source: 'Edit launch video', title: 'Edit launch video' },
  ],
};
data = await request(command);
assert.equal(data.tasks.length, 2);
assert.equal(data.spaces.length, 1);
assert.equal(data.projects.length, 1);
assert(
  data.tasks.every(
    (t) => t.projectId === data.projects[0].id && t.plannedFor === day,
  ),
);
assert.equal(data.dailyPlans[0].deliveryStatus, 'not_connected');
assert.equal(data.captureEntries.filter((e) => e.kind === 'daily').length, 1);
data = await request(command);
assert.equal(data.tasks.length, 2);
assert.equal(data.activities.length, 2);
await request({ ...command, items: [{ ...item, title: 'Changed' }] }, 409);
assert.equal(buildDailyBrief(data, now).todayTasks.length, 2);
assert(
  calendarEntries(data)
    .filter((e) => e.kind === 'task')
    .every((e) => e.time === '17:00'),
);
let task = data.tasks[0];
const existing = {
  ...item,
  source: task.title,
  title: task.title,
  taskId: task.id,
  revision: task.revision,
  spaceId: data.spaces[0].id,
  projectId: task.projectId,
  newSpace: '',
  newProject: '',
};
data = await request({
  type: 'daily-plan-commit',
  id: randomUUID(),
  day: localDay(yesterday),
  sourceText: task.title,
  items: [existing],
});
assert.equal(data.tasks.length, 2, 'Existing work is reused');
assert(buildDailyBrief(data, now).carryover.some((t) => t.id === task.id));
const plansBefore = data.dailyPlans.length;
await request(
  {
    type: 'daily-plan-commit',
    id: randomUUID(),
    day,
    sourceText: 'Stale plan',
    items: [existing, { ...item, title: 'Must not be created' }],
  },
  409,
);
data = await request();
assert.equal(data.dailyPlans.length, plansBefore);
assert.equal(data.tasks.length, 2);
const action = async (type, extra = {}) => {
  task = data.tasks.find((t) => t.id === task.id);
  data = await request({
    type,
    id: task.id,
    revision: task.revision,
    ...extra,
  });
};
await action('note', { body: 'A decision attached to this work.' });
await action('deliverable', { body: 'First version of the copy.' });
await action('complete');
assert.equal(data.tasks.find(t => t.id === task.id).stage, 'Done');
assert(!data.reviews.some(review => review.taskId === task.id));
assert(!buildDailyBrief(data, now).carryover.some((t) => t.id === task.id));
const next = new Date(now);
next.setDate(next.getDate() + 1);
data = await request({
  type: 'meeting-create',
  id: data.spaces[0].id,
  title: 'Launch review meeting',
  startsAt: next.toISOString(),
  agenda: 'Review the work',
});
data = await request({
  type: 'calendar-save',
  id: randomUUID(),
  kind: 'meeting',
  title: 'Internal check-in',
  date: localDay(next),
  time: '14:00',
});
assert.equal(buildDailyBrief(data, now).schedule.length, 2);
assert.equal(
  calendarEntries(data).filter((e) => e.kind === 'meeting').length,
  2,
);
const other = await request(undefined, 200, true);
assert(!other.tasks.some((t) => data.tasks.some((own) => own.id === t.id)));
await request(
  {
    type: 'daily-plan-commit',
    id: randomUUID(),
    day,
    sourceText: 'Forbidden task',
    items: [
      {
        ...existing,
        revision: data.tasks.find((t) => t.id === existing.taskId).revision,
      },
    ],
  },
  404,
  true,
);
console.log(
  'PASS: real HTTP daily commit → canonical clients/projects/tasks → Today → carryover → notes/deliverable/direct completion → meetings/calendar; retries, stale atomicity and tenant isolation.',
);
