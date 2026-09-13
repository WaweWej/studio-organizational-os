import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { testDatabase } from './sqlite-context.mjs';

registerHooks({
  resolve(specifier, ctx, next) {
    if (specifier.startsWith('@/'))
      return next(
        pathToFileURL(resolve(specifier.replace('@/', ''))).href,
        ctx,
      );
    return next(specifier, ctx);
  },
});

const { resolveMembership, inviteMember, revokeMember, listMemberships, memberSlug } =
  await import('../lib/workspace-members.ts');

const { db } = testDatabase();
const owner = { db, org: 'owner-org', actor: 'me' };

// A stranger with no membership stays in their own org.
assert.equal(
  await resolveMembership(
    { db },
    { userId: 'google:1', email: 'maja@homeymedia.dk', displayName: 'Maja' },
  ),
  null,
);

// The owner invites Maja.
const inviteId = '11111111-1111-4111-8111-111111111111';
await inviteMember(owner, {
  id: inviteId,
  email: 'Maja@HomeyMedia.dk',
  name: 'Maja',
});
let team = await listMemberships(owner);
assert.equal(team.length, 1);
assert.equal(team[0].status, 'invited');
assert.equal(team[0].email, 'maja@homeymedia.dk');
assert.equal(team[0].memberId, 'maja');

// Inviting the same address twice is refused.
await assert.rejects(
  inviteMember(owner, {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'maja@homeymedia.dk',
    name: 'Maja again',
  }),
  /already invited/,
);

// Maja signs in: her verified email claims the invite and she lands in
// the owner's org as herself.
const landed = await resolveMembership(
  { db },
  { userId: 'google:maja', email: 'MAJA@homeymedia.dk', displayName: 'M. H.' },
);
assert.deepEqual(landed, { org: 'owner-org', actor: 'maja', name: 'Maja' });
team = await listMemberships(owner);
assert.equal(team[0].status, 'member');

// She appears in the workspace's people list for assignment.
const person = await db
  .prepare('SELECT name FROM members WHERE org=? AND id=?')
  .bind('owner-org', 'maja')
  .first();
assert.equal(person?.name, 'Maja');

// Her next sign-in resolves by identity, not by claiming.
const again = await resolveMembership(
  { db },
  { userId: 'google:maja', email: '', displayName: '' },
);
assert.equal(again?.org, 'owner-org');
assert.equal(again?.actor, 'maja');

// API-token actors cannot manage the team.
await assert.rejects(
  inviteMember(
    { db, org: 'owner-org', actor: 'api:Viktor' },
    { id: '33333333-3333-4333-8333-333333333333', email: 'x@y.dk', name: 'X' },
  ),
  /Sign in/,
);
await assert.rejects(
  revokeMember({ db, org: 'owner-org', actor: 'api:Viktor' }, { id: inviteId }),
  /Sign in/,
);

// Members cannot revoke themselves.
await assert.rejects(
  revokeMember({ db, org: 'owner-org', actor: 'maja' }, { id: inviteId }),
  /your own access/,
);

// The owner revokes Maja: immediate, and she is back in her own org.
await revokeMember(owner, { id: inviteId });
assert.equal((await listMemberships(owner)).length, 0);
assert.equal(
  await resolveMembership(
    { db },
    { userId: 'google:maja', email: 'maja@homeymedia.dk', displayName: 'Maja' },
  ),
  null,
);
await assert.rejects(revokeMember(owner, { id: inviteId }), /not found/);

// Slugs are readable and safe.
assert.match(memberSlug('Søren Ørsted'), /^[a-z0-9-]+$/);
assert.equal(memberSlug('viktor@homeymedia.dk'), 'viktor');

console.log(
  'PASS: workspace membership — invite, email claim on sign-in, member landing, people-list registration, duplicate and token refusals, self-revoke block, immediate revocation.',
);
