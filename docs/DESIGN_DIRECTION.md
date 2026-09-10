# Studio: an organization that keeps its context

## Optional review and direct navigation · 10 September 2026

Done completes any task immediately, including older tasks and tasks with a pending or previous review. Approval is never a prerequisite for completion. Review is an explicit request to another team member, selected when moving to Review or choosing Request review. A deliverable is optional; the current task brief can be reviewed. Requests create an in-app notification for that reviewer and retain version snapshots. Completion closes pending requests without manufacturing an approval or erasing previous decisions. No review-required switch appears during task capture or daily planning. The current owner-only pilot explains when no other reviewer is available.

Projects and Calendar are independent sidebar destinations with their own selected state and heading. Existing project URLs remain valid; Calendar is no longer grouped beneath Work.

## Connected meeting notes · 10 September 2026

A meeting is one canonical record across Sales, Calendar, Today, Tasks and a client space. Opening notes from any of those places edits that record. Prospects may have scheduled meetings before they become clients. When the user confirms a won prospect as a client, the same meetings and version history carry into its client space. Taking notes never requires inventing a follow-up task; an existing task can be linked explicitly. Keep meeting notes immediately visible, with preparation and connected tasks available in tabs. Meetings taking place today remain reachable after their start time. Save notes is explicit and drafts remain recoverable in the same tab.


## Functional copy · 10 September 2026

Remove decorative slogans, magazine labels and oversized generic mastheads from work navigation. Spaces uses a compact title, actual count, filters and plain empty state. Brand styling belongs to actual client content; no invented fallback taglines. Idle screens must not spend attention on flavor text. This supersedes the earlier editorial directory framing.

## Prospect work and client correction · 10 September 2026

Daily work can belong to a client, an internal project, or a sales prospect. The review makes that distinction explicit before creating records. Prospects stay in Sales; Won offers Create client record with a details and confirmation step. Client pages provide Move to Sales for mistaken client creation and Remove client with clear consequences; neither action deletes the canonical tasks or shared files.

## Morning planning · 10 September 2026

Desk supports a daily-plan module through the quiet Plan today control and the shared writing vocabulary. A multiline list becomes a reviewable set of canonical tasks with client/project context. Existing tasks can be reused; new clients/projects are named explicitly before commitment. Planning dates remain distinct from deadlines. Saving returns to writing with a receipt linking to Today.

Today is the working daily board: committed tasks, unfinished carryover, due work, reviews and calendar meetings/events. Boards remains the full personal/team destination. Slack delivery is a separate, visible outcome of committing, never implied by a successful task save. The current interpreter is deterministic, and the pilot still has one real owner. See DAILY_PLANNING.md for behavior, configuration and verification.

## Product thesis

Studio should reduce the effort between an intention and useful work. A person arrives with “get me ready for this meeting”, “what needs me?”, or “finish the launch video”. The workspace assembles the relevant records, offers a clear next action, and preserves the outcome in the same connected records.

The previous interface put every module in the navigation and asked people to assemble context themselves. Adding a chat panel to that structure would retain the underlying work. This redesign changes the entry points, the reading experience, and the path back into action.

## The daily loop

1. **Arrive.** Today presents work already in progress, review requests, recorded blockers, and the next meeting. It does not invent priorities or hide the board.
2. **Understand.** Open a contextual brief without leaving the current workspace. Each claim has an identifiable task, meeting, project, or client record behind it.
3. **Decide.** A small number of concrete actions appears next to the context: review work, open notes, continue a task, or capture a follow-up.
4. **Act.** Existing task, review, meeting, and resource commands remain authoritative. Search and interpretation lead to those same interactions.
5. **Remember.** Notes, decisions, links, review versions, and activity remain attached to their canonical records. The next brief reads those updated records.

## Six stable places

| Place   | The question it answers                              | Secondary views                                  |
| ------- | ---------------------------------------------------- | ------------------------------------------------ |
| Today   | What needs me, and where do I continue?              | Desk, brief, my board, team board                |
| Spaces  | Who are we doing this for, and what matters to them? | Branded client home, meetings, work, references  |
| Sales   | Which relationships are moving toward a sale?        | Prospects, conversations, pipeline, next actions |
| Work    | What are we delivering together?                     | Projects, shared calendar, project board         |
| Library | Where is the thing I need?                           | Assets, templates, custom tools, vault           |
| Systems | How does this organization operate?                  | Process records, connection coverage             |

People and internal documents remain accessible through Workspace. Existing direct URLs continue to work. These places are reliable orientation points; they are not required steps before every action.

## The shared interaction language

- **Express an intention:** the command surface supports finding records, opening a client brief, reviewing work, and handing a sentence to structured task capture. Enter still starts quick capture on the daily surface; Cmd/Ctrl K opens the shared command surface.
- **Read before editing:** task details initially show the description, deadline, ownership, connected context, and notes. The full metadata form is disclosed when needed.
- **Stay in context:** briefs and tasks open beside the current place. Source actions open the original record. A meeting brief enters the existing meeting workspace, so there is one set of notes and decisions.
- **Recognize the client:** editorial client imagery, typography, and brand color remain expressive within a consistent shell. System chrome stays restrained.
- **Keep the first surface finite:** a few attention items and ongoing tasks; remaining items have an explicit route to the board, calendar, or full list.
- **Make missing context useful:** no meeting, no agenda, no recorded activity, and no connector are distinct states. Empty states explain the available next action without fabricating content.

## Meeting preparation: the reference interaction

From Today or “prepare Nord”, open a client brief. It brings together the upcoming agenda, the client's stated wants and needs, decisions recorded at the last completed meeting, actual activity since that meeting, active project progress, outstanding reviews, blockers, and linked resources. Completed/cancelled meetings never masquerade as upcoming. Old review versions never become current review requests. Standalone client tasks belong in the brief alongside project tasks.

“Open meeting notes” opens that exact meeting's existing workspace. Reviewing a deliverable opens that task's Work & review tab. Opening a source never creates a duplicate record.

## Intelligence architecture

The present implementation assembles briefs deterministically from saved records. This is a working context layer, not a connected language model. Suggested attention is explicitly derived from record state; it is not an autonomous priority decision. There are no invented campaign results or external health signals.

A later model should consume a permission-filtered context bundle containing record IDs, revisions, timestamps, and source coverage. Its output should distinguish grounded observations, uncertain interpretations, and proposed actions. Actions must use the same server-validated command boundary as the UI. A stale revision requires refreshed context; it must not silently overwrite newer work.

External instructions found in documents and tools are data, not authority. Secrets are excluded from model context. External sending, publishing, and financial actions need an explicit configured authority and a visible result. The model must never claim an integration ran solely because a command was proposed. A history of executed commands and source versions makes corrections possible.

Model interpretation belongs at entry points and between connected records, rather than becoming an extra destination that users must continually visit. Deterministic direct manipulation, keyboard capture, and search remain available.

## Visual system

Warm neutral canvas, legible ink, a narrow navigation rail, generous spacing, and quiet translucent surfaces. Accent color identifies actions and selection; client color identifies context. Depth distinguishes the persistent workspace from temporary context. Ordinary labels and task titles remain high contrast. Motion is restrained and respects reduced-motion preferences. Mobile uses the existing accessible navigation drawer and stacks the brief without dropping actions.

## Scope and remaining foundations

This iteration implements the shell, daily brief, client preparation flow, action/search surface, unified library, read-first task details, and truthful connection coverage. It preserves the underlying task/review/calendar/resource workflows and adds a schema migration for prospects, conversation history, and canonical task links.

The workspace still has one authenticated owner and sample colleagues. Real team permissions/invitations, production connectors, a model provider, background ingestion, reliable delivery jobs, and a live automation canvas remain separate engineering milestones. Process records currently document and connect resources; they do not monitor third-party execution. Client-facing access requires scoped sharing before it can ship.

## Acceptance checks

- A current review appears only for its assigned reviewer and current task version; opening it reaches the existing approval workflow.
- A client brief includes both direct client tasks and project tasks, with no cross-client leakage.
- Date boundaries, cancelled meetings, empty agendas, missing deadlines, and completed projects produce accurate states.
- A sentence passed from the command surface reaches the existing capture parser unchanged and creates a canonical task through the existing API.
- Library tools remain reachable through old URLs and the new Library tabs.
- Existing client, project, task, calendar, and tool links keep working after navigation changes.
- Loading and connector coverage never imply records or external signals have already arrived.

## Sales conversations as a distinct intention

“Sales meeting with "Acme", next step: calculate lead price” is interpreted as a prospect interaction with a linked task. Capture previews both outcomes. The server parses the sentence again, validates the date and next step, and saves prospect lookup/creation, conversation, task, and activity atomically. Case and whitespace normalized exact names reuse an existing prospect. Ambiguous fuzzy matching is intentionally avoided. Retrying the same capture does not duplicate effects.

Prospects have their own pipeline stages and history; active clients retain their richer brand spaces. Sales stage changes do not alter task progress, and completing a next step does not advance a prospect. The next action is assigned to the authenticated actor, visible on their board, and linked back to the sales history. Moving to Won changes only the sales stage. Create client record then opens a details form; explicit confirmation saves the client and removes the prospect from the pipeline. Canonical tasks and sales history remain connected and visible from the client.

## The screen that stays open

Desk is a primary navigation destination and the default continuous capture surface. Enter focuses capture; saving clears the input and preserves a durable entry with a link to its destination. Notes, tasks, client meetings, deadline changes, and sales conversations share the same input. Sales has its own primary navigation item.

Explicit note/meeting/deadline phrases and common action verbs determine the initial type. People can override the type and select a destination. Unrecognized text defaults to a note on the desk, never a silently invented task. Existing client/project context is inherited, with explicit references taking precedence and conflicts surfaced. This uses deterministic interpretation; a model remains unconnected.

Capture entries hold canonical notes and receipts for other records. Connected notes appear with the client, project, and task, while the original entry remains searchable and visible in Desk history. Notes from sibling tasks do not leak into each other’s context. Meeting captures create client meeting records, not calendar invitations. Deadline captures update existing task/project dates. Every mutation is scoped to the authenticated workspace, and related history is written atomically with its record.

The future AI contract is to propose those same typed destinations and commands, preserving the source text, correction path, and explicit uncertainty. Its success is measured by how little organizational effort the employee needs after writing something down.

## The reactive page · 9 September 2026

The latest visual direction supersedes the earlier dashboard-like Desk. At rest, the Desk should resemble a blank white page. No slogans, hero copy, instructional paragraphs, action grids, or accumulating activity feed. One writing area dominates. A selected task remains a single quiet context row; history and attention live in drawers. The screenshot feedback specifically rejected redundant breadcrumb/sample labels, decorative captions, repeated capture instructions, and a busy attention panel.

Typing reveals only the structure required by the intention. “Create new project” unfolds a project module in the same place: name, brief, client, deadline and optional files. Completing it returns to writing with one dismissible receipt. Notes can span lines with Shift+Enter. Task/client/project references, dates and proposed effects remain inspectable while writing, and uncertain destinations require a choice. Do not fill the empty page with explanations of its emptiness.

The input, interpretation, modular entry renderer, command validation and receipts are separate concerns. The present interpreter is deterministic; there is no live AI provider. Future AI can expand the set of understood intentions and propose structured modules, but every actual write still passes through validated, scoped commands. The page is the interaction surface, not a chat conversation users must manage.

## A discoverable writing vocabulary

The Desk uses an action registry (`lib/desk-intents.ts`) shared by recognition and the slash menu. Type `/` or `/help` to see actions with examples; filter by name and select with arrows and Enter or Tab. Escape cancels the action query. Full slash commands such as `/deadline @Autumn launch @18/09` also work. Normal phrases (add new deadline, schedule a meeting, log progress, flag a blocker, change status, request review) resolve to the same intents.

The convention is action + content, with @client / @project / @date for connections. Dates are day/month. Existing task updates can use the selected task or its exact quoted title. Users can finish an entry by choosing the missing target, date or status inside the page; they do not have to remember the full syntax. Required-field errors appear on a save attempt, not on every incomplete phrase. Unrecognized prose stays a note, and an unknown slash command requires a supported action or an explicit Note override.

## Boards as a primary destination · 10 September 2026

Boards has its own sidebar entry alongside Desk and Today. My board and Team board belong in that section, with a persistent scope in the URL. Today is the daily brief and links into Boards; it no longer contains the board views. Boards continue to use canonical tasks, capture and review workflows.

## Real work and a two-week calendar · 10 September 2026

New workspaces start empty. No sample tasks, clients, colleagues, resources or templates appear while loading or after sign-in. The owner remains available for assignment.

Task card menus offer Archive and Delete alongside movement. Archive hides the task from active work and offers restoration through the board's Archive drawer. Delete requires confirmation and removes task-owned notes, reviews, receipts and links while preserving shared files and source meetings/sales conversations.

The calendar shows 14 days in large day panels, with the complete day's entries visible. It combines canonical task/project deadlines and client meetings with manually entered events, meetings and deadlines. Click a day to add an entry with its date already selected. Existing work can be scheduled directly without creating a duplicate task. Timed entries show their time; task finish times can also be set in task details. Client meetings use local display of their stored timestamps; date-only deadlines and manually entered times use local wall-clock values. Events created in the calendar are internal records, not external invitations. Date editing and drag rescheduling retain validation, revisions and undo.
