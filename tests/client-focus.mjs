import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.STUDIO_TEST_URL || 'http://localhost:5173';
assert(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Use local development only.',
);
async function request(command, other = false) {
  const response = await fetch(base + '/api/workspace', {
    method: command ? 'POST' : 'GET',
    headers: {
      ...(other ? {} : { Cookie: '__sites_local_auth=1' }),
      ...(command ? { 'Content-Type': 'application/json' } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
async function ok(command) {
  const result = await request(command);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
const created = { meetings: [], projects: [], tasks: [] };
let original,
  changedProfile = false,
  originalEventIds;
try {
  const state = await ok();
  original = state.spaces.find((s) => s.id === 'forma');
  originalEventIds = new Set(state.spaceEvents.map((e) => e.id));
  const title = '[Verification] Client focus ' + Date.now();
  let data = await ok({
    ...original,
    type: 'client-edit',
    wants: 'A clear launch plan with accountable next steps.',
  });
  changedProfile = true;
  let current = data.spaces.find((s) => s.id === original.id);
  assert.equal(
    current.wants,
    'A clear launch plan with accountable next steps.',
  );
  const conflicts = await Promise.all(
    ['A', 'B'].map((voice) =>
      request({ ...current, type: 'client-edit', voice }),
    ),
  );
  assert.deepEqual(
    conflicts.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  data = await ok();
  current = data.spaces.find((s) => s.id === original.id);
  assert.equal(
    data.spaceEvents.filter(
      (e) => e.spaceId === original.id && !originalEventIds.has(e.id),
    ).length,
    2,
  );
  assert.equal(
    (
      await request({
        ...current,
        type: 'client-edit',
        website: 'javascript:alert(1)',
      })
    ).status,
    400,
  );
  assert.equal(
    (await request({ ...current, type: 'client-edit', color: 'red' })).status,
    400,
  );

  data = await ok({
    type: 'client-project',
    id: original.id,
    name: title,
    description: 'A test project',
    due: '2026-10-01',
  });
  const project = data.projects.find((p) => p.name === title);
  created.projects.push(project.id);
  data = await ok({
    type: 'client-project-deadline',
    id: project.id,
    previous: project.due,
    due: '2026-10-05',
  });
  assert.equal(
    data.projects.find((p) => p.id === project.id).due,
    '2026-10-05',
  );
  assert.equal(
    (
      await request({
        type: 'client-project-deadline',
        id: project.id,
        previous: project.due,
        due: '2026-10-07',
      })
    ).status,
    409,
  );
  data = await ok({
    type: 'meeting-create',
    id: original.id,
    title,
    startsAt: '2026-09-15T08:30:00.000Z',
    agenda: 'Review the work\nAgree a decision',
  });
  let meeting = data.meetings.find((m) => m.title === title);
  created.meetings.push(meeting.id);
  data = await ok({
    type: 'meeting-edit',
    ...meeting,
    notes: 'A useful discussion.',
    decisions: 'Launch in October.',
    status: 'Completed',
  });
  meeting = data.meetings.find((m) => m.id === meeting.id);
  assert.equal(meeting.status, 'Completed');
  const both = await Promise.all(
    ['First', 'Second'].map((notes) =>
      request({ type: 'meeting-edit', ...meeting, notes }),
    ),
  );
  assert.deepEqual(
    both.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  data = await ok();
  meeting = data.meetings.find((m) => m.id === meeting.id);
  const history = data.spaceEvents.filter((e) => e.meetingId === meeting.id);
  assert.equal(
    history.length,
    3,
    'Creation and only the two successful edits are logged.',
  );
  assert(
    history.some(
      (e) => JSON.parse(e.snapshot).notes === 'A useful discussion.',
    ),
    'Previous notes stay in history.',
  );
  assert.equal(
    (
      await request({
        type: 'meeting-edit',
        ...meeting,
        startsAt: '2026-02-30T08:30:00.000Z',
      })
    ).status,
    400,
  );
  assert.equal(
    (await request({ type: 'meeting-edit', ...meeting }, true)).status,
    404,
  );
  data = await ok({
    type: 'create',
    title: title + ' action',
    description: 'From the launch discussion.',
    projectId: project.id,
    meetingId: meeting.id,
    due: '2026-09-21',
    assignee: 'maja',
  });
  const task = data.tasks.find((t) => t.title === title + ' action');
  created.tasks.push(task.id);
  assert.equal(task.meetingId, meeting.id);
  assert.equal(task.assignee, 'maja');
  assert.equal(task.projectId, project.id);
  assert.equal(
    (
      await request({
        type: 'create',
        title: 'Wrong client',
        projectId: 'autumn',
        meetingId: meeting.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request({
        type: 'deadline',
        id: task.id,
        revision: task.revision,
        due: '2026-02-30',
      })
    ).status,
    400,
  );
  data = await ok({
    type: 'deadline',
    id: task.id,
    revision: task.revision,
    due: '2026-09-23',
  });
  const updated = data.tasks.find((t) => t.id === task.id);
  assert.equal(updated.due, '2026-09-23');
  assert.equal(updated.stage, task.stage);
  assert.equal(updated.description, task.description);
  assert.equal(data.activities.filter((a) => a.taskId === task.id).length, 2);
  const reloaded = await ok();
  assert.equal(
    reloaded.tasks.filter((t) => t.meetingId === meeting.id).length,
    1,
    'Follow-up is one canonical task.',
  );
  assert.equal(
    reloaded.meetings.find((m) => m.id === meeting.id).decisions,
    'Launch in October.',
  );
  const other = await request(undefined, true);
  assert(!other.data.meetings.some((m) => m.id === meeting.id));
  assert(!other.data.tasks.some((t) => t.id === task.id));
  console.log(
    'PASS: client brief and identity validation, project deadlines, meeting persistence and history, conflict protection, canonical follow-up ownership/deadlines, tenant isolation, invalid date rejection.',
  );
} finally {
  if (original && changedProfile) {
    const current = (await ok()).spaces.find((s) => s.id === original.id);
    await ok({ ...original, type: 'client-edit', revision: current.revision });
  }
  const state = await ok();
  const events = state.spaceEvents
    .filter((e) => e.spaceId === original?.id && !originalEventIds?.has(e.id))
    .map((e) => e.id);
  const sql = [];
  for (const id of created.tasks) {
    assert.match(id, /^[a-f0-9-]+$/);
    for (const table of ['notes', 'activities', 'reviews', 'notices'])
      sql.push(
        `DELETE FROM ${table} WHERE org='local_seedy' AND taskId='${id}';`,
      );
  }
  for (const [table, ids] of Object.entries({
    ...created,
    spaceEvents: events,
  }))
    for (const id of ids) {
      assert.match(id, /^[a-f0-9-]+$/);
      sql.push(
        `DELETE FROM "${table}" WHERE org='local_seedy' AND id='${id}';`,
      );
    }
  await mkdir('work', { recursive: true });
  await writeFile('work/client-verification-cleanup.sql', sql.join('\n'));
  console.log(
    'Cleanup prepared for the generated client verification records only.',
  );
}
