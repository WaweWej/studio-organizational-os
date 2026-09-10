import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './sqlite-context.mjs';
import { emptyWorkspace } from '../lib/model.ts';
import { commitDailyPlan } from '../lib/daily-plan-store.ts';
import { changeDayWork } from '../lib/day-work-store.ts';
import { buildDailyBrief } from '../lib/workspace-brief.ts';
import { DraftCache } from '../lib/draft-cache.ts';
const { sqlite, context: c } = testDatabase();
const day = '2026-09-10',
  tomorrow = '2026-09-11';
const data = () => {
  const d = emptyWorkspace();
  d.tasks = sqlite.prepare('SELECT * FROM tasks WHERE org=?').all(c.org);
  return d;
};
await commitDailyPlan(
  c,
  {
    id: randomUUID(),
    day,
    sourceText: 'Work',
    items: ['One', 'Two', 'Three', 'Four'].map((title) => ({
      source: title,
      title,
      due: day,
      reviewRequired: 0,
    })),
  },
  data(),
  false,
);
const ids = data().tasks.map((t) => t.id);
const change = async (id, mode, extra = {}) => {
  const task = data().tasks.find((t) => t.id === id);
  await changeDayWork(c, {
    mode,
    day,
    items: [{ id, revision: task.revision }],
    ...extra,
  });
};
for (const id of ids.slice(0, 3)) await change(id, 'focus', { focus: true });
await assert.rejects(change(ids[3], 'focus', { focus: true }), /at most three/);
assert.equal(
  buildDailyBrief(data(), new Date(day + 'T12:00:00')).priorities.length,
  3,
);
const before = data().tasks[0];
await change(ids[0], 'plan', { plannedFor: tomorrow });
assert(
  !buildDailyBrief(data(), new Date(day + 'T12:00:00')).todayTasks.some(
    (t) => t.id === ids[0],
  ),
);
assert.equal(data().tasks[0].due, day, 'Planning never changes a deadline');
await change(ids[0], 'plan', {
  plannedFor: before.plannedFor,
  focusFor: before.focusFor,
});
assert.equal(data().tasks[0].focusFor, day);
await change(ids[0], 'waiting', { blocked: 'Feedback from client' });
assert.equal(data().tasks[0].blocked, 'Feedback from client');
const snapshot = data().tasks;
await assert.rejects(
  changeDayWork(c, {
    mode: 'plan',
    day,
    plannedFor: tomorrow,
    items: snapshot.map((t, i) => ({
      id: t.id,
      revision: t.revision + (i === 1 ? 5 : 0),
    })),
  }),
  /changed/,
);
assert.deepEqual(data().tasks, snapshot);
await assert.rejects(
  changeDayWork(
    { ...c, actor: 'other' },
    {
      mode: 'plan',
      day,
      plannedFor: tomorrow,
      items: [{ id: ids[0], revision: snapshot[0].revision }],
    },
  ),
  /your tasks/,
);
await changeDayWork(c, {
  mode: 'plan',
  day,
  plannedFor: tomorrow,
  items: snapshot.map((t) => ({ id: t.id, revision: t.revision })),
});
assert.equal(
  buildDailyBrief(data(), new Date(day + 'T12:00:00')).todayTasks.length,
  0,
);
assert.equal(
  buildDailyBrief(data(), new Date(tomorrow + 'T12:00:00')).todayTasks.length,
  4,
);
const memory = new Map();
const storage = {
  getItem: (k) => memory.get(k) || null,
  setItem: (k, v) => memory.set(k, v),
};
const cache = new DraftCache();
cache.configure('org:me', storage);
cache.set('workspace', { text: 'Unfinished note', pins: [] });
cache.set('daily-planning', {
  text: 'Plan my day',
  pins: [],
  daily: { id: 'stable-id', text: 'Three tasks' },
});
const recovered = new DraftCache();
recovered.configure('org:me', storage);
assert.equal(recovered.get('workspace').text, 'Unfinished note');
assert.equal(recovered.get('daily-planning').daily.id, 'stable-id');
recovered.configure('other:me', storage);
assert.equal(recovered.size, 0);
recovered.configure('org:me', storage);
recovered.delete('workspace');
const final = new DraftCache();
final.configure('org:me', storage);
assert(!final.has('workspace'));
console.log(
  'PASS: three priorities, defer/undo, waiting, deadlines, bulk atomicity, scoping, tomorrow eligibility and scoped draft recovery.',
);
