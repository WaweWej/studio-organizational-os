import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';
import { initialWorkspace } from '../lib/model.ts';
import { pendingReview } from '../lib/workspace-brief.ts';

// Exercise the actual command boundary with isolated SQLite and no live identity.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env={}', shortCircuit: true };
  if (specifier === '@/app/chatgpt-auth') return { url: 'data:text/javascript,export async function getChatGPTUser(){return null}', shortCircuit: true };
  if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(specifier.slice(2) + '.ts')).href, context);
  return next(specifier, context);
} });
const { mutate } = await import('../lib/store.ts');
const { sqlite, context: c } = testDatabase();
sqlite.exec("INSERT INTO members VALUES ('test-a','me','Owner','Owner','#000000'),('test-a','peer','Reviewer','Designer','#111111'),('other-org','outsider','Other','Owner','#222222')");
const task = id => sqlite.prepare('SELECT * FROM tasks WHERE org=? AND id=?').get(c.org, id);
const reviews = id => sqlite.prepare('SELECT * FROM reviews WHERE org=? AND taskId=?').all(c.org, id);
const activities = id => sqlite.prepare('SELECT * FROM activities WHERE org=? AND taskId=?').all(c.org, id);
const notices = id => sqlite.prepare('SELECT * FROM notices WHERE org=? AND taskId=?').all(c.org, id);
const make = (id, extra = {}) => {
  const row = { ...initialWorkspace().tasks[0], org: c.org, id, title: 'Test task', description: 'Review the proposal outline', projectId: null, reviewer: 'me', assignee: 'me', stage: 'Doing', deliverable: '', version: 0, reviewRequired: 1, ...extra };
  sqlite.prepare(`INSERT INTO tasks (${Object.keys(row).map(k => '"' + k + '"').join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
};
const act = (id, type, extra = {}, actor = 'me') => mutate({ ...c, actor }, { type, id, revision: task(id).revision, ...extra });

make('legacy');
await act('legacy', 'move', { stage: 'Done' });
assert.equal(task('legacy').stage, 'Done');
assert.equal(reviews('legacy').length, 0);
assert.equal(notices('legacy').length, 0);
const completedRevision = task('legacy').revision;
await act('legacy', 'move', { stage: 'Done' });
assert.equal(task('legacy').revision, completedRevision, 'Repeating a board move creates no extra activity');
assert.equal(activities('legacy').length, 1);
await act('legacy', 'move', { stage: 'Doing' });
await act('legacy', 'complete');
assert.equal(task('legacy').stage, 'Done');

make('review');
await assert.rejects(act('review', 'submit'), /another team member/);
await assert.rejects(act('review', 'submit', { reviewer: 'outsider' }), /does not exist/);
assert.equal(reviews('review').length, 0);
await act('review', 'submit', { reviewer: 'peer' });
assert.equal(task('review').stage, 'Review');
assert.equal(reviews('review')[0].snapshot, 'Review the proposal outline', 'Tasks need no deliverable to request feedback');
assert.equal(notices('review').length, 1);
assert.equal(notices('review')[0].recipient, 'peer');
await assert.rejects(act('review', 'submit', { reviewer: 'peer' }), /already in review/);
await assert.rejects(act('review', 'review', { decision: 'Approved' }), /Only the requested reviewer/);
assert.equal(notices('review').length, 1);
await act('review', 'move', { stage: 'Done' });
assert.equal(task('review').stage, 'Done');
assert.equal(reviews('review')[0].decision, 'Superseded');
assert.equal(notices('review')[0].read, 1);
assert(!pendingReview({ reviews: reviews('review') }, task('review')));
assert.equal(reviews('review')[0].snapshot, 'Review the proposal outline');
await assert.rejects(act('review', 'review', { decision: 'Approved' }, 'peer'), /not in review/);

await act('review', 'move', { stage: 'Doing' });
await act('review', 'deliverable', { body: 'Version two proposal' });
await act('review', 'submit', { reviewer: 'peer' });
assert.equal(task('review').version, 2);
await act('review', 'review', { decision: 'Changes requested', feedback: 'Clarify scope' }, 'peer');
await act('review', 'complete');
assert.equal(task('review').stage, 'Done', 'Feedback does not force another review');
assert.equal(reviews('review')[1].decision, 'Changes requested');

make('approved', { reviewRequired: 0 });
await act('approved', 'move', { stage: 'Review', reviewer: 'peer' });
await act('approved', 'review', { decision: 'Approved', feedback: 'Looks good' }, 'peer');
await act('approved', 'complete');
assert.equal(reviews('approved')[0].decision, 'Approved', 'Completion preserves actual approval history');
assert.equal(task('approved').delivery, 'Internal completion');

make('conflict');
const staleRevision = task('conflict').revision;
await act('conflict', 'move', { stage: 'Up next' });
await assert.rejects(mutate(c, { type: 'complete', id: 'conflict', revision: staleRevision }), /changed/);
assert.equal(task('conflict').stage, 'Up next');
await assert.rejects(mutate({ ...c, org: 'other-org' }, { type: 'complete', id: 'conflict', revision: task('conflict').revision }), /not found/);

make('rollback');
await act('rollback', 'submit', { reviewer: 'peer' });
const before = { task: task('rollback'), reviews: reviews('rollback'), notices: notices('rollback'), activities: activities('rollback') };
sqlite.exec("CREATE TRIGGER fail_completion BEFORE INSERT ON activities WHEN NEW.taskId='rollback' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
await assert.rejects(act('rollback', 'complete'), /test rollback/);
assert.deepEqual({ task: task('rollback'), reviews: reviews('rollback'), notices: notices('rollback'), activities: activities('rollback') }, before);
sqlite.close();
console.log('PASS: legacy/new direct completion, voluntary reviewer notifications, review snapshots, request closure, approved/feedback history, duplicate moves, reviewer and organization boundaries, stale writes and atomic rollback.');
