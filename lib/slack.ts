import type { Context } from './store';
import { slackUrl, type SlackConfig } from './daily-plan-slack';

// Slack integration configuration. All values are runtime settings, never source.
// STUDIO_SLACK_WEBHOOK_URL + STUDIO_SLACK_ORG: existing incoming webhook (plan delivery and event fallback).
// STUDIO_SLACK_BOT_TOKEN + STUDIO_SLACK_CHANNEL: bot delivery for workspace events.
// STUDIO_SLACK_SIGNING_SECRET + STUDIO_SLACK_USER_MAP: inbound capture (slash command and DM events).
export type SlackEnv = SlackConfig & {
  STUDIO_SLACK_BOT_TOKEN?: string;
  STUDIO_SLACK_CHANNEL?: string;
  STUDIO_SLACK_SIGNING_SECRET?: string;
  STUDIO_SLACK_USER_MAP?: string;
  STUDIO_SLACK_TIMEZONE?: string;
};

export type SlackEventKind = 'blocker' | 'review-request' | 'review-decision';

export function slackBot(config: SlackEnv, org: string) {
  if (config.STUDIO_SLACK_ORG !== org) return null;
  const token = config.STUDIO_SLACK_BOT_TOKEN || '';
  const channel = config.STUDIO_SLACK_CHANNEL || '';
  if (!/^xoxb-[A-Za-z0-9-]{10,200}$/.test(token)) return null;
  if (!/^[A-Z][A-Z0-9]{5,20}$/.test(channel)) return null;
  return { token, channel };
}

// Events deliver through the bot when configured, otherwise the existing webhook.
export function slackEventTransport(config: SlackEnv, org: string) {
  const bot = slackBot(config, org);
  if (bot) return { mode: 'bot' as const, ...bot };
  const webhook = slackUrl(config, org);
  if (webhook) return { mode: 'webhook' as const, url: webhook };
  return null;
}

export function slackInboundConfig(config: SlackEnv) {
  const org = config.STUDIO_SLACK_ORG || '';
  const secret = config.STUDIO_SLACK_SIGNING_SECRET || '';
  if (!org || secret.length < 16) return null;
  let map: Record<string, string> = {};
  try {
    const parsed = JSON.parse(config.STUDIO_SLACK_USER_MAP || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      for (const [k, v] of Object.entries(parsed))
        if (/^[UW][A-Z0-9]{5,20}$/.test(k) && typeof v === 'string' && v)
          map[k] = v;
  } catch {
    map = {};
  }
  return { org, secret, map };
}

export function slackMemberFor(config: SlackEnv, slackUser: string) {
  const inbound = slackInboundConfig(config);
  if (!inbound) return null;
  return inbound.map[slackUser] || null;
}

// The capture day for inbound entries uses a configured IANA time zone; UTC otherwise.
export function slackDay(config: SlackEnv, at: Date) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: config.STUDIO_SLACK_TIMEZONE || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// A queued event row. Written atomically with its mutation; 'pending' only when a
// transport is configured, so the record never implies an unconfigured delivery.
export function slackMessageRow(
  config: SlackEnv,
  org: string,
  kind: SlackEventKind,
  refId: string,
  body: string,
  now: string,
) {
  return {
    id: crypto.randomUUID(),
    kind,
    refId,
    body: body.slice(0, 2500),
    createdAt: now,
    deliveryStatus: slackEventTransport(config, org) ? 'pending' : 'not_connected',
    deliveryError: '',
    deliveryClaim: '',
  };
}

type SlackMessage = {
  id: string;
  body: string;
  deliveryClaim: string;
};

// Claim-based delivery mirroring daily plans: a lost response is never blindly
// resent, 4xx marks the message failed, and only Slack's confirmation marks it sent.
export async function deliverSlackMessages(
  c: Context,
  config: SlackEnv,
  send: typeof fetch = fetch,
) {
  const transport = slackEventTransport(config, c.org);
  if (!transport) return;
  const rows = await c.db
    .prepare(
      "SELECT id FROM slackMessages WHERE org=? AND deliveryStatus IN ('pending','failed') ORDER BY createdAt LIMIT 5",
    )
    .bind(c.org)
    .all<{ id: string }>();
  for (const { id } of rows.results || []) {
    const claim = Date.now() + ':' + crypto.randomUUID();
    const claimed = await c.db
      .prepare(
        "UPDATE slackMessages SET deliveryStatus='sending',deliveryClaim=?,deliveryError='' WHERE org=? AND id=? AND deliveryStatus IN ('pending','failed')",
      )
      .bind(claim, c.org, id)
      .run();
    if (!claimed.meta.changes) continue;
    const message = await c.db
      .prepare('SELECT * FROM slackMessages WHERE org=? AND id=? AND deliveryClaim=?')
      .bind(c.org, id, claim)
      .first<SlackMessage>();
    if (!message) continue;
    let status = 'unknown',
      error =
        'Delivery could not be confirmed. Check Slack before sending again.';
    try {
      let confirmed = false,
        rejected = false;
      if (transport.mode === 'bot') {
        const response = await send('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: 'Bearer ' + transport.token,
          },
          body: JSON.stringify({
            channel: transport.channel,
            text: message.body,
            blocks: [
              {
                type: 'section',
                text: { type: 'plain_text', text: message.body },
              },
            ],
          }),
        });
        const body = (await response.json().catch(() => null)) as {
          ok?: boolean;
        } | null;
        confirmed = response.ok && body?.ok === true;
        rejected =
          (response.status >= 400 && response.status < 500) ||
          (response.ok && body?.ok === false);
      } else {
        const response = await send(transport.url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message.body,
            blocks: [
              {
                type: 'section',
                text: { type: 'plain_text', text: message.body },
              },
            ],
          }),
        });
        const body = await response.text();
        confirmed = response.ok && body.trim() === 'ok';
        rejected = response.status >= 400 && response.status < 500;
      }
      if (confirmed) {
        status = 'sent';
        error = '';
      } else if (rejected) {
        status = 'failed';
        error = 'Slack rejected the message. Check the connection before retrying.';
      }
    } catch {
      /* A lost response may follow a successful post: never blindly resend. */
    }
    await c.db
      .prepare(
        'UPDATE slackMessages SET deliveryStatus=?,deliveryError=? WHERE org=? AND id=? AND deliveryClaim=?',
      )
      .bind(status, error, c.org, id, claim)
      .run();
  }
}

// Slack request signing: v0=HMAC_SHA256(secret, "v0:" + timestamp + ":" + body).
export async function verifySlackSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!/^\d{6,12}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  if (!/^v0=[0-9a-f]{64}$/.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode('v0:' + timestamp + ':' + rawBody),
  );
  const expected =
    'v0=' +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++)
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

// Inbound retry deduplication: Slack retries events and commands; the first
// arrival wins and repeats are acknowledged without re-executing.
export async function claimInbound(c: Context, id: string, now: string) {
  try {
    const result = await c.db
      .prepare(
        'INSERT INTO slackInbound (org,id,createdAt) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM slackInbound WHERE org=? AND id=?)',
      )
      .bind(c.org, id.slice(0, 120), now, c.org, id.slice(0, 120))
      .run();
    return !!result.meta.changes;
  } catch {
    return false;
  }
}
