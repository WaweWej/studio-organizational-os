# Studio roadmap — agreed 13 September 2026

Ten upgrades, agreed by the owner in full, in build order. Each lives as a
task in the "Studio roadmap" project inside Studio itself (`/goals` on the
Desk opens it); this file carries the complete reasoning. Per the house
law, none of these add decorative copy — every item is structure, signal,
or capability.

## 1. Shared workspace

Every signed-in identity currently gets its own isolated org
(`org = user.userId` in `context()`), so a teammate signing in lands in an
empty parallel Studio. Build workspace membership: the owner invites an
email, the invitee joins the owner's org as a member, actor stamps become
real member identities, and assignees, notices, and reviews — all already
modeled — start referring to people. The largest build on the list and the
precondition for the team using Studio at all.

## 2. One timeline per client

The Log tab shows written entries; the database also knows every meeting
held, task completed, file attached, and status change per space. Merge
them into one chronological client timeline with filter chips
(Log / Meetings / Work / Files), and make entries linkable to the meeting
or task they concern.

## 3. The Desk grammar everywhere

⌘K currently offers intention starters; the Desk speaks the real language.
Let the palette accept every sentence the Desk does — surface intents,
creation, capture — from any screen, with live search results (item 4) as
you type. The Desk remains the capture home; ⌘K becomes its portable
mouth.

## 4. Real search

There is no way to find "the note where the client mentioned the autumn
blend." D1 speaks SQLite FTS5: full-text over tasks, log entries, notes,
meetings, prospects, and resource titles, served through one endpoint that
both ⌘K and the API expose. Also the future assistant's retrieval organ.

## 5. Automations on Processes

The owner's recorded direction. Flows as data — steps with links, rendered
as a structured diagram (not a freehand canvas). New catalog commands
(flow-run-start, flow-step, flow-run-finish) so Viktor reports every run
through the boundary, and a run board on the Processes page showing live,
timestamped, truthful states via polling. Updating a flow is a command
like any other.

## 6. Close the meeting loop

Agendas that assemble themselves from open follow-ups, flagged log
entries, and work due since last time; in-meeting capture where one
keystroke turns a line into a follow-up task or a log entry; the next
occurrence of a rhythm inheriting what the last one left open.

## 7. Client health as derived facts

On the Spaces grid and each client Overview: days since last touch, next
meeting, open and overdue counts, last completed work — computed from
existing data. No scores, no judgment, only the numbers that show which
client is quietly going cold.

## 8. The week as a planning surface

Commit plans to any day; see the week as seven Today-spines side by side;
drag lines between days; carryover accumulates visibly; the
finite-attention model guards against overcommitting a day.

## 9. One Inbox

Notices, review requests, and activity unified into a single triaged
surface — everything addressed to you, keyboard-walkable, read-state
honest. Where teammates' work reaches you once item 1 exists.

## 10. Export and import in Systems

One click exports the workspace as readable JSON; import ingests one.
Deliberately also the migration tool for the original ChatGPT Sites
workspace's data.

Closest cuts, recorded for honesty: a mobile/PWA pass, and the Slack door
(deferred until the assistant exists behind it).
