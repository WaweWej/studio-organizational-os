// The command catalog: a machine-readable map of every action the mutation
// boundary accepts. This is the contract other speakers read — the Desk's
// palette today, scoped API callers and the assistant next. Descriptors
// describe; the boundary itself remains the only validator and executor.
// tests/command-catalog.mjs holds this list against the real dispatch.

export type CommandField = {
  name: string;
  kind: 'text' | 'id' | 'day' | 'number' | 'flag' | 'list' | 'object';
  required?: boolean;
  notes?: string;
};

export type CommandDescriptor = {
  name: string;
  group:
    | 'capture'
    | 'tasks'
    | 'projects'
    | 'clients'
    | 'meetings'
    | 'planning'
    | 'calendar'
    | 'sales'
    | 'library';
  summary: string;
  risk: 'write' | 'destructive';
  fields: CommandField[];
};

const id = (name: string, notes?: string): CommandField => ({
  name,
  kind: 'id',
  required: true,
  notes,
});
const text = (name: string, required = true, notes?: string): CommandField => ({
  name,
  kind: 'text',
  required,
  notes,
});

export const commandCatalog: CommandDescriptor[] = [
  {
    name: 'capture-entry',
    group: 'capture',
    summary:
      'Interpret one written sentence into a note, meeting, deadline, progress note, blocker, status change, or daily entry, exactly as the Desk does. Notes targeted at a space are stored on that client’s timeline.',
    risk: 'write',
    fields: [
      { name: 'kind', kind: 'text', required: true, notes: 'note · meeting · deadline · progress · blocker · status · daily' },
      text('captureText'),
      { name: 'captureDay', kind: 'day', required: true },
      { name: 'captureId', kind: 'id', required: true, notes: 'Client-supplied UUID; retries with the same id are idempotent.' },
      { name: 'contextSpace', kind: 'id', notes: 'Space to attach to.' },
      { name: 'contextProject', kind: 'id' },
      { name: 'targetType', kind: 'text', notes: 'space · project · task' },
      { name: 'targetId', kind: 'id' },
      { name: 'meetingDate', kind: 'day' },
      { name: 'meetingTime', kind: 'text' },
      { name: 'pins', kind: 'list' },
    ],
  },
  {
    name: 'quick-create',
    group: 'tasks',
    summary: 'Create one task from a captured sentence, with optional project, space, due day, and review requirement.',
    risk: 'write',
    fields: [
      text('title'),
      text('captureText'),
      { name: 'captureId', kind: 'id', required: true, notes: 'Idempotency id.' },
      { name: 'spaceId', kind: 'id' },
      { name: 'projectId', kind: 'id' },
      { name: 'due', kind: 'day' },
      { name: 'reviewRequired', kind: 'number' },
    ],
  },
  {
    name: 'create',
    group: 'tasks',
    summary: 'Create a task with explicit fields (title, project, assignee, due, review).',
    risk: 'write',
    fields: [text('title'), { name: 'projectId', kind: 'id' }, { name: 'due', kind: 'day' }],
  },
  {
    name: 'edit',
    group: 'tasks',
    summary: 'Edit a task’s fields against its current revision.',
    risk: 'write',
    fields: [id('id'), { name: 'revision', kind: 'number', required: true }],
  },
  {
    name: 'move',
    group: 'tasks',
    summary: 'Move a task between stages on the board.',
    risk: 'write',
    fields: [id('id'), text('stage', true, 'Up next · Doing · Review · Done')],
  },
  {
    name: 'complete',
    group: 'tasks',
    summary: 'Complete a task; a recurring task spawns its successor in the same transaction.',
    risk: 'write',
    fields: [id('id'), { name: 'revision', kind: 'number', required: true }],
  },
  {
    name: 'submit',
    group: 'tasks',
    summary: 'Submit a task for review.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'review',
    group: 'tasks',
    summary: 'Record a review decision on a task.',
    risk: 'write',
    fields: [id('id'), text('decision')],
  },
  {
    name: 'note',
    group: 'tasks',
    summary: 'Add a note to a task.',
    risk: 'write',
    fields: [id('taskId'), text('body')],
  },
  {
    name: 'progress',
    group: 'tasks',
    summary: 'Record progress on a task.',
    risk: 'write',
    fields: [id('taskId'), text('body')],
  },
  {
    name: 'blocker',
    group: 'tasks',
    summary: 'Flag or clear a blocker on a task.',
    risk: 'write',
    fields: [id('taskId'), { name: 'clear', kind: 'flag' }],
  },
  {
    name: 'deadline',
    group: 'tasks',
    summary: 'Set or change a task deadline.',
    risk: 'write',
    fields: [id('id'), { name: 'due', kind: 'day', required: true }],
  },
  {
    name: 'deliverable',
    group: 'tasks',
    summary: 'Mark a task’s deliverable link or state.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'template',
    group: 'tasks',
    summary: 'Create tasks from a template.',
    risk: 'write',
    fields: [id('templateId')],
  },
  {
    name: 'task-archive',
    group: 'tasks',
    summary: 'Archive a task (reversible).',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'task-restore',
    group: 'tasks',
    summary: 'Restore an archived task.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'task-delete',
    group: 'tasks',
    summary: 'Delete a task permanently.',
    risk: 'destructive',
    fields: [id('id')],
  },
  {
    name: 'project-capture',
    group: 'projects',
    summary:
      'Create a project from a capture, optionally creating its client atomically in the same command.',
    risk: 'write',
    fields: [
      text('name'),
      { name: 'spaceId', kind: 'id' },
      { name: 'newClient', kind: 'object', notes: '{ id, name } creates the client with the project.' },
      { name: 'captureId', kind: 'id', required: true },
    ],
  },
  {
    name: 'project-deadline',
    group: 'projects',
    summary: 'Set or change a project deadline.',
    risk: 'write',
    fields: [id('id'), { name: 'due', kind: 'day', required: true }, { name: 'previous', kind: 'day' }],
  },
  {
    name: 'client-create',
    group: 'clients',
    summary:
      'Create a client explicitly. Client-supplied UUID makes retries idempotent; a name collision answers 409 with the existing client.',
    risk: 'write',
    fields: [id('id', 'Client-supplied UUID.'), text('name')],
  },
  {
    name: 'client-edit',
    group: 'clients',
    summary: 'Edit a client’s brief, brand and context fields.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'client-project',
    group: 'clients',
    summary: 'Create a project under a client.',
    risk: 'write',
    fields: [id('spaceId'), text('name')],
  },
  {
    name: 'client-project-deadline',
    group: 'clients',
    summary: 'Set a deadline on a client’s project.',
    risk: 'write',
    fields: [id('projectId'), { name: 'due', kind: 'day', required: true }],
  },
  {
    name: 'client-to-prospect',
    group: 'clients',
    summary: 'Move a client back to the sales pipeline; projects detach.',
    risk: 'destructive',
    fields: [id('id')],
  },
  {
    name: 'client-delete',
    group: 'clients',
    summary: 'Delete a client; its projects detach and read as internal.',
    risk: 'destructive',
    fields: [id('id')],
  },
  {
    name: 'meeting-create',
    group: 'meetings',
    summary: 'Create a meeting on a client, optionally with a recurrence rhythm.',
    risk: 'write',
    fields: [
      id('id', 'Client-supplied UUID.'),
      id('spaceId'),
      text('title'),
      { name: 'startsAt', kind: 'text', required: true, notes: 'ISO datetime.' },
      { name: 'recurrence', kind: 'text', notes: 'weekly · biweekly · monthly · quarterly' },
    ],
  },
  {
    name: 'meeting-plan',
    group: 'meetings',
    summary: 'Update a meeting’s plan, status, notes, or cancel one occurrence (a rhythm continues).',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'meeting-link-task',
    group: 'meetings',
    summary: 'Link a follow-up task to a meeting.',
    risk: 'write',
    fields: [id('meetingId'), id('taskId')],
  },
  {
    name: 'day-work',
    group: 'planning',
    summary: 'Adjust the day’s working set (focus, order, done-for-today).',
    risk: 'write',
    fields: [],
  },
  {
    name: 'daily-plan-commit',
    group: 'planning',
    summary: 'Commit a daily plan; tasks are created and the plan is recorded.',
    risk: 'write',
    fields: [id('id'), { name: 'lines', kind: 'list', required: true }],
  },
  {
    name: 'daily-plan-deliver',
    group: 'planning',
    summary: 'Deliver a committed plan to Slack when configured; delivery state is truthful.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'read-notice',
    group: 'planning',
    summary: 'Mark an in-app notice as read.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'calendar-meeting-time',
    group: 'calendar',
    summary: 'Change a calendar meeting’s time.',
    risk: 'write',
    fields: [id('id'), { name: 'startsAt', kind: 'text', required: true }],
  },
  {
    name: 'calendar-remove',
    group: 'calendar',
    summary: 'Remove an event from the Studio calendar.',
    risk: 'destructive',
    fields: [id('id')],
  },
  {
    name: 'sales-capture',
    group: 'sales',
    summary: 'Log a sales conversation from a captured sentence; prospects are created or updated.',
    risk: 'write',
    fields: [text('captureText'), { name: 'captureDay', kind: 'day', required: true }],
  },
  {
    name: 'sales-stage',
    group: 'sales',
    summary: 'Move a prospect between pipeline stages.',
    risk: 'write',
    fields: [id('id'), text('stage')],
  },
  {
    name: 'sales-convert',
    group: 'sales',
    summary: 'Convert a prospect into a client; conversion is idempotent by fingerprint.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'resource-archive',
    group: 'library',
    summary: 'Archive a library resource.',
    risk: 'write',
    fields: [id('id')],
  },
  {
    name: 'folder-create',
    group: 'library',
    summary: 'Create a library folder.',
    risk: 'write',
    fields: [text('name')],
  },
  {
    name: 'blueprint-create',
    group: 'library',
    summary: 'Create a blueprint from a resource.',
    risk: 'write',
    fields: [id('resourceId')],
  },
];

export function catalogByName(name: string) {
  return commandCatalog.find((command) => command.name === name) || null;
}
