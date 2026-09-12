// Surface intents: Desk sentences that open a place instead of creating an
// entry. Deterministic like the rest of the interpreter — a name resolves
// only when it matches exactly one space; anything ambiguous falls through
// to ordinary interpretation and is kept as a note.
import type { Workspace } from './model';

export type SurfaceIntent = {
  type: 'client-log';
  spaceId: string;
  spaceName: string;
  seed: string;
};

const LOG_WITH_VERB =
  /^\s*(?:add\s+to|open|log\s+to)\s+(.+?)(?:['’]s)?\s+log\b\s*:?\s*([\s\S]*)$/i;
const LOG_BARE = /^\s*(.+?)(?:['’]s)?\s+log\s*$/i;

export function resolveSpaceByName(
  data: Pick<Workspace, 'spaces'>,
  name: string,
) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const spaces = data.spaces;
  const exact = spaces.filter((s) => s.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const prefixed = spaces.filter((s) =>
    s.name.toLowerCase().startsWith(wanted),
  );
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) return null;
  const worded = spaces.filter((s) =>
    s.name
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word === wanted),
  );
  return worded.length === 1 ? worded[0] : null;
}

export function parseSurfaceIntent(
  text: string,
  data: Pick<Workspace, 'spaces'>,
): SurfaceIntent | null {
  const verb = LOG_WITH_VERB.exec(text);
  const bare = verb ? null : LOG_BARE.exec(text);
  const match = verb || bare;
  if (!match) return null;
  const space = resolveSpaceByName(data, match[1]);
  if (!space) return null;
  return {
    type: 'client-log',
    spaceId: space.id,
    spaceName: space.name,
    seed: (verb ? verb[2] : '').trim(),
  };
}
