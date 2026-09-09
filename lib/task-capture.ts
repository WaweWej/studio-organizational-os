import type { Workspace } from './model';
export type CaptureMention = {
  start: number;
  end: number;
  kind: 'space' | 'project' | 'date';
  id: string;
  label: string;
};
export type MentionOption = {
  kind: CaptureMention['kind'];
  id: string;
  label: string;
  detail: string;
  color?: string;
};
type Catalog = Pick<Workspace, 'spaces' | 'projects'>;
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const normal = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
export function captureDate(raw: string, now = new Date()): string | null {
  const value = raw.toLowerCase();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (['today', 'tomorrow', 'nextweek'].includes(value)) {
    date.setDate(
      date.getDate() +
        (value === 'tomorrow' ? 1 : value === 'nextweek' ? 7 : 0),
    );
    return dayKey(date);
  }
  let day: number, month: number, year: number;
  let explicit = false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [year, month, day] = value.split('-').map(Number);
    explicit = true;
  } else if (/^\d{1,2}\/\d{1,2}(?:\/\d{4})?$/.test(value)) {
    const parts = value.split('/').map(Number);
    [day, month] = parts;
    year = parts[2] ?? date.getFullYear();
    explicit = parts.length === 3;
  } else return null;
  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const valid = (y: number) => {
    const d = new Date(y, month - 1, day, 12);
    return d.getFullYear() === y &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
      ? dayKey(d)
      : null;
  };
  if (explicit) return valid(year);
  // A yearless day/month means its next occurrence, including leap days.
  for (let y = year; y <= Math.min(year + 8, 9999); y++) {
    const key = valid(y);
    if (key && key >= dayKey(date)) return key;
  }
  return null;
}
export function displayCaptureDate(key: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(key + 'T12:00:00'));
}
export function mentionCatalog(data: Catalog): MentionOption[] {
  return [
    ...data.spaces.map((s) => ({
      kind: 'space' as const,
      id: s.id,
      label: s.name,
      detail: s.type,
      color: s.color,
    })),
    ...data.projects.map((p) => ({
      kind: 'project' as const,
      id: p.id,
      label: p.name,
      detail:
        data.spaces.find((s) => s.id === p.spaceId)?.name || 'Internal project',
      color: data.spaces.find((s) => s.id === p.spaceId)?.color,
    })),
  ];
}
function aliases(option: MentionOption) {
  return Array.from(
    new Set([
      option.label,
      option.id,
      normal(option.label),
      option.label.replace(/\s+/g, '-'),
      option.label.replace(/\s+/g, ''),
      option.label.replace(/&/g, 'and'),
    ]),
  ).sort((a, b) => b.length - a.length);
}
export function parseCapture(
  text: string,
  data: Catalog,
  options: {
    now?: Date;
    projectId?: string | null;
    pins?: CaptureMention[];
  } = {},
) {
  const now = options.now || new Date(),
    catalog = mentionCatalog(data),
    mentions: CaptureMention[] = [],
    errors: string[] = [];
  const starts = Array.from(
    text.matchAll(/(?:^|[\s(])@/g),
    (m) => (m.index ?? 0) + m[0].length - 1,
  );
  for (const start of starts) {
    if (mentions.some((m) => start < m.end)) continue;
    const pin = options.pins?.find(
      (p) =>
        p.start === start &&
        p.kind !== 'date' &&
        text.slice(p.start, p.end) === '@' + p.label &&
        catalog.some(
          (c) => c.kind === p.kind && c.id === p.id && c.label === p.label,
        ),
    );
    if (pin) {
      mentions.push(pin);
      continue;
    }
    const rest = text.slice(start + 1),
      dateRaw = rest.match(
        /^(today|tomorrow|nextweek|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{4})?)(?=$|[\s,:;.!?)])/i,
      )?.[0];
    if (dateRaw) {
      const due = captureDate(dateRaw, now);
      if (due)
        mentions.push({
          kind: 'date',
          id: due,
          label: displayCaptureDate(due),
          start,
          end: start + dateRaw.length + 1,
        });
      else
        errors.push(
          `“${dateRaw}” is not a valid date. Use DD/MM or DD/MM/YYYY.`,
        );
      continue;
    }
    const matches = catalog.flatMap((c) =>
      aliases(c)
        .filter(
          (a) =>
            rest.toLowerCase().startsWith(a.toLowerCase()) &&
            (!rest[a.length] || /[\s,:;.!?)]/.test(rest[a.length])),
        )
        .map((a) => ({ option: c, length: a.length })),
    );
    const longest = Math.max(0, ...matches.map((m) => m.length)),
      best = matches.filter((m) => m.length === longest),
      distinct = Array.from(
        new Map(
          best.map((m) => [m.option.kind + ':' + m.option.id, m]),
        ).values(),
      );
    if (distinct.length === 1) {
      const { option, length } = distinct[0];
      mentions.push({ ...option, start, end: start + length + 1 });
    } else if (distinct.length > 1)
      errors.push(
        'That mention matches more than one record. Choose it from the suggestions.',
      );
    else
      errors.push(
        `Choose a client, project, or date for “@${rest.split(/\s|@/)[0]}”.`,
      );
  }
  const unique = (kind: CaptureMention['kind']) =>
    Array.from(
      new Set(mentions.filter((m) => m.kind === kind).map((m) => m.id)),
    );
  const spaceIds = unique('space'),
    projectIds = unique('project'),
    dates = unique('date');
  if (spaceIds.length > 1) errors.push('Choose one client for this task.');
  if (projectIds.length > 1) errors.push('Choose one project for this task.');
  if (dates.length > 1) errors.push('Choose one deadline for this task.');
  let projectId = projectIds[0] || options.projectId || null;
  if (
    !projectIds.length &&
    spaceIds.length &&
    data.projects.find((p) => p.id === projectId)?.spaceId !== spaceIds[0]
  )
    projectId = null;
  const project = data.projects.find((p) => p.id === projectId),
    spaceId = spaceIds[0] || project?.spaceId || null;
  if (projectId && !project)
    errors.push('This project is no longer available.');
  if (project && spaceIds[0] && project.spaceId !== spaceIds[0])
    errors.push(
      'The client and project do not match. Choose the client that owns this project.',
    );
  let title = text;
  for (const m of [...mentions].sort((a, b) => b.start - a.start)) {
    let start = m.start;
    if (m.kind === 'date') {
      const connector = title
        .slice(0, start)
        .match(/\s+(?:at\s+date|on|by|due(?:\s+on)?|at)\s*$/i);
      if (connector) start -= connector[0].length;
    }
    title =
      title.slice(0, start) +
      (m.kind === 'date' ? '' : m.label) +
      title.slice(m.end);
  }
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) errors.push('Give the task a name.');
  if (title.length > 180)
    errors.push('Keep the task name under 180 characters.');
  return {
    title,
    projectId,
    spaceId,
    due: dates[0] || '',
    mentions,
    errors: Array.from(new Set(errors)),
    project,
    space: data.spaces.find((s) => s.id === spaceId),
  };
}
export function activeMention(
  text: string,
  caret: number,
  mentions: CaptureMention[],
) {
  const match = text.slice(0, caret).match(/(?:^|[\s(])@([^@\n]*)$/);
  if (!match) return null;
  const start = caret - match[1].length - 1;
  const resolved = mentions.find((m) => m.start === start);
  if (resolved && resolved.end < caret) return null;
  return { start, end: caret, query: match[1] };
}
export function mentionSuggestions(
  query: string,
  data: Catalog,
  now = new Date(),
): MentionOption[] {
  const queryKey = normal(query);
  const choices = mentionCatalog(data).filter(
    (o) =>
      !queryKey ||
      normal(o.label).includes(queryKey) ||
      normal(o.id).includes(queryKey) ||
      normal(o.detail).includes(queryKey),
  );
  const dateOptions = ['today', 'tomorrow', 'nextweek'].map((value) => ({
    kind: 'date' as const,
    id: captureDate(value, now)!,
    label: value,
    detail: displayCaptureDate(captureDate(value, now)!),
  }));
  const due = captureDate(query, now);
  if (due && !dateOptions.some((d) => d.label === query.toLowerCase()))
    dateOptions.unshift({
      kind: 'date',
      id: due,
      label: query,
      detail: displayCaptureDate(due),
    });
  return [
    ...dateOptions.filter(
      (d) => !queryKey || normal(d.label).includes(queryKey),
    ),
    ...choices,
  ].slice(0, 9);
}
// Keep an explicitly chosen identity pinned while edits occur before/after it.
// Editing the mention itself invalidates that pin, so stale IDs cannot survive.
export function shiftMentionPins(
  before: string,
  after: string,
  pins: CaptureMention[],
): CaptureMention[] {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let end = before.length,
    nextEnd = after.length;
  while (
    end > start &&
    nextEnd > start &&
    before[end - 1] === after[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  const delta = after.length - before.length;
  return pins.flatMap((p) =>
    p.end <= start
      ? [p]
      : p.start >= end
        ? [{ ...p, start: p.start + delta, end: p.end + delta }]
        : [],
  );
}
