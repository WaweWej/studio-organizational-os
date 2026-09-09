import assert from 'node:assert/strict';
import {
  deskIntents,
  matchEntryIntent,
  stripEntryPrefix,
  commandQuery,
  commandSuggestions,
} from '../lib/desk-intents.ts';
import { inferEntryKind, interpretEntry } from '../lib/entry-model.ts';
import { initialWorkspace } from '../lib/model.ts';
import { parseSalesCapture } from '../lib/sales-model.ts';
const data = initialWorkspace(),
  now = new Date(2026, 8, 9, 12),
  target = { type: 'task', id: 't1' };
for (const action of deskIntents) {
  for (const alias of action.aliases)
    assert.equal(matchEntryIntent(alias)?.id, action.id, alias);
  assert.equal(
    matchEntryIntent('/' + action.id)?.id,
    action.id,
    '/' + action.id,
  );
  assert.equal(inferEntryKind(action.insert), action.kind, action.insert);
}
for (const text of [
  'add new deadline',
  'set a deadline',
  'update the deadline',
  'new deadline',
  'create a deadline',
])
  assert.equal(inferEntryKind(text), 'deadline', text);
assert.equal(commandQuery('/'), '');
assert.equal(commandQuery('/dead'), 'dead');
assert.equal(commandQuery('/deadline @tomorrow'), null);
assert.equal(commandQuery('a / b'), null);
assert.equal(commandQuery('/note A note'), null);
assert.equal(commandSuggestions('dead')[0].kind, 'deadline');
assert.equal(commandSuggestions('help').length, deskIntents.length);
assert.equal(commandSuggestions('unknown').length, 0);
let e = interpretEntry('add new deadline @18/09', data, { target, now });
assert.equal(e.kind, 'deadline');
assert.equal(e.due, '2026-09-18');
assert.equal(e.taskId, 't1');
assert.deepEqual(e.errors, []);
e = interpretEntry('/deadline @Autumn launch @tomorrow', data, { now });
assert.equal(e.projectId, 'autumn');
assert.equal(e.due, '2026-09-10');
assert.deepEqual(e.errors, []);
e = interpretEntry(
  'Add a new note @nord: Goals: better leads\nBudget: keep it steady',
  data,
  { now },
);
assert.equal(e.body, 'Goals: better leads\nBudget: keep it steady');
assert.equal(e.spaceId, 'nord');
assert.deepEqual(e.errors, []);
e = interpretEntry('/note A quieter opening\nKeep the original voice', data, {
  target,
  now,
});
assert.equal(e.body, 'A quieter opening\nKeep the original voice');
e = interpretEntry('Create a new task: edit the launch video @nord', data, {
  now,
});
assert.equal(e.kind, 'task');
assert.equal(e.title, 'edit the launch video Nord & Form');
assert.equal(e.spaceId, 'nord');
assert.deepEqual(e.errors, []);
assert(
  interpretEntry('add new task', data, { now }).errors.includes(
    'Give the task a name.',
  ),
);
e = interpretEntry('Schedule a meeting with @nord @tomorrow at 14:00', data, {
  now,
});
assert.equal(e.kind, 'meeting');
assert.equal(e.meetingTime, '14:00');
assert.deepEqual(e.errors, []);
e = interpretEntry('Log progress: first cut ready', data, { target, now });
assert.equal(e.body, 'first cut ready');
assert.equal(e.taskId, 't1');
assert.deepEqual(e.errors, []);
e = interpretEntry('Flag a blocker: missing footage', data, { target, now });
assert.equal(e.kind, 'blocker');
assert.equal(e.body, 'missing footage');
assert.deepEqual(e.errors, []);
e = interpretEntry('Clear the blocker', data, { target, now });
assert.equal(e.clearBlocker, true);
assert.deepEqual(e.errors, []);
e = interpretEntry('Change status: Doing', data, { target, now });
assert.equal(e.nextStage, 'Doing');
assert.deepEqual(e.errors, []);
e = interpretEntry('Request a review', data, { target, now });
assert.equal(e.nextStage, 'Review');
assert.deepEqual(e.errors, []);
const title = data.tasks[0].title;
e = interpretEntry('Log progress "' + title + '": editing', data, { now });
assert.equal(e.taskId, 't1');
assert.equal(e.body, 'editing');
assert.deepEqual(e.errors, []);
assert.equal(
  stripEntryPrefix('Add a new project: Summer', 'project'),
  'Summer',
);
assert.equal(inferEntryKind('Book meeting with @nord @tomorrow'), 'task');
assert.equal(inferEntryKind('Notebook ideas for tomorrow'), 'note');
assert.equal(inferEntryKind('The deadline needs discussion'), 'note');
assert(interpretEntry('/unknown thing', data, { now }).errors.length);
assert.deepEqual(
  interpretEntry('Note: /unknown thing', data, { now }).errors,
  [],
);
e = interpretEntry('/sales "Acme", next step: calculate lead price', data, {
  now,
});
assert.equal(e.kind, 'sales');
assert.equal(
  parseSalesCapture('/sales "Acme", next step: calculate lead price', now).name,
  'Acme',
);
assert.deepEqual(e.errors, []);
console.log(
  'PASS: action registry aliases, slash discovery and filtering, complete typed commands, prefix stripping, note punctuation, task/meeting distinction, deadline context, progress/blocker/status/review routing and sales shorthand.',
);
