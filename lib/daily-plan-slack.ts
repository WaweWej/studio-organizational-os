import type { Context } from './store';
import type { DailyPlan } from './model';
export type SlackConfig = {
  STUDIO_SLACK_WEBHOOK_URL?: string;
  STUDIO_SLACK_ORG?: string;
};
export function slackUrl(config: SlackConfig, org: string) {
  if (config.STUDIO_SLACK_ORG !== org || !config.STUDIO_SLACK_WEBHOOK_URL)
    return null;
  try {
    const url = new URL(config.STUDIO_SLACK_WEBHOOK_URL);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'hooks.slack.com' ||
      !url.pathname.startsWith('/services/') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export async function deliverDailyPlan(
  c: Context,
  id: string,
  config: SlackConfig,
  send: typeof fetch = fetch,
) {
  const url = slackUrl(config, c.org);
  if (!url) return;
  const claim = Date.now() + ':' + crypto.randomUUID();
  const result = await c.db
    .prepare(
      "UPDATE dailyPlans SET deliveryStatus='sending',deliveryClaim=?,deliveryError='' WHERE org=? AND id=? AND actor=? AND deliveryStatus IN ('pending','failed','not_connected')",
    )
    .bind(claim, c.org, id, c.actor)
    .run();
  if (!result.meta.changes) return;
  const plan = await c.db
    .prepare(
      'SELECT * FROM dailyPlans WHERE org=? AND id=? AND deliveryClaim=?',
    )
    .bind(c.org, id, claim)
    .first<DailyPlan>();
  if (!plan) return;
  let status = 'unknown',
    error =
      'Delivery could not be confirmed. Check Slack before sending again.';
  try {
    // Plain text blocks prevent task text from generating Slack mentions.
    const response = await send(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Daily plan committed for ' + plan.day,
        blocks: [
          {
            type: 'section',
            text: { type: 'plain_text', text: c.name + ' · ' + plan.day },
          },
          ...plan.summary.match(/[\s\S]{1,2500}/g)!.map((text) => ({
            type: 'section',
            text: { type: 'plain_text', text },
          })),
        ],
      }),
    });
    const body = await response.text();
    if (response.ok && body.trim() === 'ok') {
      status = 'sent';
      error = '';
    } else if (response.status >= 400 && response.status < 500) {
      status = 'failed';
      error =
        'Slack rejected the message. Check the connection before retrying.';
    }
  } catch {
    /* A lost response may follow a successful post: never blindly resend. */
  }
  await c.db
    .prepare(
      "UPDATE dailyPlans SET deliveryStatus=?,deliveryError='' || ? WHERE org=? AND id=? AND deliveryClaim=?",
    )
    .bind(status, error, c.org, id, claim)
    .run();
}
