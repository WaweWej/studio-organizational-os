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

const {
  isCalcomEvent,
  externalAttendee,
  prospectNameFromEvent,
  autoProspectCalendarEvents,
  linkCalendarProspect,
} = await import('../lib/calendar-prospects.ts');

// Recognition: the Cal.com signature lives in the description.
assert.equal(isCalcomEvent({ description: 'Reschedule: https://cal.com/x' }), true);
assert.equal(isCalcomEvent({ description: 'https://app.cal.com/booking/y' }), true);
assert.equal(isCalcomEvent({ description: 'Ordinary meeting' }), false);
assert.equal(isCalcomEvent({ description: 'local.communication notes' }), false);

// The external attendee is everyone but the signed-in person; without a
// known own address nothing is decided.
assert.equal(
  externalAttendee('gabriel@wawe.dk,jens@firma.dk', 'gabriel@wawe.dk'),
  'jens@firma.dk',
);
assert.equal(externalAttendee('gabriel@wawe.dk', 'gabriel@wawe.dk'), null);
assert.equal(externalAttendee('a@b.dk,c@d.dk', ''), null);

// Names from Cal.com title shapes.
assert.equal(
  prospectNameFromEvent(
    'Salgsmøde between Gabriel Elung-Jensen and Jens Hansen',
    'jens@firma.dk',
  ),
  'Jens Hansen',
);
assert.equal(
  prospectNameFromEvent(
    'Intro between Jens Hansen and Gabriel Elung-Jensen',
    'jens.hansen@firma.dk',
  ),
  'Jens Hansen',
);
assert.equal(
  prospectNameFromEvent('30 min with Mette Friis', 'mette@firma.dk'),
  'Mette Friis',
);
assert.equal(
  prospectNameFromEvent('Opfølgning', 'lars.holm@firma.dk'),
  'Lars Holm',
);

// The pipeline: creation at New with provenance, idempotency, client-link
// and ignored exclusions, and email matching to existing prospects.
const { db } = testDatabase();
const org = 'org-sales';
const ctx = { db, org, actor: 'me', email: 'gabriel@wawe.dk' };
const day = (offset) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const future = day(2);
const past = day(-2);
const insertEvent = (id, title, description, attendees, extra = {}) =>
  db
    .prepare(
      "INSERT INTO calendarEvents (org,id,title,kind,date,time,description,attendees,spaceId,spaceLink,prospectId,prospectLink,revision,archived,actor,createdAt,updatedAt,fingerprint,lastMutation) VALUES (?,?,?,'meeting',?,?,?,?,?,?,?,?,0,?,'me','2026-09-16','2026-09-16','f','n')",
    )
    .bind(
      org,
      id,
      title,
      extra.date || future,
      extra.time || '10:00',
      description,
      attendees,
      extra.spaceId || '',
      extra.spaceLink || '',
      '',
      extra.prospectLink || '',
      extra.archived || 0,
    )
    .run();

await insertEvent(
  's1',
  'Salgsmøde between Gabriel Elung-Jensen and Jens Hansen',
  'Need changes? https://cal.com/reschedule/abc',
  'gabriel@wawe.dk,jens@firma.dk',
);
await insertEvent('s2', 'Ordinary sync', 'No signature here', 'gabriel@wawe.dk,x@y.dk');
await insertEvent(
  's3',
  'Client checkin',
  'https://cal.com/x',
  'gabriel@wawe.dk,klient@kunde.dk',
  { spaceId: 'space-1', spaceLink: 'auto' },
);
await insertEvent(
  's4',
  'Skip me between Gabriel and Bo',
  'https://cal.com/y',
  'gabriel@wawe.dk,bo@firma.dk',
  { prospectLink: 'ignored' },
);
// Meetings already held stay history: a past Cal.com meeting never
// prospects.
await insertEvent(
  's0',
  'Old salgsmøde between Gabriel Elung-Jensen and Per Gammel',
  'https://cal.com/old',
  'gabriel@wawe.dk,per@gammel.dk',
  { date: past },
);

const readEvents = async () =>
  (
    await db
      .prepare(
        'SELECT id,title,date,time,description,attendees,archived,spaceId,spaceLink,prospectId,prospectLink FROM calendarEvents WHERE org=? ORDER BY id',
      )
      .bind(org)
      .all()
  ).results;
const readProspects = async () =>
  (
    await db
      .prepare(
        'SELECT id,name,nameKey,owner,stage,contactEmail,revision,createdAt,updatedAt FROM prospects WHERE org=? ORDER BY createdAt',
      )
      .bind(org)
      .all()
  ).results;

let events = await readEvents();
let prospects = await readProspects();
assert.equal(
  await autoProspectCalendarEvents(ctx, events, prospects),
  1,
);
assert.equal(prospects.length, 1);
assert.equal(prospects[0].name, 'Jens Hansen');
assert.equal(prospects[0].stage, 'New');
assert.equal(prospects[0].contactEmail, 'jens@firma.dk');
const s1 = events.find((e) => e.id === 's1');
assert.equal(s1.prospectLink, 'auto');
assert.equal(s1.prospectId, prospects[0].id);
assert.equal(events.find((e) => e.id === 's2').prospectLink, '');
assert.equal(events.find((e) => e.id === 's0').prospectLink, '');
assert.equal(prospects.some((p) => p.name === 'Per Gammel'), false);
assert.equal(events.find((e) => e.id === 's3').prospectId, '');
assert.equal(events.find((e) => e.id === 's4').prospectLink, 'ignored');
const provenance = (
  await db
    .prepare('SELECT body,kind FROM prospectEvents WHERE org=? AND prospectId=?')
    .bind(org, prospects[0].id)
    .all()
).results;
assert.equal(provenance.length, 1);
assert.match(provenance[0].body, /Sales meeting from the calendar/);
assert.match(provenance[0].body, new RegExp(future + ' 10:00'));

// Idempotent: the second pass over fresh rows creates and stamps nothing.
events = await readEvents();
prospects = await readProspects();
assert.equal(await autoProspectCalendarEvents(ctx, events, prospects), 0);
assert.equal((await readProspects()).length, 1);

// A second meeting with the same address matches by email — one
// prospect, two provenance notes.
await insertEvent(
  's5',
  'Opfølgning between Gabriel Elung-Jensen and Jens Hansen',
  'https://cal.com/z',
  'gabriel@wawe.dk,jens@firma.dk',
  { date: day(9) },
);
events = await readEvents();
prospects = await readProspects();
assert.equal(await autoProspectCalendarEvents(ctx, events, prospects), 1);
assert.equal((await readProspects()).length, 1);
assert.equal(
  (
    await db
      .prepare('SELECT COUNT(*) AS n FROM prospectEvents WHERE org=? AND prospectId=?')
      .bind(org, prospects[0].id)
      .first()
  ).n,
  2,
);

// Without a known own email, nothing is decided.
assert.equal(
  await autoProspectCalendarEvents(
    { db, org, actor: 'api:Viktor' },
    await readEvents(),
    await readProspects(),
  ),
  0,
);

// The boundary correction: ignore an event for good; relink manually.
await linkCalendarProspect({ db, org }, { id: 's2', prospectId: '' });
assert.equal(
  (await readEvents()).find((e) => e.id === 's2').prospectLink,
  'ignored',
);
await linkCalendarProspect(
  { db, org },
  { id: 's2', prospectId: prospects[0].id },
);
assert.equal(
  (await readEvents()).find((e) => e.id === 's2').prospectLink,
  'manual',
);
await assert.rejects(
  linkCalendarProspect({ db, org }, { id: 's2', prospectId: 'missing' }),
  /not found/,
);

// The delete power: through the boundary, the ticket goes, its timeline
// goes, tasks detach, and the source meetings are marked ignored so the
// automation never resurrects it.
{
  const { deleteProspect } = await import('../lib/prospect-delete.ts');
  const target = (await readProspects())[0];
  await db
    .prepare(
      "INSERT INTO tasks (org,id,title,stage,assignee,reviewer,description,due,priority,blocked,deliverable,delivery,version,position,revision,archived,updatedAt,lastMutation,prospectId) VALUES (?,?,?,'Up next','me','','','','',0,'','',0,0,0,0,'t','n',?)",
    )
    .bind(org, 'task-p', 'Follow up', target.id)
    .run();
  await deleteProspect({ db, org }, { id: target.id });
  assert.equal(
    (await readProspects()).some((p) => p.id === target.id),
    false,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) n FROM prospectEvents WHERE org=? AND prospectId=?')
        .bind(org, target.id)
        .first()
    ).n,
    0,
  );
  assert.equal(
    (
      await db
        .prepare('SELECT prospectId FROM tasks WHERE org=? AND id=?')
        .bind(org, 'task-p')
        .first()
    ).prospectId,
    null,
  );
  const sources = (
    await db
      .prepare('SELECT id,prospectLink FROM calendarEvents WHERE org=? AND prospectLink=?')
      .bind(org, 'auto')
      .all()
  ).results;
  assert.equal(sources.length, 0);
  // And the automation finds nothing to resurrect.
  assert.equal(
    await autoProspectCalendarEvents(ctx, await readEvents(), await readProspects()),
    0,
  );
  await assert.rejects(
    deleteProspect({ db, org }, { id: target.id }),
    /not found/,
  );
}

console.log(
  'PASS: calendar sales prospecting — upcoming-only floor with past meetings excluded, Cal.com recognition, external attendee against the signed-in address, title name parsing, creation at New with timeline provenance, email matching to one prospect across meetings, idempotency, client-linked and ignored exclusions, boundary corrections, and deletion that detaches tasks, clears the timeline, and ignores source meetings against resurrection.',
);
