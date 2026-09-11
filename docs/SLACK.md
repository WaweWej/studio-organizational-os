# Slack

Studio connects to Slack in both directions. Everything is optional runtime
configuration; a workspace without it behaves exactly as before, and no Studio
surface ever implies a Slack connection that is not configured.

## Outbound: workspace events

Three events queue a Slack message atomically with their mutation: a blocker
flagged or cleared, a review requested, and a review decision. The queued row
is written in the same transaction as the work itself, so a message can only
exist for a mutation that actually saved. Daily plan delivery through the
existing incoming webhook is unchanged.

Delivery follows the same truthfulness rules as daily plans: a message is
marked sent only when Slack confirms it, a rejection marks it failed and
eligible for retry, and a lost network response is marked unknown and never
blindly resent. Events deliver through the bot token to the configured channel
when present, otherwise through the incoming webhook. Systems shows the
configured directions and the count of undelivered messages.

## Inbound: capture from Slack

`/api/slack` accepts slash commands and direct messages to the bot. Every
request must carry a valid Slack signature within a five-minute window;
retries are deduplicated so a slow response never creates a second record.
Slack users map to workspace members through configuration, and unmapped
users receive an explanation instead of records.

Inbound text runs through the same deterministic interpreter and validated
command boundary as the Desk, resolved against the workspace's real clients,
projects and tasks. Notes, meetings, deadlines, progress, blockers, status
changes, tasks with `@client` references and full sales sentences all work;
unrecognized text becomes a note, never a silently invented task. The sender
receives a receipt naming what was created. Any system that can sign requests
the same way — including in-house automation — can use this door.

## Configuration

All values are hosting runtime settings, never source:

- `STUDIO_SLACK_ORG` — the workspace organization the connection belongs to.
- `STUDIO_SLACK_WEBHOOK_URL` — incoming webhook (plan delivery and event fallback).
- `STUDIO_SLACK_BOT_TOKEN` — bot token (`xoxb-…`) for event delivery.
- `STUDIO_SLACK_CHANNEL` — channel ID events post to.
- `STUDIO_SLACK_SIGNING_SECRET` — verifies inbound requests.
- `STUDIO_SLACK_USER_MAP` — JSON of Slack user IDs to member IDs, e.g. `{"U012345":"me"}`.
- `STUDIO_SLACK_TIMEZONE` — optional IANA zone for inbound capture days (default UTC).

In the Slack app configuration, point the slash command and the Events API
request URL at `https://<site>/api/slack` and subscribe to `message.im`.

## Verification

`tests/slack.mjs` covers configuration validation, organization binding,
capture-day time zones, outbox truthfulness, signature verification, retry
deduplication, tenant isolation, bot and webhook delivery confirmation,
rejection handling, the no-resend rule for lost responses, and retry
eligibility for failed messages. No external requests or real records are
used.
