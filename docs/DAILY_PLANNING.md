# Daily planning

On Desk, choose **Plan today**, or write **Plan my day**, **Daily tasks**, **Today:** or `/day`. Write one task per line. Existing `@client` and `@project` mentions select the corresponding canonical context. A final `by 14:30` sets an optional finish time and defaults the deadline to the planning day.

For sales work, select **Sales prospect** in the review, then choose an existing prospect or **+ New prospect**. The task appears in both Today and Sales. New prospects start at New; task completion does not advance the pipeline stage.

Choose **Organize tasks** to inspect every task before committing. Exact matching unfinished tasks assigned to the actor can be reused; ambiguous matches require a choice. Correct titles and connections in the preview, choose an existing task explicitly, or name a new client/project. New context creation is shown before commitment. A planning day is separate from the actual deadline; planning work does not silently rewrite existing due dates.

**Commit daily plan** saves the plan, tasks, new context, links, history and Desk receipt atomically. Retrying the same commitment does not create another plan or tasks. A stale referenced task rejects the entire commitment; review the list again using current task revisions. Drafts recover after reload in the same browser tab for up to seven days using organization/member-scoped session storage. Closing the tab may discard this recovery; it is not cross-device sync.

Today shows committed work, deadlines due today, unfinished prior plans, ongoing work, pending current-version reviews and upcoming meetings/events from the calendar. Its board uses the same tasks and review rules as Boards and client/project views. Completed prior work does not carry forward. The private pilot still has one real owner; employee membership and invitations have not been implemented.

## Working through the day

Use a task menu to choose up to three priorities, plan it for tomorrow with Undo, or record what it is waiting for. Finish day lets you choose remaining tasks to carry into tomorrow; deadlines are preserved. Reviews remain in attention even if planned later. New quick/daily tasks have a review choice: simple tasks can complete directly; tasks requiring review retain the versioned approval workflow. Existing tasks remain review-required.

## Slack

The app includes a server-side incoming-webhook adapter. No live connection is configured and no real Slack message was sent during development.

Create an incoming webhook for the intended channel following [Slack's official incoming-webhook guide](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/). The webhook is tied to its configured conversation. Store it as a server secret, never in chat, source code, a client-visible Vite variable, or this document.

For the local Cloudflare preview, put `STUDIO_SLACK_WEBHOOK_URL` and `STUDIO_SLACK_ORG` in an ignored `.dev.vars` file and restart the preview. `STUDIO_SLACK_ORG` must match the authenticated Studio organization's database ID. That explicit restriction prevents a shared runtime webhook from receiving another organization's plan. Hosted secrets must be configured separately in the hosting environment.

A configured commitment claims its pending delivery and posts a plain-text summary immediately. Successful HTTP `ok` responses become **Posted to Slack**. Rejections become **failed** and may be retried from Today. Timeouts, lost responses or interrupted sends become **unknown**; they are never blindly retried because Slack may already have received the message. Check Slack before any manual intervention. An unconfigured connection shows **Slack not connected**, and committing the plan still works. Delivery failures do not roll back committed work. There is no background delivery worker yet; pending deliveries are visible and can be resumed from Today.

## Verification

`tests/daily-plan.mjs` uses a fresh in-memory SQLite schema and mocked delivery; it never calls Slack. It verifies parsing, context/task creation, deduplication, rollback, org-scoped webhook configuration, exclusive delivery claims and uncertain-response behavior.

`tests/daily-plan-e2e.mjs` requires an isolated local copy on port 3001 with a fresh database. Set `STUDIO_TEST_STATE` to a dedicated path under `work/`, migrate that same path with Wrangler's `--persist-to`, and launch the isolated copy. Run `STUDIO_TEST_URL=http://localhost:3001 node --import ./tests/ts-loader.mjs tests/daily-plan-e2e.mjs`. It creates test records only there. Never point it at the user's preview or reuse the live `.wrangler/state` directory. It checks HTTP persistence from plan commitment through notes, deliverable submission, approval/completion, Today, calendar, stale conflicts, retries and organization isolation using the local test-auth cookie for the second identity.

The working-day refinement was exercised in an isolated browser preview, including draft reload, commitment, task planning, waiting, meeting access and the full review/completion flow. See PROGRESS.md for verification boundaries.
