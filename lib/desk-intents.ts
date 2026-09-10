import type { EntryKind } from './entry-model';
export type DeskIntent = {
  id: string;
  kind: EntryKind;
  title: string;
  insert: string;
  example: string;
  aliases: string[];
  pattern: RegExp;
};
const prefix = (value: string) =>
  new RegExp('^\\s*(?:' + value + ')(?=\\s|:|$)', 'i');
const create = '(?:add|create|start)\\s+(?:a\\s+)?(?:new\\s+)?';
export const deskIntents: DeskIntent[] = [
  {
    id: 'day',
    kind: 'daily',
    title: 'Plan my day',
    insert: 'Plan my day',
    example: 'Plan my day: one task per line, with @client or @project',
    aliases: [
      'daily tasks',
      'today:',
      'plan my day',
      'plan today',
      'today’s tasks',
      'daily plan',
    ],
    pattern: prefix(
      '\\/day|\\/daily|plan my day|plan today|daily tasks|daily plan|today(?:[’\u0027]s)? tasks|today(?=\\s*:)',
    ),
  },
  {
    id: 'note',
    kind: 'note',
    title: 'Add a note',
    insert: 'Note: ',
    example: 'Note @client: what you want to keep',
    aliases: [
      'add note',
      'add new note',
      'new note',
      'write a note',
      'meeting notes',
      'idea',
      'decision',
    ],
    pattern: prefix(
      '\\/note|meeting notes?|note|idea|decision|(?:' +
        create +
        '|new\\s+|write\\s+(?:a\\s+)?)note',
    ),
  },
  {
    id: 'task',
    kind: 'task',
    title: 'Add a task',
    insert: 'Task: ',
    example: 'Task: edit the video @project @tomorrow',
    aliases: ['add task', 'create task', 'add new task', 'new task'],
    pattern: prefix('\\/task|task|(?:' + create + '|new\\s+)task'),
  },
  {
    id: 'project',
    kind: 'project',
    title: 'Create a project',
    insert: 'Create new project',
    example: 'Create new project',
    aliases: [
      'add new project',
      'create new project',
      'start project',
      'new project',
    ],
    pattern: prefix('\\/project|(?:' + create + '|new\\s+)project'),
  },
  {
    id: 'deadline',
    kind: 'deadline',
    title: 'Set a deadline',
    insert: 'Set deadline ',
    example: 'Set deadline @project @18/09',
    aliases: [
      'add new deadline',
      'set deadline',
      'add deadline',
      'change deadline',
      'new deadline',
      'due date',
      'reschedule',
    ],
    pattern: prefix(
      '\\/deadline|deadline|due date|reschedule|(?:' +
        create +
        '|new\\s+|(?:set|change|update)\\s+(?:the\\s+|a\\s+)?(?:new\\s+)?)(?:deadline|due date)',
    ),
  },
  {
    id: 'meeting',
    kind: 'meeting',
    title: 'Schedule a meeting',
    insert: 'Meeting with ',
    example: 'Meeting with @client @tomorrow at 14:00',
    aliases: [
      'add meeting',
      'new meeting',
      'create a meeting',
      'schedule meeting',
      'meet with',
    ],
    pattern: prefix(
      '\\/meeting|meeting|meet with|(?:' +
        create +
        '|new\\s+|schedule\\s+(?:a\\s+)?(?:new\\s+)?)meeting',
    ),
  },
  {
    id: 'progress',
    kind: 'progress',
    title: 'Log progress',
    insert: 'Progress: ',
    example: 'Progress: the first cut is ready',
    aliases: [
      'log progress',
      'add progress',
      'record progress',
      'progress',
      'update:',
    ],
    pattern: prefix(
      '\\/progress|progress|update(?=\\s*:)|(?:log|add|record)\\s+(?:the\\s+)?progress',
    ),
  },
  {
    id: 'blocker',
    kind: 'blocker',
    title: 'Flag a blocker',
    insert: 'Blocked: ',
    example: 'Blocked: waiting for footage',
    aliases: ['add blocker', 'flag a blocker', 'log blocker', 'blocked'],
    pattern: prefix(
      '\\/blocker|blocked|blocker|(?:add|flag|log)\\s+(?:a\\s+|new\\s+)?blocker',
    ),
  },
  {
    id: 'unblock',
    kind: 'blocker',
    title: 'Clear a blocker',
    insert: 'Unblocked',
    example: 'Unblocked',
    aliases: [
      'clear blocker',
      'clear the blocker',
      'remove blocker',
      'unblocked',
    ],
    pattern: prefix(
      '\\/unblock|unblocked|(?:clear|remove)\\s+(?:the\\s+|a\\s+)?blocker',
    ),
  },
  {
    id: 'status',
    kind: 'status',
    title: 'Change a status',
    insert: 'Status: ',
    example: 'Status: Doing · Up next · Review · Done',
    aliases: ['change status', 'set status', 'update status', 'status'],
    pattern: prefix(
      '\\/status|status|(?:change|set|update)\\s+(?:the\\s+)?status',
    ),
  },
  {
    id: 'review',
    kind: 'status',
    title: 'Request review',
    insert: 'Ready for review',
    example: 'Ready for review',
    aliases: ['request review', 'request a review', 'ready for review'],
    pattern: prefix('\\/review|ready for review|request\\s+(?:a\\s+)?review'),
  },
  {
    id: 'sales',
    kind: 'sales',
    title: 'Log a sales meeting',
    insert: 'Sales meeting with ',
    example: 'Sales meeting with "Acme", next step: follow up',
    aliases: ['sales meeting with'],
    pattern: prefix('\\/sales|sales\\s+meeting\\s+with'),
  },
];
export function matchEntryIntent(text: string) {
  return deskIntents.find((intent) => intent.pattern.test(text));
}
export function stripEntryPrefix(text: string, kind: EntryKind) {
  const intent = matchEntryIntent(text);
  return (
    intent?.kind === kind
      ? text.replace(intent.pattern, '').replace(/^\s*:\s*/, '')
      : text
  ).trim();
}
export function commandQuery(text: string): string | null {
  return /^\s*\/([a-z-]*)$/i.exec(text)?.[1].toLowerCase() ?? null;
}
export function commandSuggestions(query: string) {
  const q = query.toLowerCase();
  return !q || ['help', 'commands'].includes(q)
    ? deskIntents
    : deskIntents.filter((intent) =>
        [intent.id, intent.title, ...intent.aliases].some((value) =>
          value.toLowerCase().includes(q),
        ),
      );
}
