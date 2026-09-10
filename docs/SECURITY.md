# Vault and file storage design

## Private hosting and initial transfer

Production uses Sites owner-only access plus dispatch-authenticated user IDs. The development fallback remains compiled out of production. D1 and R2 are bound to the existing site across deployments; deployments contain code and schema migrations, never local workspace state or credentials.

The initial maintenance transfer required a temporary secret key and Sites private API credential, bound to the exact existing organization verified after the owner's first sign-in. It never enabled identity-less access to ordinary workspace APIs. The transfer endpoint has since been removed from the application. Removing the environment settings alone did not disable the previously deployed handler, so removal of the route is the definitive closeout; do not rely on environment removal alone for maintenance access revocation.

The retained transfer library accepts only known tables and columns, remaps organization IDs while preserving record IDs/history, and refuses files/vault records. A guarded transaction checks that the target contains no work, imports all rows, and records a digest for retry deduplication. A failed import rolls back; a later differing import never overwrites existing work. Snapshots stay in ignored local work/backups with restricted file permissions. Reintroducing any transfer HTTP route requires a separately scoped operation; ordinary updates never import local data.


## Meeting notes and connections

Meeting creation, edits, task linking and legacy calendar attachment validate organization-scoped references and optimistic revisions. Task connections must match the meeting's prospect/client. A task can explicitly give context to an unconnected meeting. Creation/attachment/history use one guarded batch and a private fingerprint; calendar sources cannot be independently edited after linking. Meeting edits retain prior note/decision snapshots. Prospect conversion atomically transfers meeting/history client references, preserving record IDs and task/calendar links. Explicit client deletion also archives linked calendar sources. Notes and participants are ordinary workspace content, never vault secrets. First-capture and existing-meeting drafts use the same per-tab organization/member boundary as other drafts, with a seven-day recovery window; saved notes remain in D1.


## Daily work and draft recovery

Priority, waiting and scheduling commands restrict edits to the authenticated actor’s active tasks. Multi-task rescheduling validates every revision before any update and records history atomically. Planning dates do not rewrite deadlines. All tasks can complete without approval. Optional review requests validate another member in the same organization, notify that reviewer, and preserve the current deliverable or task brief as a version snapshot. Only the requested reviewer may record a decision. Completion atomically supersedes pending reviews and clears their unread request notices while retaining genuine prior decisions. Workspace notification results are scoped to the current recipient.

Capture drafts are stored in sessionStorage, keyed by server-provided organization/member identity. They recover within that tab for seven days, are not shared across tabs/devices, and are not suitable for credentials. File bodies and vault data never enter this cache. Captures retain retry IDs across reload. Browser storage failures retain the existing unsaved-change guard.

## Sales conversion boundaries

Stage changes never create clients. A separate sales-convert command requires Won, the current prospect revision, validated profile fields and an organization-scoped account lead. Confirmation, client creation/update and history are atomic; a private fingerprint deduplicates retries. Duplicate client names are rejected. Legacy linked clients require their current revision before profile updates. Converted prospects cannot be moved through the stage endpoint. Client removal clears the conversion link and marker atomically.

## Client lifecycle boundaries

Client removal and conversion are scoped to the authenticated organization and guarded by client revision. Removal receipts contain IDs, actor, action and timestamp only; dependent changes and removal commit atomically. Shared resource bodies are never deleted. Conversion preserves profile context in the destination prospect history and is refused when client meetings exist. The UI explicitly confirms removal of the profile and meeting history.

## Daily plan boundaries

Daily commitments validate all titles, dates/times, actor ownership, selected client/project consistency and referenced task revisions. New context, canonical tasks, history and receipts are written in one guarded batch. The webhook URL is server-only, restricted to hooks.slack.com over HTTPS with no redirects and bound to one configured organization. A plan's delivery claim prevents simultaneous posts; an unknown network outcome is not automatically repeated. Messages use Slack plain-text blocks so task text cannot create mentions or formatting instructions. `.dev.vars*` is ignored by Git. Tests use mocked Slack and an isolated local application/database; no production connection was enabled.

## Task and calendar changes · 10 September 2026

Archive, restore and delete are scoped to the authenticated organization and guarded by task revision. Deletion and dependent cleanup run in one atomic batch. Content-free task tombstones retain ID, actor, revision and time for retry safety; shared file bodies and source meeting/sales records are preserved. The board confirms permanent deletion. Archived tasks cannot be edited until restored.

Calendar records validate dates, times and revisions on the server. Changes and history are atomic. Existing client-meeting moves use the meeting command/history boundary. No external invitations or messages are sent. Sample cleanup was local only, targeted exact IDs and retained an ignored local backup. New workspaces seed only the owner; test fixtures are isolated from user data.

## Current scope

This is an implemented encryption prototype inside the private Studio pilot. It has not had an independent security assessment. The application currently has one real authenticated owner and sample team members; there is no real multi-user role or credential-sharing model yet. Local development has an explicitly development-only identity fallback. Do not expose the development server publicly.

Production use with agency credentials needs a reviewed membership/authorization model, a backup and recovery policy, operational monitoring, and a security review. The master passphrase must be set in the app, never in a chat, source file, environment file, or test fixture containing real secrets.

## Encryption

- The browser uses Web Crypto PBKDF2 with SHA-256, 600,000 iterations, and a fresh 16-byte random salt to derive a non-extractable AES-256-GCM key.
- Each encryption uses a new random 12-byte IV and a 128-bit authentication tag. Additional authenticated data binds the ciphertext to the vault ID, record ID, and format version.
- The server stores a salt, KDF parameters, encrypted verifier, and encrypted credential payloads. Username, password, login URL, and private notes are in that payload. Plaintext titles, public descriptions, and record connections remain searchable workspace metadata; the UI identifies these as public fields.
- Keys and decrypted credentials are held in browser memory only. They are not placed in localStorage, sessionStorage, ordinary workspace JSON, URLs, or application logs. Locking clears the session and unmounts decrypted editors. Locks occur on leaving the tab or five minutes without keyboard/pointer activity. Browsers do not offer guaranteed memory zeroization.
- Copying a credential is an explicit user action and places that value on the system clipboard; locking the app does not erase the clipboard.
- A forgotten master passphrase cannot currently be reset. Passphrase rotation, individual key wrapping for members, recovery keys, vault export/import, and access auditing remain future work.

Authenticated encryption follows the [OWASP Cryptographic Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html). PBKDF2 is chosen for native [Web Crypto support](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey); OWASP generally prefers Argon2id where available and documents the [600,000-iteration PBKDF2-HMAC-SHA-256 work factor](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). This is a documented implementation choice, not a claim of certification.

Encryption protects stored credential contents against a database-only disclosure. It cannot protect an unlocked browser against malicious same-origin application code, a compromised device, a malicious extension, or a server that replaces the application's JavaScript. Strong passphrases are essential because encrypted verifier data permits offline guessing after a database disclosure.

## Files and custom tools

R2 contains file bodies; D1 contains metadata and canonical associations. Every file read checks the authenticated organization and resource ID. Object keys are never returned in workspace JSON. Responses use no-store and nosniff. Uploaded content is not fetched from arbitrary remote URLs; links open directly in the browser.

Uploads are limited to 20 MB per file, with bounded request reads and client/server validation. Larger videos or live documents can be registered as HTTPS links. Raster images have authenticated previews. Other assets are downloaded as attachments; this deliberately includes SVG and HTML outside the tool runner. Uploads do not currently have malware scanning or file version history.

Self-contained HTML tools can run in an iframe sandbox permitting scripts, forms, and downloads, without same-origin, top navigation, or popups. An HTTP Content Security Policy independently applies that sandbox to the document. A tool receives no workspace data or vault secrets automatically. HTTPS scripts, styles, images, network calls, and form destinations are supported inside the isolated tool, so an untrusted tool can transmit information a user types into that tool. Authentication-dependent embedded systems should be registered as external links instead.

## Validation

`tests/resources.mjs` covers authenticated ciphertext round trips, wrong-password and tamper rejection, vault/record binding, fresh IVs, key non-extractability, absence of credentials in workspace responses, organization isolation, revision conflicts, safe URLs, R2 upload/download, tool response sandbox policy, and upload size limits. Tests use synthetic secrets and exact-ID cleanup. These checks do not constitute a penetration test or browser sandbox audit.

## Desk writes and upload retries

Desk task updates and project capture validate canonical destinations inside the authenticated organization. Optimistic task revisions and guarded atomic batches prevent stale captures from leaving receipts, notes or alerts behind. Review-related status changes call the existing review engine. The Desk does not send Slack messages, email, invitations or external deliveries.

Optional upload IDs are validated UUIDs. The server computes a digest covering file bytes, metadata and initial targets, stores only that digest in private object metadata, and rejects mismatched reuse. Each upload attempt uses an independent object key. Only the winning database record receives links; cleanup cannot delete another attempt’s committed object. Existing files retain authenticated download and sandbox handling. `tests/desk.mjs` exercises identical concurrent uploads, byte conflicts, organization isolation and download integrity without modifying vault settings.
