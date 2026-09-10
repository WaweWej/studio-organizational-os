import { parseCapture } from './task-capture';
import { stripEntryPrefix } from './desk-intents';
import type { Workspace } from './model';
import { taskSpaceId } from './task-context';

export type PlanItem = {
  source: string;
  title: string;
  taskId: string | null;
  revision?: number;
  projectId: string | null;
  spaceId: string | null;
  prospectId?: string | null;
  newProspect?: string;
  newSpace: string;
  newProject: string;
  due: string;
  dueTime: string;
  reviewRequired?: number;
  errors: string[];
};
export type DailyPlanDraft = {
  id: string;
  text: string;
  day: string;
  items: PlanItem[];
  reviewed: boolean;
};
export const normalized = (s: string) =>
  s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function parseDailyPlan(
  source: string,
  data: Workspace,
  day: string,
): PlanItem[] {
  return stripEntryPrefix(source, 'daily')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const time = line.match(/\s+(?:by|at)\s+([01]?\d|2[0-3]):([0-5]\d)\s*$/i);
      const dueTime = time ? time[1].padStart(2, '0') + ':' + time[2] : '';
      const text = time ? line.slice(0, time.index) : line;
      // Exact suffixes identify known prospects; ambiguous client/prospect names
      // remain a review choice. No new relationship is inferred from a verb.
      const suffix = text.match(/(?:\s+for\s+|\s+@)([^@]+)$/i);
      const prospectMatches = suffix
        ? data.prospects.filter(
            (p) =>
              normalized(p.name) === normalized(suffix[1]) &&
              ![...data.spaces, ...data.projects].some(
                (s) => normalized(s.name) === normalized(p.name),
              ),
          )
        : [];
      const prospect =
        prospectMatches.length === 1 ? prospectMatches[0] : undefined;
      const captureText =
        prospect && suffix && text.slice(suffix.index).trim().startsWith('@')
          ? text.slice(0, suffix.index)
          : text;
      const natural =
        suffix && !prospect
          ? [
              ...data.spaces.map((s) => ({
                kind: 'space',
                id: s.id,
                name: s.name,
              })),
              ...data.projects.map((p) => ({
                kind: 'project',
                id: p.id,
                name: p.name,
              })),
            ].filter((row) => normalized(row.name) === normalized(suffix[1]))
          : [];
      const known = natural.length === 1 ? natural[0] : null;
      const parsed = parseCapture(captureText, data, {
        now: new Date(day + 'T12:00:00'),
      });
      if (known && !parsed.spaceId && !parsed.projectId) {
        if (known.kind === 'space') parsed.spaceId = known.id;
        else {
          parsed.projectId = known.id;
          parsed.spaceId =
            data.projects.find((p) => p.id === known.id)?.spaceId || null;
        }
      }
      let bareTitle = captureText;
      for (const mention of [...parsed.mentions].sort(
        (a, b) => b.start - a.start,
      )) {
        bareTitle =
          bareTitle.slice(0, mention.start) + bareTitle.slice(mention.end);
      }
      const title = stripEntryPrefix(
        bareTitle
          .replace(/\s+(?:for|with|in|on|by|at|due)\s*$/i, '')
          .replace(/\s+/g, ' ')
          .trim(),
        'task',
      );
      const matches = data.tasks.filter(
        (t) =>
          !t.archived &&
          t.stage !== 'Done' &&
          t.assignee === data.currentMember &&
          normalized(t.title) === normalized(title) &&
          (!prospect || t.prospectId === prospect.id) &&
          (!parsed.projectId || t.projectId === parsed.projectId) &&
          (!parsed.spaceId || taskSpaceId(data, t) === parsed.spaceId),
      );
      const task = matches.length === 1 ? matches[0] : undefined;
      return {
        source: line,
        title,
        taskId: task?.id || null,
        revision: task?.revision,
        projectId: task?.projectId || parsed.projectId || null,
        spaceId: task ? taskSpaceId(data, task) : parsed.spaceId || null,
        prospectId: task?.prospectId || prospect?.id || null,
        newProspect: '',
        reviewRequired: task?.reviewRequired ?? (task ? 1 : 0),
        newSpace: '',
        newProject: '',
        due: parsed.due || (dueTime ? day : task?.due || ''),
        dueTime: dueTime || task?.dueTime || '',
        errors: [
          ...parsed.errors,
          ...(!title ? ['Give the task a title.'] : []),
          ...(matches.length > 1
            ? [
                'More than one existing task matches. Choose which task to plan.',
              ]
            : []),
        ],
      };
    });
}
