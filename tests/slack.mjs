import assert from 'node:assert/strict';
import { testDatabase } from './sqlite-context.mjs';
import {
  slackBot,
  slackEventTransport,
  slackInboundConfig,
  slackMemberFor,
  slackDay,
  slackMessageRow,
  deliverSlackMessages,
  verifySlackSignature,
  claimInbound,
} from '../lib/slack.ts';

const webhookOnly = {
  STUDIO_SLACK_ORG: 'test-a',
  STUDIO_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T0/B0/x1y2z3',
};
const botConfig = {
  STUDIO_SLACK_ORG: 'test-a',
  STUDIO_SLACK_BOT_TOKEN: 'xoxb-1234567890-abcDEF',
  STUDIO_SLACK_CHANNEL: 'C0123456',
};
const inboundConfig = {
  STUDIO_SLACK_ORG: 'test-a',
  STUDIO_SLACK_SIGNING_SECRET: 'a-signing-secret-of-length',
  STUDIO_SLACK_USER_MAP: '{"U0AAAA11":"me","W0BBBB22":"maja","bad key":"x"}',
};

// Configuration validation: org binding, token/channel shape, safe map parsing.
assert.equal(slackBot(botConfig, 'other-org'), null);
assert.deepEqual(slackBot(botConfig, 'test-a'), {
  token: 'xoxb-1234567890-abcDEF',
  channel: 'C0123456',
});
assert.equal(
  slackBot({ ...botConfig, STUDIO_SLACK_BOT_TOKEN: 'xoxp-user-token-1234' }, 'test-a'),
  null,
);
assert.equal(
  slackBot({ ...botConfig, STUDIO_SLACK_CHANNEL: 'lowercase' }, 'test-a'),
  null,
);
assert.equal(slackEventTransport(botConfig, 'test-a').mode, 'bot');
assert.equal(slackEventTransport(webhookOnly, 'test-a').mode, 'webhook');
assert.equal(slackEventTransport({}, 'test-a'), null);
assert.equal(slackInboundConfig({ STUDIO_SLACK_ORG: 'test-a' }), null);
assert.equal(
  slackInboundConfig({ ...inboundConfig, STUDIO_SLACK_SIGNING_SECRET: 'short' }),
  null,
);
assert.equal(slackMemberFor(inboundConfig, 'U0AAAA11'), 'me');
assert.equal(slackMemberFor(inboundConfig, 'W0BBBB22'), 'maja');
assert.equal(slackMemberFor(inboundConfig, 'U0UNKNOWN'), null);
assert.equal(
  slackMemberFor({ ...inboundConfig, STUDIO_SLACK_USER_MAP: 'not json' }, 'U0AAAA11'),
  null,
);

// Capture day uses the configured time zone.
const lateEvening = new Date('2026-09-10T23:30:00Z');
assert.equal(slackDay({}, lateEvening), '2026-09-10');
assert.equal(
  slackDay({ STUDIO_SLACK_TIMEZONE: 'Europe/Copenhagen' }, lateEvening),
  '2026-09-11',
);
assert.equal(
  slackDay({ STUDIO_SLACK_TIMEZONE: 'Not/AZone' }, lateEvening),
  '2026-09-10',
);

// Outbox rows never claim a configured transport that does not exist.
const nowIso = '2026-09-10T12:00:00.000Z';
assert.equal(
  slackMessageRow({}, 'test-a', 'blocker', 't1', 'Needs help', nowIso)
    .deliveryStatus,
  'not_connected',
);
assert.equal(
  slackMessageRow(botConfig, 'test-a', 'blocker', 't1', 'Needs help', nowIso)
    .deliveryStatus,
  'pending',
);
assert.equal(
  slackMessageRow(botConfig, 'test-a', 'blocker', 't1', 'x'.repeat(9000), nowIso)
    .body.length,
  2500,
);

// Signature verification: correct digest, constant shape checks, stale rejection.
const secret = inboundConfig.STUDIO_SLACK_SIGNING_SECRET;
const ts = '1789000000';
const body = 'command=%2Fstudio&text=Note%3A+hello';
const { createHmac } = await import('node:crypto');
const good =
  'v0=' + createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');
assert.equal(
  await verifySlackSignature(secret, ts, body, good, Number(ts) + 60),
  true,
);
assert.equal(
  await verifySlackSignature(secret, ts, body, good, Number(ts) + 3600),
  false,
);
assert.equal(
  await verifySlackSignature(secret, ts, body + 'tampered', good, Number(ts) + 60),
  false,
);
assert.equal(
  await verifySlackSignature(secret, ts, body, 'v0=' + '0'.repeat(64), Number(ts) + 60),
  false,
);
assert.equal(
  await verifySlackSignature(secret, 'notdigits', body, good, Number(ts) + 60),
  false,
);

// Inbound retries: the first arrival claims the ID, repeats are refused, and
// organizations are isolated from each other.
{
  const { db } = testDatabase();
  const a = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  const b = { db, org: 'test-b', actor: 'me', name: 'Other owner' };
  assert.equal(await claimInbound(a, 'event:E1', nowIso), true);
  assert.equal(await claimInbound(a, 'event:E1', nowIso), false);
  assert.equal(await claimInbound(b, 'event:E1', nowIso), true);
  assert.equal(await claimInbound(a, 'command:TR1', nowIso), true);
}

// Delivery: only Slack's confirmation marks a message sent; a rejection marks it
// failed; a lost response keeps the claim and is never blindly resent.
const seedMessage = (db, org, id, status = 'pending') =>
  db
    .prepare(
      'INSERT INTO slackMessages (org,id,kind,refId,body,createdAt,deliveryStatus,deliveryError,deliveryClaim) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .bind(org, id, 'blocker', 't1', 'Needs help: Edit the launch video', nowIso, status, '', '')
    .run();
const readMessage = (db, org, id) =>
  db.prepare('SELECT * FROM slackMessages WHERE org=? AND id=?').bind(org, id).first();

{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  await seedMessage(db, 'test-a', 'm-ok');
  const calls = [];
  await deliverSlackMessages(c, botConfig, async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://slack.com/api/chat.postMessage');
  assert.equal(
    JSON.parse(calls[0].init.body).channel,
    'C0123456',
  );
  assert.match(calls[0].init.headers.Authorization, /^Bearer xoxb-/);
  const row = await readMessage(db, 'test-a', 'm-ok');
  assert.equal(row.deliveryStatus, 'sent');
  assert.equal(row.deliveryError, '');
}

{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  await seedMessage(db, 'test-a', 'm-rejected');
  await deliverSlackMessages(c, botConfig, async () =>
    new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), {
      status: 200,
    }),
  );
  assert.equal((await readMessage(db, 'test-a', 'm-rejected')).deliveryStatus, 'failed');
}

{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  await seedMessage(db, 'test-a', 'm-lost');
  await deliverSlackMessages(c, botConfig, async () => {
    throw new Error('network interrupted');
  });
  const lost = await readMessage(db, 'test-a', 'm-lost');
  assert.equal(lost.deliveryStatus, 'unknown');
  assert.match(lost.deliveryError, /could not be confirmed/);
  // A second run must not retry the unconfirmed message.
  const retries = [];
  await deliverSlackMessages(c, botConfig, async (url) => {
    retries.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(retries.length, 0);
}

{
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  await seedMessage(db, 'test-a', 'm-failed', 'failed');
  // Failed messages are eligible for an explicit retry pass.
  const sent = [];
  await deliverSlackMessages(c, botConfig, async (url) => {
    sent.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(sent.length, 1);
  assert.equal((await readMessage(db, 'test-a', 'm-failed')).deliveryStatus, 'sent');
}

{
  // Webhook fallback confirms only on Slack's literal ok body.
  const { db } = testDatabase();
  const c = { db, org: 'test-a', actor: 'me', name: 'Test owner' };
  await seedMessage(db, 'test-a', 'm-webhook');
  await deliverSlackMessages(c, webhookOnly, async (url) => {
    assert.equal(url, webhookOnly.STUDIO_SLACK_WEBHOOK_URL);
    return new Response('ok', { status: 200 });
  });
  assert.equal((await readMessage(db, 'test-a', 'm-webhook')).deliveryStatus, 'sent');
}

{
  // Organization scoping: another organization's transport never sends this
  // organization's messages, and nothing is attempted without configuration.
  const { db } = testDatabase();
  const other = { db, org: 'test-b', actor: 'me', name: 'Other owner' };
  await seedMessage(db, 'test-b', 'm-other');
  const attempts = [];
  await deliverSlackMessages(other, botConfig, async (url) => {
    attempts.push(url);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.equal(attempts.length, 0);
  assert.equal((await readMessage(db, 'test-b', 'm-other')).deliveryStatus, 'pending');
}

console.log(
  'PASS: Slack config validation, org binding, capture day time zones, outbox truthfulness, signature verification, inbound dedup and tenant isolation, bot/webhook delivery confirmation, rejection handling, lost-response no-resend, and failed retry eligibility.',
);
