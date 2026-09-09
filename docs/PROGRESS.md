# Studio implementation status

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
