declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_TOKEN_KEY?: string;
    GOOGLE_REDIRECT_URI?: string;
  }
}
