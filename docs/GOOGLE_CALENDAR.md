# Google Calendar

Calendar → Google Calendar offers account connection, calendar selection, the deadline time zone, Sync now, last successful sync, errors, and Disconnect. The Google OAuth app is internal to homeymedia.dk, as requested. It is registered as Studio OS in Google Cloud project `smiling-basis-508213-s0`; the web client is Studio OS web. Studio retains its existing private Sites/ChatGPT sign-in and owner-only access.

## What sync means

- Selected Google calendars are read into Studio for the past 90 days and next 366 days. Google expands recurring meetings and exceptions. All-day/multi-day entries retain their date span; timed entries display in the browser's time zone. A complete paginated response is required before missing events are removed from a snapshot. Cancelled and self-declined events are hidden.
- Google events open Studio's existing meeting-note pathway. Saving notes creates one canonical meeting and retains the source connection. Google schedule changes update that same meeting and history without replacing notes, decisions, participants, task links, or client/prospect relationships. Explicit prospect-to-client conversion preserves those records.
- Active Studio meetings, calendar events, task deadlines assigned to the owner, and project/manual deadlines are exported to a dedicated Google calendar named Studio. Completed, archived, removed, or unscheduled work is removed on the next successful sync. Restoring work creates a fresh remote event ID while preserving the Studio record. Retries reuse recorded event IDs.
- Editing authority stays with the source: edit Google meetings in Google and Studio work in Studio. This is import/export in both directions, not an arbitrary two-way field merge. Google-origin entries are not exported back. Notes, decisions, participants, task briefs and deliverables are never exported. No attendees or invitations are sent. Google copies contain the title, schedule, and a link to Studio.
- Date-only deadlines stay all day. Timed deadlines use the selected IANA time zone and a 15-minute marker; meetings/events without stored end times use one hour. Studio currently stores meeting starts only.

## Timing and limits

The visible Studio app requests a sync each minute, when returning to the tab, and after saving work. Sync now works on demand. The server throttles ordinary polls, serializes concurrent runs with a scoped lease, and retains visible errors without rolling back saved work. There is no independent background scheduler or public webhook: closing Studio pauses sync until it is opened again.

Select up to 10 calendars. Each imported calendar is bounded to 3,000 events and 40 pages; active exports are bounded to 1,000 per run. Large feeds report a failure instead of deleting unseen entries. Notes remain saved when a feed is disconnected or deselected. Disconnect erases the refresh token and stops Studio access, retaining source IDs and the Google Studio calendar. Google permission revocation is separately available in Google Account connections. Reconnect the same account to preserve calendar links and history.

## Setup and development

Production uses Sites runtime settings, never source:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` (secret)
- `GOOGLE_TOKEN_KEY` (secret; base64-encoded 32 random bytes)
- `GOOGLE_REDIRECT_URI`: `https://studio-organizational-os.gwej123.chatgpt.site/api/google-calendar/callback`

Enable Google Calendar API and allow that exact redirect on a Web application OAuth client. Local clones are deliberately unconfigured. For isolated integration development, use a separate test client with a localhost redirect and ignored `.dev.vars`; never point fixture tests at production. Keep the encryption key stable across deploys. Losing it requires reconnecting Google.

Scopes: `calendar.calendarlist.readonly`, `calendar.events.readonly`, and `calendar.app.created`. This is a separately consented account link, not Studio authentication. State is single-use, expires after ten minutes, and is bound to the authenticated organization/member and an HttpOnly browser cookie. PKCE protects the exchange. Refresh tokens and PKCE verifiers use AES-GCM with organization/member-bound associated data. Secrets never enter workspace JSON or browser storage. Requests use fixed Google origins, timeouts, bounded responses and no redirects. Provider error bodies and credentials are not logged.

Migration 0016 adds connection/export/state tables and calendar source metadata. Applied migrations are immutable. Import history and canonical meeting changes share a D1 transaction. Lost calendar-creation responses are reconciled by a unique description marker; uncertain creation is not blindly repeated.

Run `node --import ./tests/ts-loader.mjs tests/google-calendar.mjs` with Node 24. It uses isolated in-memory SQLite and mocked Google responses, never real calendars.

Primary references: [OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [scopes](https://developers.google.com/workspace/calendar/api/auth), [pagination and recurrence](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [event IDs and insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
