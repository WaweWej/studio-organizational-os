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
workspace" — the workspace fails closed until identity exists. Identity comes
from Cloudflare Access (free for up to 50 users):

1. one.dash.cloudflare.com → complete the short Zero Trust onboarding and
   choose a team name — note it, it is your `<team>` below.
2. Access → Applications → Add an application → Self-hosted. Application
   domain: `studio.<your-subdomain>.workers.dev`. Add a policy that allows
   your email address (and teammates' as needed). Save.
3. On the application's overview, copy the **Application Audience (AUD)
   tag**.
4. Dashboard → Workers & Pages → studio → Settings → Variables and Secrets,
   add two variables:
   - `STUDIO_ACCESS_TEAM` — your team name (the `<team>` of
     `<team>.cloudflareaccess.com`)
   - `STUDIO_ACCESS_AUD` — the audience tag

Visiting the URL now shows Cloudflare's sign-in, and Studio verifies the
signed identity cryptographically on every request — audience, issuer,
expiry, and signature against your team's published keys. Each signed-in
email gets its own workspace.

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
