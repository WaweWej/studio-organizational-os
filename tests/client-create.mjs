import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Client creation: explicit creation from Spaces and named clients from the
// project form. Requires the running local preview on port 5173. All records
// use fixed test IDs and are removed afterwards.
const base = 'http://localhost:5173';
const api = async (body) => {
  const response = await fetch(base + '/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const uuid = () => crypto.randomUUID();

const clientId = uuid();
const projectIds = [];
const removeClient = async (id) => {
  const read = await fetch(base + '/api/workspace');
  const data = await read.json();
  const space = data.spaces.find((s) => s.id === id);
  if (!space) return;
  const removed = await api({ type: 'client-delete', id, revision: space.revision });
  if (removed.status !== 200)
    throw new Error('cleanup failed: ' + JSON.stringify(removed.body));
};
const cleanup = async () => {
  await removeClient(clientId);
};

try {
  // Creation succeeds and the space appears with the supplied ID.
  const created = await api({ type: 'client-create', id: clientId, name: 'Test Client Alpha' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const space = created.body.spaces.find((s) => s.id === clientId);
  assert.ok(space, 'created client is in the workspace');
  assert.equal(space.name, 'Test Client Alpha');
  assert.equal(space.type, 'Client');

  // A retry with the same ID and name is idempotent and adds no second event.
  const retried = await api({ type: 'client-create', id: clientId, name: 'Test Client Alpha' });
  assert.equal(retried.status, 200);
  assert.equal(
    retried.body.spaces.filter((s) => s.name === 'Test Client Alpha').length,
    1,
  );

  // The same ID with a different name is refused.
  const conflicted = await api({ type: 'client-create', id: clientId, name: 'Different Name' });
  assert.equal(conflicted.status, 409);

  // The same name under a new ID points at the existing client.
  const duplicate = await api({ type: 'client-create', id: uuid(), name: '  test   client ALPHA ' });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.body.error, /already exists/);

  // The project form can name a new client; both are created atomically.
  const captureId = uuid();
  projectIds.push(captureId);
  const project = await api({
    type: 'project-capture',
    captureId,
    captureText: 'create new project',
    name: '[Verification] Alpha launch',
    description: '',
    spaceId: '',
    newClient: 'Test Client Beta',
    due: '',
    resourceIds: [],
  });
  assert.equal(project.status, 200, JSON.stringify(project.body));
  const beta = project.body.spaces.find((s) => s.name === 'Test Client Beta');
  assert.ok(beta, 'named client was created');
  const createdProject = project.body.projects.find((p) => p.id === captureId);
  assert.equal(createdProject.spaceId, beta.id);

  // Naming an existing client reuses it (planning semantics), case-insensitive.
  const secondCapture = uuid();
  projectIds.push(secondCapture);
  const reuse = await api({
    type: 'project-capture',
    captureId: secondCapture,
    captureText: 'create new project',
    name: '[Verification] Alpha second',
    description: '',
    spaceId: '',
    newClient: 'test client beta',
    due: '',
    resourceIds: [],
  });
  assert.equal(reuse.status, 200);
  assert.equal(
    reuse.body.spaces.filter((s) => s.name.toLowerCase().includes('test client beta')).length,
    1,
  );
  assert.equal(
    reuse.body.projects.find((p) => p.id === secondCapture).spaceId,
    beta.id,
  );

  // Choosing both an existing and a new client is refused.
  const both = await api({
    type: 'project-capture',
    captureId: uuid(),
    captureText: 'create new project',
    name: '[Verification] Alpha third',
    description: '',
    spaceId: beta.id,
    newClient: 'Another Name',
    due: '',
    resourceIds: [],
  });
  assert.equal(both.status, 400);

  // Cleanup: remove the named client (its projects go with it).
  await removeClient(beta.id);
  console.log(
    'PASS: explicit client creation with idempotent retries, name-collision honesty, project-form client naming with atomic creation and normalized reuse, and both-choices rejection.',
  );
} finally {
  await cleanup();
  // Client deletion detaches projects instead of destroying work, so the
  // suite hands the local database a broom, matching the capture suite.
  for (const id of projectIds) assert.match(id, /^[a-f0-9-]+$/);
  await mkdir('work', { recursive: true });
  await writeFile(
    'work/client-create-cleanup.sql',
    projectIds
      .flatMap((id) => [
        `DELETE FROM projects WHERE org='local_seedy' AND id='${id}';`,
        `DELETE FROM captureEntries WHERE org='local_seedy' AND id='${id}';`,
      ])
      .join('\n'),
  );
}
