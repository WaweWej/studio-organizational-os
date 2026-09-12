# Change notes — September 2026, for the next agent

Written for whichever agent works here next (ChatGPT 6 / Codex, Claude, or
another). Everything below is committed, tested, and live. Fuller narrative
per change: docs/PROGRESS.md. Deployment runbook: docs/DEPLOY.md.

## The repository now deploys to two homes

The ChatGPT Sites deployment is untouched and keeps working exactly as
before. Additionally, pushes to the default branch auto-deploy to the
owner's own Cloudflare account via `.github/workflows/deploy.yml` (worker
`studio`, database `studio-d1`, currently no R2). The workflow provisions
what is missing, detects whether the account has R2 (error 10042), patches
the built `dist/server/wrangler.json` through `scripts/prepare-deploy.mjs`,
applies migrations, and deploys.

Two hard-won rules about that pipeline — do not undo them:

- `wrangler deploy` runs with `--keep-vars`. Without it, every deploy
  replaces dashboard-set worker variables with the artifact's empty set and
  silently erases the owner's settings (secrets survive, plain variables do
  not). This caused a long, confusing breakage.
- Never pass `redirect: 'error'` to fetch anywhere. Production workerd
  refuses it outright ("must be one of follow or manual") before any network
  I/O, so code using it fails only in production while mocked tests and
  local dev pass. All outbound calls (Google, Slack, daily plan) now use
  `redirect: 'manual'`, and the Google wrapper refuses 3xx explicitly. This
  bug meant the Google integration had never worked on real Workers,
  including (presumably) under Sites.

## Identity: three ways in, one fallback chain

`context()` resolves the user as: ChatGPT Sites auth → Cloudflare Access JWT
(`lib/access-auth.ts`, when STUDIO_ACCESS_TEAM/AUD are set) → the app's own
session (`lib/session.ts` + `lib/login-auth.ts`) → local dev fallback.
Preserve this order; Sites keeps working because its branch runs first.

The app's own sign-in (migration 0021, `authKeys` table): GitHub OAuth for
the owner (STUDIO_GITHUB_CLIENT_ID/SECRET + STUDIO_ALLOWED_LOGINS) and
Google OAuth for the team (reuses GOOGLE_CLIENT_ID/SECRET +
STUDIO_ALLOWED_EMAILS, where entries starting with `@` admit a whole
domain). Sessions are HMAC-signed cookies keyed by a secret the app
generates for itself in `authKeys`; deleting the `session` row signs
everyone out. `/signin` offers exactly the configured providers; routes live
under `app/api/auth/*`; tests in `tests/login-auth.mjs`.

## Storage: R2 is optional now

`lib/file-store.ts` presents put/head/get/delete over R2 when the ASSETS
binding exists, otherwise over the database (`fileBlobs`, migration 0020,
1 MB cap with a truthful refusal pointing at Google Drive). The files route
uses the store, never `env.ASSETS` directly. `env.d.ts` types ASSETS as
optional. Tests in `tests/file-store.mjs`.

## Google connection: hardened and self-diagnosing

- Config values are trimmed at every entry (`cleanGoogleConfig`); pasted
  whitespace must never differ between our validation and Google's.
- The OAuth token endpoint's error code (invalid_client,
  redirect_uri_mismatch, invalid_grant) is surfaced as truthful guidance;
  other Google requests still discard response bodies. Generic failures name
  the HTTP status; the callback logs exceptions (never tokens).
- `GET /api/google-calendar?action=diagnose` (signed-in) reports config
  shapes, token-key crypto round-trip, and live reachability of Google's
  endpoints, probing with deliberately invalid grants. Use it before
  guessing.

## Also new since August

Slack integration behind six STUDIO_SLACK_* settings (docs/SLACK.md);
Google Drive as the file home with per-client folders (docs/GOOGLE_DRIVE.md);
explicit client creation with an idempotent client-create command; recurring
tasks and client meeting rhythms (`lib/recurrence.ts`, migration 0019);
nightly database backups (`.github/workflows/backup.yml`, 90-day
artifacts — keep the repository private so backups stay private).

## Known debt

`tests/resources.mjs` and `tests/context-sales.mjs` fail on pristine
checkouts (legacy fixture and date drift, predating September); the client
build emits a chunk-size warning. Client deletion detaches projects, which
then read as "Internal" — open product question.

## Direction

The next planned construction is the assistant layer: AI as an additional
speaker of the existing validated command boundary (never direct database
access), bring-your-own provider keys sealed like Google tokens, proposal
cards with explicit approval before any write. Nothing of it is built yet;
when building it, keep the Desk's deterministic interpreter untouched.
