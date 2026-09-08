import type { Workspace } from './model';

export type DeadlineEntry = {
  key: string;
  kind: 'project' | 'task';
  id: string;
  title: string;
  due: string;
  projectId: string | null;
  spaceId: string | null;
  client: string;
  color: string;
  ownerId: string | null;
  complete: boolean;
  stage: string;
  description: string;
  revision?: number;
  taskCount?: number;
  doneCount?: number;
};

// Deadlines are date-only values, never timestamps. Local noon avoids DST
// boundaries when navigating dates; persisted YYYY-MM-DD values stay intact.
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function monthKey(date: Date) {
  return dateKey(date).slice(0, 7);
}
export function shiftMonth(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
}
export function deadlineOrder(a: DeadlineEntry, b: DeadlineEntry) {
  return (
    (a.due || '9999').localeCompare(b.due || '9999') ||
    a.kind.localeCompare(b.kind) ||
    a.title.localeCompare(b.title) ||
    a.key.localeCompare(b.key)
  );
}

export function calendarEntries(data: Workspace): DeadlineEntry[] {
  const spaces = new Map(data.spaces.map((s) => [s.id, s]));
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const projectTasks = new Map(
    data.projects.map((p) => [
      p.id,
      data.tasks.filter((t) => t.projectId === p.id),
    ]),
  );
  const entries: DeadlineEntry[] = data.projects.map((project) => {
    const space = project.spaceId ? spaces.get(project.spaceId) : undefined;
    const tasks = projectTasks.get(project.id) || [];
    const done = tasks.filter((t) => t.stage === 'Done').length;
    const complete = tasks.length > 0 && tasks.length === done;
    return {
      key: 'project:' + project.id,
      kind: 'project',
      id: project.id,
      title: project.name,
      due: project.due,
      projectId: project.id,
      spaceId: project.spaceId,
      client: space?.name || 'Internal',
      color: space?.color || '#64718a',
      ownerId: space?.owner || null,
      complete,
      stage: complete ? 'Tasks complete' : 'Project deadline',
      description: project.description,
      taskCount: tasks.length,
      doneCount: done,
    };
  });
  for (const task of data.tasks) {
    const project = task.projectId ? projects.get(task.projectId) : undefined;
    const space = project?.spaceId ? spaces.get(project.spaceId) : undefined;
    entries.push({
      key: 'task:' + task.id,
      kind: 'task',
      id: task.id,
      title: task.title,
      due: task.due,
      projectId: task.projectId,
      spaceId: project?.spaceId || null,
      client: space?.name || (project ? 'Internal' : 'Inbox'),
      color: space?.color || '#64718a',
      ownerId: task.assignee,
      complete: task.stage === 'Done',
      stage: task.stage,
      description: task.description,
      revision: task.revision,
    });
  }
  return entries.sort(deadlineOrder);
}

export type CalendarFilters = {
  kind: string;
  space: string;
  project: string;
  completed: boolean;
};
export function filterDeadlines(
  entries: DeadlineEntry[],
  filters: CalendarFilters,
) {
  return entries.filter(
    (e) =>
      (filters.kind === 'all' || e.kind === filters.kind) &&
      (filters.space === 'all' ||
        (filters.space === 'internal'
          ? !e.spaceId
          : e.spaceId === filters.space)) &&
      (filters.project === 'all' || e.projectId === filters.project) &&
      (filters.completed || !e.complete),
  );
}

export function deadlineCommand(entry: DeadlineEntry, due: string) {
  return entry.kind === 'task'
    ? { type: 'deadline', id: entry.id, revision: entry.revision, due }
    : { type: 'project-deadline', id: entry.id, previous: entry.due, due };
}
