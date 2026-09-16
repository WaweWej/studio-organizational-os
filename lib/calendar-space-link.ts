// Calendar events link to clients when the client's name appears in the
// event title — the same kind of law the Desk speaks: deterministic,
// word-bounded, and refusing ambiguity. Matching runs at read time, so a
// client created after its meetings synced is linked the moment it
// exists. A manual link always wins; an ignored event is never relinked.
import { AppError } from './validation';

type SpaceRef = { id: string; name: string; contactEmail?: string };
type EventRef = {
  id: string;
  title: string;
  attendees?: string;
  archived?: number;
  spaceId: string;
  spaceLink: string;
};

type SpaceMatcher = { space: SpaceRef; email: string; pattern: RegExp | null };

// Compile each client's title pattern once; matching hundreds of events
// then costs regex tests, not regex constructions.
export function compileSpaceMatchers(spaces: SpaceRef[]): SpaceMatcher[] {
  return spaces.map((space) => {
    const name = space.name.trim();
    return {
      space,
      email: (space.contactEmail || '').trim().toLowerCase(),
      pattern: name
        ? new RegExp(
            '(?:^|[^\\p{L}\\p{N}])' +
              escape(name) +
              '(?:[^\\p{L}\\p{N}]|$)',
            'iu',
          )
        : null,
    };
  });
}
type Db = { db: D1Database };

const escape = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A space matches when its full name appears in the title with word
// boundaries on both sides, case-insensitively. Exactly one matching
// space links; none or several refuse.
export function matchSpaceInTitle(
  title: string,
  spaces: SpaceRef[],
): SpaceRef | null {
  const matches = spaces.filter((space) => {
    const name = space.name.trim();
    if (!name) return false;
    return new RegExp(
      '(?:^|[^\\p{L}\\p{N}])' + escape(name) + '(?:[^\\p{L}\\p{N}]|$)',
      'iu',
    ).test(title);
  });
  return matches.length === 1 ? matches[0] : null;
}

// The full law. Email decides first: a client whose contact email is
// among the event's attendees. Exact and case-insensitive; two clients
// sharing an address refuse. Only when no email decides does the name
// fallback apply, and only for clients with no email on file — an email
// on the client record is a declaration that email is how this client is
// recognized.
export function matchSpaceForEvent(
  event: Pick<EventRef, 'title' | 'attendees'>,
  spaces: SpaceRef[],
  compiled?: SpaceMatcher[],
): SpaceRef | null {
  const matchers = compiled || compileSpaceMatchers(spaces);
  const attendees = (event.attendees || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (attendees.length) {
    const byEmail = matchers.filter(
      (m) => m.email !== '' && attendees.includes(m.email),
    );
    if (byEmail.length === 1) return byEmail[0].space;
    if (byEmail.length > 1) return null;
  }
  const byTitle = matchers.filter(
    (m) => m.email === '' && m.pattern !== null && m.pattern.test(event.title),
  );
  return byTitle.length === 1 ? byTitle[0].space : null;
}

// A stable fingerprint of the client set as matching sees it: names and
// contact emails. When it changes — a client created, renamed, or given
// an email — previously unmatched events are re-decided; while it holds,
// a request does no matching work at all.
export function spaceSetHash(spaces: SpaceRef[]): string {
  const source = spaces
    .map((s) => s.id + '\u0000' + s.name + '\u0000' + (s.contactEmail || ''))
    .sort()
    .join('\u0001');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

// Link every undecided event whose title or attendees name exactly one
// client. Every verdict is remembered on the event: a match links it, a
// non-match is marked against the current client-set hash and skipped on
// every later read until the client set changes. Patches rows in place
// so the response that triggered the pass already shows the links, and
// persists in one batch with guards so manual links set in the meantime
// are never overwritten. Work per pass is bounded; the remainder is
// decided on subsequent reads.
export async function autoLinkCalendarEvents(
  c: Db & { org: string },
  events: EventRef[],
  spaces: SpaceRef[],
  limit = 50,
): Promise<number> {
  if (!spaces.length) return 0;
  const hash = spaceSetHash(spaces);
  const none = 'none:' + hash;
  const compiled = compileSpaceMatchers(spaces);
  const links: { id: string; spaceId: string }[] = [];
  const marks: string[] = [];
  for (const event of events) {
    if (event.spaceId || event.archived) continue;
    if (event.spaceLink && !event.spaceLink.startsWith('none:')) continue;
    if (event.spaceLink === none) continue;
    if (links.length + marks.length >= limit) break;
    const previous = event.spaceLink;
    const space = matchSpaceForEvent(event, spaces, compiled);
    if (space) {
      event.spaceId = space.id;
      event.spaceLink = 'auto';
      links.push({ id: event.id, spaceId: space.id });
    } else {
      event.spaceLink = none;
      if (previous !== none) marks.push(event.id);
    }
  }
  const statements = [
    ...links.map((link) =>
      c.db
        .prepare(
          "UPDATE calendarEvents SET spaceId=?, spaceLink='auto' WHERE org=? AND id=? AND spaceId='' AND (spaceLink='' OR spaceLink LIKE 'none:%')",
        )
        .bind(link.spaceId, c.org, link.id),
    ),
    ...marks.map((id) =>
      c.db
        .prepare(
          "UPDATE calendarEvents SET spaceLink=? WHERE org=? AND id=? AND spaceId='' AND (spaceLink='' OR spaceLink LIKE 'none:%')",
        )
        .bind(none, c.org, id),
    ),
  ];
  if (statements.length) await c.db.batch(statements);
  return links.length;
}

// Manual linking through the boundary. An empty spaceId marks the event
// ignored so automatic matching leaves it alone.
export async function linkCalendarSpace(
  c: Db & { org: string },
  input: Record<string, unknown>,
) {
  const id = typeof input.id === 'string' ? input.id : '';
  const spaceId = typeof input.spaceId === 'string' ? input.spaceId : '';
  if (!id) throw new AppError('Which calendar event?');
  const event = await c.db
    .prepare('SELECT id FROM calendarEvents WHERE org=? AND id=?')
    .bind(c.org, id)
    .first();
  if (!event) throw new AppError('That calendar event was not found.', 404);
  if (spaceId) {
    const space = await c.db
      .prepare('SELECT id FROM spaces WHERE org=? AND id=?')
      .bind(c.org, spaceId)
      .first();
    if (!space) throw new AppError('That client was not found.', 404);
    await c.db
      .prepare(
        "UPDATE calendarEvents SET spaceId=?, spaceLink='manual' WHERE org=? AND id=?",
      )
      .bind(spaceId, c.org, id)
      .run();
    return;
  }
  await c.db
    .prepare(
      "UPDATE calendarEvents SET spaceId='', spaceLink='ignored' WHERE org=? AND id=?",
    )
    .bind(c.org, id)
    .run();
}
