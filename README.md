# Studio

A creative organization OS: a quiet Desk for capturing intentions, branded client spaces, connected work and reviews, a shared calendar, sales, and a library of assets, templates and custom tools.

The product and engineering context travels with this repository. Codex reads [AGENTS.md](AGENTS.md); the accepted visual direction is in [docs/DESIGN_DIRECTION.md](docs/DESIGN_DIRECTION.md).

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

The GitHub default branch points to the original active Studio development branch, so a normal clone starts with the current work. No Cloudflare or AI API key is needed for the local sample workspace.

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

This repository shares the source, migrations, images and product context. Each fresh local clone creates its own sample workspace. Tasks and notes entered into a preview, uploaded files, encrypted vault entries and secrets stay in that preview's local `.wrangler/state` directory and are intentionally excluded from Git.

The existing computer's data is preserved. Use the same host through Remote if you need that data while developing elsewhere. Sharing live workspace data across independent computers requires a hosted application and a deliberate data transfer; that has not been enabled by sharing this repository. Unsaved browser drafts and this Codex transcript are not copied into Git.

## Commands

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

The first pilot has one real owner and sample team members. Live AI, production third-party connectors, real team permissions and client sharing remain future work. The existing Sites registration is retained; a code push does not publish the app.
