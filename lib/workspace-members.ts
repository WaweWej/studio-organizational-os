// Workspace membership. An invite is a row holding an email; the first
// allowlisted sign-in with that verified email claims it and lands in the
// inviting org as a named member. Identities without a membership keep
// their own org. Revocation is immediate and sends the person back to
// their own workspace, leaving their stamps in the history they made.
import { AppError } from './validation';

type Db = { db: D1Database };
type OwnerContext = Db & { org: string; actor: string };

export type MembershipRow = {
  org: string;
  id: string;
  email: string;
  userId: string;
  memberId: string;
  displayName: string;
  role: string;
  invitedBy: string;
  createdAt: string;
  acceptedAt: string;
  revokedAt: string;
};

const clean = (value: unknown) => (typeof value === 'string' ? value : '');

export function memberSlug(source: string) {
  const base = source
    .toLowerCase()
    .replace(/@.*$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'member';
}

// Resolve a signed-in identity to its workspace. Precedence: an accepted
// membership wins; otherwise a pending invite matching the verified email
// is claimed now; otherwise the identity's own org, as before.
export async function resolveMembership(
  c: Db,
  user: { userId: string; email: string; displayName: string },
): Promise<{ org: string; actor: string; name: string } | null> {
  const accepted = await c.db
    .prepare(
      "SELECT org,memberId,displayName FROM workspaceMembers WHERE userId=? AND revokedAt='' ORDER BY acceptedAt DESC LIMIT 1",
    )
    .bind(user.userId)
    .first<{ org: string; memberId: string; displayName: string }>();
  if (accepted)
    return {
      org: accepted.org,
      actor: accepted.memberId,
      name: accepted.displayName,
    };
  const email = user.email.trim().toLowerCase();
  if (!email) return null;
  const invite = await c.db
    .prepare(
      "SELECT org,id,memberId,displayName FROM workspaceMembers WHERE email=? AND userId='' AND revokedAt='' ORDER BY createdAt ASC LIMIT 1",
    )
    .bind(email)
    .first<{ org: string; id: string; memberId: string; displayName: string }>();
  if (!invite) return null;
  const now = new Date().toISOString();
  const claimed = await c.db
    .prepare(
      "UPDATE workspaceMembers SET userId=?, acceptedAt=? WHERE org=? AND id=? AND userId='' AND revokedAt=''",
    )
    .bind(user.userId, now, invite.org, invite.id)
    .run();
  if (!claimed.meta.changes) return null;
  const name = invite.displayName || user.displayName;
  // The member appears in the workspace's own people list so assignment
  // and notices can address them. Color is derived, stable per member.
  const colors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
  let sum = 0;
  for (let i = 0; i < invite.memberId.length; i++)
    sum += invite.memberId.charCodeAt(i);
  const color = colors[sum % colors.length];
  await c.db
    .prepare(
      'INSERT OR IGNORE INTO members (org,id,name,role,color) VALUES (?,?,?,?,?)',
    )
    .bind(invite.org, invite.memberId, name, 'Member', color)
    .run();
  return { org: invite.org, actor: invite.memberId, name };
}

export async function inviteMember(
  c: OwnerContext,
  input: Record<string, unknown>,
) {
  if (c.actor.startsWith('api:'))
    throw new AppError('API tokens cannot manage the team. Sign in.', 403);
  const id = clean(input.id);
  const email = clean(input.email).trim().toLowerCase();
  const displayName = clean(input.name).trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError('Invite id is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError('A valid email address is required.');
  if (!displayName || displayName.length > 60)
    throw new AppError('Name the member (up to 60 characters).');
  const existing = await c.db
    .prepare(
      "SELECT id FROM workspaceMembers WHERE org=? AND email=? AND revokedAt=''",
    )
    .bind(c.org, email)
    .first();
  if (existing)
    throw new AppError(`${email} is already invited or a member.`, 409);
  let memberId = memberSlug(displayName || email);
  const taken = await c.db
    .prepare('SELECT id FROM members WHERE org=? AND id=?')
    .bind(c.org, memberId)
    .first();
  if (taken) memberId = memberId + '-' + id.slice(0, 4);
  await c.db
    .prepare(
      'INSERT INTO workspaceMembers (org,id,email,memberId,displayName,role,invitedBy,createdAt) VALUES (?,?,?,?,?,?,?,?)',
    )
    .bind(
      c.org,
      id,
      email,
      memberId,
      displayName,
      'member',
      c.actor,
      new Date().toISOString(),
    )
    .run();
}

export async function revokeMember(
  c: OwnerContext,
  input: Record<string, unknown>,
) {
  if (c.actor.startsWith('api:'))
    throw new AppError('API tokens cannot manage the team. Sign in.', 403);
  const id = clean(input.id);
  const row = await c.db
    .prepare(
      "SELECT memberId FROM workspaceMembers WHERE org=? AND id=? AND revokedAt=''",
    )
    .bind(c.org, id)
    .first<{ memberId: string }>();
  if (!row)
    throw new AppError('That member was not found or is already revoked.', 404);
  if (row.memberId === c.actor)
    throw new AppError('You cannot revoke your own access.', 400);
  await c.db
    .prepare('UPDATE workspaceMembers SET revokedAt=? WHERE org=? AND id=?')
    .bind(new Date().toISOString(), c.org, id)
    .run();
}

export async function listMemberships(c: Db & { org: string }) {
  const rows = await c.db
    .prepare(
      "SELECT id,email,userId,memberId,displayName,role,createdAt,acceptedAt FROM workspaceMembers WHERE org=? AND revokedAt='' ORDER BY createdAt ASC",
    )
    .bind(c.org)
    .all<MembershipRow>();
  return rows.results.map((row) => ({
    ...row,
    status: row.userId ? 'member' : 'invited',
  }));
}
