// Sales meetings booked through Cal.com become prospects. The law:
// a synced calendar event dated today or later, carrying Cal.com's
// signature in its description, linked to no client, yields the external
// attendee — every
// attendee that is not the signed-in person — and that attendee is
// matched to an existing prospect by contact email or created at stage
// New, with a provenance note on the prospect's timeline. Idempotent:
// the event is stamped with the prospect it produced and never
// processed twice; stamping it ignored through the boundary keeps it
// out for good. Deterministic throughout — no guessing beyond the
// stated rules.
import { AppError } from './validation';
import { prospectNameKey } from './sales-model';

type Db = { db: D1Database };
type Ctx = Db & { org: string; actor: string; email?: string };
type EventRow = {
  id: string;
  title: string;
  date: string;
  time: string;
  description?: string;
  attendees?: string;
  archived?: number;
  spaceId: string;
  spaceLink: string;
  prospectId: string;
  prospectLink: string;
};
type ProspectRow = {
  id: string;
  name: string;
  nameKey: string;
  owner: string;
  stage: string;
  contactEmail: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export function isCalcomEvent(event: Pick<EventRow, 'description'>): boolean {
  return /\bcal\.com\b/i.test(event.description || '');
}

// The external attendee: the first attendee address that is not the
// signed-in person's. Without a known own address nothing is decided.
export function externalAttendee(
  attendees: string,
  ownEmail: string,
): string | null {
  const own = ownEmail.trim().toLowerCase();
  if (!own) return null;
  for (const raw of attendees.split(',')) {
    const email = raw.trim().toLowerCase();
    if (email && email !== own) return email;
  }
  return null;
}

// A name for the prospect. Cal.com titles read "Type between A and B" or
// "Type with B"; the side that is not the signed-in person is preferred,
// decided by overlap with the email's local part when both sides are
// candidates. Failing every pattern, the email's local part serves,
// capitalized.
export function prospectNameFromEvent(
  title: string,
  email: string,
): string {
  const local = email.split('@')[0].replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const between = /\bbetween\s+(.+?)\s+and\s+(.+?)(?:\s*[|·(-]|$)/i.exec(
    title,
  );
  if (between) {
    const [a, b] = [between[1].trim(), between[2].trim()];
    const key = (value: string) =>
      value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const localKey = key(local);
    const aHit = localKey !== '' && key(a).includes(localKey);
    const bHit = localKey !== '' && key(b).includes(localKey);
    if (aHit && !bHit) return a;
    return b;
  }
  const withMatch = /\b(?:with|med)\s+(.+?)(?:\s*[|·(-]|$)/i.exec(title);
  if (withMatch) return withMatch[1].trim();
  if (!local) return email;
  return local
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Process undecided Cal.com events into the funnel. Patches the given
// rows and the prospects array in place so the triggering response
// already shows the result; persists in one batch; bounded per pass.
export async function autoProspectCalendarEvents(
  c: Ctx,
  events: EventRow[],
  prospects: ProspectRow[],
  limit = 20,
  today = new Date().toISOString().slice(0, 10),
): Promise<number> {
  const own = (c.email || '').trim().toLowerCase();
  if (!own) return 0;
  const statements: D1PreparedStatement[] = [];
  let produced = 0;
  const now = new Date().toISOString();
  for (const event of events) {
    if (produced >= limit) break;
    if (event.archived || event.spaceId || event.prospectLink) continue;
    // The funnel's New means upcoming: meetings already held stay history.
    if (event.date < today) continue;
    if (!isCalcomEvent(event)) continue;
    const email = externalAttendee(event.attendees || '', own);
    if (!email) continue;
    let prospect = prospects.find(
      (p) => p.contactEmail.toLowerCase() === email,
    );
    const provenance =
      'Sales meeting from the calendar: ' +
      event.title +
      ' · ' +
      event.date +
      (event.time ? ' ' + event.time : '');
    if (!prospect) {
      const name = prospectNameFromEvent(event.title, email);
      const nameKey = prospectNameKey(name);
      prospect = prospects.find((p) => p.nameKey === nameKey);
      if (prospect && !prospect.contactEmail) {
        prospect.contactEmail = email;
        statements.push(
          c.db
            .prepare(
              "UPDATE prospects SET contactEmail=?, updatedAt=? WHERE org=? AND id=? AND contactEmail=''",
            )
            .bind(email, now, c.org, prospect.id),
        );
      }
      if (!prospect) {
        prospect = {
          id: crypto.randomUUID(),
          name,
          nameKey,
          owner: c.actor,
          stage: 'New',
          contactEmail: email,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        prospects.push(prospect);
        statements.push(
          c.db
            .prepare(
              "INSERT INTO prospects (org,id,name,nameKey,owner,stage,contactEmail,revision,createdAt,updatedAt,lastMutation) VALUES (?,?,?,?,?,'New',?,0,?,?,?)",
            )
            .bind(
              c.org,
              prospect.id,
              name,
              nameKey,
              c.actor,
              email,
              now,
              now,
              crypto.randomUUID(),
            ),
        );
      }
    }
    statements.push(
      c.db
        .prepare(
          "INSERT INTO prospectEvents (org,id,prospectId,taskId,body,kind,actor,createdAt) SELECT ?,?,?,NULL,?,'context',?,? WHERE 1",
        )
        .bind(c.org, crypto.randomUUID(), prospect.id, provenance, c.actor, now),
    );
    event.prospectId = prospect.id;
    event.prospectLink = 'auto';
    statements.push(
      c.db
        .prepare(
          "UPDATE calendarEvents SET prospectId=?, prospectLink='auto' WHERE org=? AND id=? AND prospectLink=''",
        )
        .bind(prospect.id, c.org, event.id),
    );
    produced++;
  }
  if (statements.length) await c.db.batch(statements);
  return produced;
}

// Manual correction through the boundary: point the event at a prospect,
// or pass an empty prospectId to mark it ignored for good.
export async function linkCalendarProspect(
  c: Db & { org: string },
  input: Record<string, unknown>,
) {
  const id = typeof input.id === 'string' ? input.id : '';
  const prospectId =
    typeof input.prospectId === 'string' ? input.prospectId : '';
  if (!id) throw new AppError('Which calendar event?');
  const event = await c.db
    .prepare('SELECT id FROM calendarEvents WHERE org=? AND id=?')
    .bind(c.org, id)
    .first();
  if (!event) throw new AppError('That calendar event was not found.', 404);
  if (prospectId) {
    const prospect = await c.db
      .prepare('SELECT id FROM prospects WHERE org=? AND id=?')
      .bind(c.org, prospectId)
      .first();
    if (!prospect) throw new AppError('That prospect was not found.', 404);
    await c.db
      .prepare(
        "UPDATE calendarEvents SET prospectId=?, prospectLink='manual' WHERE org=? AND id=?",
      )
      .bind(prospectId, c.org, id)
      .run();
    return;
  }
  await c.db
    .prepare(
      "UPDATE calendarEvents SET prospectId='', prospectLink='ignored' WHERE org=? AND id=?",
    )
    .bind(c.org, id)
    .run();
}
