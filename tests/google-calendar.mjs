import assert from 'node:assert/strict';
import { testDatabase } from './sqlite-context.mjs';
import {
  startGoogle,
  finishGoogle,
  seal,
  unseal,
  tokenScope,
  digest,
  googleScopes,
  googleConfigured,
  googleConnection,
} from '../lib/google-calendar-auth.ts';
import {
  fetchGoogleEvents,
  importGoogleEvents,
  studioExports,
  syncGoogle,
  googleStatus,
} from '../lib/google-calendar-sync.ts';
import { mutateMeeting } from '../lib/meeting-store.ts';
import { mutateCalendar } from '../lib/calendar-store.ts';
import { calendarEntries, deadlineCommand } from '../lib/calendar-model.ts';
import { emptyWorkspace, initialWorkspace } from '../lib/model.ts';
const { sqlite, context: c } = testDatabase();
const config = {
  GOOGLE_CLIENT_ID: 'isolated.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fake-client',
  GOOGLE_TOKEN_KEY: Buffer.alloc(32, 7).toString('base64'),
  GOOGLE_REDIRECT_URI: 'https://studio.example/api/google-calendar/callback',
};
assert.equal(googleConfigured(config), true);
assert.equal(googleConfigured({ ...config, GOOGLE_TOKEN_KEY: 'bad' }), false);
const primary = {
  id: 'owner@example.test',
  summary: 'Owner',
  primary: true,
  timeZone: 'Europe/Copenhagen',
  accessRole: 'owner',
};
const response = (value) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
let calls = [];
const authFetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/token'))
    return response({
      access_token: 'fake-access',
      refresh_token: 'fake-refresh',
      scope: googleScopes.join(' '),
      expires_in: 3600,
    });
  assert(String(url).includes('/calendarList'));
  return response({ items: [primary] });
};
const sealed = await seal(config, 'secret', tokenScope(c));
assert.equal(await unseal(config, sealed, tokenScope(c)), 'secret');
await assert.rejects(
  unseal(config, sealed, tokenScope({ ...c, org: 'other' })),
);
const url = new URL(await startGoogle(c, config, 'browser-secret'));
assert.equal(url.searchParams.get('access_type'), 'offline');
assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
const state = url.searchParams.get('state');
await assert.rejects(
  finishGoogle(
    { ...c, org: 'other' },
    config,
    state,
    'browser-secret',
    'code',
    authFetch,
  ),
  { status: 403 },
);
await assert.rejects(
  finishGoogle(c, config, state, 'different-browser', 'code', authFetch),
  { status: 403 },
);
assert.equal(calls.length, 0);
await finishGoogle(c, config, state, 'browser-secret', 'code', authFetch);
await assert.rejects(
  finishGoogle(c, config, state, 'browser-secret', 'code', authFetch),
  { status: 403 },
);
const connection = await googleConnection(c);
assert(!connection.token.includes('fake-refresh'));
assert.equal(connection.account, primary.id);
assert.equal(
  (await googleStatus({ ...c, actor: 'someone-else' }, config)).connected,
  false,
);
const publicStatus = JSON.stringify(await googleStatus(c, config));
assert(
  !publicStatus.includes('fake-refresh') &&
    !publicStatus.includes('fake-access') &&
    !publicStatus.includes(connection.token),
);
assert(
  sqlite.prepare('SELECT verifier FROM googleOAuthStates').all().length === 0,
);

const now = new Date('2026-09-10T09:00:00Z');
const event = {
  id: 'recurrence_20260911T080000Z',
  summary: 'Prospect call',
  start: { dateTime: '2026-09-11T08:00:00Z' },
  end: { dateTime: '2026-09-11T09:00:00Z' },
  htmlLink: 'https://calendar.google.com/calendar/event?eid=example',
};
let pageCalls = 0;
const paged = await fetchGoogleEvents(
  'access',
  primary.id,
  'Europe/Copenhagen',
  async (url) => {
    pageCalls++;
    if (pageCalls === 1)
      return response({ items: [event], nextPageToken: 'page-two' });
    assert.equal(new URL(url).searchParams.get('pageToken'), 'page-two');
    return response({ items: [{ id: 'cancelled', status: 'cancelled' }] });
  },
  now,
);
assert.equal(paged.length, 2);
await importGoogleEvents(c, primary.id, paged, 'Europe/Copenhagen', now);
let imported = sqlite.prepare('SELECT * FROM calendarEvents').get();
assert.equal(imported.time, '10:00');
assert.equal(imported.googleEventId, event.id);
await importGoogleEvents(c, primary.id, paged, 'Europe/Copenhagen', now);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM calendarHistory').get().n,
  1,
);
await assert.rejects(
  mutateCalendar(c, {
    type: 'calendar-remove',
    id: imported.id,
    revision: imported.revision,
  }),
  { status: 409 },
);
await mutateMeeting(c, {
  type: 'meeting-plan',
  id: 'notes-meeting',
  calendarId: imported.id,
  calendarRevision: imported.revision,
  title: event.summary,
  startsAt: '2026-09-11T08:00:00.000Z',
  notes: 'Do not lose this proposal discussion',
  decisions: 'Send proposal Tuesday',
  participants: 'Sales owner',
});
const meeting = () =>
  sqlite.prepare("SELECT * FROM meetings WHERE id='notes-meeting'").get();
const shifted = {
  ...event,
  start: { dateTime: '2026-09-12T09:00:00Z' },
  end: { dateTime: '2026-09-12T10:00:00Z' },
};
await importGoogleEvents(c, primary.id, [shifted], 'Europe/Copenhagen', now);
assert.equal(meeting().startsAt, '2026-09-12T09:00:00.000Z');
assert.equal(meeting().notes, 'Do not lose this proposal discussion');
assert.equal(meeting().decisions, 'Send proposal Tuesday');
await assert.rejects(
  mutateMeeting(c, {
    type: 'meeting-edit',
    ...meeting(),
    startsAt: '2026-09-12T15:00:00.000Z',
  }),
  { status: 409 },
);
await mutateMeeting(c, {
  type: 'meeting-edit',
  ...meeting(),
  notes: 'Saved after Google sync',
});
await importGoogleEvents(
  c,
  primary.id,
  [{ id: event.id, status: 'cancelled' }],
  'Europe/Copenhagen',
  now,
);
assert.equal(meeting().status, 'Cancelled');
assert.equal(meeting().notes, 'Saved after Google sync');
assert.equal(
  sqlite.prepare('SELECT archived FROM calendarEvents').get().archived,
  1,
);
await importGoogleEvents(c, primary.id, [shifted], 'Europe/Copenhagen', now);
assert.equal(meeting().status, 'Planned');
assert.equal(meeting().notes, 'Saved after Google sync');
assert.equal(sqlite.prepare('SELECT count(*) n FROM meetings').get().n, 1);
const data = {
  ...emptyWorkspace(),
  googleCalendar: await googleStatus(c, config),
  meetings: [meeting()],
  calendarEvents: sqlite.prepare('SELECT * FROM calendarEvents').all(),
};
const entries = calendarEntries(data);
assert.equal(entries.length, 1);
assert.equal(entries[0].google, true);
assert.throws(
  () => deadlineCommand(entries[0], '2026-10-01'),
  /Google Calendar/,
);
assert.equal(
  studioExports(data, 'Europe/Copenhagen', 'https://studio.example').length,
  0,
);
assert.equal(
  calendarEntries({
    ...data,
    googleCalendar: { ...data.googleCalendar, connected: false },
  }).length,
  0,
);
const allDay = {
  id: 'all-day',
  summary: 'Offsite',
  start: { date: '2026-09-15' },
  end: { date: '2026-09-18' },
};
await importGoogleEvents(
  c,
  primary.id,
  [shifted, allDay],
  'Europe/Copenhagen',
  now,
);
const allData = {
  ...data,
  calendarEvents: sqlite.prepare('SELECT * FROM calendarEvents').all(),
};
assert.equal(
  calendarEntries(allData).find((e) => e.title === 'Offsite').endDue,
  '2026-09-17',
);
assert.equal(
  sqlite
    .prepare('SELECT count(*) n FROM calendarEvents WHERE org=?')
    .get('other').n,
  0,
);

// A failed later page leaves existing data intact. Malformed events and batch
// failures also roll back the calendar snapshot and linked meeting updates.
await assert.rejects(
  fetchGoogleEvents(
    'access',
    primary.id,
    'UTC',
    async (url) =>
      new URL(url).searchParams.has('pageToken')
        ? new Response('', { status: 503 })
        : response({ items: [event], nextPageToken: 'next' }),
    now,
  ),
);
assert.equal(meeting().notes, 'Saved after Google sync');
const before = sqlite.prepare('SELECT * FROM calendarEvents').all();
await assert.rejects(
  importGoogleEvents(c, primary.id, [shifted, { id: 'bad-date' }], 'UTC', now),
);
assert.deepEqual(sqlite.prepare('SELECT * FROM calendarEvents').all(), before);
sqlite.exec(
  "CREATE TRIGGER reject_google_update BEFORE UPDATE ON meetings BEGIN SELECT RAISE(ABORT, 'isolated rollback'); END;",
);
await assert.rejects(
  importGoogleEvents(
    c,
    primary.id,
    [{ ...shifted, summary: 'Must roll back' }],
    'UTC',
    now,
  ),
);
assert.deepEqual(sqlite.prepare('SELECT * FROM calendarEvents').all(), before);
sqlite.exec('DROP TRIGGER reject_google_update');

// Real sync orchestration with mocked Google, deterministic insert retry,
// dedicated-calendar reuse, cancellation/deadline cleanup, and no invitations.
sqlite
  .prepare('UPDATE googleConnections SET calendarId=?,selected=?')
  .run('studio-calendar', '[]');
const task = {
  ...initialWorkspace().tasks[0],
  id: 'sync-task',
  assignee: 'me',
  title: 'Proposal',
  due: '2026-09-15',
  dueTime: '14:30',
  stage: 'Doing',
  archived: 0,
  description: 'PRIVATE task brief',
  deliverable: 'PRIVATE deliverable',
};
const exportData = { ...emptyWorkspace(), tasks: [task] };
const writes = [];
let failAfterInsert = true;
const remote = new Map();
const syncFetch = async (url, init = {}) => {
  const target = String(url);
  if (target.endsWith('/token'))
    return response({ access_token: 'fake-access' });
  if (target.includes('/calendarList'))
    return response({
      items: [primary, { id: 'studio-calendar', accessRole: 'owner' }],
    });
  assert(target.includes('/calendars/studio-calendar/events'));
  writes.push({ target, method: init.method, body: init.body });
  assert.equal(new URL(target).searchParams.get('sendUpdates'), 'none');
  if (init.method === 'POST') {
    const item = JSON.parse(init.body);
    if (remote.has(item.id)) return new Response('', { status: 409 });
    remote.set(item.id, item);
    if (failAfterInsert) {
      failAfterInsert = false;
      throw new Error('Lost response');
    }
    return response(item);
  }
  const id = new URL(target).pathname.split('/').at(-1);
  if (init.method === 'PUT') {
    remote.set(id, JSON.parse(init.body));
    return response(remote.get(id));
  }
  if (init.method === 'DELETE') {
    remote.delete(id);
    return new Response(null, { status: 204 });
  }
  throw new Error('Unexpected fake request');
};
await assert.rejects(
  syncGoogle(c, config, exportData, 'https://studio.example', true, syncFetch),
);
assert.equal(remote.size, 1);
assert.equal((await googleConnection(c)).lease, '');
assert((await googleStatus(c, config)).error);
await syncGoogle(
  c,
  config,
  exportData,
  'https://studio.example',
  true,
  syncFetch,
);
assert.equal(remote.size, 1);
assert.equal(sqlite.prepare('SELECT count(*) n FROM googleExports').get().n, 1);
assert(!JSON.stringify(writes).includes('PRIVATE'));
assert(!JSON.stringify(writes).includes('attendees'));
assert.equal([...remote.values()][0].start.timeZone, 'Europe/Copenhagen');
const writesBefore = writes.length;
await syncGoogle(
  c,
  config,
  exportData,
  'https://studio.example',
  true,
  syncFetch,
);
assert.equal(writes.length, writesBefore);
await syncGoogle(
  c,
  config,
  { ...exportData, tasks: [{ ...task, due: '2026-09-16' }] },
  'https://studio.example',
  true,
  syncFetch,
);
assert([...remote.values()][0].start.dateTime.startsWith('2026-09-16'));
await syncGoogle(
  c,
  config,
  { ...exportData, tasks: [{ ...task, stage: 'Done' }] },
  'https://studio.example',
  true,
  syncFetch,
);
assert.equal(remote.size, 0);
const removedId = sqlite
  .prepare('SELECT eventId FROM googleExports')
  .get().eventId;
await syncGoogle(
  c,
  config,
  exportData,
  'https://studio.example',
  true,
  syncFetch,
);
assert.equal(remote.size, 1);
assert.notEqual(
  sqlite.prepare('SELECT eventId FROM googleExports').get().eventId,
  removedId,
);
sqlite
  .prepare('UPDATE googleConnections SET leaseUntil=?')
  .run(Date.now() + 60000);
assert.equal(
  await syncGoogle(
    c,
    config,
    exportData,
    'https://studio.example',
    true,
    () => {
      throw new Error('Concurrent sync must not send');
    },
  ),
  false,
);
assert.equal(
  await syncGoogle(
    { ...c, org: 'other' },
    config,
    exportData,
    'https://studio.example',
    true,
    () => {
      throw new Error('Foreign org must not send');
    },
  ),
  false,
);
console.log(
  'Google Calendar: OAuth scope/browser/replay isolation, encrypted tokens, pagination, recurrence/cancellation, note preservation, atomic rollback, provenance, time zones, export retries, cleanup and sync leases passed. No external requests or real records used.',
);
