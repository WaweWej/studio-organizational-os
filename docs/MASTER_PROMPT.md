# Master prompt for GPT-6 Astra in Codex

Build a beautiful, modular Organizational OS.

You are the product, design, and engineering partner responsible for turning the specification below into a coherent, working product in this repository. Exercise judgment, implement real behavior, inspect the result, and follow through. Treat this as a substantial product with a shared information model and multiple connected working experiences.

The working name is **Studio**. Keep the name easy to change. The first customer is a small content and marketing agency, but the architecture must accommodate other organizations and eventual commercial use.

This prompt is self-contained. Earlier experiments or screenshots, if present, are exploratory references only. The requirements below supersede any earlier assumption that the entire application should use an infinite canvas.

## 1. The product's purpose

An organization has good tools but no shared headquarters. Work, notes, leads, automations, assets, tools, analytics, decisions, and responsibilities are scattered. People repeatedly ask where something lives, what happened, who owns it, what was agreed, and what comes next.

Build the place where those questions are answered as a natural consequence of doing the work.

The central promise is:

> Every task starts with its context already present. Completing work leaves the organization's shared knowledge and records more complete.

The intended feeling is: “I can look at this once, understand what matters, and get to work.”

The product must combine day-to-day execution, project management, CRM, knowledge, process documentation, integration visibility, analytics, custom tools, and organizational operations. These are connected capabilities of one system. Keep their underlying relationships consistent and their interfaces purpose-specific.

Modular means organizations can enable capabilities, configure templates and fields, and adapt terminology and page composition without rebuilding the product. Do not begin by building an unconstrained application builder or plugin marketplace. Establish a well-structured core and clear extension contracts.

## 2. Established customer context

- Initially 6–7 people, primarily content creators and project managers. The founder/user coordinates much of the operation. Do not hard-code these roles into the domain model.
- At least 10 active clients, multiple owned platforms, concurrent projects, recurring work, internal marketing, and projects without clients.
- Services include content production, paid advertising, lead generation, custom tools, websites, strategy, workshops, studio rental, and owned end-to-end platforms.
- Existing systems include Slack, Monday, Google Drive, Google Calendar, InSMS, custom applications, and scattered documents.
- Staff currently post what they intend to do and what they completed in a daily Slack channel. There is weak follow-up and work gets lost.
- Problems include unclear reviews, missing notes, fragmented context, undocumented automations, disconnected analytics, forgotten tools and access details, and lead campaigns that consume money without demonstrating value.
- A typical engagement: meeting → contract → scope and deliverables → content production → advertising → custom landing page → lead captured in Monday → client notification through InSMS → booking and follow-up → reporting, finance handoff, and the next monthly meeting.
- Monday remains during transition because existing automations depend on it. Eventually move work over when the required capabilities and migration path are proven.
- The organization has a server. Its operating system, capacity, network, and deployment constraints are not yet known.

## 3. Fixed product decisions

1. This should become the main organizational workspace, through a gradual transition.
2. The default landing experience is a useful personal daily board. Include a team view.
3. Use an infinite canvas selectively for process blueprints and automation relationships. Regular navigation, clients, projects, documents, and daily work must remain direct and predictable.
4. People are assigned to projects, pull tasks from available project work, and organize their own priorities. Support explicit assignment and reassignment too.
5. Kanban cards remain visually quiet: task title, project/client context, responsible person, and stage/progress. Put deadlines, urgency, effort, dependencies, workload details, and detailed metadata inside the task by default. Surface exceptions through a focused attention area.
6. Tasks and projects support both internal and client review.
7. Client spaces support extensive customization of logos, colors, typography, covers, layout, sections, notes, tools, meetings, reminders, and ownership. Navigation and core interaction patterns remain consistent.
8. Owned platforms use the same space experience as clients, distinguished by type and relevant configuration.
9. External clients initially receive access to narrow, specific views, such as their leads or a deliverable awaiting approval. A full external client workspace is outside the initial scope.
10. Blueprints document the actual process, link to external systems, and track activity where possible. They do not need to replace every external automation engine.
11. Staff can edit blueprints initially. Still retain revision history, validation, and clear differences between a draft diagram and deployed behavior.
12. Monitoring may update periodically. Important failures should generate timely alerts where the source supports detection.
13. Provide quick capture, universal search, and sensible hierarchical browsing.
14. Notifications include in-app attention, email, Slack, daily digests, reminders, review requests, and escalation.
15. Desktop is primary; mobile supports quick checks and focused actions.
16. Rules, automations, and AI are part of the product.
17. Detailed finance, HR, and advanced permissions requirements are deferred. Keep appropriate module boundaries and basic access controls without inventing a complete ERP.

## 4. Fill the remaining gaps using these defaults

These are implementation assumptions, not statements the customer explicitly confirmed. Record them in the decision log and keep them changeable.

- **Work happens in both places:** author notes, briefs, simple text, tasks, and structured records inside the OS. Preview and reference work from external editors. Link or embed supplied custom tools when supported. Do not recreate a video editor, design suite, advertising platform, or accounting package.
- **Review concerns a version:** every review references an identifiable deliverable version, attached assets, criteria, reviewers, decisions, and comments. New material changes invalidate or supersede the relevant earlier approval.
- **Delivery is configured:** projects/templates define the recipient or destination. Approval and delivery are distinct recorded events. An authorized reviewer can choose “Approve and send” when the destination is known and the action is supported. Otherwise produce an explicit manual handoff.
- **Capture is observable:** record actions performed in the OS and events received from authorized integrations. Outside conversations and unsupported tool actions require capture/import or manual notes. Never promise invisible knowledge capture.
- **Shared client views are restricted:** prefer authenticated or recipient-verified access for sensitive lead data. Support scope, revocation, expiry, and explicit allowed actions. Treat possession of a link alone as insufficient protection for unrestricted client data.
- **Authentication is real:** establish organization membership and minimal owner/admin/member access, even while advanced permission design remains deferred. Team-wide blueprint editing must not imply public access or credential administration.
- **Language and time:** start with English. Make locale and organization timezone configurable; use Europe/Copenhagen for demo data and test daylight-saving boundaries. Store timestamps consistently and keep currencies explicit.
- **Hosting:** develop locally and prepare a portable container deployment for the existing server. Verify its characteristics before any production deployment.
- **Commercial readiness:** design tenant isolation, configuration, and organization boundaries from the start. Subscription billing, public signup, and a marketplace come later.
- **AI:** start with context retrieval, sourced summaries, and suggested actions. Deterministic rules manage required state transitions. AI-triggered external writes require explicit permission and an audit trail.

Do not reopen discovery for routine choices. Ask only when a missing answer blocks a consequential decision, an external service cannot be configured, or the user must supply access. Continue independent work while such questions are pending.

## 5. Design standard

The design is a core acceptance criterion. Aim for the clarity, precision, and calm of an exceptional professional Apple application, with the operational comprehensibility of a carefully engineered control system.

Translate this into implementation:

- Refined typography, deliberate spacing, balanced density, restrained color, excellent alignment, subtle depth, and carefully timed motion.
- A stable application shell and a small number of primary destinations. Start with approximately five to seven relevant choices as a design constraint, not a claim about human cognitive limits.
- Progressive disclosure: present the information needed for the current decision, with supporting context immediately available.
- Familiar interaction patterns, readable labels, useful defaults, clear selection, and an obvious primary action.
- Fast task creation and editing. Drag-and-drop for suitable operations, with keyboard and menu alternatives. Dragging must not be the only way to perform essential actions.
- Focused task and review surfaces with a stable URL and a predictable way back to the originating view.
- Client branding inside client spaces while common controls remain recognizable and accessible.
- Good empty, loading, failure, disconnected, permission-limited, and recovery states.
- Accessible contrast, keyboard operation, focus management, touch targets, and reduced-motion support. Treat mobile as a deliberate condensed experience.
- No unnecessary dashboard metrics, decorative charts, huge marketing headlines in working screens, arbitrary color coding, or a sidebar entry for every database entity.
- Use one coherent design system. An unmodified component library is only a starting point. Customize proportions, surfaces, interactions, and visual hierarchy.
- Light mode first, with a coherent dark-mode token architecture. Complete and verify dark mode as the core workflow stabilizes.
- Avoid gratuitous glass effects, blur, gradients, or animation that make work harder to read or slower to perform.

Before building many screens, define the design tokens and implement the shell, daily board, task detail, review surface, and one client space at a high level of finish. Validate them in the browser and iterate. Do not stop at attractive static screens.

## 6. Information architecture and shared records

Use this starting navigation, refining the labels if a clearer structure emerges:

- **My day:** personal board, queued work, recent completion, attention, and reviews.
- **Work:** team board, projects, templates, recurring work, and planning.
- **Spaces:** clients, prospects, owned platforms, and internal initiatives.
- **Blueprints:** processes, linked automations, observations, failures, and ownership.
- **Tools:** the custom tool and external service directory.
- **Insights:** operational and campaign performance with source context.
- **Organization:** knowledge, People & Culture, office/admin, and future finance capabilities.

Search, quick capture, and notifications are global utilities. Reviews must be immediately accessible from daily work. Contextual links should remove unnecessary navigation between these areas.

Core relationships:

- An organization has members, enabled modules, spaces, projects, records, integration accounts, and templates.
- A space may represent a client, prospect, owned platform, or internal initiative.
- Projects may belong to a space or exist independently. Model a clear primary context; additional links should not duplicate ownership or totals.
- Tasks belong to projects when appropriate; captured standalone tasks can be organized later. Subtasks are actual task records with parent relationships.
- A task can connect to deliverables, files, notes, people, reviews, meetings, tools, blueprint steps, and external records.
- A client space aggregates related records rather than maintaining separate copies of them.
- Blueprint steps reference relevant systems, owners, integration mappings, and internal records.
- Actions produce attributed activity records and, when applicable, durable events for notifications and integrations.

One task has one identity and one authoritative state across its personal board, team board, project, and space. Moving it between views never clones it.

Use a shared CRM experience but distinguish the organization's own sales opportunities from leads generated on behalf of its clients. Preserve client ownership, external identifiers, and separate reporting to avoid mixing those datasets.

## 7. Daily work and Kanban

Default stages: **Up next → Doing → Review → Done**. A project's workflow can configure internal/client review details. “Blocked” is an orthogonal condition with a reason and owner, not a place where work silently disappears.

Implement:

- A personal ordered queue and a team board showing who is doing what and for which project.
- Self-selection from assigned projects and explicit assignment/reassignment.
- Persistent card movement, priority ordering, and status changes, synchronized across views and sessions.
- A complete task surface: description, expected outcome, project and client links, notes, activity, assets, tools, assignee, contributors, reviewer, due date, priority, dependencies, effort, and relevant instructions.
- Previous-day completion and unfinished work carried forward without duplicating tasks or resetting history.
- Quick capture that never silently discards unsorted work. Provide an inbox or triage destination.
- A focused attention area for blocked, stale, overdue, and review-required work. Do not crowd every ordinary card with all metadata.
- Explicit review readiness, changes requested, approval, delivery, and completion behavior.
- Clear optimistic update and failure recovery behavior; never show a successful save when persistence failed.
- Concurrent editing protection appropriate to the operation. Preserve comments and surface conflicting material edits.

The daily digest is generated from recorded activity and outstanding work. Let a person add useful context before sharing. Do not infer that unrecorded work was completed, or present activity counts as employee productivity scores.

## 8. Projects, templates, and review

Projects can be simple task lists or contain phases, milestones, subtasks, dependencies, and recurring deliverables. Keep complexity optional.

Templates can specify structure, reusable briefs, checklist criteria, roles, reviewers, offsets from a target date, resources, tool links, and supported automation rules. Template instances have a version and remain stable when the template is edited. Applying later template changes to existing projects must be an explicit, reviewable operation.

Dependency-aware due dates and progress must avoid cycles and double-counting nested tasks. Recurring work must create uniquely identifiable occurrences without duplicates when a job retries.

Use initial templates for a content campaign, recurring content retainer, website/landing-page delivery, custom-tool project, and internal onboarding. Fully implement one before broadening.

Review requirements:

- Assign a reviewer or reviewer group using project/template defaults, with per-task overrides.
- Provide a review queue with previews for supported images, video, documents, text, and links. Preserve external-editor links when native preview is unsupported.
- Attach comments, approval, and change requests to the relevant deliverable version. Advanced frame-level or region annotations can follow after reliable basic review.
- Support internal-only and internal-then-client approval paths.
- Prevent missing reviewer or destination configuration from silently advancing the work. Show the next required action.
- Keep approval, delivery attempt, external acknowledgement, and final completion separately observable. A delivery failure must not be represented as delivered.
- Provide a narrow client review view without exposing internal discussions or unrelated records.
- Prevent repeated clicks, retries, or duplicate events from sending the same deliverable repeatedly.

## 9. Client spaces and organizational knowledge

A client space should feel like entering the client's brand while remaining effortless to use.

Build composable, reorderable sections with sensible templates: overview/brief, account ownership, contacts, goals, active projects, meetings and next meeting, notes, decisions, reminders, tools, files, leads, blueprints, and reporting.

Use typed sections and validated customization. Allow branding and arrangement without letting arbitrary styling break common navigation, accessibility, or security. Theme previews and a restore-default action are useful.

Knowledge requirements:

- Quick capture for tasks, notes, links, files, and decisions.
- Rich-text documents with stable links, owners, revision history, and contextual backlinks.
- Predictable collections, including People & Culture → Documents → Employee Handbook.
- Search across permitted internal records, with result type, relevant context, and a direct destination.
- Index connected external content only when authorized and technically supported. Clearly distinguish an indexed file from a link-only resource.
- Preserve source, author, timestamp, and provenance when importing notes or generating summaries.
- Do not copy every note into every related record. Link canonical notes and build contextual views.

## 10. Blueprints and automation visibility

Build a beautiful, usable infinite canvas for actual process maps. Include pan, zoom, fit-to-content, selectable and draggable nodes, connection editing, branching, labels, groups, undo/redo, and persisted layouts. Keyboard and non-canvas access should expose essential process information too.

Support nodes for external systems, human actions, waits/conditions, internal record updates, and custom tools. A node can document its owner, purpose, inputs/outputs, system link, configuration references, expected behavior, linked client/project, and last verified time.

Distinguish three capabilities per node or connection:

1. **Documented:** manually mapped, with instructions and a direct tool link.
2. **Observed:** receives supported events, scheduled observations, or health checks.
3. **Actionable:** supports a validated internal or external action through a configured adapter.

The diagram can include all three together. Separate capability from operational health. A documented node is not automatically healthy; a successful API request is not proof that the business process succeeded.

Support draft and published versions. Editing a map must never imply that an external system was changed. When external editing is unsupported, provide “Open in tool,” clear handoff instructions, and an action to record what changed. When supported, show the change being applied and record the response.

Observation should show source, last observation time, freshness, recent runs/events, errors, and useful linked records where available. Keep unknown, stale, disconnected, and failed states distinct. Collect only the payload fields required for useful diagnostics; protect personal data and credentials.

Correlate events across the lead journey using actual identifiers when available. Never invent end-to-end tracking where the source cannot supply it.

Implement internal rules incrementally: trigger → conditions → actions. Examples include updating a task, creating a follow-up, adding a client activity entry, and requesting review. Use validated action types, retry-safe handlers, and loop protection. External automation replacement comes from verified adapter capabilities rather than a decorative node editor.

Use the sample journey: ad → landing page/form → lead record → InSMS notification → booked meeting or follow-up → client visibility → finance handoff.

## 11. Tools, integrations, and Monday transition

The tool directory is the authoritative index of what the organization uses and why. Support name, purpose, owner, external URL, linked spaces/projects/blueprints, access instructions, integration capability, configuration, and operational notes.

Examples include a brand-specific content generator, an analytics calculation tool, and a research/travel planning tool. Supplied tools may be linked, embedded where their hosting permits it, or connected through APIs. Do not assume their source code, API, or iframe support exists.

For access information, store login URLs, account ownership, and password-manager references. Keep actual integration secrets server-side. Do not build a plaintext password notebook or display credentials in ordinary notes, activity, search, or AI context.

Design a common adapter contract for authorization, external record mapping, supported actions, inbound events, scheduled synchronization, health/freshness, rate limits, and errors. Capabilities must be declared per provider; connectors are not interchangeable promises.

Initial integration priorities:

- Slack: configured notifications, review requests, digests, and authorized capture.
- Google Drive: contextual files/folders and supported metadata synchronization.
- Google Calendar: linked meetings and reminders, with per-calendar authorization.
- Monday: mapped items/statuses and existing automation relationships during migration.
- InSMS: identify the exact product and verify available interfaces. Start with documented links if access/API support is unavailable.
- Custom tools: links first, then embeddings and declared event/action contracts.
- Analytics sources: add providers based on the actual channels in use; do not assume their account access or schemas.

For each integration, document the exact supported direction and actions. Treat inbound and outbound permissions separately. Validate current official documentation before implementing provider-specific behavior.

Synchronization must address duplicate events, retries, source ownership, conflict handling, external IDs, reconnect/backfill, archived or deleted records, and preventing updates from echoing back forever.

During migration, define which system owns each mapped dataset or field. Begin with a small pilot and explicit imports/sync; avoid uncontrolled dual authority. Provide a migration inventory, reconciliation report, rollback path, and workflow parity checklist. Do not retire Monday or delete its data merely because the new boards look complete.

Missing credentials must not block unrelated implementation. Use clearly labeled fixtures and adapter tests. Report a connector as unconfigured until it has actually been exercised against the intended service.

## 12. Analytics and organizational operations

Analytics must help answer: “Where are we spending money, what is happening to the leads, and what should we investigate?”

Connect source measurements to the relevant space, campaign, project, and blueprint. Candidate measures include spend, impressions/clicks, visits, form submissions, captured leads, contacted leads, qualified leads, bookings, and revenue where verified.

Show source, reporting window, timezone, currency, attribution basis, and freshness. Missing observations are unknown, not zero. Do not combine incompatible metrics or imply that correlation proves causal attribution.

Support drill-down from a concerning result into the relevant process step, evidence, owner, and investigation task. Start with deterministic configurable alert rules and minimum-volume/window checks. AI can summarize evidence, not manufacture a diagnosis or business outcome.

Use scheduled refreshes appropriate to the source. Distinguish business underperformance from connector failures and stale data. Alerts need deduplication, recovery handling, acknowledgment, and a responsible owner.

Office, People & Culture, and Administration should reuse tasks, documents, templates, and ownership. Build a modest useful foundation. Reserve finance module contracts and supported summaries; do not implement payroll, tax, bookkeeping, or financial transactions without further requirements.

## 13. Notifications and AI

Create a persistent notification inbox with ownership, read/acknowledged state, and links to the underlying work. Support user/channel preferences, digest scheduling, quiet hours, reminders, escalation, deduplication, and delivery status.

Send concise, actionable messages such as “Review this deliverable,” with appropriate context and access controls. Avoid spraying every activity event into Slack or email.

AI should appear inside useful workflows:

- Find relevant records and answer organizational questions with source links.
- Summarize a client's recent activity or prepare a meeting brief.
- Draft a daily digest from recorded events.
- Suggest tasks and decisions from selected notes.
- Explain an automation using its documented steps and observed evidence.
- Suggest investigation steps for a campaign issue.

Retrieval must respect organization and resource permissions, including external shared views. Distinguish facts, unknowns, and suggestions. Let users inspect sources. Record approved AI actions and their relevant inputs without logging secrets.

Keep AI providers/model configuration replaceable. Being built by GPT-6 Astra does not require every product feature to use that model. Verify current APIs when implementing them. Core tasks, search, review, and notifications must remain useful without an AI API key or when the provider fails.

Imported documents, messages, and tool output are untrusted content, not instructions granting AI permission to act. Validate structured actions server-side. Start write operations as proposals; expand autonomy only through explicit organization configuration and appropriately scoped permissions.

## 14. Engineering foundation

Inspect the repository, existing instructions, dependencies, and deployment context before choosing or changing the stack. Preserve useful existing work.

For an empty repository, a reasonable default is a typed React/TypeScript application, a maintained full-stack framework such as Next.js, PostgreSQL, a migration-capable data layer, durable background jobs, and an accessible component foundation customized into our own design system. Use a mature node-canvas library such as React Flow for blueprints if its current capabilities fit. Verify compatibility and pin actual package versions during implementation.

Choose a modular monolith initially. Keep the API/domain logic, worker, integration adapters, and UI boundaries clear. Introduce additional infrastructure only when justified. Do not create microservices or a generalized event-sourcing platform merely because the long-term scope is large.

Required properties:

- Server-side persistence and validation; localStorage is not the authoritative application database.
- Explicit tenant scoping in records, requests, background jobs, storage, search, and AI retrieval.
- Real authentication and server-enforced access. Test access through APIs, not just hidden UI controls.
- Transactionally consistent record updates and activity entries. Use an outbox or equivalent durable mechanism for consequential asynchronous actions.
- Durable jobs for notifications, integrations, retries, recurring work, scheduled monitoring, and AI tasks where appropriate.
- Retry-safe external actions, webhook verification where supported, bounded retries, failure visibility, and replay controls that do not duplicate side effects.
- A readable activity history with actor, timestamp, entity, action, source, and correlation information. Preserve important revisions and avoid logging secrets or unnecessary personal data.
- File metadata, scoped storage access, and a storage abstraction appropriate to the server. Validate uploads and embedded/external destinations.
- Protected credentials and configurable secret management. Include environment variable examples without real credentials.
- Database migrations, realistic seed data, health checks, structured error logs, backup/restore instructions, and a practical deployment/runbook.
- Authorization-aware search with a path from straightforward full-text search to optional semantic retrieval.
- Concurrency handling and a clear update mechanism so team/project/client views converge promptly.
- Efficient queries, pagination and selective loading for large lists, and measured performance on representative datasets.

Keep durable state typed. Allow validated custom fields and module configuration without turning every domain entity into unstructured JSON.

## 15. Build sequence

Keep the full product vision intact while implementing complete usable workflows in a sensible order. A milestone is a delivery unit, not permission to forget the remaining scope.

### A. Foundation and the daily work loop — first priority

Produce a brief product model and architecture decision record, then implement:

- Authentication, organization membership, core persistence, and realistic seed data.
- The polished shell, personal/team Kanban, project queue, complete task detail, one client space, and contextual links.
- A working project template and connected tasks.
- Notes, deliverable versions, internal review, change requests, approval, in-app notification, and activity history.
- A configured delivery interface with a safe local test destination; distinguish local verification from real email/Slack delivery.
- Quick capture and useful internal search.

Demonstrate the entire loop with persistent data. Do not substitute a frontend demo for this milestone.

### B. Context, repeatable work, and external views

Expand composable client spaces, knowledge, meetings, templates, recurring work, custom-tool records, and basic internal operations. Add carefully scoped client lead/review views with real server-side enforcement. Implement the email/Slack delivery adapters and verify them when credentials and test destinations are available.

### C. Blueprints and integration groundwork

Implement the persisted process editor, version history, documented/observed/actionable capabilities, useful internal rules, adapter contracts, and initial provider integrations. Connect a representative journey rather than presenting many shallow connector tiles.

### D. Monitoring, campaign evidence, and AI assistance

Add scheduled observations, source-aware analytics, incident-to-task flows, and initial permission-aware AI assistance. Prove freshness, missing-data, and failure behavior with realistic fixtures before claiming live coverage.

### E. Pilot, migration, and deployment hardening

Pilot real work, complete supported integrations, verify the server environment, test restore and isolation, reconcile the Monday migration, and refine the product from observed use. Production publication, real account changes, and migration cutover require their appropriate authorization.

Advanced commercial billing, a public marketplace, full ERP, and a universal replacement automation engine remain future expansion unless explicitly requested.

## 16. Acceptance scenarios

Write meaningful automated and browser checks for the implemented scope. Use these scenarios to guide design and verification:

1. A member signs in, sees unfinished work from yesterday, and pulls a task from an assigned project. No duplicate task is created.
2. Opening that task exposes its brief, client, project, relevant notes, assets, and tool links without a scavenger hunt.
3. Updating a task in My day updates its team/project/client views. The update survives reload and is visible in another authorized session.
4. Work is submitted for review against a specific deliverable version. The correct reviewer is notified once.
5. A reviewer requests changes, the creator submits a new version, and the resulting approval refers to that version. Earlier decisions remain understandable.
6. Approval and sending record separate outcomes. A failed send is recoverable; retrying does not deliver the same item twice.
7. A client can open an authorized shared view of their leads or review item, but cannot retrieve internal notes, another client's records, or another tenant's data by changing URLs or API requests.
8. A project without a client and an owned-platform project work without special-case hacks.
9. Applying a template creates linked records with correct dates/roles. Retrying or recurring-job replay does not create duplicate instances.
10. A process can include manual documentation, an observed provider step, and an internal task update. Unknown health is never shown as successful execution.
11. Editing a documented external step does not claim to deploy a change. A supported executable change records its actual result.
12. A duplicate webhook is processed safely; failed synchronization is visible; stale analytics do not become zeroes or false success.
13. A campaign issue can be traced to source evidence and converted into an owned investigation task linked to its client and blueprint.
14. A user finds the employee handbook through search and through its predictable collection path.
15. AI answers include accessible sources, respect record permissions, and gracefully handle missing evidence or provider failure.
16. Key flows are usable by keyboard and at desktop and phone widths, including long titles, missing data, and error states.

Use representative synthetic content: several team roles, approximately 10 clients, owned platforms, internal work, projects with different structures, a review cycle, a blocked dependency, custom tools, and a lead journey. Keep demonstration data visibly distinguishable from real provider observations. Include a second organization in tests to verify isolation.

## 17. How to work in Codex

- First inspect applicable repository instructions, the actual codebase, and available tooling. Reconcile this product specification with existing constraints and report material conflicts.
- Create a concise plan and begin implementation in the same working session. Documentation should enable engineering, not replace it.
- Make routine reversible choices independently. Record assumptions and their consequences instead of repeatedly asking the same questions.
- You may use available subagents for bounded independent implementation or review tasks when it helps. Assign clear ownership and integrate their work. Do not create separate user-facing Codex tasks unless requested.
- Preserve existing user changes. Make targeted edits and maintain a runnable repository.
- Use current official documentation for external APIs and changing package behavior. Do not invent endpoints or connector capabilities.
- Inspect the real UI in a browser. Review hierarchy, spacing, responsive behavior, interactions, keyboard operation, and failure states. Fix obvious visual problems before presenting work.
- Run tests appropriate to the changes, including integration and end-to-end checks for consequential behavior. Avoid redundant tests that merely mirror implementation. Broaden testing when changes or failures justify it.
- Do not expose fake success states. Distinguish implemented and verified, implemented but unconfigured, simulated, and planned capabilities.
- A request to build the application does not itself authorize sending real client messages, accessing arbitrary external accounts, spending money, migrating production records, or publicly exposing the server. Prepare reviewable changes and use existing explicit authorization where available. Ask only when an actual remaining action requires it.
- Keep external communication and production-affecting jobs in a clearly configured test/dry-run mode until their intended recipients, account, and behavior are authorized.
- Missing keys or server access block only the dependent live verification/deployment, not local application work.
- Give concise progress updates describing what is working, what you learned, and what the next step resolves. Do not leave long runs without useful updates.
- Keep durable project notes so another Codex session can continue without reconstructing the conversation. Record decisions, completed work, verification evidence, blockers, and the next concrete action.
- If the full scope exceeds a session, leave a working increment and an explicit continuation plan. Do not label the overall product complete because one milestone is finished, or stop at a plan when implementation is possible.

## 18. Expected repository deliverables

Maintain these documents or equivalent existing project files:

- `docs/PRODUCT.md`: confirmed requirements, assumptions, boundaries, and core user journeys.
- `docs/ARCHITECTURE.md`: domain relationships, persistence, events/jobs, adapters, tenant/access boundaries, and deployment approach.
- `docs/DESIGN.md`: tokens, shell/navigation, interaction patterns, and visual acceptance standards.
- `docs/ROADMAP.md`: sequenced work, completion status, dependencies, and acceptance scenarios.
- `docs/DECISIONS.md`: consequential choices with rationale and open questions.
- `docs/INTEGRATIONS.md`: provider capabilities, source ownership, authorization needs, configuration, and verification status.
- `docs/PROGRESS.md`: latest implementation state and the precise next action.
- A practical README, environment example, migrations, seed workflow, test instructions, and local/deployment runbook.

Keep documents concise, consistent, and updated with the implementation. Avoid duplicating a requirement in many places where it can drift.

## 19. Begin now

Briefly state your understanding of the product and the first milestone. Inspect the repository, establish the design and architecture foundation, and build the first persistent daily-work-to-review loop.

The standard is a product where ordinary work feels obvious, context is already at hand, and the organization's records stay connected as people use it. Preserve that standard as the capability grows.
