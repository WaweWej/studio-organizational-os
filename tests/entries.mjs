import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { initialWorkspace } from '../lib/model.ts';
import { inferEntryKind, interpretEntry } from '../lib/entry-model.ts';
const data = initialWorkspace(),
  now = new Date(2026, 8, 9, 12);
assert.equal(inferEntryKind('The client prefers a quieter opening'), 'note');
assert.equal(inferEntryKind('Edit the launch video'), 'task');
assert.equal(inferEntryKind('Task: follow up'), 'task');
assert.equal(
  inferEntryKind('Meeting notes @nord: agreed a new direction'),
  'note',
);
let entry = interpretEntry(
  'Note @Nord & Form: the client prefers a calmer direction',
  data,
  { now },
);
assert.equal(entry.kind, 'note');
assert.equal(entry.spaceId, 'nord');
assert.equal(entry.body, 'the client prefers a calmer direction');
assert.deepEqual(entry.errors, []);
assert.deepEqual(
  interpretEntry('Note: ' + 'Longer context. '.repeat(25), data, { now })
    .errors,
  [],
);
entry = interpretEntry('Meeting with @Nord & Form @tomorrow at 14:00', data, {
  now,
});
assert.equal(entry.meetingDate, '2026-09-10');
assert.equal(entry.meetingTime, '14:00');
assert.deepEqual(entry.errors, []);
assert(
  interpretEntry('Meeting with @nord', data, { now }).errors.some((e) =>
    e.includes('date'),
  ),
);
assert(
  interpretEntry('Meeting with @nord @tomorrow at 27:00', data, { now }).errors
    .length,
);
assert(
  interpretEntry('Note @nord: idea', data, {
    now,
    target: { type: 'space', id: 'harbor' },
  }).errors.length,
);
entry = interpretEntry('Deadline @Autumn launch @18/09', data, { now });
assert.equal(entry.projectId, 'autumn');
assert.equal(entry.due, '2026-09-18');
assert.deepEqual(entry.errors, []);
entry = interpretEntry(
  'Deadline "Build the autumn landing page" @18/09',
  data,
  { now },
);
// Exact title matching is optional; explicit selections are authoritative and checked.
entry = interpretEntry('Deadline @18/09', data, {
  now,
  target: { type: 'task', id: 't1' },
});
assert.equal(entry.taskId, 't1');
assert.deepEqual(entry.errors, []);
assert(
  interpretEntry('Deadline @18/09', data, {
    now,
    target: { type: 'space', id: 'nord' },
  }).errors.length,
);
assert(
  interpretEntry('Note @nord @tomorrow: details', data, { now }).errors.length,
);
assert.equal(
  interpretEntry('Notebook for tomorrow', data, { now }).body,
  'Notebook for tomorrow',
);
assert.equal(
  interpretEntry('A captured thought', data, { now, spaceId: 'nord' }).spaceId,
  'nord',
);
assert.equal(
  interpretEntry('Edit a page @internal', data, { now, spaceId: 'nord' })
    .spaceId,
  null,
);
console.log(
  'PASS: entry classification, safe note fallback, note body/context, long notes, meeting dates/times, explicit routing, and deadline target validation.',
);

const base = 'http://localhost:5173',
  ids = [],
  taskIds = [],
  projectIds = [];
async function api(command, other = false) {
  const r = await fetch(base + '/api/workspace', {
    method: command ? 'POST' : 'GET',
    headers: {
      ...(other ? {} : { Cookie: '__sites_local_auth=1' }),
      ...(command ? { 'Content-Type': 'application/json' } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const capture = (kind, text, fields = {}) => {
  const captureId = crypto.randomUUID();
  ids.push(captureId);
  return {
    type: 'capture-entry',
    captureId,
    kind,
    captureText: text,
    captureDay: '2026-09-09',
    ...fields,
  };
};
try {
  const projectName = '[Verification] Desk ' + crypto.randomUUID();
  let r = await api({
    type: 'client-project',
    id: 'nord',
    name: projectName,
    description: 'Capture tests',
    due: '2026-10-10',
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const project = r.data.projects.find((p) => p.name === projectName);
  projectIds.push(project.id);
  const taskId = crypto.randomUUID();
  taskIds.push(taskId);
  ids.push(taskId);
  r = await api({
    type: 'quick-create',
    captureId: taskId,
    title: '[Verification] Desk action',
    captureText: 'Edit this action',
    projectId: project.id,
    spaceId: 'nord',
    due: '2026-10-12',
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    r.data.captureEntries.find((e) => e.id === taskId).targetId,
    taskId,
  );
  const baselineTasks = r.data.tasks.length;
  const note = capture(
    'note',
    'Note @Nord & Form: [Verification] The client prefers a calmer direction',
  );
  r = await api(note);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  entry = r.data.captureEntries.find((e) => e.id === note.captureId);
  assert.equal(entry.spaceId, 'nord');
  assert.equal(entry.targetType, 'note');
  assert.equal(
    entry.body,
    '[Verification] The client prefers a calmer direction',
  );
  assert.equal(r.data.tasks.length, baselineTasks);
  assert(!('fingerprint' in entry));
  const inherited = capture(
    'note',
    '[Verification] Remember the material samples',
    { contextSpace: 'nord' },
  );
  r = await api(inherited);
  assert.equal(r.status, 200);
  assert.equal(
    r.data.captureEntries.find((e) => e.id === inherited.captureId).spaceId,
    'nord',
  );
  assert.equal((await api(note)).status, 200);
  assert.equal(
    (await api({ ...note, captureText: 'Note: different text' })).status,
    409,
  );
  const routed = capture(
    'note',
    '  Note: [Verification] Keep the opening brief',
    { targetType: 'task', targetId: taskId },
  );
  r = await api(routed);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  entry = r.data.captureEntries.find((e) => e.id === routed.captureId);
  assert.equal(entry.taskId, taskId);
  assert.equal(entry.projectId, project.id);
  assert.equal(entry.spaceId, 'nord');
  assert.equal((await api(routed, true)).status, 400);
  const meeting = capture(
    'meeting',
    'Meeting with @Nord & Form @tomorrow at 14:00',
    { meetingOffset: -120 },
  );
  r = await api(meeting);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const recorded = r.data.meetings.find((m) => m.id === meeting.captureId);
  assert.equal(recorded.startsAt, '2026-09-10T12:00:00.000Z');
  assert.equal(recorded.spaceId, 'nord');
  assert.equal(recorded.status, 'Planned');
  assert.equal(r.data.tasks.length, baselineTasks);
  assert.equal((await api(meeting)).status, 200);
  assert.equal(
    (
      await api(
        capture('meeting', 'Meeting with @nord @tomorrow at 14:00', {
          meetingOffset: 9999,
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await api(
        capture('meeting', 'Meeting with @nord', { meetingOffset: -120 }),
      )
    ).status,
    400,
  );
  const deadline = capture('deadline', 'Deadline @20/09', {
    targetType: 'task',
    targetId: taskId,
    revision: 0,
  });
  r = await api(deadline);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.tasks.find((t) => t.id === taskId).due, '2026-09-20');
  assert.equal(r.data.tasks.find((t) => t.id === taskId).revision, 1);
  assert.equal(
    r.data.captureEntries.find((e) => e.id === deadline.captureId).targetId,
    taskId,
  );
  assert.equal(
    (await api(deadline)).status,
    200,
    'A retry after the record revision changed still succeeds without another mutation.',
  );
  const stale = capture('deadline', 'Deadline @21/09', {
    targetType: 'task',
    targetId: taskId,
    revision: 0,
  });
  assert.equal((await api(stale)).status, 409);
  assert(
    !(await api()).data.captureEntries.some((e) => e.id === stale.captureId),
  );
  const projectDeadline = capture('deadline', 'Deadline @25/09', {
    targetType: 'project',
    targetId: project.id,
    previous: '2026-10-10',
  });
  r = await api(projectDeadline);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    r.data.projects.find((p) => p.id === project.id).due,
    '2026-09-25',
  );
  assert.equal(r.data.tasks.length, baselineTasks);
  assert.equal(
    (
      await api(
        capture('deadline', 'Deadline @26/09', {
          targetType: 'project',
          targetId: project.id,
          previous: '2026-10-10',
        }),
      )
    ).status,
    409,
  );
  const ambiguous = capture('note', 'Note @nord: mismatched', {
    targetType: 'space',
    targetId: 'harbor',
  });
  assert.equal((await api(ambiguous)).status, 400);
  const raced = capture('note', '[Verification] One saved thought');
  const race = await Promise.all([api(raced), api(raced)]);
  assert(race.every((r) => r.status === 200));
  r = await api();
  assert.equal(
    r.data.captureEntries.filter((e) => e.id === raced.captureId).length,
    1,
  );
  assert(
    !(await api(undefined, true)).data.captureEntries.some(
      (e) => e.id === note.captureId,
    ),
  );
  console.log(
    'PASS: canonical note filing, meeting persistence and timezone offset, task/project deadline updates, optimistic concurrency, receipt atomicity, retries, concurrent deduplication, task counts, and tenant isolation.',
  );
} finally {
  for (const id of [...ids, ...taskIds, ...projectIds])
    assert.match(id, /^[a-f0-9-]+$/);
  await mkdir('work', { recursive: true });
  await writeFile(
    'work/entries-cleanup.sql',
    [
      ...ids.flatMap((id) => [
        `DELETE FROM spaceEvents WHERE org='local_seedy' AND (meetingId='${id}' OR json_extract(snapshot,'$.captureId')='${id}');`,
        `DELETE FROM meetings WHERE org='local_seedy' AND id='${id}';`,
        `DELETE FROM captureEntries WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...taskIds.flatMap((id) => [
        ...['notes', 'activities', 'reviews', 'notices'].map(
          (table) =>
            `DELETE FROM ${table} WHERE org='local_seedy' AND taskId='${id}';`,
        ),
        `DELETE FROM tasks WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...projectIds.flatMap((id) => [
        `DELETE FROM spaceEvents WHERE org='local_seedy' AND json_extract(snapshot,'$.projectId')='${id}';`,
        `DELETE FROM projects WHERE org='local_seedy' AND id='${id}';`,
      ]),
    ].join('\n'),
  );
}
