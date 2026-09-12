// Surface intents: Desk sentences that open a place instead of creating an
// entry. Deterministic like the rest of the interpreter — a name resolves
// only when it matches exactly one space; anything ambiguous falls through
// to ordinary interpretation and is kept as a note.
import type { Workspace } from './model';

export type SurfaceIntent =
  | {
      type: 'client-log';
      spaceId: string;
      spaceName: string;
      seed: string;
    }
  | { type: 'open-view'; view: string; label: string }
  | { type: 'open-space'; spaceId: string; spaceName: string }
  | { type: 'open-project'; projectId: string; projectName: string };

// Fixed view vocabulary; a view name always wins over a client that happens
// to share it, because the vocabulary is checked first and never ambiguous.
const views: { view: string; label: string; aliases: string[] }[] = [
  { view: 'desk', label: 'Desk', aliases: ['desk'] },
  { view: 'day', label: 'Today', aliases: ['today', 'day'] },
  { view: 'boards', label: 'Boards', aliases: ['boards', 'board'] },
  { view: 'spaces', label: 'Spaces', aliases: ['spaces', 'clients'] },
  { view: 'sales', label: 'Sales', aliases: ['sales', 'pipeline'] },
  { view: 'work', label: 'Projects', aliases: ['projects', 'work'] },
  { view: 'calendar', label: 'Calendar', aliases: ['calendar'] },
  { view: 'library', label: 'Library', aliases: ['library'] },
  { view: 'blueprints', label: 'Systems', aliases: ['systems', 'blueprints'] },
  { view: 'tools', label: 'Tools', aliases: ['tools'] },
  { view: 'insights', label: 'Insights', aliases: ['insights'] },
];

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

const OPEN = /^\s*(?:open|go to|show)\s+(.+?)\s*$/i;

function resolveProjectByName(
  data: { projects?: { id: string; name: string }[] },
  name: string,
) {
  const wanted = name.trim().toLowerCase();
  const projects = data.projects || [];
  if (!wanted) return null;
  const exact = projects.filter((p) => p.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const prefixed = projects.filter((p) =>
    p.name.toLowerCase().startsWith(wanted),
  );
  return prefixed.length === 1 ? prefixed[0] : null;
}

export function parseSurfaceIntent(
  text: string,
  data: Pick<Workspace, 'spaces'> & {
    projects?: { id: string; name: string }[];
  },
  options: { navigation?: boolean } = {},
): SurfaceIntent | null {
  const verb = LOG_WITH_VERB.exec(text);
  const bare = verb ? null : LOG_BARE.exec(text);
  const match = verb || bare;
  if (match) {
    const space = resolveSpaceByName(data, match[1]);
    if (space)
      return {
        type: 'client-log',
        spaceId: space.id,
        spaceName: space.name,
        seed: (verb ? verb[2] : '').trim(),
      };
    if (verb) return null;
  }
  if (!options.navigation) return null;
  const open = OPEN.exec(text);
  if (!open) return null;
  const wanted = open[1].toLowerCase();
  const view = views.find((v) => v.aliases.includes(wanted));
  if (view) return { type: 'open-view', view: view.view, label: view.label };
  const space = resolveSpaceByName(data, open[1]);
  if (space)
    return { type: 'open-space', spaceId: space.id, spaceName: space.name };
  const project = resolveProjectByName(data, open[1]);
  if (project)
    return {
      type: 'open-project',
      projectId: project.id,
      projectName: project.name,
    };
  return null;
}
