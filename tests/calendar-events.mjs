import assert from 'node:assert/strict';
import { mutateCalendar, timeValue } from '../lib/calendar-store.ts';
import {
  calendarEntries,
  deadlineCommand,
  dateKey,
  filterDeadlines,
} from '../lib/calendar-model.ts';
import { emptyWorkspace, initialWorkspace } from '../lib/model.ts';
import { testDatabase } from './sqlite-context.mjs';
const { sqlite, context } = testDatabase();
const command = {
  type: 'calendar-save',
  id: 'isolated-event',
  kind: 'meeting',
  title: 'Discuss launch',
  date: '2026-09-12',
  time: '14:30',
  description: 'Bring the brief',
};
await mutateCalendar(context, command);
await mutateCalendar(context, command);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM calendarEvents').get().n,
  1,
);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM calendarHistory').get().n,
  1,
);
await assert.rejects(mutateCalendar(context, { ...command, time: '25:00' }), {
  status: 400,
});
await assert.rejects(
  mutateCalendar(context, { ...command, date: '2026-02-30' }),
  { status: 400 },
);
await assert.rejects(mutateCalendar(context, { ...command, revision: 5 }), {
  status: 409,
});
await mutateCalendar(context, { ...command, revision: 0, date: '2026-09-13' });
await mutateCalendar(context, { ...command, revision: 0, date: '2026-09-13' });
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM calendarHistory').get().n,
  2,
);
await assert.rejects(
  mutateCalendar({ ...context, org: 'other-org' }, { ...command, revision: 1 }),
  { status: 409 },
);
assert.equal(
  sqlite
    .prepare("SELECT count(*) n FROM calendarHistory WHERE org='other-org'")
    .get().n,
  0,
);
const data = emptyWorkspace();
data.calendarEvents = sqlite.prepare('SELECT * FROM calendarEvents').all();
const task = {
  ...initialWorkspace().tasks[0],
  due: '2026-09-13',
  dueTime: '10:00',
};
data.tasks = [task, { ...task, id: 'archived', archived: 1 }];
data.meetings = [
  {
    id: 'canonical-meeting',
    spaceId: 'client',
    title: 'Client meeting',
    startsAt: '2026-09-13T11:00:00.000Z',
    status: 'Planned',
    revision: 3,
    agenda: '',
    notes: '',
    decisions: '',
    updatedAt: '',
  },
  {
    id: 'cancelled',
    spaceId: 'client',
    title: 'Cancelled',
    startsAt: '2026-09-13T11:00:00.000Z',
    status: 'Cancelled',
    revision: 0,
  },
];
const entries = calendarEntries(data);
assert.equal(entries.length, 3);
assert.equal(entries.find((e) => e.id === task.id).time, '10:00');
assert.equal(
  entries.find((e) => e.id === 'canonical-meeting').due,
  dateKey(new Date(data.meetings[0].startsAt)),
);
assert.equal(
  deadlineCommand(
    entries.find((e) => e.id === task.id),
    '2026-09-14',
    '17:00',
  ).dueTime,
  '17:00',
);
const meeting = entries.find((e) => e.id === 'canonical-meeting');
const move = deadlineCommand(meeting, '2026-09-14', '12:00');
assert.equal(move.type, 'calendar-meeting-time');
assert.equal(new Date(move.startsAt).getHours(), 12);
assert.equal(
  filterDeadlines(entries, {
    kind: 'meeting',
    space: 'all',
    project: 'all',
    completed: false,
  }).length,
  2,
);
await mutateCalendar(context, {
  type: 'calendar-remove',
  id: command.id,
  revision: 1,
});
await mutateCalendar(context, {
  type: 'calendar-remove',
  id: command.id,
  revision: 1,
});
data.calendarEvents = sqlite.prepare('SELECT * FROM calendarEvents').all();
assert.equal(calendarEntries(data).length, 2);
assert.throws(() => timeValue('9:99'), { status: 400 });
assert.equal(timeValue(''), '');
console.log(
  'PASS: isolated event creation/edit/remove, retry history, invalid dates/times, revision/tenant guards, canonical meeting/task aggregation and timed rescheduling.',
);
sqlite.close();
