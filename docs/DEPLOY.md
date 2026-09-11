# Deploying Studio to your own Cloudflare account

Studio is built for the Cloudflare Workers runtime — D1 for the database, R2
for files — so it runs on a free Cloudflare account with a permanent URL you
own. GitHub deploys it automatically on every push once you complete the
one-time setup below (about ten minutes, all in your own browser; no secrets
ever pass through anyone else).

Free-tier headroom at a small agency's scale: 100,000 requests a day, a 5 GB
database, 10 GB of file storage, and sign-in for up to 50 people.

## One-time setup

1. **Create a Cloudflare account** at dash.cloudflare.com (free plan).

2. **Copy your Account ID.** Dashboard → Workers & Pages → the Account ID is
   in the right-hand column. If Cloudflare asks you to choose a `workers.dev`
   subdomain, pick one — it becomes part of your URL.

3. **Create an API token.** dash.cloudflare.com/profile/api-tokens → Create
   Token → Create Custom Token, with exactly these three permissions:
   - Account · Workers Scripts · Edit
   - Account · D1 · Edit
   - Account · Workers R2 Storage · Edit

   Copy the token once; Cloudflare will not show it again.

4. **Hand both to GitHub.** In this repository: Settings → Secrets and
   variables → Actions.
   - Secrets tab → New repository secret: name `CLOUDFLARE_API_TOKEN`,
     value the token.
   - Variables tab → New repository variable: name `CLOUDFLARE_ACCOUNT_ID`,
     value the account ID.

5. **Run the deploy.** Actions tab → "Deploy to Cloudflare" → Run workflow
   (afterwards it runs automatically on every push). The first run creates
   the `studio-d1` database and `studio-r2` bucket, applies all migrations,
   and deploys. The URL is `https://studio.<your-subdomain>.workers.dev`.

The workflow skips silently until the account variable exists, so the
repository stays green before setup.

## Turning on sign-in

Fresh deployments answer every request with "Sign in to access your
workspace" — the workspace fails closed until identity exists. Studio carries
its own sign-in: GitHub for you, Google for the team, both gated by explicit
allowlists. No Cloudflare Zero Trust plan (and no payment card) is required.

**GitHub sign-in (the owner):**

1. github.com → Settings → Developer settings → OAuth Apps → New OAuth App:
   - Application name: `Studio`
   - Homepage URL: `https://studio.<your-subdomain>.workers.dev`
   - Authorization callback URL:
     `https://studio.<your-subdomain>.workers.dev/api/auth/github/callback`
2. Register, then copy the **Client ID** and generate a **client secret**.
3. Cloudflare dashboard → Workers & Pages → studio → Settings → Variables and
   Secrets, add:
   - `STUDIO_GITHUB_CLIENT_ID` — the client ID (plain variable)
   - `STUDIO_GITHUB_CLIENT_SECRET` — the secret (type: Secret)
   - `STUDIO_ALLOWED_LOGINS` — GitHub usernames allowed in, comma-separated,
     e.g. `WaweWej`

**Google sign-in (the team):** uses the same Google OAuth app as the
Calendar/Drive connection — set it up once under "Connecting Google Calendar
and Drive" below, add
`https://studio.<your-subdomain>.workers.dev/api/auth/google/callback` as a
second authorized redirect URI, and add one more worker variable:

   - `STUDIO_ALLOWED_EMAILS` — exact addresses and/or whole domains,
     comma-separated, e.g. `gabriel@wawe.dk, @homeymedia.dk`

Visiting the URL now shows the sign-in page with a button per configured
provider. Google identities require a verified email; anyone outside the
allowlists is told so truthfully. Each signed-in identity gets its own
workspace, and sessions are signed with a key the app generates for itself —
deleting the `session` row in the `authKeys` table signs everyone out.

**Alternative:** deployments behind Cloudflare Access (Zero Trust) are also
supported — set `STUDIO_ACCESS_TEAM` and `STUDIO_ACCESS_AUD` and Studio
verifies the Access JWT instead. Note that enabling Zero Trust requires a
payment card on file with Cloudflare.

## Connecting Google Calendar and Drive

On the Google Cloud project that holds the Studio OS OAuth app:

1. Add `https://studio.<your-subdomain>.workers.dev/api/google-calendar/callback`
   as an authorized redirect URI, and enable the Google Calendar API and
   Google Drive API.
2. On the worker, add the four settings (mark the secret as Secret type):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (a fresh
   32-byte key: `openssl rand -base64 32`), and `GOOGLE_REDIRECT_URI` (the
   callback URL above).

## Connecting Slack

The six `STUDIO_SLACK_*` settings from docs/SLACK.md, with the Slack app's
request URL pointed at `https://studio.<your-subdomain>.workers.dev/api/slack`.

## Day to day

Pushes to the default branch deploy automatically. Data lives in the
`studio-d1` database (export a backup any time with
`npx wrangler d1 export studio-d1 --remote --output backup.sql`) and files in
the `studio-r2` bucket. The ChatGPT Sites deployment is unaffected and can
run in parallel; the two share code, never data.
