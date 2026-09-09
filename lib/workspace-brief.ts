import type { Workspace, Task } from './model';
import { taskSpaceId } from './task-context';

export function localDay(now: Date) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function pendingReview(data: Workspace, task: Task) {
  return (
    task.stage === 'Review' &&
    data.reviews.some(
      (r) =>
        r.taskId === task.id &&
        r.version === task.version &&
        r.decision === 'Pending',
    )
  );
}
export function taskContext(data: Workspace, task: Task) {
  return {
    space: data.spaces.find((s) => s.id === taskSpaceId(data, task)),
    prospect: data.prospects.find((p) => p.id === task.prospectId),
    project: data.projects.find((p) => p.id === task.projectId),
    member: data.members.find((m) => m.id === task.assignee),
  };
}
export type Attention = {
  task: Task;
  kind: 'review' | 'blocked' | 'overdue';
  reason: string;
};
export function buildDailyBrief(data: Workspace, now: Date) {
  const open = data.tasks.filter((t) => t.stage !== 'Done');
  const reviews = open.filter(
    (t) => t.reviewer === data.currentMember && pendingReview(data, t),
  );
  const blocked = open.filter((t) => !!t.blocked.trim());
  const overdue = open
    .filter(
      (t) =>
        t.assignee === data.currentMember && !!t.due && t.due < localDay(now),
    )
    .sort((a, b) => a.due.localeCompare(b.due));
  const seen = new Set<string>();
  const attention: Attention[] = [
    ...reviews.map(
      (task): Attention => ({
        task,
        kind: 'review',
        reason: 'Your review is requested',
      }),
    ),
    ...blocked.map(
      (task): Attention => ({ task, kind: 'blocked', reason: task.blocked }),
    ),
    ...overdue.map(
      (task): Attention => ({
        task,
        kind: 'overdue',
        reason: `Deadline passed · ${task.due}`,
      }),
    ),
  ].filter(({ task }) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
  const mine = open.filter(
    (t) =>
      t.assignee === data.currentMember &&
      ['Doing', 'Up next'].includes(t.stage),
  );
  const focus = mine.sort(
    (a, b) =>
      Number(b.stage === 'Doing') - Number(a.stage === 'Doing') ||
      a.position - b.position,
  );
  const upcoming = data.meetings
    .filter(
      (m) => m.status === 'Planned' && Date.parse(m.startsAt) >= now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const recent = data.activities
    .filter((a) => Date.parse(a.createdAt) <= now.getTime())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { attention, focus, upcoming, recent, reviews, blocked, overdue };
}
export function buildClientBrief(data: Workspace, spaceId: string, now: Date) {
  const space = data.spaces.find((s) => s.id === spaceId);
  const tasks = data.tasks.filter((t) => taskSpaceId(data, t) === spaceId);
  const meetings = data.meetings.filter((m) => m.spaceId === spaceId);
  const upcoming = meetings
    .filter(
      (m) => m.status === 'Planned' && Date.parse(m.startsAt) >= now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const previous = meetings
    .filter(
      (m) =>
        m.status === 'Completed' && Date.parse(m.startsAt) <= now.getTime(),
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
  const taskIds = new Set(tasks.map((t) => t.id));
  const since = previous ? Date.parse(previous.startsAt) : 0;
  const changes = [
    ...data.activities
      .filter((a) => taskIds.has(a.taskId))
      .map((a) => ({ ...a, source: 'task' as const, sourceId: a.taskId })),
    ...data.spaceEvents
      .filter((e) => e.spaceId === spaceId)
      .map((e) => ({
        ...e,
        source: 'meeting' as const,
        sourceId: e.meetingId,
      })),
  ]
    .filter(
      (e) =>
        Date.parse(e.createdAt) > since &&
        Date.parse(e.createdAt) <= now.getTime(),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = tasks.filter((t) => t.stage !== 'Done');
  const projects = data.projects
    .filter((p) => p.spaceId === spaceId)
    .map((p) => {
      const work = tasks.filter((t) => t.projectId === p.id);
      const done = work.filter((t) => t.stage === 'Done').length;
      return {
        ...p,
        total: work.length,
        done,
        overdue:
          !!p.due &&
          p.due < localDay(now) &&
          (!work.length || done < work.length),
      };
    });
  return {
    space,
    tasks,
    upcoming,
    previous,
    changes,
    projects,
    blocked: open.filter((t) => !!t.blocked.trim()),
    reviews: open.filter((t) => pendingReview(data, t)),
    deadlines: open
      .filter((t) => !!t.due)
      .sort((a, b) => a.due.localeCompare(b.due)),
  };
}
export function briefMatches(query: string, data: Workspace) {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const requested = /\b(prepare|brief|meeting|catch up)\b/.test(normalized);
  const words = normalized
    .split(/\s+/)
    .filter(
      (w) =>
        ![
          'prepare',
          'brief',
          'meeting',
          'catch',
          'up',
          'me',
          'for',
          'with',
          'the',
          'a',
          'about',
          'client',
          'my',
          'next',
        ].includes(w),
    );
  const spaces = data.spaces.filter((s) => {
    const name = `${s.name} ${s.id}`.toLowerCase();
    return words.length > 0 && words.every((w) => name.includes(w));
  });
  return {
    requested,
    spaces: requested && words.length === 0 ? data.spaces : spaces,
  };
}
