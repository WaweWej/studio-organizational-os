// Calendar events link to clients when the client's name appears in the
// event title — the same kind of law the Desk speaks: deterministic,
// word-bounded, and refusing ambiguity. Matching runs at read time, so a
// client created after its meetings synced is linked the moment it
// exists. A manual link always wins; an ignored event is never relinked.
import { AppError } from './validation';

type SpaceRef = { id: string; name: string };
type EventRef = {
  id: string;
  title: string;
  spaceId: string;
  spaceLink: string;
};
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

// Link every unlinked event whose title names exactly one client. Patches
// the given rows in place so the response that triggered the pass already
// shows the links, and persists with a guard so a manual link set in the
// meantime is never overwritten.
export async function autoLinkCalendarEvents(
  c: Db & { org: string },
  events: EventRef[],
  spaces: SpaceRef[],
): Promise<number> {
  if (!spaces.length) return 0;
  const updates: { id: string; spaceId: string }[] = [];
  for (const event of events) {
    if (event.spaceId || event.spaceLink) continue;
    const space = matchSpaceInTitle(event.title, spaces);
    if (!space) continue;
    event.spaceId = space.id;
    event.spaceLink = 'auto';
    updates.push({ id: event.id, spaceId: space.id });
  }
  for (const update of updates) {
    await c.db
      .prepare(
        "UPDATE calendarEvents SET spaceId=?, spaceLink='auto' WHERE org=? AND id=? AND spaceId='' AND spaceLink=''",
      )
      .bind(update.spaceId, c.org, update.id)
      .run();
  }
  return updates.length;
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
