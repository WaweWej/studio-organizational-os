# Studio development context

This repository is the Studio organizational OS. Keep work inside this repository; the original parent directory contains unrelated projects.

## Read first

- `README.md` for setup, switching computers, and data boundaries.
- `docs/DESIGN_DIRECTION.md`, especially the latest Reactive page and writing vocabulary sections, for the accepted interaction and visual direction.
- `docs/PROGRESS.md` for implemented behavior and verification history.
- `docs/MASTER_PROMPT.md` for the original discovery and long-term scope. Later user feedback and DESIGN_DIRECTION supersede older daily-board/dashboard assumptions.
- `docs/SECURITY.md` before changing authentication, permissions, files, tools or vault behavior.

## Product essentials

The Desk is a minimal white writing surface and the default destination. Writing an intention unfolds only the required structure, then saving returns to a clear page. Keep slogans, explanatory copy, action grids and growing feeds out of the idle Desk. History and attention remain available in drawers. Preserve accessible keyboard controls and reduced-motion behavior.

Client spaces and the client overview feel like branded editorial websites within consistent navigation. Tasks, projects, clients, meetings, sales, assets, templates, tools and process records share canonical records and links. Do not duplicate a task for each view. Preserve versioned review, optimistic revisions, atomic history, retry deduplication and organization scoping.

The present interpreter is deterministic; no live AI provider or production Slack/Monday/Google/InSMS connection is configured. Future AI must use the same validated command boundary. Never imply a connection, monitoring signal, delivery or invitation exists without evidence. Current colleagues are sample members; real multi-user organization access remains future work.

## Engineering

- React 19 / TypeScript / Vinext / Vite, Cloudflare D1 and R2. Retain the lockfile and existing Sites integration.
- Use Node 24, `npm ci`, `npm run db:local`, then `npm run dev` in this directory. See README for details.
- Database migrations in `drizzle/` are immutable once applied. Add new migrations instead of rewriting existing ones. Never reset `.wrangler/state` to resolve a schema problem.
- Local preview data, uploaded files, vault ciphertext and environment files are not source code. Do not commit, push, or seed them into another environment. Local fallback authentication is development-only; do not expose the development server publicly.
- Run checks appropriate to the change. `npm run check` checks types and `npm run test:intents` exercises the Desk vocabulary without a server. API suites require a running isolated local preview and create test records; inspect their auth/cleanup behavior before running them. Never run destructive fixture cleanup or vault tests against a real user's data.
- The full lint command has older known findings; use focused lint for modified code and report limitations honestly. Existing builds may report a large client chunk warning.

## Working across computers

Use a separate clone outside OneDrive/Dropbox/iCloud on each computer. At the start of work, inspect the current branch, status and remote, then fetch the private GitHub remote. Preserve uncommitted changes and do not force-push, auto-stash, or overwrite divergent work. Before switching computers, commit and push completed, validated work and report the branch. Carry unfinished work only with an explicit, labeled checkpoint.

Keep durable product context and current decisions in these checked-in documents so another Codex conversation can continue. Git shares code and documentation, not this conversation or local app data. Use Codex Remote to continue the same conversation and development state on the original host.

Use `codex/` for new development branches unless the user specifies another. GitHub is the development source remote. Publishing the Studio app through Sites is a separate operation: preserve the existing project ID and do not publish merely to synchronize development files.
