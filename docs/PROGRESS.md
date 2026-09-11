# Studio implementation status

## Google Calendar import/export · 10 September 2026

Added a private Google account connection in Calendar, scoped calendar selection, a dedicated Studio calendar for outbound meetings/deadlines, and automatic refresh while the visible app is open and after saved changes. Sync now, actual last-sync time, errors and disconnect are available. Google-origin meetings open the existing notes pathway; schedule changes/cancellations retain notes, decisions, task/client/prospect connections and history. Editing stays in the originating app; internal notes and attendees are not exported. See GOOGLE_CALENDAR.md for exact boundaries, rolling-window limits and configuration.

Google Cloud Studio OS project and Web OAuth client are configured with the user-approved homeymedia.dk Internal audience. Google credentials and token encryption key are private Sites runtime settings. Migration 0016 is additive, generated from schema and applied locally after an ignored backup. Prior migrations and live data are untouched by local verification.

The 14-day Calendar names both ISO week numbers in its heading and labels each week in the grid, including a current-week marker.

Isolated SQLite and mocked-provider tests pass for OAuth state/browser/org/replay isolation, encrypted tokens, pagination, recurring instances, cancelled/declined entries, meeting-note preservation, transactional rollback, canonical provenance, date/time zones, export retries, completion cleanup, restoration IDs and sync leases. Existing calendar, meeting-notes, sales conversion and optional-review suites and Desk intent checks pass. TypeScript, focused lint and the production build pass (existing client chunk warning); the local Calendar route returns HTTP 200. Production publication and real-account sync verification are recorded after completion below.

## Optional reviews and separate Calendar / Projects · 10 September 2026

Published privately as version 4, source `4bc34fa37795d67c76b71364e24e48548c92313f`, successful deployment `appgdep_6aa2aaad34648191aae7a6f1afbd1a5c`. Existing DB/ASSETS bindings and all applied migrations are unchanged.

This supersedes the earlier required-approval workflow. Done completes any task directly through the shared command boundary, including legacy review-required tasks and work with pending, approved or changes-requested versions. Completing closes pending requests and marks their request notices read atomically; actual approvals, feedback and snapshots remain history. Capture and daily planning no longer show a review-required switch or ordinary-task review badges. The legacy field remains stored only for capture compatibility and does not gate completion. No data migration or live record rewrite is needed.

Dragging or selecting Review on a board or task opens an explicit reviewer choice. The request can review the task brief without a deliverable, creates one version snapshot and in-app notice for the selected other member, and checks organization membership. Only that reviewer can record a decision. Notification results are recipient-scoped. The one-owner pilot shows a clear unavailable state when there is no other member; real employee access is still future work.

Projects and Calendar now have independent sidebar entries and selected states. The Work label and Projects/Calendar nested tabs were removed; existing project URLs remain valid. The Projects heading uses its plain name.

Verification: the actual task command handler passes isolated SQLite tests for legacy/new completion, voluntary requests without deliverables, one recipient notice, correct reviewer authorization, closing pending requests, preserved approval/feedback snapshots, repeated moves, stale and cross-organization writes, and atomic rollback. Daily planning, day-work, task lifecycle and Desk intent regressions pass, as do TypeScript and the production build (existing chunk-size warning). Focused lint passes for the changed capture, board, review and server modules; Studio's existing compiler/ref, label, link and deprecated-event findings remain. The old workflow test entry point now runs the isolated suite, and the HTTP daily-plan suite was updated to direct completion but was not rerun. No browser interaction QA or mutations to live work records were performed.

## Persistent private hosting · 10 September 2026

Published [Studio online](https://studio-organizational-os.gwej123.chatgpt.site) using the existing owner-only Sites project with persistent DB/ASSETS bindings. The final live version is 3, source commit `0d92c8925ffce994070d2bba160d29979080f3e5`, successful deployment `appgdep_6aa2a697b7548191b1eb01fad20f739d`, environment revision 3. The initial transfer used version 2. All 16 migrations applied successfully. Private access is restricted to the connected owner; the owner completed browser sign-in. The local preview is stopped and the live site is the destination for real work.

The final consistent local backup is ignored under `work/backups/20260910-143453/`. Transferred 37 saved rows across 27 workspace tables, including three tasks, three prospects, one meeting, its notes/decisions, a daily plan and the linked history. Every field and canonical ID was compared with the live database, allowing only the organization remapping. An identical retry returned the original receipt without duplicating records. Both transfer runtime settings were removed, the same version redeployed, and all 27 tables compared again: every row remained unchanged. The transfer handler still responded after environment removal, so version 3 removed the route entirely. Its absence is now verified over HTTP (404), and a final comparison of all 27 tables after this code update found every row unchanged. The signed-in browser showed the three real prospects and their canonical tasks. There were no files or vault records to transfer; no placeholder/test records were introduced.

Local preview is clearly labeled, separate from hosted records. Retained the tested transfer library, immutable receipt migration 0015, consistent local SQLite backup helper, and export helper; the temporary HTTP route is removed. The importer rejects nonempty targets and files/vault records, rolls back atomically and deduplicates identical retries. Ordinary APIs require browser identity. Data and temporary credentials never enter source or deployment archives. Ordinary improvements publish code and new migrations to this same private Site; never reimport local data as an update.

Validation: TypeScript, focused lint, Desk intent tests, transfer/route authorization tests and isolated meeting, daily-plan, day-work, sales conversion, calendar, task and client lifecycle suites pass. The production build passes with its existing large-chunk warning. Transfer tests cover fixed-target authorization, missing identity, cross-origin/key rejection, rollback, retry deduplication and disabling. All real-data comparisons were read-only; no test fixtures were created in the live workspace.


## Meeting notes across Sales, Calendar, Tasks and Clients · 10 September 2026

- Meetings can belong to a prospect, client, or the workspace. Sales offers Meeting notes and a meeting list on each prospect. Notes, participants and decisions use the existing versioned meeting editor, opening directly to notes; a follow-up task is optional and needs no project.
- Today, Desk, Calendar and a linked task open the same meeting record. Task details provide Link meeting & take notes for an existing meeting or calendar entry. Linking validates the task's client/prospect and both record revisions. New meeting creation, calendar attachment, task link and history commit together; existing calendar entries are referenced and hidden from duplicate display.
- Today's planned meetings stay reachable after their start time. Calendar meeting creation has an explicit prospect/client connection. Existing unconnected meetings can be attached without losing their notes.
- Confirming Create client record transfers meeting ownership and history within the conversion transaction; the meeting ID, notes, decisions and task/calendar references remain intact. No new copy of the meeting is created. Conversion is still explicit after Won.
- Saved notes are durable workspace data. Unsaved meeting drafts (including the first capture) recover in the same browser tab for seven days, scoped to organization/member. Save notes is explicit; close/reload guards protect unsaved changes. Revision conflicts preserve the draft.
- Migration 0014 was inspected and corrected before application, then applied to isolated and local databases. It preserves existing rows while making meeting/history client references optional. A local backup is ignored under work/. Type checks now exclude ignored test app copies in work/.
- Verification: isolated SQLite meeting/notes, task linking, wrong-client and organization rejection, stale writes, retry deduplication, conversion rollback, version history and draft recovery pass. The actual browser flow linked a Today task to an existing calendar call, saved notes/decisions, reopened them through Today, then opened the same notes from the confirmed client space after reload. HTTP checks also verified a project-free follow-up and rejected foreign writes. No test records were added to the owner's workspace. Type checks, focused lint, Desk intent/day-work/calendar/conversion regressions, and the production build pass (existing large-chunk warning only).


## A working-day refinement · 10 September 2026

Desk and daily-plan drafts now recover after reload in the same browser tab, using sessionStorage scoped to the authenticated organization/member. Daily-plan review state, project drafts and retry IDs persist with the draft; a completed capture clears its cached draft. This is tab recovery, not cross-device sync. Locked/changed identities do not read another scope. New daily/quick tasks explicitly choose whether review is needed. Existing tasks retain required-review behavior; simple tasks can complete directly until a review version is submitted. Canonical versioned approval remains required for reviewed work.

Today supports up to three priorities, Plan for tomorrow with Undo, waiting notes, and a finish-day selection that moves unfinished work to tomorrow without rewriting deadlines. Future-planned work no longer reappears on Today's board merely because it is Doing or due; overdue attention remains visible. Planned changes validate actor, revisions and all selected tasks in one atomic batch. Upcoming client meetings open their actual notes workspace directly. Exact known client names in daily-plan phrases such as “Prepare proposal for Client” resolve without @ syntax. Optional per-task planning fields are folded into Edit details. Migration 0013 is applied locally.

Browser QA found and fixed a zero-width task-menu button caused by old select-trigger CSS hiding its icon. In an isolated preview/database on port 3001, browser interactions verified note draft reload/save, daily review draft reload, natural client selection, mixed review choices, commitment/Today navigation, priority selection, defer/undo, simple completion, waiting notes, selective end-of-day carryover, direct meeting access, and deliverable submission → Today review → approval → completion. A separate HTTP suite verified canonical records, conflicts, calendar and tenant boundaries. Real-SQLite day-work tests cover priority limits, undo, immutable deadlines, bulk atomicity and actor scoping; draft-cache tests cover recovery and scope separation. Main workspace received no test fixtures.

Following the user's screenshot feedback, Spaces now uses only a compact heading/count, filters and plain empty state. Removed directory slogans, decorative masthead/footer, invented client taglines, sample-biased ordering and the false global Sample data label. Sales and empty task lanes also lost generic slogans. Real client branding remains intact.

## Explicit client confirmation · 10 September 2026

This supersedes automatic Won conversion below. Moving to Won changes only the prospect stage. Won cards and the prospect workspace offer Create client record, opening a details form for client name, account lead, website, brief, goals and needs. Confirming atomically saves the client, durable conversion marker and history. Converted prospects disappear from all pipeline lanes/counts while their tasks retain canonical links; sales history is readable on the client page. Cancellation writes nothing, and reopening an unconverted prospect creates no client. Confirmed clients cannot be dragged back through the sales stage endpoint. Client removal clears the conversion marker. Migration 0012 is applied locally.

The accidental empty Credenta client from the previous automatic behavior was removed after a local export; its Proposal stage, original task and sales history remain. Tests in sales-won.mjs now exercise explicit confirmation, fields, invalid inputs, stale and cross-org writes, atomic rollback, retry deduplication, pipeline exclusion and canonical context. Existing daily planning/client lifecycle suites pass, as do TypeScript, focused lint and production build. Browser interaction QA was not performed.

## Won prospects become clients · 10 September 2026

The main Sales pipeline now includes Won and Lost as visible drag targets, with the existing stage selector retained for keyboard/touch use. Moving to Won atomically creates or reuses a same-name client, stores a durable prospect.clientId link, and writes sales/client history. The prospect remains in the sales history; its canonical tasks resolve to the client through the link, including future sales tasks. Opening a prospect exposes Open client space. Reopening a sale preserves the client, and winning again reuses it. Client removal clears the prospect link. Migration 0011 is applied locally.

Real-SQLite tests pass for creation, reuse, retries, reopening, inherited task context, daily replanning, removed-client recreation, rollback, stale writes and organization isolation. Existing daily-plan and client lifecycle tests, TypeScript, focused lint and production build pass (existing chunk warning). No live prospect was marked Won during development and no fixture data was added to the owner's workspace. Browser drag-and-drop interaction QA was not performed.

## Prospects in daily plans and client removal · 10 September 2026

Daily-plan review now offers Client / internal work or Sales prospect. Existing prospects and explicitly named new prospects create canonical tasks that appear in Today and Sales, with pipeline history. Exact known prospect suffixes are recognized; client/prospect name ambiguity remains a review choice. Existing prospect tasks can be planned again without duplication. Selected context existence is checked inside the plan transaction.

Client pages expose Move to Sales and Remove client with confirmation. Moving reuses a same-name prospect, preserves the client profile in sales history, links existing tasks, and leaves projects in Work and shared resources in Library. Moving is currently limited to clients without meeting records. Removal deletes the client profile and its meetings/history while retaining detached tasks, projects, Desk notes, blueprints and shared files. Scoped revision guards and content-free removal receipts make the full batch atomic and retry-safe. Migration 0010 is applied locally.

Corrected the user-identified Credenta record through the real API after an ignored local database export: its existing proposal task retains its ID, deadline and planned day, and is now linked to Sales. NeedforNature was untouched. Real-SQLite tests cover prospect creation/reuse, existing-task planning, conversion, tenant rejection, stale revisions, deletion, rollback and preserved work. TypeScript, focused lint and production build pass (existing chunk warning); browser interaction QA was not performed.

## Committed daily plans and end-to-end verification · 10 September 2026

Desk now recognizes Plan my day, Daily tasks, Today: and /day, with a quiet Plan today shortcut. The inline module splits one task per line, resolves known mentions, offers canonical existing task selection and editable context, and explicitly previews new client/project creation. Commit saves plan/tasks/context/activity/receipt atomically; stale task revisions reject the whole plan and identical retries deduplicate. Migration 0009 adds plan records/links and task plannedFor; it is applied locally. Task deletion removes its plan links while the committed summary remains history.

Today now uses the existing Kanban for committed/due/carryover work, current reviews and combined upcoming calendar meetings/events. New tasks captured directly on Today are planned for that day. Client/project/member scope and canonical task/review transitions are preserved. Slack has an org-restricted webhook adapter with durable delivery state, exclusive claims, safe plaintext messages and visible failures. No webhook is configured; mock verification sent no external messages. A background delivery worker and real employee access remain future work.

Verified the actual HTTP chain in a separate local copy/database: empty workspace → daily plan → one canonical client/project with tasks → Today/carryover → note → deliverable → review → approval → completion → client and calendar meetings. Retry conflicts, stale-plan atomicity and a second development identity's isolation pass. The main workspace received no test records. In-memory SQLite tests also pass for planning rollback and mocked Slack success/claim/unknown delivery behavior; the intent registry and TypeScript checks pass. Focused lint passes for the new planning/Today/server modules. Production build passes with the existing chunk-size warning. Browser automation was attempted but could not attach, so no click-through or screenshot verification is claimed. See DAILY_PLANNING.md.

## Task lifecycle, empty workspace and 14-day calendar · 10 September 2026

Task cards now expose Archive and Delete in the action menu. Archive drawers follow the current personal/team/project scope and restore the same task with its stage and review records intact. Archived work is excluded from active workspace tasks, deadlines and alerts. Deletion confirms the consequence, guards revision and atomically removes task-owned records/links. Shared files and source sales/meeting records stay intact. Content-free tombstones make deletion retries safe and prevent quick-capture resurrection. Migration 0007 adds the archive field and deletion receipts.

Deleted 55 exact-ID sample/trial records from this Mac's local organization after saving an ignored local database backup. This includes the Arc trial meeting explicitly approved for removal. Verified all app collections empty except the owner account. Runtime initialization now uses emptyWorkspace, and template upgrades no longer insert sample starters. Synthetic model fixtures remain in tests only.

The shared calendar now shows two weeks with large day panels, previous/next fortnight controls and responsive columns. Canonical meetings, task/project deadlines and manual events/meetings/deadlines share the view. A day button opens capture with that date selected; existing tasks/projects can be scheduled without duplication. Task details and calendar editing support optional finish times. Entries can be moved by drag or date input, with undo; unscheduled/overdue lists and client/project/type/completed filters remain. Calendar-created events retain revisions and atomic history. Client-meeting rescheduling uses its existing command boundary. Migration 0008 adds calendar records/history and task dueTime. Both migrations are applied locally.

Validation: TypeScript, production build, intent vocabulary, isolated real-SQLite lifecycle and calendar suites pass. Lifecycle tests exercise scoped cleanup, retries and stale revisions; calendar tests exercise persistence/history, dates/times, isolation, aggregation and rescheduling. Focused lint passes for the new board/calendar/server modules; the older Studio component retains its documented lint debt. Build retains the large-client-chunk warning. No fixtures were created in the live workspace, no browser interaction QA was performed, and no publishing was attempted.

## Dedicated Boards navigation · 10 September 2026

Boards is a primary sidebar destination with My board and Team board views. Direct URLs use `?view=boards&scope=mine` and `?view=boards&scope=team`, preserving the selected view after reload. Today now contains only its brief; its board shortcut, Work's team shortcut and command search open Boards. Existing capture, assignment filtering and canonical review workflows are retained. Desk remains the default destination.

Validation: TypeScript and production build pass; both board URLs return HTTP 200 on the local preview. The build retains the existing client chunk warning. Focused lint still reports Studio's existing compiler/ref, accessibility, internal-link and deprecated FormEvent findings. Browser interaction QA was not performed. No data migration or publication was needed.

## Client focus pages · 8 September 2026

Client spaces now have a branded cover, editable identity and brief, goals and needs, account lead, an upcoming meeting workspace, actual task progress, editable deadlines, and linked project work. Nord & Form uses an original illustrative sample cover; no real client assets or data have been imported.

The same page structure works for every client and owned platform. Overview, Work, Meetings, and Brand & context use consistent navigation. The layout adapts to smaller screens and respects reduced motion.

Meeting agendas, notes, decisions, completion, cancellation and reopening persist in D1. Successful meeting edits retain previous content in an attributed history. Optimistic revision checks reject stale edits without discarding the editor draft. Closing a dirty meeting asks whether to keep editing; opening a follow-up saves pending meeting changes first.

Follow-ups are canonical tasks, with one project, responsible person, due date and source meeting. They appear in the same task collection used by client, project and personal/team boards. Project completion percentages use actual task stages. No simulated campaign metrics or external delivery are shown.

## Validation

- TypeScript checking and the production Vinext build passed.
- Client API suite passed: profile and identity validation, project deadlines, meeting persistence, previous-note history, conflicting edits, canonical follow-ups, ownership, tenant isolation and invalid dates.
- Existing review workflow suite passed: deliverable versions, review/changes/approval, internal completion, duplicate review prevention, persistence, isolation, optimistic concurrency, audit consistency and origin validation.
- Focused lint passed for the new client interface, client store and validation module. Repository-wide lint still reports existing issues in generated UI components and the older Studio component.
- Development route and workspace API returned HTTP 200. Sample cover was inspected directly. Browser interaction and screenshot QA have not been performed.
- Local migration applied. Temporary records created by the API suites were removed using their exact generated IDs.

## Product boundaries

This remains a private pilot with sample colleagues and clients, and one authenticated workspace owner. Hosted data and the local preview database are separate. Real team invitations, scoped external client views, external connectors, automatic calendar invitations, notifications through email/Slack, live analytics, AI, and the saved process canvas are not implemented yet. Uploads and the shared delivery calendar are now implemented as described below.

Client identity currently supports name, brand line, hosted logo/cover addresses, signature color and three typography choices. Arbitrary layouts, custom sections and uploaded fonts remain later work.

The current client experience is ready for private preview publication. Deployment status must be checked separately; a successful local build alone is not proof that a Site is live.

## Editorial design refinement

The client directory now uses a magazine index with a featured brand spread, photographic covers for Nord & Form, Harbor Coffee and Juniper Hotels, and distinct typographic treatments for the remaining spaces. The client interior has a larger editorial masthead, numbered working sections, ruled task lists, a client-goal pull quote, and a meeting-decision footer. The editing and task workflows are retained. Covers for Harbor Coffee and Juniper Hotels are original illustrative sample images. The sample migration updates only previously untouched sample spaces.

Private publishing is currently blocked: automatic approval review rejected the upload of the app source to the Sites repository because explicit authorization and destination trust were not established to its satisfaction. No source was pushed and no version was deployed. The local preview remains available.

## Calendar, assets, templates, tools, and vault · 8 September 2026

The delivery calendar reads canonical project/task deadlines, including internal projects. It supports month and agenda views, client/project/type/completion filters, overdue and unscheduled lists, date editing, drag rescheduling, and undo. Changes update the records used by client spaces and project boards; personal meetings do not become deadline events.

Library has Assets, Templates, and Vault tabs. Assets support uploads, authenticated image previews, downloads, HTTPS links, nested folders, search, client filters, grid/list views, and archive/restore. Files are limited to 20 MB; large files and live documents can use links. Library records have one canonical identity with connections to spaces, projects, tasks, and process references. Derived associations expose project material alongside its client and tasks without copying records. Organization-wide material is optional. Direct task connections are not leaked into sibling tasks.

Templates include categories for pitch decks, logos, brand guidelines, sales templates, call scripts, cases/portfolio, and other material. Upload files, link live documents, or author reusable text. Text can be copied, files downloaded as copies, and records connected to the work where needed. Four clearly labelled sample starters are supplied through an idempotent application upgrade, not a schema migration. No real brand logos, decks, or guidelines have been imported.

Tools registers hosted systems and self-contained HTML uploads. The runner isolates HTML tools from workspace data. Existing sample tools have been migrated to linked resource records. Process references can now be created and connected to resources; this is documentation, not the planned visual canvas or live monitoring.

Client Library & tools tabs, project boards, task briefs, and global search expose these canonical resources. Assets can be uploaded directly from a contextual Connect dialog.

The vault implements browser encryption, a master-passphrase unlock, generated passwords, reveal/copy controls, and automatic locking. See SECURITY.md for the actual protection and remaining production requirements. No real credentials are seeded. The master passphrase is not sent to the server.

Validation: TypeScript and focused lint pass; production build passes. Calendar model/API tests and resource/crypto/API tests pass, including optimistic concurrency, organization isolation, uploads, HTML response sandboxing, and ciphertext tampering. HTTP preview/API checks pass. Browser interaction/screenshot verification was not requested and has not been performed. Exact temporary D1 test records, including the synthetic vault configuration, were removed. Tiny unreferenced synthetic upload fixtures may remain in local R2 emulator storage. Remote source upload and deployment remain blocked as recorded above.

## Intent-first Kanban capture · 8 September 2026

My day and project boards now have a compact capture surface and four clear lanes. Enter from the board opens and focuses capture without intercepting typing, other controls, dialogs, IME composition, or workspace search. A complete recognized sentence saves with Enter; incomplete mentions use the command picker with arrow keys, Enter, or Tab. Escape closes capture while retaining the draft during workspace navigation. New task creation also uses this flow from the project overview.

Supported examples include `Book meeting with @Nord & Form at date @12/05` and `Edit launch video for @Autumn launch @nord`. Client/project mentions resolve by selected identity, full name, ID, compact name, or hyphenated name. Dates support `@today`, `@tomorrow`, `@nextweek`, `@DD/MM`, `@DD/MM/YYYY`, and `@YYYY-MM-DD`. The resolved client, project, owner, and full deadline are shown before saving. Client/project conflicts, duplicate contexts, impossible dates, and unresolved names do not save silently.

Created tasks belong to the current owner, enter Up next, and appear immediately in the canonical board. A request ID prevents duplicate tasks or duplicate history when a save is retried or raced. The source sentence remains in activity. This creates a task to book a meeting, not a calendar invitation or an external message.

Cards show client, project, owner, blocked state, notes, and connected resource access. Native drag/drop and a keyboard-accessible Move menu use the existing review rules. Opening task context includes a live client brief and a direct route to that client's meeting notes and decisions. Direct client tasks now count in client views, appear in the shared calendar, and inherit the client's library resources.

Production build, TypeScript, and focused lint pass. Task capture/parser/API tests pass, including calendar/library propagation, day/month and leap dates, ambiguous identities, edited mention pins, client/project validation, actor assignment, tenant isolation, retries, and concurrent deduplication. Existing review and calendar suites pass. Exact generated test records were removed. Run capture/calendar/resource tests with `node --import ./tests/ts-loader.mjs tests/capture.mjs` (or `tests/calendar.mjs`) so Node resolves Vite-style TypeScript imports. Browser interaction QA has not been requested or performed.

## Organization OS redesign and sales conversations · 9 September 2026

The primary navigation now has Today, Spaces, Work, Library, and Systems. My/team boards remain one click from Today; the shared calendar belongs to Work; assets, templates, tools, and vault share Library tabs. Legacy view URLs remain supported. Workspace keeps internal documents and sample people accessible. Client spaces retain their editorial identity.

Today assembles current review requests, recorded blockers, overdue assigned tasks, in-progress work, the next planned meeting, and active spaces from saved records. It shows a finite first surface with routes to the full board and attention list. A client brief opens alongside the current view, gathering goals/needs, agenda, last completed meeting decisions, recorded changes, project progress, task deadlines, pending reviews, blockers, and linked references. Source actions open the canonical records; meeting notes open the existing meeting workspace. Reopening the same meeting works after closing it. Task details now start with readable context and disclose the full edit form on demand.

Cmd/Ctrl K opens a real command surface supporting client preparation, record search, reviews, boards, prospects, and sentence capture. Enter opens capture from the Today brief and sales pipeline without intercepting inputs or dialogs. The context model and future AI contract are documented in DESIGN_DIRECTION.md. No language model, live analytics, or third-party connector is configured. Systems exposes actual source coverage.

Sales capture recognizes sentences such as: Sales meeting with "Acme", next step: calculate lead price @tomorrow. The preview shows the prospect, stage, next action, owner, and deadline. The server reparses the source sentence and atomically saves/locates a prospect, records the conversation, creates the canonical task, and records activity. Normalized exact names reuse an existing prospect. Capture IDs and mutation tokens prevent duplicate retry effects. Prospects stay distinct from active client spaces. The sales pipeline has New, Discovery, Proposal, Negotiation, Won, and Lost stages, native drag/drop, a keyboard-accessible stage selector, conversation history, and connected task access. Pipeline stages and task stages change independently. Prospect task deadlines appear in the shared calendar with a sales filter. Won prospects do not yet convert into client spaces automatically.

Migration 0005 adds prospect and prospect-event tables plus nullable tasks.prospectId; it contains no sample data and has been applied locally. User records were preserved. Temporary verification records are removed by exact generated IDs.

Validation: production build and TypeScript pass. Focused lint for the new surfaces, interpretation/context modules, sales store, and updated capture passes. Existing Studio lint debt remains in initialization/ref compiler checks and older form labels/auth links; the full repository is not lint-clean. Context/sales tests pass for source association, review versions, dates, parsing, transaction persistence, exact-name matching, retry/concurrent deduplication, actor assignment, tenant isolation, and pipeline/task independence. Existing capture, calendar, and versioned review workflow tests pass. All view URLs and the workspace API return HTTP 200. Browser interaction/screenshot QA has not been requested or performed. The build reports the existing large client chunk warning. Preview remains local; source upload/deployment have not been retried.

## Continuous capture and a first-class Sales area · 9 September 2026

Sales now has its own primary navigation item. Today includes a dedicated Desk view at ?view=day&desk=1. It keeps a capture input open through the workday, supports Enter-to-focus, and shows a durable history of each entry and its destination. Saving keeps the input ready for another entry. Capture is also accessible from other main views with Enter, while typing, buttons, dialogs, menus, and IME composition retain their normal behavior.

The shared capture surface recognizes notes, tasks, client meetings, deadlines, and sales conversations, with an explicit type override and destination selection. Notes inherit the current client/project, while task/project references and conflicts remain visible. Unrecognized text is retained as a note rather than guessed into a task. Meeting date/time fields resolve missing information; daylight-saving gaps are surfaced in the UI. Meeting timestamps use the selected local time and offset, and no invitations are sent. Deadline updates use the existing task revision/project previous-date rules. The server reinterprets note/meeting/deadline input against the authenticated workspace. The original source text remains attached to its saved entry.

Migration 0006 adds the captureEntries table and an actor/time index, and is applied locally. Canonical captured notes appear beside related client, project, and task work and in global search. Other capture records are receipts pointing to the canonical task, meeting, or project. Task and sales capture append their receipts inside their existing transaction. New note, meeting, and deadline commands atomically save records/history and deduplicate retries. Overlay drafts are isolated from the open Desk input so a command capture does not overwrite an unfinished desk note.

Verification: entry interpretation and API tests pass for safe fallback, note body/context, inherited context, meetings/timezones, canonical deadlines, stale revisions, receipt atomicity, duplicate/concurrent submissions, actor scoping, and workspace isolation. Existing task capture and sales/context regressions pass. TypeScript, focused lint, and the production build are checked before delivery. Browser interaction/screenshot QA has not been requested or performed. Exact generated verification records are cleaned up. No source upload or deployment is attempted.

## Reactive Desk · 9 September 2026

Desk now owns a primary navigation destination and is the default screen. It has been reduced, following screenshot feedback, to a plain white writing surface with compact task context. Slogans, helper paragraphs, action grids and the growing capture feed are gone. Activity is searchable in a drawer; reviews, alerts, blockers and deadlines are collected in a separate attention drawer. The former attention-card layout conflict is removed.

The Desk accepts multiline notes (Shift+Enter) and unfolds a dedicated project entry when the user types “create new project”. Name, brief, client, deadline and files are completed in place, then the entry folds back to writing. Project drafts and file upload IDs survive in-app navigation. Uploaded files are shared library records and are attached atomically when the project is created; retries reuse the same project and file IDs.

Progress, blocker and status captures update existing tasks. Task context is inherited only when the sentence does not name different work. Exact quoted task names or explicit selection resolve updates; ambiguous identities are not guessed. Progress retains paragraph breaks. Blocker changes notify responsible people in-app, and Review/Done transitions retain existing deliverable and approval checks. Task/project/client history and filing receipts stay connected. No external notifications or live AI calls are claimed.

Validation: entry, task capture, sales/context and new Desk model/API suites pass. The new suite covers multiline context, routing conflicts, ambiguous identities, project/file persistence, upload byte integrity, retries/concurrency, stale updates, recipient deduplication, review guards and tenant isolation. TypeScript and focused lint pass. Temporary fixtures use exact-ID database cleanup and the exact generated R2 object key. No browser automation or screenshots were requested/performed; the provided screenshot guided the visual reduction.
Final local production build passes (existing client-chunk size warning only). HTTP checks return 200 for Desk, Today, Sales and the workspace API. All generated database fixtures and the exact generated file object were removed; the user's workspace records remain intact. Local preview stays available at http://localhost:5173/?view=desk. No publishing or external source upload was performed.

## Discoverable Desk actions · 9 September 2026

Added a shared action registry for natural phrases and slash commands, including “add new deadline”, “schedule a meeting”, “log progress”, “flag a blocker”, “change status” and “request review”. `/` and `/help` show searchable actions and examples in the writing surface. Keyboard selection expands the canonical entry without saving anything. Full slash sentences are also accepted, including sales shorthand. Deadline entries expose a date picker and work target; status entries expose the new stage. Validation waits until a save attempt. Connected notes retain internal colons and paragraph breaks.

The registry suite tests every advertised alias and slash action, command filtering, unknown commands, prefix removal and context preservation. Entry, capture, sales/context and full Desk API suites also pass, including file retries and review safeguards.

Production build, TypeScript and focused lint pass for the action vocabulary. The Desk returns HTTP 200. Verification fixtures were cleaned up, and local preview remains running.

## Development across computers · 10 September 2026

Prepared this standalone Studio repository for private GitHub synchronization. README documents fresh setup and switching branches/computers. AGENTS.md carries the current product direction, engineering boundaries and data handling into future Codex conversations. The original master prompt is now included in docs instead of relying on a file outside the repository. Product notes now identify Desk as the default surface. Node 24 is recorded in .nvmrc; npm commands cover local migrations, type checks and the standalone intent suite.

Verification used an isolated copy of the tracked source and new documentation, with no copied dependencies or workspace data. A clean npm ci installed 582 packages; all seven local migrations applied; the production build passed with the existing client chunk warning. Its Desk and workspace API returned 200 and the expected 12 sample tasks / 5 sample projects. The temporary server was stopped. TypeScript, intent tests and documentation links also passed. The original workspace database and running preview were not changed.

Git shares source and durable documentation only. Each independent clone has its own local sample data; it does not synchronize the original preview's user records, files, vault, browser drafts or Codex transcript. Codex Remote is documented for continuing the same conversation and host state. The CLI's remote-control start command reports that its daemon lifecycle is Unix-only, so Windows device pairing must be completed through the desktop app. This development setup does not deploy the Studio application or change its Sites access.

## Slack in both directions · 10 September 2026

Blockers, review requests and review decisions now queue Slack messages
atomically with their mutations, delivered through a bot token or the existing
webhook with the daily-plan truthfulness rules: sent only on confirmation,
failed on rejection, unknown and never blindly resent on a lost response. A
new `/api/slack` endpoint accepts signed slash commands and bot DMs,
deduplicates Slack's retries, maps Slack users to members through
configuration, and runs inbound text through the same interpreter and command
boundary as the Desk — notes, meetings, deadlines, progress, blockers, status,
tasks with client references and full sales sentences. Systems shows granular
Slack coverage and undelivered counts. Configuration is six runtime settings
documented in docs/SLACK.md; nothing is implied when they are absent.

Migration 0017 adds the outbox and inbound-dedup tables. The dev server is
pinned to port 5173, which the API suites and documentation already assumed.
tests/slack.mjs passes alongside the entry, capture, desk, task lifecycle,
review, sales and daily-plan suites; TypeScript, focused lint and the
production build pass.

## Google Drive uploads and browsing · 10 September 2026

Drive extends the Calendar Google connection with separately recorded scopes.
With Drive connected, dropped and uploaded assets and templates land in a
Studio/<Client> folder tree in Drive resolved from the file's targets, with
the canonical resource record kept in Studio and links opening in Drive; tools
stay in Studio storage, and unconnected workspaces behave exactly as before.
Folder bookkeeping searches before creating so retries and renames never
duplicate folders, and upload retries reuse the canonical record instead of
uploading again. A Library strip shows the truthful connection state, offers
the connect flow, and — with browsing granted — an attach-from-Drive search
that links existing files without duplicating records. Systems reports uploads
only versus uploads and browsing.

Migration 0018 adds granted scopes, Drive file identity on resources and the
folder cache. Local previews now read runtime settings from a gitignored
.dev.vars file, which the inline binding configuration previously ignored —
this also makes the Google Calendar connection testable locally.
tests/google-drive.mjs passes with the full regression sweep; TypeScript and
the production build pass, and focused lint now sits below the repository's
previous baseline.

## Clients can be born anywhere · 11 September 2026

An empty workspace previously had no way to create a client outside morning
planning or a won prospect — the cold-start dead end. Spaces now has an
explicit New client dialog: the record ID is generated once per dialog so a
retried save lands on the same client, an existing name is answered with
"open it instead" rather than a duplicate, and creation records a space event
and opens the new space. The Desk's project form gains "+ New client…" in the
client selector; the named client is created atomically in the same guarded
batch as the project, with normalized-name reuse matching the planning flow,
and the footer names the new client before commitment. Empty states now say
what to do.

tests/client-create.mjs verifies idempotent retries, name-collision honesty,
atomic project-form creation, normalized reuse and both-choices rejection,
cleaning up by exact IDs. Known debt, unchanged by this work: several API
suites assume the legacy sample workspace records that fresh clones no longer
seed, and tests/context-sales.mjs fails on its fixed September 2026 date
against the current model on pristine code as well. TypeScript, focused lint
and the production build pass.

## Rhythms: recurring tasks and client meetings · 11 September 2026

Tasks and meetings can carry a rhythm — weekly, every two weeks, monthly or
quarterly — with no background scheduler. A recurring task spawns its next
occurrence in the same transaction that completes it, advancing from the later
of the due date and the completion day, so late work recurs upcoming rather
than already overdue; a repeated completion is a no-op and the chain keeps its
lineage under one root. A recurring meeting materializes its next occurrence
on workspace reads once its time has passed — the same while-the-app-is-open
pattern calendar sync uses — landing on a single future occurrence however
long the rhythm was neglected, recording a space event on the client timeline,
and continuing past a cancelled occurrence; removing the rhythm is what stops
it. Unattended items stay a single overdue record; nothing multiplies on its
own. The task sheet gains a Repeats control and rhythm chip; the client
space's Plan a conversation gains the same choice. Materialized meetings flow
to Google Calendar through the existing export.

Migration 0019 adds rhythm and lineage columns. tests/recurrence.mjs covers
the deterministic date math (clamping, leap years, catch-up); tests/
recurring.mjs exercises the real command boundary in isolated SQLite for
spawn-once semantics, chain lineage, editable validation, meeting
materialization idempotence and tenant isolation. The full regression sweep,
TypeScript, focused lint and the production build pass.
