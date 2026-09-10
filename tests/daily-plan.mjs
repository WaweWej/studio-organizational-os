import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './sqlite-context.mjs';
import { emptyWorkspace, initialWorkspace } from '../lib/model.ts';
import { parseDailyPlan } from '../lib/daily-plan.ts';
import { commitDailyPlan } from '../lib/daily-plan-store.ts';
import { deliverDailyPlan, slackUrl } from '../lib/daily-plan-slack.ts';
import { inferEntryKind } from '../lib/entry-model.ts';
const { sqlite, context } = testDatabase(),
  data = emptyWorkspace();
for (const text of ['Plan my day', '/day', 'daily tasks', 'Today:'])
  assert.equal(inferEntryKind(text), 'daily');
const parsed = parseDailyPlan(
  'Plan my day:\n- Draft a brief\n- Edit a video by 14:30',
  data,
  '2026-09-10',
);
const fixture = initialWorkspace();
fixture.tasks[0].assignee = fixture.currentMember;
assert.equal(
  parseDailyPlan(
    fixture.tasks[0].title + ' @nord @autumn',
    fixture,
    '2026-09-10',
  )[0].taskId,
  fixture.tasks[0].id,
);
assert.equal(parsed.length, 2);
assert.equal(parsed[1].dueTime, '14:30');
assert.equal(parsed[1].due, '2026-09-10');
const item = {
  ...parsed[0],
  newSpace: 'New client',
  newProject: 'New project',
};
const command = {
  id: randomUUID(),
  day: '2026-09-10',
  sourceText: 'Draft a brief',
  items: [item],
};
await commitDailyPlan(context, command, data, true);
assert.equal(sqlite.prepare('SELECT count(*) n FROM tasks').get().n, 1);
assert.equal(sqlite.prepare('SELECT count(*) n FROM projects').get().n, 1);
await commitDailyPlan(context, command, data, true);
assert.equal(sqlite.prepare('SELECT count(*) n FROM tasks').get().n, 1);
const config = {
  STUDIO_SLACK_ORG: context.org,
  STUDIO_SLACK_WEBHOOK_URL:
    'https://hooks.slack.com/services/TEST/TEST/NOTREAL',
};
assert.equal(slackUrl(config, 'other-org'), null);
assert.equal(
  slackUrl(
    {
      ...config,
      STUDIO_SLACK_WEBHOOK_URL: 'https://example.invalid/services/test',
    },
    context.org,
  ),
  null,
);
let sent = 0;
const send = async (url, options) => {
  sent++;
  const payload = JSON.parse(options.body);
  assert(payload.blocks.every((b) => b.text.type === 'plain_text'));
  return new Response('ok');
};
await Promise.all([
  deliverDailyPlan(context, command.id, config, send),
  deliverDailyPlan(context, command.id, config, send),
]);
assert.equal(sent, 1);
assert.equal(
  sqlite.prepare('SELECT deliveryStatus FROM dailyPlans').get().deliveryStatus,
  'sent',
);
await deliverDailyPlan(context, command.id, config, send);
assert.equal(sent, 1);
const second = { ...command, id: randomUUID() };
await commitDailyPlan(context, second, data, true);
await deliverDailyPlan(context, second.id, config, async () => {
  throw Error('Timeout');
});
assert.equal(
  sqlite
    .prepare('SELECT deliveryStatus FROM dailyPlans WHERE id=?')
    .get(second.id).deliveryStatus,
  'unknown',
);
await deliverDailyPlan(context, second.id, config, send);
assert.equal(sent, 1, 'Unknown delivery must not be automatically repeated');
sqlite.exec(
  "CREATE TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT,'simulated failure'); END",
);
const before = sqlite.prepare('SELECT count(*) n FROM dailyPlans').get().n;
await assert.rejects(
  commitDailyPlan(context, { ...command, id: randomUUID() }, data, false),
  /simulated failure/,
);
assert.equal(
  sqlite.prepare('SELECT count(*) n FROM dailyPlans').get().n,
  before,
);
sqlite.exec('DROP TRIGGER reject_task');
console.log(
  'PASS: daily parsing, atomic context/task creation, retries, transaction rollback, Slack claims, mock delivery, configuration scoping and uncertain-response safety. No external messages sent.',
);
sqlite.close();
