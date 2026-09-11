# Google Drive

Drive extends the same Google account connection Calendar uses. Drive owns the
bytes; Studio owns the canonical record of what a file is and what it belongs
to. Editing authority stays with the source: files open in Drive, and Studio
never mirrors or rewrites their content. A workspace without the connection
stores uploads in Studio storage exactly as before.

## Connecting

The Library shows a Drive strip whenever the Google configuration exists.
Connecting runs the existing Google account flow with two additional scopes:
`drive.file` for the folder tree and uploads Studio creates, and
`drive.readonly` for browsing and attaching existing files. Granted scopes are
recorded on the connection, so the strip and Systems report the truthful
level: uploads only, or uploads and browsing. Enable the Google Drive API on
the same Google Cloud project the Calendar connection uses; no new OAuth app
is needed.

## Uploads

Drag and drop anywhere files are accepted today — the Library, client spaces,
project capture. With Drive connected, assets and templates land in a
`Studio/<Client name>` folder in your Drive, resolved from what the file is
attached to (a client directly, or through its project or task); unassigned
files land in the `Studio` root. Tools stay in Studio storage because they are
served and executed here. Folder bookkeeping reconciles by searching before
creating, so lost responses and manual deletions never produce duplicate
folders, and a renamed client gets a folder under its new name.

Upload retries reuse the caller's upload ID against the canonical resource
record — never a second blind upload — and a lost database race deletes only
the file that same request created.

## Attaching existing files

With browsing granted, "Attach from Drive" in the Library searches your Drive
and links a chosen file as a resource on the current client or the shared
library. The resource records the Drive file, its metadata and a link that
opens in Drive. Attaching the same file again adds the missing connections
instead of creating a duplicate record.

## Local development

The local server reads runtime settings from a gitignored `.dev.vars` file
(KEY=VALUE lines). This is how the Google configuration reaches local
previews; production values live in the hosting settings.

## Verification

`tests/google-drive.mjs` covers scope gating, folder creation, caching and
reconciliation, tenant isolation, client renames, multipart upload shape and
the size cap, search escaping and folder filtering, and file lookup
validation. No external requests or real records are used.
