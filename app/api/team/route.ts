import { context } from '@/lib/store';
import { apiFailure, json } from '@/lib/api-safety';
import { AppError } from '@/lib/validation';
import { listMemberships } from '@/lib/workspace-members';
export const dynamic = 'force-dynamic';

// Team listing: session identities only. Invites and revocations go
// through the command boundary like every other mutation.
export async function GET() {
  try {
    const c = await context();
    if (c.tokenScopes)
      throw new AppError('API tokens cannot read the team. Sign in.', 403);
    return json({ members: await listMemberships(c) });
  } catch (e) {
    return apiFailure(e);
  }
}
