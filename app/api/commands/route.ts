import { context } from '@/lib/store';
import { apiFailure, json } from '@/lib/api-safety';
import { commandCatalog } from '@/lib/command-catalog';
export const dynamic = 'force-dynamic';

// The machine-readable map of the mutation boundary, for any signed-in
// speaker: the Desk's palette, future scoped API callers, the assistant.
// Descriptors describe; the boundary validates and executes.
export async function GET() {
  try {
    await context();
    return json({
      commands: commandCatalog,
      note: 'Execute by POSTing { type: <name>, ...fields } to /api/workspace. The boundary validates every field; descriptors are documentation, not the validator.',
    });
  } catch (e) {
    return apiFailure(e);
  }
}
