import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { initialWorkspace } from '../lib/model.ts';
import {
  inferEntryKind,
  interpretEntry,
  blockerRecipients,
} from '../lib/entry-model.ts';
import { deskAttention, deskEntries } from '../lib/desk-model.ts';
const data = initialWorkspace(),
  now = new Date(2026, 8, 9, 12),
  target = { type: 'task', id: 't1' };
for (const text of [
  'Create new project',
  'Create a new project',
  'New project: Autumn',
  'Start project',
])
  assert.equal(inferEntryKind(text), 'project');
let e = interpretEntry('Progress: first cut is ready', data, {
  focusTaskId: 't1',
  now,
});
assert.equal(e.kind, 'progress');
assert.equal(e.taskId, 't1');
assert.equal(e.body, 'first cut is ready');
assert.deepEqual(e.errors, []);
e = interpretEntry(
  'Note: the client said "less is more"\nKeep the opening quiet.',
  data,
  { focusTaskId: 't1', now },
);
assert.equal(e.taskId, 't1');
assert.equal(e.body, 'the client said "less is more"\nKeep the opening quiet.');
e = interpretEntry('Progress: client said "yes"\nNow editing', data, {
  focusTaskId: 't1',
  now,
});
assert.equal(e.taskId, 't1');
assert.deepEqual(e.errors, []);
assert(e.body.includes('\n'));
e = interpretEntry('Note @harbor: a fresh direction', data, {
  focusTaskId: 't1',
  now,
});
assert.equal(e.taskId, null);
assert.equal(e.spaceId, 'harbor');
e = interpretEntry('Blocked: waiting for footage', data, { target, now });
assert.equal(e.body, 'waiting for footage');
assert.deepEqual(e.errors, []);
e = interpretEntry('Unblocked', data, { target, now });
assert.equal(e.clearBlocker, true);
assert.deepEqual(e.errors, []);
for (const stage of ['Doing', 'Up next', 'Review', 'Done']) {
  e = interpretEntry('Status: ' + stage, data, { target, now });
  assert.equal(e.nextStage, stage);
  assert.deepEqual(e.errors, []);
}
assert(interpretEntry('Status: anything', data, { target, now }).errors.length);
assert(interpretEntry('Progress: edited', data, { now }).errors.length);
const title = data.tasks.find((t) => t.id === 't1').title;
e = interpretEntry('Progress "' + title + '": edited', data, { now });
assert.equal(e.taskId, 't1');
assert.deepEqual(e.errors, []);
assert(
  interpretEntry('Progress "' + title + '": edited', data, {
    now,
    target: { type: 'task', id: 't2' },
  }).errors.length,
);
assert(
  interpretEntry('Progress "missing": edited', data, { now, focusTaskId: 't1' })
    .errors.length,
);
const duplicate = structuredClone(data);
duplicate.tasks.push({ ...duplicate.tasks[0], id: 'duplicate' });
assert(
  interpretEntry('Progress "' + title + '": edited', duplicate, { now }).errors
    .length,
);
e = interpretEntry('Deadline @tomorrow', data, { now, focusTaskId: 't1' });
assert.equal(e.taskId, 't1');
assert.deepEqual(e.errors, []);
assert.deepEqual(
  blockerRecipients(
    { ...data.tasks[0], assignee: 'me', reviewer: 'maja' },
    'me',
  ),
  ['maja'],
);
assert.deepEqual(
  blockerRecipients(
    { ...data.tasks[0], assignee: 'maja', reviewer: 'maja' },
    'me',
  ),
  ['maja'],
);
const attention = deskAttention(data, now);
assert.equal(new Set(attention.map((x) => x.taskId)).size, attention.length);
const blank = structuredClone(data);
blank.tasks = [];
blank.notices = [
  {
    taskId: 'missing',
    recipient: 'me',
    read: 0,
    createdAt: now.toISOString(),
    body: 'lost',
    id: 'x',
  },
];
assert.equal(deskAttention(blank, now).length, 0);
assert.deepEqual(deskEntries(data), []);
console.log(
  'PASS: project intent, multiline context, task update recognition, explicit destinations, ambiguous/missing task checks, deadline focus, recipient deduplication, finite attention model.',
);

const base = 'http://localhost:5173',
  ids = [],
  taskIds = [],
  projectIds = [],
  fileIds = [];
async function api(command, other = false) {
  const r = await fetch(base + '/api/workspace', {
    method: command ? 'POST' : 'GET',
    headers: {
      ...(!other ? { Cookie: '__sites_local_auth=1' } : {}),
      ...(command ? { 'Content-Type': 'application/json' } : {}),
    },
    body: command ? JSON.stringify(command) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function upload(id, contents = 'desk file fixture', targetList = []) {
  const body = new FormData();
  body.set('uploadId', id);
  body.set('kind', 'asset');
  body.set('targets', JSON.stringify(targetList));
  body.set(
    'file',
    new File([contents], '[Verification] Desk brief.txt', {
      type: 'text/plain',
    }),
  );
  const r = await fetch(base + '/api/files', {
    method: 'POST',
    headers: { Cookie: '__sites_local_auth=1' },
    body,
  });
  return { status: r.status, data: await r.json() };
}
const check = (r) => assert.equal(r.status, 200, JSON.stringify(r.data));
let state;
const capture = (kind, text, extra = {}) => {
  const captureId = crypto.randomUUID();
  ids.push(captureId);
  const t = state.tasks.find((t) => t.id === taskIds[0]);
  return {
    type: 'capture-entry',
    kind,
    captureText: text,
    captureDay: '2026-09-09',
    captureId,
    targetType: 'task',
    targetId: t.id,
    revision: t.revision,
    ...extra,
  };
};
try {
  const fileId = crypto.randomUUID();
  fileIds.push(fileId);
  const uploads = await Promise.all([upload(fileId), upload(fileId)]);
  uploads.forEach(check);
  let r = await upload(fileId);
  check(r);
  assert.equal(r.data.resources.filter((x) => x.id === fileId).length, 1);
  assert.equal((await upload(fileId, 'different content')).status, 409);
  const download = await fetch(base + '/api/files?id=' + fileId, {
    headers: { Cookie: '__sites_local_auth=1' },
  });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'desk file fixture');
  assert.equal((await fetch(base + '/api/files?id=' + fileId)).status, 404);
  const projectId = crypto.randomUUID();
  projectIds.push(projectId);
  ids.push(projectId);
  const project = {
    type: 'project-capture',
    captureId: projectId,
    captureText: 'Create new project',
    name: '[Verification] Reactive project',
    description: 'A complete project brief\nWith a second line.',
    spaceId: 'nord',
    due: '2026-10-12',
    resourceIds: [fileId],
  };
  const projects = await Promise.all([api(project), api(project)]);
  projects.forEach(check);
  r = await api(project);
  check(r);
  state = r.data;
  assert.equal(state.projects.filter((p) => p.id === projectId).length, 1);
  assert.equal(
    state.captureEntries.filter((e) => e.id === projectId).length,
    1,
  );
  assert.equal(
    state.projects.find((p) => p.id === projectId).description,
    project.description,
  );
  assert.equal(
    state.resourceLinks.filter(
      (l) =>
        l.resourceId === fileId &&
        l.targetType === 'project' &&
        l.targetId === projectId,
    ).length,
    1,
  );
  assert.equal((await api({ ...project, name: 'changed' })).status, 409);
  const foreign = { ...project, captureId: crypto.randomUUID() };
  ids.push(foreign.captureId);
  assert.equal((await api(foreign, true)).status, 404);
  assert(
    !(await api(undefined, true)).data.projects.some(
      (p) => p.id === foreign.captureId,
    ),
  );
  const invalid = {
    ...project,
    captureId: crypto.randomUUID(),
    spaceId: 'missing',
  };
  ids.push(invalid.captureId);
  assert.equal((await api(invalid)).status, 404);
  assert(
    !(await api()).data.captureEntries.some((e) => e.id === invalid.captureId),
  );
  const internalId = crypto.randomUUID();
  projectIds.push(internalId);
  ids.push(internalId);
  r = await api({
    ...project,
    captureId: internalId,
    spaceId: '',
    resourceIds: [],
    name: '[Verification] Internal project',
  });
  check(r);
  assert.equal(r.data.projects.find((p) => p.id === internalId).spaceId, null);
  const taskId = crypto.randomUUID();
  taskIds.push(taskId);
  ids.push(taskId);
  r = await api({
    type: 'quick-create',
    captureId: taskId,
    title: '[Verification] Reactive task',
    captureText: 'Edit reactive fixture',
    projectId,
    spaceId: 'nord',
    due: '',
  });
  check(r);
  state = r.data;
  let t = state.tasks.find((t) => t.id === taskId);
  r = await api({
    type: 'edit',
    id: taskId,
    revision: t.revision,
    title: t.title,
    description: t.description,
    due: t.due,
    blocked: '',
    assignee: 'me',
    reviewer: 'maja',
  });
  check(r);
  state = r.data;
  const progress = capture(
    'progress',
    'Progress: first draft\nReady for feedback',
  );
  const tries = await Promise.all([api(progress), api(progress)]);
  tries.forEach(check);
  r = await api(progress);
  check(r);
  state = r.data;
  t = state.tasks.find((t) => t.id === taskId);
  assert.equal(t.stage, 'Up next');
  assert.equal(
    state.notes.filter((n) => n.id === progress.captureId).length,
    1,
  );
  assert(
    state.notes.find((n) => n.id === progress.captureId).body.includes('\n'),
  );
  assert.equal(
    state.captureEntries.filter((e) => e.id === progress.captureId).length,
    1,
  );
  assert.equal(
    (await api({ ...progress, captureText: 'Progress: changed' })).status,
    409,
  );
  let command = capture('blocker', 'Blocked: waiting for original footage');
  r = await api(command);
  check(r);
  state = r.data;
  assert.equal(
    state.tasks.find((t) => t.id === taskId).blocked,
    'waiting for original footage',
  );
  assert.equal(state.notices.filter((n) => n.taskId === taskId).length, 1);
  assert.equal(
    state.notices.find((n) => n.taskId === taskId).recipient,
    'maja',
  );
  check(await api(command));
  r = await api(capture('blocker', 'Unblocked'));
  check(r);
  state = r.data;
  assert.equal(state.tasks.find((t) => t.id === taskId).blocked, '');
  r = await api(capture('status', 'Status: Doing'));
  check(r);
  state = r.data;
  assert.equal(state.tasks.find((t) => t.id === taskId).stage, 'Doing');
  command = capture('status', 'Status: Review');
  r = await api(command);
  assert.equal(r.status, 400);
  assert(r.data.error.includes('deliverable'));
  assert(
    !(await api()).data.captureEntries.some((e) => e.id === command.captureId),
  );
  command = capture('status', 'Status: Done');
  r = await api(command);
  assert.equal(r.status, 400);
  assert(
    !(await api()).data.captureEntries.some((e) => e.id === command.captureId),
  );
  t = state.tasks.find((t) => t.id === taskId);
  r = await api({
    type: 'deliverable',
    id: taskId,
    revision: t.revision,
    body: 'A reviewable draft',
  });
  check(r);
  state = r.data;
  command = capture('status', 'Status: Review');
  r = await api(command);
  check(r);
  state = r.data;
  t = state.tasks.find((t) => t.id === taskId);
  assert.equal(t.stage, 'Review');
  assert.equal(t.version, 1);
  assert.equal(
    state.reviews.filter((x) => x.taskId === taskId && x.decision === 'Pending')
      .length,
    1,
  );
  check(await api(command));
  assert.equal(
    state.notices.filter(
      (n) => n.taskId === taskId && n.body.startsWith('Ready for review'),
    ).length,
    1,
  );
  r = await api({
    type: 'review',
    id: taskId,
    revision: t.revision,
    decision: 'Approved',
    feedback: '',
  });
  check(r);
  state = r.data;
  r = await api(capture('status', 'Status: Done'));
  check(r);
  state = r.data;
  assert.equal(state.tasks.find((t) => t.id === taskId).stage, 'Done');
  r = await api(capture('status', 'Status: Doing'));
  check(r);
  state = r.data;
  assert(
    !state.reviews.some(
      (r) => r.taskId === taskId && r.decision === 'Approved',
    ),
  );
  const stale = capture('progress', 'Progress: stale update', { revision: 0 });
  assert.equal((await api(stale)).status, 409);
  assert(
    !(await api()).data.captureEntries.some((e) => e.id === stale.captureId),
  );
  const race1 = capture('progress', 'Progress: one'),
    race2 = capture('progress', 'Progress: two');
  const race = await Promise.all([api(race1), api(race2)]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert(
    (await api(capture('progress', 'Progress: foreign'), true)).status >= 400,
  );
  state = (await api()).data;
  assert.equal(
    state.captureEntries.filter(
      (e) => e.id === race1.captureId || e.id === race2.captureId,
    ).length,
    1,
  );
  assert(
    deskEntries(state, 'first draft').some((e) => e.id === progress.captureId),
  );
  console.log(
    'PASS: idempotent file uploads and byte integrity, tenant isolation, atomic projects/resources/receipts, internal projects, progress/blocker routing and alerts, review/approval safeguards, retries, stale edits and races.',
  );
} finally {
  for (const id of [...ids, ...taskIds, ...projectIds, ...fileIds])
    assert.match(id, /^[a-f0-9-]+$/);
  await mkdir('work', { recursive: true });
  await writeFile(
    'work/desk-cleanup.sql',
    [
      ...ids.flatMap((id) => [
        `DELETE FROM spaceEvents WHERE org='local_seedy' AND json_extract(snapshot,'$.captureId')='${id}';`,
        `DELETE FROM captureEntries WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...taskIds.flatMap((id) => [
        ...['notes', 'activities', 'notices', 'reviews'].map(
          (table) =>
            `DELETE FROM ${table} WHERE org='local_seedy' AND taskId='${id}';`,
        ),
        `DELETE FROM tasks WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...projectIds.flatMap((id) => [
        `DELETE FROM resourceLinks WHERE org='local_seedy' AND targetType='project' AND targetId='${id}';`,
        `DELETE FROM projects WHERE org='local_seedy' AND id='${id}';`,
      ]),
      ...fileIds.flatMap((id) => [
        `DELETE FROM resourceLinks WHERE org='local_seedy' AND resourceId='${id}';`,
        `DELETE FROM resources WHERE org='local_seedy' AND id='${id}';`,
      ]),
    ].join('\n'),
  );
  await writeFile('work/desk-file-ids.json', JSON.stringify(fileIds));
}
