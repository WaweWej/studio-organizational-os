# Decisions

- 2026-09-05: Keep the master discovery brief in the parent workspace; build the app in `studio/` to preserve that file and keep the generated application isolated.
- Use the required Sites starter (Vinext/React/TypeScript) with D1 and platform sign-in for the first private pilot. Database access is confined to the server store, not UI components. This differs from the draft prompt's suggested PostgreSQL/Next.js default. The existing company server is not yet assessed; a self-hosted deployment will need a deliberate adapter/auth/runtime decision. Do not claim current Cloudflare-specific code is directly portable to that server.
- Private authenticated pilot identity receives an isolated organization dataset. The first build has one real owner and sample collaborators. Real multi-person membership/invitations are outstanding, not implied by the team board.
- Atomic D1 batches and per-record optimistic revisions protect task mutations. A unique mutation token gates dependent activity/review writes so failed concurrent edits cannot create false history.
- Reviews store the submitted content snapshot and version. Editing a reviewed deliverable supersedes that approval. Delivery is currently unconfigured; internal completion does not send anything.
- First UI has functional daily work, task context, notes, project templates, spaces, internal search, and reviews. Blueprint and analytics screens explicitly describe pending work.
