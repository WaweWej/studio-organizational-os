# The Studio API

Studio's mutation boundary is one endpoint speaking a cataloged command
vocabulary. Anything holding a scoped token — an integration, a script,
Viktor, an assistant — is an equal speaker of it: same validation, same
truthful errors, same history, stamped with its own provenance.

## Get a token

Systems → API access → Manage API access → name the token, pick scopes,
Mint. The secret (`studio_…`) is shown exactly once; Studio stores only a
hash. Revoke there any time — revocation is immediate.

Scopes are the catalog's command groups (`capture`, `tasks`, `projects`,
`clients`, `meetings`, `planning`, `calendar`, `sales`, `library`,
`access`), plus:

- `read` — reading the workspace.
- `destructive` — an extra lock that destructive commands (deletions,
  client removal) require **in addition** to their group.

Tokens can never mint or revoke tokens, whatever their scopes.

## Speak

Every call carries `Authorization: Bearer studio_…`.

**The map** — every command with its group, risk, and field shapes:

    curl https://<your-studio>/api/commands \
      -H "Authorization: Bearer $TOKEN"

**Read the workspace** (needs `read`):

    curl https://<your-studio>/api/workspace \
      -H "Authorization: Bearer $TOKEN"

**Execute a command** — POST `{ "type": <name>, ...fields }`:

    curl -X POST https://<your-studio>/api/workspace \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "type": "capture-entry",
        "kind": "note",
        "captureText": "Booking flow verified end to end",
        "captureDay": "2026-09-12",
        "captureId": "<a fresh uuid — retries with the same id are idempotent>",
        "contextSpace": "<space id>",
        "targetType": "space",
        "targetId": "<space id>",
        "pins": []
      }'

A successful mutation answers with the full updated workspace. A command
outside the token's scopes answers 403 with the reason spelled out
("This token is not scoped for clients commands."); an unknown or revoked
token answers 401.

## Conduct

Space ids come from the workspace read. Supply a fresh UUID as `captureId`
(and as `id` where the catalog marks it client-supplied) and reuse it on
retries — the boundary makes retries idempotent. Everything a token does
appears in history as `api:<token name>`.
