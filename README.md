# Studio

A creative organization OS: a quiet Desk for capturing intentions, branded client spaces, connected work and reviews, a shared calendar, sales, and a library of assets, templates and custom tools.

The product and engineering context travels with this repository. Codex reads [AGENTS.md](AGENTS.md); the accepted visual direction is in [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md).

## Online use and updates

Open [Studio online](https://studio-organizational-os.gwej123.chatgpt.site) for real work. The live site uses the existing private Sites project with persistent Cloudflare D1 data and R2 file storage. Sign in with the same ChatGPT account that owns the site. Local preview data is separate; the header labels it Local preview.

Publishing a new code version reuses the same site and database. Keep `.openai/hosting.json` and its project ID/binding names intact. Database changes use new, reviewed migrations; never reset the live database, replay sample seeds, or replace it with local test data. The pilot remains one owner; sharing the site does not yet create a shared multi-user organization.

To make improvements, ask Codex to change Studio locally, verify the affected flow with isolated fixtures, then publish the update to the existing private site. GitHub stores the development source; Sites stores published versions. The deployment process applies pending schema migrations while retaining workspace records. Keep migrations compatible with already saved data.

For a local backup, stop the preview and run `python3 scripts/backup-workspace.py`. Backups and exports stay under ignored `work/`; never commit them. The initial local-to-hosted transfer used a temporary endpoint bound to the owner's workspace and an atomic empty-target check. The endpoint was removed from the application after the transfer; importing local data is not part of ordinary updates. Files/vault records need a separately planned transfer; neither was present in the initial cutover.

## Continue on another computer

1. Install Git, Node.js 24 and Codex. Sign in to the GitHub account that can access this private repository.
2. Clone the repository into a normal development folder, outside OneDrive, Dropbox or iCloud:

   ```sh
   git clone https://github.com/WaweWej/studio-organizational-os.git studio
   cd studio
   npm ci
   npm run db:local
   npm run dev
   ```

3. In Codex, add the cloned `studio` folder as a local project. Open the local URL printed by the development server.
4. Start with: **“Continue Studio. Read AGENTS.md and the latest design and progress documents, check the branch and remote for newer work, then help me with [your next change].”**

The GitHub default branch points to the original active Studio development branch, so a normal clone starts with the current work. No Cloudflare or AI API key is needed for the local workspace. New workspaces start empty, with only the owner account.

## Switch computers during development

Before you leave one computer, ask Codex to **save and push the completed work, then tell you the branch name**. On the next computer, ask it to **fetch the newest work and continue that branch**. Keep any uncommitted changes safe; if both computers changed the same branch, resolve the difference before continuing.

On a clean checkout of the same branch:

```sh
git pull --ff-only
npm ci
npm run db:local
npm run dev
```

Rerun `npm ci` when dependencies change and `npm run db:local` when migrations change. Stop a running preview before replacing dependencies. Git refuses a non-fast-forward pull instead of silently discarding different work. GitHub synchronization happens when changes are pushed and pulled; it is not continuous background synchronization.

## Continue this exact conversation

For the same chat, files and local preview data, use Codex Remote. On the original PC, open **Settings > Connections > Control this PC** and complete setup. On another supported Mac or Windows computer, use **Settings > Connections > Control other devices** and pair with the original PC using the same account and workspace. Feature availability can vary.

The original PC must remain awake, online and running the app. A dedicated always-on development host can replace it later. The [official remote connection guide](https://learn.chatgpt.com/docs/remote-connections) covers pairing and SSH hosts.

## Code and workspace data are separate

This repository shares the source, migrations, images and product context. Each fresh local clone creates its own empty workspace. Tasks and notes entered into a preview, uploaded files, encrypted vault entries and secrets stay in that preview's local `.wrangler/state` directory and are intentionally excluded from Git.

The existing computer's data is preserved. Use the same host through Remote if you need that data while developing elsewhere. The live Site shares saved work across your signed-in devices. A Git checkout still has its own local preview data; pulling code does not copy or update the live records. Unsaved browser drafts and this Codex transcript are not copied into Git.

## Commands

Google Calendar setup and sync behavior are documented in [docs/GOOGLE_CALENDAR.md](docs/GOOGLE_CALENDAR.md). Its credentials are private hosting settings; fresh clones do not connect to your real calendar.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact locked dependencies |
| `npm run db:local` | Apply migrations to this clone's local D1 database |
| `npm run dev` | Start local development |
| `npm run check` | Check TypeScript |
| `npm run test:intents` | Test the Desk command vocabulary without a server |
| `npm run build` | Build the production application |
| `npm run db:generate` | Generate a new migration after a schema change |

The local development identity is not production authentication. Keep the preview local. See [docs/SECURITY.md](docs/SECURITY.md) before changing access or using the vault.

## Product references

- [Original discovery and vision](docs/MASTER_PROMPT.md)
- [Current design and interaction direction](docs/DESIGN_DIRECTION.md)
- [Implementation history](docs/PROGRESS.md)
- [Decisions](docs/DECISIONS.md)
- [Security and data boundaries](docs/SECURITY.md)

The pilot has one real owner. Sample records and colleagues were removed; synthetic fixtures remain only in tests. Google Calendar has an account connection and sync flow; other production connectors, live AI, real team permissions and client sharing remain future work. The existing Sites registration is retained; a code push does not publish the app.
