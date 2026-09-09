import type { Workspace, Task, Stage } from './model';
import { parseCapture, type CaptureMention } from './task-capture';
import { parseSalesCapture } from './sales-model';

export type EntryKind =
  | 'task'
  | 'note'
  | 'meeting'
  | 'deadline'
  | 'sales'
  | 'progress'
  | 'blocker'
  | 'status'
  | 'project';
export type EntryTarget = { type: 'space' | 'project' | 'task'; id: string };
export type CaptureEntry = {
  id: string;
  kind: EntryKind;
  sourceText: string;
  title: string;
  body: string;
  targetType: 'note' | 'task' | 'meeting' | 'project';
  targetId: string;
  spaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  actor: string;
  createdAt: string;
};
export type EntryOptions = {
  kind?: EntryKind | 'auto';
  spaceId?: string | null;
  projectId?: string | null;
  pins?: CaptureMention[];
  target?: EntryTarget | null;
  now?: Date;
  meetingDate?: string;
  meetingTime?: string;
  focusTaskId?: string | null;
};
export function inferEntryKind(text: string): EntryKind {
  if (/^\s*(?:create|start|new)\s+(?:a\s+)?(?:new\s+)?project\b/i.test(text))
    return 'project';
  if (
    /^\s*(progress|update)\s*:/i.test(text) ||
    /^\s*progress\s+["“]/i.test(text)
  )
    return 'progress';
  if (/^\s*(blocked|blocker|unblocked)\b/i.test(text)) return 'blocker';
  if (/^\s*(status\b|ready for review\b)/i.test(text)) return 'status';
  if (/^\s*task\s*:/i.test(text)) return 'task';
  if (/^\s*sales\s+meeting\s+with\b/i.test(text)) return 'sales';
  if (/^\s*(note\b|meeting notes?\b|idea\b|decision\b)/i.test(text))
    return 'note';
  if (/^\s*(deadline\b|due date\b|reschedule\b)/i.test(text)) return 'deadline';
  if (/^\s*(meeting\b|meet with\b)/i.test(text)) return 'meeting';
  if (
    /^\s*(task\s*:|book|edit|write|send|call|prepare|create|build|review|finish|update|check|calculate|plan|design|record|publish|schedule|follow up|confirm|fix|draft|research|add|make|connect|document|deliver|set up)\b/i.test(
      text,
    )
  )
    return 'task';
  return 'note';
}
export function interpretEntry(
  text: string,
  data: Workspace,
  options: EntryOptions = {},
) {
  const kind =
    options.kind && options.kind !== 'auto'
      ? options.kind
      : inferEntryKind(text);
  const isUpdate = isTaskUpdate(kind);
  const parsed = parseCapture(text, data, {
    projectId: options.projectId,
    pins: options.pins,
    now: options.now,
  });
  const errors = parsed.errors.filter(
    (e) =>
      !(
        (kind === 'note' || isUpdate) &&
        e === 'Keep the task name under 180 characters.'
      ),
  );
  const quoted = isUpdate
    ? /^\s*(?:progress|update|blocked|blocker|unblocked|status|ready for review)\s+["“]([^"”]+)["”](?:\s*:|\s*$)/i.exec(
        text,
      )?.[1]
    : /["“]([^"”]+)["”]/.exec(text)?.[1];
  let target = options.target || null;
  if (isUpdate && quoted) {
    const matches = data.tasks.filter(
      (t) => t.title.toLowerCase() === quoted.toLowerCase(),
    );
    if (target?.type === 'task') {
      if (!matches.some((t) => t.id === target!.id))
        errors.push('The selected task and the sentence do not match.');
    } else if (matches.length === 1)
      target = { type: 'task', id: matches[0].id };
    else
      errors.push(
        matches.length > 1
          ? 'More than one task has that name. Choose the right task.'
          : 'That task could not be found. Choose the task to update.',
      );
  }
  // Only use the visible desk context when no explicit work was named.
  if (
    !target &&
    options.focusTaskId &&
    (kind === 'note' || !quoted) &&
    !parsed.mentions.some((m) => m.kind !== 'date') &&
    (isUpdate || kind === 'note' || kind === 'deadline')
  )
    target = { type: 'task', id: options.focusTaskId };
  let spaceId =
      parsed.spaceId || (!parsed.projectId ? options.spaceId || null : null),
    projectId = parsed.projectId,
    taskId: string | null = null;
  if (spaceId && !data.spaces.some((s) => s.id === spaceId))
    errors.push('This client is no longer available.');
  if (target?.type === 'task') {
    const task = data.tasks.find((t) => t.id === target!.id);
    if (!task) errors.push('This task is no longer available.');
    else {
      taskId = task.id;
      projectId = task.projectId;
      spaceId = projectId
        ? data.projects.find((p) => p.id === projectId)?.spaceId || null
        : task.spaceId;
    }
  } else if (target?.type === 'project') {
    const project = data.projects.find((p) => p.id === target!.id);
    if (!project) errors.push('This project is no longer available.');
    else {
      projectId = project.id;
      spaceId = project.spaceId;
    }
  } else if (target?.type === 'space') {
    if (!data.spaces.some((s) => s.id === target!.id))
      errors.push('This client is no longer available.');
    projectId = null;
    spaceId = target.id;
  }
  // A selection cannot quietly contradict an explicit @reference in the sentence.
  if (
    target &&
    parsed.mentions.some(
      (m) =>
        (m.kind === 'space' && m.id !== spaceId) ||
        (m.kind === 'project' && m.id !== projectId),
    )
  )
    errors.push(
      'The selected destination and the sentence refer to different work.',
    );
  if (!target)
    target = projectId
      ? { type: 'project', id: projectId }
      : spaceId
        ? { type: 'space', id: spaceId }
        : null;
  let title = parsed.title.replace(/^task\s*:\s*/i, '');
  let writing = text;
  for (const mention of [...parsed.mentions].sort((a, b) => b.start - a.start))
    writing = writing.slice(0, mention.start) + writing.slice(mention.end);
  writing = writing.replace(/[ \t]+/g, ' ').trim();
  let body = (kind === 'note' ? writing : title).replace(
    /^(?:meeting notes?|note|idea|decision)\b(?:\s+(?:for|on))?\s*:?\s*/i,
    '',
  );
  if (
    kind === 'note' &&
    body.includes(':') &&
    parsed.mentions.some(
      (m) => m.kind !== 'date' && m.start < text.indexOf(':'),
    )
  )
    body = body.slice(body.indexOf(':') + 1).trim();
  if (kind === 'note') {
    if (!body) errors.push('Write the note you want to keep.');
    title = body.length > 90 ? body.slice(0, 87) + '…' : body;
    if (parsed.due)
      errors.push(
        'Choose Task, Meeting, or Deadline to use that date, or remove it to keep a note.',
      );
  }
  if (
    kind === 'deadline' &&
    !options.target &&
    (!projectId || /["“]([^"”]+)["”]/.test(text))
  ) {
    const quoted = /["“]([^"”]+)["”]/.exec(text)?.[1];
    const matches = quoted
      ? data.tasks.filter((t) => t.title.toLowerCase() === quoted.toLowerCase())
      : [];
    if (matches.length === 1) {
      const task = matches[0];
      target = { type: 'task', id: task.id };
      taskId = task.id;
      projectId = task.projectId;
      spaceId = projectId
        ? data.projects.find((p) => p.id === projectId)?.spaceId || null
        : task.spaceId;
    } else
      errors.push(
        matches.length > 1
          ? 'More than one task has that name. Choose the right task.'
          : 'Choose the task or project whose deadline should change.',
      );
  }
  if (kind === 'deadline') {
    if (!taskId && !projectId)
      errors.push('Choose a task or project for this deadline.');
    if (
      parsed.mentions.some(
        (m) =>
          (m.kind === 'space' && m.id !== spaceId) ||
          (m.kind === 'project' && m.id !== projectId),
      )
    )
      errors.push(
        'The deadline target and the sentence refer to different work.',
      );
    if (!parsed.due) errors.push('Add a date such as @tomorrow or @18/09.');
    title = taskId
      ? data.tasks.find((t) => t.id === taskId)?.title || title
      : data.projects.find((p) => p.id === projectId)?.name || title;
  }
  let nextStage: Stage | null = null;
  let clearBlocker = false;
  if (isUpdate) {
    if (!taskId) errors.push('Choose the task this update belongs to.');
    const withoutTitle = quoted
      ? writing.replace(/["“][^"”]+["”]/, '')
      : writing;
    body = withoutTitle
      .replace(
        /^(?:progress|update|blocked|blocker|unblocked|status|ready for review)\b\s*:?\s*/i,
        '',
      )
      .replace(/^:\s*/, '')
      .trim();
    title = data.tasks.find((t) => t.id === taskId)?.title || 'Task update';
    if (parsed.due)
      errors.push(
        'Use Deadline to change a date, or remove the date from this update.',
      );
    if (kind === 'progress' && !body) errors.push('Write what moved forward.');
    if (kind === 'blocker') {
      clearBlocker = /^\s*unblocked\b/i.test(text);
      if (!clearBlocker && !body)
        errors.push('Describe what is blocking this task.');
      if (body.length > 500)
        errors.push('Keep the blocking reason under 500 characters.');
      if (clearBlocker) body = body ? 'Unblocked: ' + body : 'Blocker cleared';
    }
    if (kind === 'status') {
      const value = /^\s*ready for review\b/i.test(text)
        ? 'review'
        : body.toLowerCase().replace(/[.!]$/, '').trim();
      nextStage =
        (
          {
            doing: 'Doing',
            'in progress': 'Doing',
            'up next': 'Up next',
            review: 'Review',
            'ready for review': 'Review',
            done: 'Done',
            complete: 'Done',
          } as Record<string, Stage>
        )[value] || null;
      if (!nextStage)
        errors.push('Use a status: Doing, Up next, Review, or Done.');
      body = nextStage ? 'Status: ' + nextStage : body;
    }
  }
  const timeMatch = /\bat\s+(\d{1,2}[:.]\d{2})\b/i.exec(text);
  const meetingTime =
    options.meetingTime ||
    (timeMatch ? timeMatch[1].replace('.', ':').padStart(5, '0') : '');
  const meetingDate = options.meetingDate || parsed.due;
  if (kind === 'meeting') {
    if (!spaceId)
      errors.push(
        'Connect the client for this meeting with @ or choose it below.',
      );
    if (taskId) errors.push('Choose a client or project for a meeting.');
    if (!meetingDate) errors.push('Choose the meeting date.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(meetingTime))
      errors.push('Choose a valid meeting time.');
    if (options.meetingDate && parsed.due && options.meetingDate !== parsed.due)
      errors.push('The date field and the sentence do not match.');
    if (
      options.meetingTime &&
      timeMatch &&
      options.meetingTime !== timeMatch[1].replace('.', ':').padStart(5, '0')
    )
      errors.push('The time field and the sentence do not match.');
    title = title.replace(/\s+at\s+\d{1,2}[:.]\d{2}\b/i, '').trim();
    body = '';
  }
  if (kind === 'sales') {
    const sales = parseSalesCapture(text, options.now);
    return {
      kind,
      nextStage,
      clearBlocker,
      title: sales?.nextStep || '',
      body: '',
      target: null,
      spaceId: null,
      projectId: null,
      taskId: null,
      due: sales?.due || '',
      meetingDate: '',
      meetingTime: '',
      errors: sales?.errors || ['Use a sales meeting sentence.'],
      parsed,
    };
  }
  return {
    kind,
    nextStage,
    clearBlocker,
    title,
    body,
    target,
    spaceId,
    projectId,
    taskId,
    due: parsed.due,
    meetingDate,
    meetingTime,
    errors: Array.from(new Set(errors)),
    parsed,
  };
}
export function captureDestination(
  entry: Pick<CaptureEntry, 'kind' | 'spaceId' | 'projectId' | 'taskId'>,
  data: Workspace,
) {
  const task = data.tasks.find((t) => t.id === entry.taskId);
  const project = data.projects.find((p) => p.id === entry.projectId);
  const space = data.spaces.find((s) => s.id === entry.spaceId);
  const context = task?.title || project?.name || space?.name;
  if (entry.kind === 'project') return `${project?.name || 'Work'} · Project`;
  if (isTaskUpdate(entry.kind))
    return `${context || 'Choose a task'} · ${entry.kind === 'progress' ? 'Progress' : entry.kind === 'blocker' ? 'Blocker' : 'Status'}`;
  return entry.kind === 'note'
    ? `${context || 'Your desk'} · Notes`
    : entry.kind === 'meeting'
      ? `${space?.name || 'Client'} · Meetings`
      : entry.kind === 'deadline'
        ? `${context || 'Work'} · Deadline`
        : entry.kind === 'sales'
          ? 'Sales pipeline · Next action'
          : `${project?.name || space?.name || 'Your board'} · Up next`;
}

export function isTaskUpdate(kind: EntryKind) {
  return ['progress', 'blocker', 'status'].includes(kind);
}
export function blockerRecipients(task: Task, actor: string) {
  return [...new Set([task.assignee, task.reviewer])].filter(
    (id) => id && id !== actor,
  );
}
