import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';
import { initialWorkspace } from '../lib/model.ts';
import { nextDueDate } from '../lib/recurrence.ts';

// Exercise the actual command boundary with isolated SQLite and no live identity.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier === '@/app/chatgpt-auth') return { url: 'data:text/javascript,export async function getChatGPTUser(){return null}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { mutate } = await import('../lib/store.ts');
const { materializeRecurringMeetings } = await import('../lib/meeting-store.ts');
const { sqlite, context: c } = testDatabase();
sqlite.exec(
  "INSERT INTO members VALUES ('test-a','me','Owner','Owner','#000000'),('test-b','me','Other','Owner','#111111')",
);
const task = (id, org = c.org) =>
  sqlite.prepare('SELECT * FROM tasks WHERE org=? AND id=?').get(org, id);
const successors = (id, org = c.org) =>
  sqlite
    .prepare('SELECT * FROM tasks WHERE org=? AND recurrenceOf=?')
    .all(org, id);
const make = (id, extra = {}) => {
  const row = {
    ...initialWorkspace().tasks[0],
    org: c.org,
    id,
    title: 'Monthly retainer check-in',
    description: 'Walk through the retainer scope.',
    projectId: null,
    spaceId: null,
    reviewer: 'me',
    assignee: 'me',
    stage: 'Doing',
    deliverable: '',
    version: 0,
    reviewRequired: 0,
    blocked: '',
    ...extra,
  };
  sqlite
    .prepare(
      `INSERT INTO tasks (${Object.keys(row).map((k) => '"' + k + '"').join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
    )
    .run(...Object.values(row));
};

const today = new Date().toISOString().slice(0, 10);

// Completing a weekly task spawns exactly one successor with the advanced due
// date, the same rhythm, and lineage back to the chain root.
make('r1', { recurrence: 'weekly', recurrenceOf: '', due: '2026-01-02' });
await mutate(c, { type: 'move', id: 'r1', stage: 'Done', revision: 0 });
assert.equal(task('r1').stage, 'Done');
const spawned = successors('r1');
assert.equal(spawned.length, 1);
assert.equal(spawned[0].stage, 'Up next');
assert.equal(spawned[0].recurrence, 'weekly');
assert.equal(spawned[0].due, nextDueDate('weekly', '2026-01-02', today));
assert.equal(spawned[0].blocked, '');
assert.equal(spawned[0].title, 'Monthly retainer check-in');

// Repeating the completed move is a no-op: still exactly one successor.
await mutate(c, {
  type: 'move',
  id: 'r1',
  stage: 'Done',
  revision: task('r1').revision,
});
assert.equal(successors('r1').length, 1);

// Completing the successor extends the chain under the original root.
const child = spawned[0];
await mutate(c, {
  type: 'move',
  id: child.id,
  stage: 'Done',
  revision: child.revision,
});
assert.equal(successors('r1').length, 2);
assert.ok(successors('r1').every((t) => t.recurrenceOf === 'r1'));

// A task without a rhythm completes without offspring.
make('plain', { recurrence: '', recurrenceOf: '' });
await mutate(c, { type: 'move', id: 'plain', stage: 'Done', revision: 0 });
assert.equal(successors('plain').length, 0);

// The rhythm is editable through the task edit command and validated.
make('edit-me', { recurrence: '', recurrenceOf: '' });
const editable = task('edit-me');
await mutate(c, {
  type: 'edit',
  id: 'edit-me',
  revision: editable.revision,
  title: editable.title,
  description: editable.description,
  due: '',
  blocked: '',
  assignee: 'me',
  reviewer: 'me',
  recurrence: 'monthly',
});
assert.equal(task('edit-me').recurrence, 'monthly');
await assert.rejects(
  mutate(c, {
    type: 'edit',
    id: 'edit-me',
    revision: task('edit-me').revision,
    title: editable.title,
    description: editable.description,
    due: '',
    blocked: '',
    assignee: 'me',
    reviewer: 'me',
    recurrence: 'daily',
  }),
  /supported rhythm/,
);

// Meetings: a monthly meeting whose time has passed materializes exactly one
// upcoming occurrence, records a space event, and repeated reads add nothing.
const meetingRow = (org, id, extra = {}) => {
  const row = {
    org,
    id,
    spaceId: null,
    prospectId: null,
    participants: '',
    fingerprint: '',
    title: 'Monthly client meeting',
    startsAt: '2026-06-03T13:00:00.000Z',
    agenda: 'Standing agenda',
    notes: '',
    decisions: '',
    status: 'Completed',
    recurrence: 'monthly',
    recurrenceOf: '',
    revision: 0,
    updatedAt: '2026-06-03T14:00:00.000Z',
    lastMutation: '',
    ...extra,
  };
  sqlite
    .prepare(
      `INSERT INTO meetings (${Object.keys(row).map((k) => '"' + k + '"').join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`,
    )
    .run(...Object.values(row));
};
const meetings = (org = c.org) =>
  sqlite
    .prepare("SELECT * FROM meetings WHERE org=? ORDER BY startsAt")
    .all(org);
const now = new Date('2026-09-11T10:00:00Z');
meetingRow(c.org, 'm1');
meetingRow('test-b', 'm-other');
await materializeRecurringMeetings(c, now);
const all = meetings();
assert.equal(all.length, 2);
const next = all.find((m) => m.id !== 'm1');
assert.equal(next.status, 'Planned');
assert.equal(next.recurrence, 'monthly');
assert.equal(next.recurrenceOf, 'm1');
assert.equal(next.startsAt, '2026-10-03T13:00:00.000Z');
assert.equal(next.agenda, 'Standing agenda');
assert.equal(next.notes, '');
const events = sqlite
  .prepare('SELECT * FROM spaceEvents WHERE org=? AND meetingId=?')
  .all(c.org, next.id);
assert.equal(events.length, 1);
assert.match(events[0].body, /next monthly meeting/);

// Repeated reads converge on the single upcoming occurrence.
await materializeRecurringMeetings(c, now);
assert.equal(meetings().length, 2);

// A cancelled occurrence does not end the rhythm; removing the rhythm does.
sqlite
  .prepare("UPDATE meetings SET status='Cancelled' WHERE org=? AND id=?")
  .run(c.org, next.id);
const later = new Date('2026-10-20T10:00:00Z');
await materializeRecurringMeetings(c, later);
assert.equal(meetings().length, 3);
sqlite
  .prepare("UPDATE meetings SET recurrence='' WHERE org=?")
  .run(c.org);
await materializeRecurringMeetings(c, new Date('2027-01-01T10:00:00Z'));
assert.equal(meetings().length, 3);

// Tenant isolation: the other organization's chain was never touched by our
// reads, and materializing there affects only its own rows.
assert.equal(meetings('test-b').length, 1);
await materializeRecurringMeetings({ ...c, org: 'test-b' }, now);
assert.equal(meetings('test-b').length, 2);
assert.equal(meetings().length, 3);

console.log(
  'PASS: weekly task spawn with advanced due and lineage, no-op on repeated completion, chain extension under one root, rhythm-free completion, editable and validated rhythm, meeting materialization with space events, read idempotence, cancelled-occurrence continuation, rhythm removal as the stop, and tenant isolation.',
);
