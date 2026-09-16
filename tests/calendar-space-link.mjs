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

const { matchSpaceInTitle, matchSpaceForEvent, autoLinkCalendarEvents, linkCalendarSpace } =
  await import('../lib/calendar-space-link.ts');

const spaces = [
  { id: 'good', name: 'Goodcompany' },
  { id: 'harbor', name: 'Harbor Coffee' },
  { id: 'harbor-hotel', name: 'Harbor Hotel' },
];

// The matching law: full name, word-bounded, case-insensitive, unique.
assert.equal(matchSpaceInTitle('Møde med Goodcompany kl 10', spaces)?.id, 'good');
assert.equal(matchSpaceInTitle('goodcompany onboarding', spaces)?.id, 'good');
assert.equal(matchSpaceInTitle('Harbor Coffee tasting', spaces)?.id, 'harbor');
// "Harbor" alone is ambiguous between two clients: refused.
assert.equal(matchSpaceInTitle('Harbor status', spaces), null);
// Substrings inside words never match.
assert.equal(matchSpaceInTitle('Feelgoodcompanyism workshop', spaces), null);
assert.equal(matchSpaceInTitle('Team lunch', spaces), null);

// The full law: email decides first, exactly and case-insensitively.
const emailSpaces = [
  { id: 'good', name: 'Goodcompany', contactEmail: 'jens@goodcompany.dk' },
  { id: 'harbor', name: 'Harbor Coffee', contactEmail: '' },
];
assert.equal(
  matchSpaceForEvent(
    { title: 'Status', attendees: 'me@homeymedia.dk,Jens@GoodCompany.dk' },
    emailSpaces,
  )?.id,
  'good',
);
// Two clients sharing an address refuse.
assert.equal(
  matchSpaceForEvent(
    { title: 'Status', attendees: 'shared@x.dk' },
    [
      { id: 'a', name: 'A', contactEmail: 'shared@x.dk' },
      { id: 'b', name: 'B', contactEmail: 'shared@x.dk' },
    ],
  ),
  null,
);
// The name fallback applies only to clients with no email on file: an
// email on record declares how the client is recognized.
assert.equal(
  matchSpaceForEvent({ title: 'Harbor Coffee tasting', attendees: '' }, emailSpaces)
    ?.id,
  'harbor',
);
assert.equal(
  matchSpaceForEvent({ title: 'Goodcompany kickoff', attendees: '' }, emailSpaces),
  null,
);

// Read-time auto-linking: persists, patches rows in place, respects
// manual and ignored links.
const { db } = testDatabase();
const org = 'org-a';
const insert = async (id, title, spaceId = '', spaceLink = '') =>
  db
    .prepare(
      "INSERT INTO calendarEvents (org,id,title,kind,date,time,description,spaceId,spaceLink,revision,archived,actor,createdAt,updatedAt,fingerprint,lastMutation) VALUES (?,?,?,?,?,?,?,?,?,0,0,'me','2026-09-13','2026-09-13','f','n')",
    )
    .bind(org, id, title, 'meeting', '2026-09-14', '10:00', '', spaceId, spaceLink)
    .run();
const spaceCols = "org,id,name,type,color,brief,owner,meeting,tagline,wants,needs,audience,voice,website,coverUrl,logoUrl,brandStyle,revision,lastMutation";
await db
  .prepare(
    `INSERT INTO spaces (${spaceCols}) VALUES (?,?,?,'client','#000','','','','','','','','','','','','',0,'n')`,
  )
  .bind(org, 'good', 'Goodcompany')
  .run();

await insert('e1', 'Møde med Goodcompany');
await insert('e2', 'Team lunch');
await insert('e3', 'Goodcompany review', '', 'ignored');
await insert('e4', 'Goodcompany kickoff', 'other-space', 'manual');

const rows = (
  await db
    .prepare('SELECT id,title,spaceId,spaceLink FROM calendarEvents WHERE org=?')
    .bind(org)
    .all()
).results;
const linked = await autoLinkCalendarEvents(
  { db, org },
  rows,
  [{ id: 'good', name: 'Goodcompany' }],
);
assert.equal(linked, 1);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
assert.equal(byId.e1.spaceId, 'good');
assert.equal(byId.e1.spaceLink, 'auto');
assert.equal(byId.e2.spaceId, '');
assert.equal(byId.e3.spaceLink, 'ignored');
assert.equal(byId.e4.spaceId, 'other-space');
const persisted = await db
  .prepare('SELECT spaceId,spaceLink FROM calendarEvents WHERE org=? AND id=?')
  .bind(org, 'e1')
  .first();
assert.equal(persisted.spaceId, 'good');
assert.equal(persisted.spaceLink, 'auto');

// Manual linking wins; empty spaceId ignores the event thereafter.
await linkCalendarSpace({ db, org }, { id: 'e2', spaceId: 'good' });
assert.equal(
  (
    await db
      .prepare('SELECT spaceLink FROM calendarEvents WHERE org=? AND id=?')
      .bind(org, 'e2')
      .first()
  ).spaceLink,
  'manual',
);
await linkCalendarSpace({ db, org }, { id: 'e1', spaceId: '' });
const ignored = await db
  .prepare('SELECT spaceId,spaceLink FROM calendarEvents WHERE org=? AND id=?')
  .bind(org, 'e1')
  .first();
assert.equal(ignored.spaceId, '');
assert.equal(ignored.spaceLink, 'ignored');
await assert.rejects(
  linkCalendarSpace({ db, org }, { id: 'missing', spaceId: 'good' }),
  /not found/,
);
await assert.rejects(
  linkCalendarSpace({ db, org }, { id: 'e2', spaceId: 'missing' }),
  /client was not found/,
);

console.log(
  'PASS: calendar-client linking — email-first matching with shared-address refusal, name fallback only for clients without an email on file, word-bounded unique title matching, read-time auto-link persisting and patching in place, manual and ignored links respected through the boundary.',
);
