import { taskSpaceId } from './task-context';
import type { Workspace } from './model';

export type DeadlineEntry = {
  key: string;
  kind: 'project' | 'task' | 'meeting' | 'event' | 'deadline';
  source?: 'calendar' | 'meeting';
  time?: string;
  id: string;
  title: string;
  due: string;
  prospectId?: string | null;
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
    (a.time || '').localeCompare(b.time || '') ||
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
    if (task.archived) continue;
    const project = task.projectId ? projects.get(task.projectId) : undefined;
    const prospect = data.prospects.find((p) => p.id === task.prospectId);
    const spaceId = taskSpaceId(data, task);
    const space = spaceId ? spaces.get(spaceId) : undefined;
    entries.push({
      key: 'task:' + task.id,
      kind: 'task',
      id: task.id,
      title: task.title,
      due: task.due,
      time: task.dueTime || '',
      projectId: task.projectId,
      prospectId: task.prospectId || null,
      spaceId,
      client:
        space?.name ||
        (prospect
          ? prospect.name + ' · Prospect'
          : project
            ? 'Internal'
            : 'Inbox'),
      color: space?.color || '#64718a',
      ownerId: task.assignee,
      complete: task.stage === 'Done',
      stage: task.stage,
      description: task.description,
      revision: task.revision,
    });
  }
  for (const meeting of data.meetings) {
    if (meeting.status === 'Cancelled') continue;
    const start = new Date(meeting.startsAt);
    if (Number.isNaN(start.getTime())) continue;
    const space = meeting.spaceId ? spaces.get(meeting.spaceId) : undefined;
    const prospect = data.prospects.find((p) => p.id === meeting.prospectId);
    entries.push({
      key: 'meeting:' + meeting.id,
      id: meeting.id,
      kind: 'meeting',
      source: 'meeting',
      title: meeting.title,
      due: dateKey(start),
      time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      projectId: null,
      spaceId: meeting.spaceId,
      prospectId: meeting.prospectId,
      client:
        space?.name || (prospect ? prospect.name + ' · Prospect' : 'Meeting'),
      color: space?.color || '#4263d4',
      ownerId: space?.owner || prospect?.owner || null,
      complete: meeting.status === 'Completed',
      stage: meeting.status,
      description: meeting.agenda,
      revision: meeting.revision,
    });
  }
  for (const event of data.calendarEvents || []) {
    if (event.archived || event.meetingId) continue;
    entries.push({
      key: 'calendar:' + event.id,
      id: event.id,
      kind: event.kind,
      source: 'calendar',
      title: event.title,
      due: event.date,
      time: event.time,
      projectId: null,
      spaceId: null,
      client: 'Workspace',
      color: event.kind === 'deadline' ? '#a65a39' : '#4263d4',
      ownerId: event.actor,
      complete: false,
      stage:
        event.kind === 'meeting'
          ? 'Meeting'
          : event.kind === 'deadline'
            ? 'Deadline'
            : 'Event',
      description: event.description,
      revision: event.revision,
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
          ? !e.spaceId && !e.prospectId
          : filters.space === 'prospects'
            ? !!e.prospectId
            : e.spaceId === filters.space)) &&
      (filters.project === 'all' || e.projectId === filters.project) &&
      (filters.completed || !e.complete),
  );
}

export function deadlineCommand(
  entry: DeadlineEntry,
  due: string,
  time = entry.time || '',
) {
  if (entry.source === 'calendar')
    return {
      type: 'calendar-save',
      id: entry.id,
      revision: entry.revision,
      title: entry.title,
      kind: entry.kind,
      date: due,
      time,
      description: entry.description,
    };
  if (entry.source === 'meeting') {
    const date = localDate(due),
      [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    if (
      !due ||
      !time ||
      Number.isNaN(date.getTime()) ||
      dateKey(date) !== due ||
      date.getHours() !== hours ||
      date.getMinutes() !== minutes
    )
      throw new Error(
        'Choose a valid meeting time; this time may fall in a daylight-saving gap.',
      );
    return {
      type: 'calendar-meeting-time',
      id: entry.id,
      revision: entry.revision,
      startsAt: date.toISOString(),
    };
  }
  return entry.kind === 'task'
    ? {
        type: 'deadline',
        id: entry.id,
        revision: entry.revision,
        due,
        dueTime: time,
      }
    : { type: 'project-deadline', id: entry.id, previous: entry.due, due };
}
