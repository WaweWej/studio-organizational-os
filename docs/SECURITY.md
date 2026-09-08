# Vault and file storage design

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
