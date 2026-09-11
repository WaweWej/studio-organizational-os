import { env } from 'cloudflare:workers';
import { mutate, readWorkspace, type Context } from '@/lib/store';
import { interpretEntry } from '@/lib/entry-model';
import {
  verifySlackSignature,
  slackInboundConfig,
  claimInbound,
  slackDay,
  type SlackEnv,
} from '@/lib/slack';
import { AppError } from '@/lib/validation';

const asText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Inbound Slack capture. Requests are accepted only with a valid Slack signature,
// a mapped workspace member, and the configured organization. Entries run through
// the same server-validated capture command the Desk uses; unrecognized text
// becomes a note, never a silently invented task.
export async function POST(request: Request) {
  const config = env as unknown as SlackEnv;
  const inbound = slackInboundConfig(config);
  if (!inbound) return json({ error: 'Slack inbound is not configured.' }, 503);
  const raw = await request.text();
  if (raw.length > 20000) return json({ error: 'Request too large.' }, 413);
  const verified = await verifySlackSignature(
    inbound.secret,
    request.headers.get('x-slack-request-timestamp') || '',
    raw,
    request.headers.get('x-slack-signature') || '',
  );
  if (!verified) return json({ error: 'Invalid signature.' }, 401);
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.startsWith('application/json')) {
      const payload = JSON.parse(raw) as Record<string, unknown>;
      if (payload.type === 'url_verification')
        return json({ challenge: asText(payload.challenge, 500) });
      if (payload.type === 'event_callback') {
        const event = (payload.event || {}) as Record<string, unknown>;
        // Only direct messages from mapped humans; bot echoes and edits are ignored.
        if (
          event.type !== 'message' ||
          event.channel_type !== 'im' ||
          event.bot_id ||
          event.subtype
        )
          return json({ ok: true });
        const eventId = asText(payload.event_id, 100);
        if (!eventId) return json({ ok: true });
        const result = await capture(
          config,
          inbound,
          asText(event.user, 30),
          asText(event.text, 4000),
          'event:' + eventId,
        );
        return json({ ok: true, receipt: result });
      }
      return json({ ok: true });
    }
    if (contentType.startsWith('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams(raw);
      if (!form.get('command')) return json({ error: 'Unsupported payload.' }, 400);
      const text = form.get('text') || '';
      if (!text.trim())
        return json({
          response_type: 'ephemeral',
          text: 'Write something to capture, for example: /studio Note @Client: agreed a calmer direction',
        });
      const receipt = await capture(
        config,
        inbound,
        form.get('user_id') || '',
        text,
        'command:' + (form.get('trigger_id') || ''),
      );
      return json({ response_type: 'ephemeral', text: receipt });
    }
    return json({ error: 'Unsupported payload.' }, 415);
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : 'The entry could not be saved. Please try again.';
    if (contentType.startsWith('application/x-www-form-urlencoded'))
      return json({ response_type: 'ephemeral', text: message });
    return json({ ok: true, error: message });
  }
}

async function capture(
  config: SlackEnv,
  inbound: NonNullable<ReturnType<typeof slackInboundConfig>>,
  slackUser: string,
  rawText: string,
  dedupId: string,
) {
  const member = inbound.map[slackUser] || null;
  if (!member)
    throw new AppError(
      'This Slack account is not connected to a Studio member.',
    );
  const text = rawText.trim().slice(0, 2000);
  if (!text) throw new AppError('Write something to capture.');
  const row = await env.DB.prepare(
    'SELECT id,name FROM members WHERE org=? AND id=?',
  )
    .bind(inbound.org, member)
    .first<{ id: string; name: string }>();
  if (!row)
    throw new AppError(
      'This Slack account is not connected to a Studio member.',
    );
  const c: Context = {
    org: inbound.org,
    actor: row.id,
    name: row.name,
    db: env.DB,
  };
  const now = new Date();
  if (!dedupId || !(await claimInbound(c, dedupId, now.toISOString())))
    return 'Already captured.';
  // The same deterministic interpretation the Desk uses, resolved against the
  // workspace's real clients, projects and tasks. The server-side stores then
  // reparse and validate each command again before anything is saved.
  const data = await readWorkspace(c);
  const entry = interpretEntry(text, data, { now });
  if (entry.errors.length) throw new AppError(entry.errors[0]);
  const captureId = crypto.randomUUID();
  const captureDay = slackDay(config, now);
  if (entry.kind === 'sales') {
    await mutate(c, {
      type: 'sales-capture',
      captureId,
      captureText: text,
      captureDay,
    });
    return 'Captured the sales conversation and its next step.';
  }
  if (entry.kind === 'task') {
    await mutate(c, {
      type: 'quick-create',
      captureId,
      captureText: text,
      title: entry.title,
      spaceId: entry.spaceId || '',
      projectId: entry.parsed.projectId || '',
      due: entry.parsed.due || '',
    });
    return 'Created task: ' + entry.title;
  }
  await mutate(c, {
    type: 'capture-entry',
    captureId,
    captureText: text,
    kind: entry.kind,
    captureDay,
  });
  const saved = await env.DB.prepare(
    'SELECT kind FROM captureEntries WHERE org=? AND id=?',
  )
    .bind(inbound.org, captureId)
    .first<{ kind: string }>();
  return 'Captured to your Desk as a ' + (saved?.kind || 'note') + '.';
}
