import type { Workspace } from './model';
import { localDay } from './workspace-brief';

export function deskAttention(data: Workspace, now: Date) {
  const items: {
    taskId: string;
    label: string;
    detail: string;
    kind: 'review' | 'blocker' | 'notice' | 'deadline';
  }[] = [];
  const seen = new Set<string>();
  const add = (item: (typeof items)[number]) => {
    if (!seen.has(item.taskId)) {
      seen.add(item.taskId);
      items.push(item);
    }
  };
  for (const task of data.tasks) {
    if (
      task.stage === 'Review' &&
      data.reviews.some(
        (r) =>
          r.taskId === task.id &&
          r.version === task.version &&
          r.decision === 'Pending' &&
          r.reviewer === data.currentMember,
      )
    )
      add({
        taskId: task.id,
        label: task.title,
        detail: 'Ready for your review',
        kind: 'review',
      });
  }
  for (const notice of data.notices
    .filter((n) => !n.read && n.recipient === data.currentMember)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const task = data.tasks.find((t) => t.id === notice.taskId);
    if (task)
      add({
        taskId: task.id,
        label: task.title,
        detail: notice.body,
        kind: 'notice',
      });
  }
  for (const task of data.tasks.filter(
    (t) => t.assignee === data.currentMember && t.stage !== 'Done',
  )) {
    if (task.blocked)
      add({
        taskId: task.id,
        label: task.title,
        detail: task.blocked,
        kind: 'blocker',
      });
    else if (task.due && task.due <= localDay(now))
      add({
        taskId: task.id,
        label: task.title,
        detail: task.due < localDay(now) ? 'Deadline has passed' : 'Due today',
        kind: 'deadline',
      });
  }
  return items;
}
export function deskEntries(data: Workspace, query = '') {
  const q = query.trim().toLowerCase();
  return data.captureEntries
    .filter(
      (e) =>
        e.actor === data.currentMember &&
        (!q ||
          [
            e.title,
            e.body,
            e.sourceText,
            e.kind,
            data.spaces.find((s) => s.id === e.spaceId)?.name,
            data.projects.find((p) => p.id === e.projectId)?.name,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
