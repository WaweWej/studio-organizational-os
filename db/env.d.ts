declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_TOKEN_KEY?: string;
    GOOGLE_REDIRECT_URI?: string;
    STUDIO_SLACK_WEBHOOK_URL?: string;
    STUDIO_SLACK_ORG?: string;
    STUDIO_SLACK_BOT_TOKEN?: string;
    STUDIO_SLACK_CHANNEL?: string;
    STUDIO_SLACK_SIGNING_SECRET?: string;
    STUDIO_SLACK_USER_MAP?: string;
    STUDIO_SLACK_TIMEZONE?: string;
  }
}
