import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './sqlite-context.mjs';
import { mutateMeeting } from '../lib/meeting-store.ts';
import { mutateCalendar } from '../lib/calendar-store.ts';
import { changeSalesStage } from '../lib/sales-stage-store.ts';
import { convertProspect } from '../lib/sales-conversion-store.ts';
import { emptyWorkspace, initialWorkspace } from '../lib/model.ts';
import { buildDailyBrief } from '../lib/workspace-brief.ts';
import { calendarEntries } from '../lib/calendar-model.ts';
import {
  readMeetingPlanDraft,
  writeMeetingPlanDraft,
  readMeetingDraft,
  writeMeetingDraft,
  clearMeetingDraft,
} from '../lib/meeting-draft.ts';

const { sqlite, context: c } = testDatabase();
sqlite
  .prepare(
    "INSERT INTO members (org,id,name,role,color) VALUES (?,'me','Owner','Owner','#000000')",
  )
  .run(c.org);
sqlite
  .prepare(
    "INSERT INTO prospects (org,id,name,nameKey,owner,stage,revision,createdAt,updatedAt) VALUES (?,'lead','Prospective company','prospective company','me','Discovery',0,'','')",
  )
  .run(c.org);
const getMeeting = (id) =>
  sqlite.prepare('SELECT * FROM meetings WHERE org=? AND id=?').get(c.org, id);
const events = (id) =>
  sqlite
    .prepare('SELECT * FROM spaceEvents WHERE org=? AND meetingId=?')
    .all(c.org, id);
const getData = () => {
  const d = emptyWorkspace();
  for (const table of [
    'spaces',
    'meetings',
    'spaceEvents',
    'prospects',
    'calendarEvents',
  ])
    d[table] = sqlite
      .prepare('SELECT * FROM ' + table + ' WHERE org=?')
      .all(c.org);
  return d;
};
function makeTask(overrides = {}) {
  const t = {
    ...initialWorkspace().tasks[0],
    org: c.org,
    id: randomUUID(),
    projectId: null,
    spaceId: null,
    prospectId: 'lead',
    meetingId: null,
    revision: 0,
    archived: 0,
    ...overrides,
  };
  const columns = Object.keys(t);
  sqlite
    .prepare(
      `INSERT INTO tasks (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    )
    .run(...Object.values(t));
  return t;
}
const id = randomUUID();
const plan = {
  type: 'meeting-plan',
  id,
  prospectId: 'lead',
  title: 'Discovery call',
  startsAt: '2026-09-10T11:30:00.000Z',
  notes: 'Budget is not confirmed.',
  participants: 'Owner and prospect',
};
await mutateMeeting(c, plan);
await mutateMeeting(c, plan);
assert.equal(events(id).length, 1, 'retry does not duplicate history');
assert.equal(getMeeting(id).spaceId, null);
assert.equal(getMeeting(id).prospectId, 'lead');
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM tasks').get().n,
  0,
  'notes need no next action',
);
await assert.rejects(mutateMeeting(c, { ...plan, title: 'Different' }), {
  status: 409,
});
await assert.rejects(
  mutateMeeting({ ...c, org: 'foreign' }, { ...plan, id: randomUUID() }),
  { status: 404 },
);
await assert.rejects(
  mutateMeeting(c, { ...plan, id: randomUUID(), startsAt: 'invalid' }),
  { status: 400 },
);
let meeting = getMeeting(id);
const edit = {
  ...meeting,
  type: 'meeting-edit',
  notes: 'Budget approved. Start with a proposal.',
  decisions: 'Send two options.',
};
await mutateMeeting(c, edit);
await mutateMeeting(c, edit);
assert.equal(events(id).length, 2);
assert.equal(
  JSON.parse(events(id)[1].snapshot).notes,
  'Budget is not confirmed.',
);
await assert.rejects(mutateMeeting(c, { ...edit, notes: 'Stale overwrite' }), {
  status: 409,
});
await assert.rejects(mutateMeeting({ ...c, org: 'foreign' }, edit), {
  status: 404,
});
const callTask = makeTask();
const link = {
  type: 'meeting-link-task',
  id,
  revision: getMeeting(id).revision,
  taskId: callTask.id,
  taskRevision: 0,
};
await mutateMeeting(c, link);
await mutateMeeting(c, link);
assert.equal(
  sqlite.prepare('SELECT meetingId FROM tasks WHERE id=?').get(callTask.id)
    .meetingId,
  id,
);
assert.equal(
  sqlite
    .prepare('SELECT count(*) n FROM activities WHERE taskId=?')
    .get(callTask.id).n,
  1,
);
await assert.rejects(mutateMeeting({ ...c, org: 'foreign' }, link), {
  status: 404,
});
await changeSalesStage(c, { id: 'lead', revision: 0, stage: 'Won' });
const conversion = {
  id: 'lead',
  revision: 1,
  name: 'Confirmed company',
  owner: 'me',
};
sqlite.exec(
  "CREATE TRIGGER block_meeting_transfer BEFORE UPDATE OF spaceId ON meetings BEGIN SELECT RAISE(ABORT,'blocked transfer'); END;",
);
await assert.rejects(convertProspect(c, conversion), /blocked transfer/);
assert.equal(
  getData().spaces.length,
  0,
  'failed transfer rolls back client conversion',
);
assert.equal(getData().prospects[0].convertedAt, '');
sqlite.exec('DROP TRIGGER block_meeting_transfer');
await convertProspect(c, conversion);
await convertProspect(c, conversion);
const client = getData().spaces[0];
meeting = getMeeting(id);
assert.equal(meeting.spaceId, client.id);
assert.equal(meeting.prospectId, 'lead');
assert.equal(meeting.notes, edit.notes);
assert.equal(meeting.decisions, edit.decisions);
assert(
  events(id).every((e) => e.spaceId === client.id && e.prospectId === 'lead'),
);
assert.equal(
  getData().meetings.length,
  1,
  'conversion keeps the original meeting',
);
await assert.rejects(
  mutateMeeting(c, { ...edit, revision: 1, notes: 'Before conversion draft' }),
  { status: 409 },
);
await mutateMeeting(c, {
  ...meeting,
  type: 'meeting-edit',
  notes: 'Client kickoff added.',
});
assert.equal(events(id).at(-1).spaceId, client.id);
assert.equal(calendarEntries(getData()).filter((e) => e.id === id).length, 1);
await mutateMeeting(c, {
  ...plan,
  id: randomUUID(),
  title: 'After conversion',
});
assert(
  getData().meetings.every((m) => m.spaceId === client.id),
  'new meetings after conversion inherit the client',
);

const calendar = {
  type: 'calendar-save',
  id: 'calendar-call',
  kind: 'meeting',
  title: 'Existing scheduled call',
  date: '2026-09-10',
  time: '15:00',
  description: 'Original calendar notes',
};
await mutateCalendar(c, calendar);
const attach = {
  ...plan,
  id: randomUUID(),
  calendarId: calendar.id,
  calendarRevision: 0,
  startsAt: '2026-09-10T13:00:00.000Z',
  notes: calendar.description,
};
await mutateMeeting(c, attach);
await mutateMeeting(c, attach);
assert.equal(getData().calendarEvents[0].meetingId, attach.id);
assert.equal(getMeeting(attach.id).notes, calendar.description);
assert(
  !calendarEntries(getData()).some((e) => e.key === 'calendar:' + calendar.id),
  'linked calendar entry is not shown twice',
);
await assert.rejects(mutateMeeting(c, { ...attach, id: randomUUID() }), {
  status: 409,
});
await assert.rejects(
  mutateCalendar(c, {
    ...calendar,
    revision: 1,
    title: 'Stale calendar editor',
  }),
  { status: 409 },
);
await assert.rejects(
  mutateCalendar(c, { type: 'calendar-remove', id: calendar.id, revision: 1 }),
  { status: 409 },
);
const unlinked = {
  ...plan,
  id: randomUUID(),
  prospectId: null,
  notes: 'Unconnected meeting notes',
};
await mutateMeeting(c, unlinked);
await mutateMeeting(c, {
  ...getMeeting(unlinked.id),
  type: 'meeting-edit',
  prospectId: 'lead',
});
assert.equal(getMeeting(unlinked.id).spaceId, client.id);
assert(events(unlinked.id).every((e) => e.spaceId === client.id));

const scheduledTask = makeTask();
const viaTask = {
  ...plan,
  id: randomUUID(),
  taskId: scheduledTask.id,
  taskRevision: 0,
  notes: 'Notes taken from the task',
};
await mutateMeeting(c, viaTask);
await mutateMeeting(c, viaTask);
assert.equal(
  sqlite.prepare('SELECT meetingId FROM tasks WHERE id=?').get(scheduledTask.id)
    .meetingId,
  viaTask.id,
);
assert.equal(getMeeting(viaTask.id).spaceId, client.id);
const workspaceMeeting = { ...plan, id: randomUUID(), prospectId: null };
await mutateMeeting(c, workspaceMeeting);
const contextTask = makeTask();
await mutateMeeting(c, {
  type: 'meeting-link-task',
  id: workspaceMeeting.id,
  revision: 0,
  taskId: contextTask.id,
  taskRevision: 0,
});
assert.equal(getMeeting(workspaceMeeting.id).spaceId, client.id);
assert(events(workspaceMeeting.id).every((e) => e.spaceId === client.id));
const staleTask = makeTask({ revision: 2 });
const count = getData().meetings.length;
await assert.rejects(
  mutateMeeting(c, {
    ...viaTask,
    id: randomUUID(),
    taskId: staleTask.id,
    taskRevision: 0,
  }),
  { status: 409 },
);
assert.equal(getData().meetings.length, count);
const foreignContext = makeTask({
  spaceId: 'different-client',
  prospectId: null,
});
await assert.rejects(
  mutateMeeting(c, {
    type: 'meeting-link-task',
    id,
    revision: getMeeting(id).revision,
    taskId: foreignContext.id,
    taskRevision: 0,
  }),
  /same prospect or client/,
);
const cache = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (k) => cache.get(k),
    setItem: (k, v) => cache.set(k, v),
    removeItem: (k) => cache.delete(k),
  },
};
const draft = { ...getMeeting(id), notes: 'Unsaved call note' };
writeMeetingDraft('org:member', draft);
assert.equal(readMeetingDraft('org:member', getMeeting(id)).notes, draft.notes);
assert.equal(readMeetingDraft('other:member', getMeeting(id)), null);
assert.equal(
  readMeetingDraft('org:member', draft),
  null,
  'lost save response does not restore stale draft',
);
clearMeetingDraft('org:member', id);
assert.equal(readMeetingDraft('org:member', getMeeting(id)), null);
const planDraft={id:randomUUID(),source:'new',connection:'prospect:lead',title:'First call',day:'2026-09-10',time:'09:00',notes:'Notes before the first save',participants:'Owner'};
writeMeetingPlanDraft('org:member','plan:lead',planDraft);
assert.deepEqual(readMeetingPlanDraft('org:member','plan:lead'),planDraft);
assert.equal(readMeetingPlanDraft('other:member','plan:lead'),null);
clearMeetingDraft('org:member','plan:lead');
assert.equal(readMeetingPlanDraft('org:member','plan:lead'),null);
const currentDay = getData();
assert(buildDailyBrief(currentDay,new Date('2026-09-10T20:00:00')).schedule.some(e=>e.id===id),'today meetings remain reachable after their start time');
delete globalThis.window;
console.log(
  'PASS: meeting notes, revision history, retry safety, tenant isolation, atomic prospect conversion, existing calendar attachment, and scoped draft recovery.',
);
