import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
const identity = () => ({
  org: text('org').notNull(),
  id: text('id').notNull(),
});
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('createdAt').notNull(),
});
export const workspaceTransfers = sqliteTable('workspaceTransfers', {
  org: text('org').primaryKey(),
  digest: text('digest').notNull(),
  recordCount: integer('recordCount').notNull(),
  createdAt: text('createdAt').notNull(),
  mutation: text('mutation').notNull(),
});
export const members = sqliteTable(
  'members',
  {
    ...identity(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    color: text('color').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
export const spaces = sqliteTable(
  'spaces',
  {
    ...identity(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    color: text('color').notNull(),
    brief: text('brief').notNull(),
    owner: text('owner').notNull(),
    meeting: text('meeting').notNull(),
    tagline: text('tagline').notNull().default(''),
    wants: text('wants').notNull().default(''),
    needs: text('needs').notNull().default(''),
    audience: text('audience').notNull().default(''),
    voice: text('voice').notNull().default(''),
    website: text('website').notNull().default(''),
    coverUrl: text('coverUrl').notNull().default(''),
    logoUrl: text('logoUrl').notNull().default(''),
    brandStyle: text('brandStyle').notNull().default('sans'),
    revision: integer('revision').notNull().default(0),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
export const projects = sqliteTable(
  'projects',
  {
    ...identity(),
    name: text('name').notNull(),
    spaceId: text('spaceId'),
    description: text('description').notNull(),
    due: text('due').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('projects_by_space').on(t.org, t.spaceId),
  ],
);
export const tasks = sqliteTable(
  'tasks',
  {
    ...identity(),
    archived: integer('archived').notNull().default(0),
    dueTime: text('dueTime').notNull().default(''),
    plannedFor: text('plannedFor').notNull().default(''),
    focusFor: text('focusFor').notNull().default(''),
    reviewRequired: integer('reviewRequired').notNull().default(1),
    title: text('title').notNull(),
    prospectId: text('prospectId'),
    projectId: text('projectId'),
    spaceId: text('spaceId'),
    assignee: text('assignee').notNull(),
    reviewer: text('reviewer').notNull(),
    stage: text('stage').notNull(),
    description: text('description').notNull(),
    due: text('due').notNull(),
    priority: text('priority').notNull(),
    blocked: text('blocked').notNull(),
    deliverable: text('deliverable').notNull(),
    delivery: text('delivery').notNull(),
    version: integer('version').notNull(),
    revision: integer('revision').notNull(),
    position: integer('position').notNull(),
    meetingId: text('meetingId'),
    updatedAt: text('updatedAt').notNull(),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('tasks_by_assignee').on(t.org, t.assignee, t.stage),
    index('tasks_by_project').on(t.org, t.projectId),
  ],
);
export const taskDeletions = sqliteTable(
  'taskDeletions',
  {
    ...identity(),
    revision: integer('revision').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
    mutation: text('mutation').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);

export const calendarEvents = sqliteTable(
  'calendarEvents',
  {
    ...identity(),
    meetingId: text('meetingId'),
    googleCalendarId: text('googleCalendarId').notNull().default(''),
    googleEventId: text('googleEventId').notNull().default(''),
    googleUrl: text('googleUrl').notNull().default(''),
    googleStart: text('googleStart').notNull().default(''),
    googleEnd: text('googleEnd').notNull().default(''),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    date: text('date').notNull(),
    time: text('time').notNull().default(''),
    description: text('description').notNull().default(''),
    revision: integer('revision').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    fingerprint: text('fingerprint').notNull(),
    lastMutation: text('lastMutation').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('calendar_by_date').on(t.org, t.date),
    index('calendar_google_source').on(
      t.org,
      t.actor,
      t.googleCalendarId,
      t.googleEventId,
    ),
  ],
);

export const googleConnections = sqliteTable(
  'googleConnections',
  {
    org: text('org').notNull(),
    actor: text('actor').notNull(),
    token: text('token').notNull(),
    account: text('account').notNull(),
    calendarId: text('calendarId').notNull().default(''),
    selected: text('selected').notNull().default('[]'),
    timeZone: text('timeZone').notNull().default('UTC'),
    status: text('status').notNull().default('connected'),
    lastSync: text('lastSync').notNull().default(''),
    error: text('error').notNull().default(''),
    lease: text('lease').notNull().default(''),
    leaseUntil: integer('leaseUntil').notNull().default(0),
    createAttempt: integer('createAttempt').notNull().default(0),
    scopes: text('scopes').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.org, t.actor] })],
);
export const driveFolders = sqliteTable(
  'driveFolders',
  {
    ...identity(),
    spaceId: text('spaceId').notNull().default(''),
    folderId: text('folderId').notNull(),
    name: text('name').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    uniqueIndex('drive_folders_by_space').on(t.org, t.spaceId),
  ],
);
export const googleOAuthStates = sqliteTable(
  'googleOAuthStates',
  {
    org: text('org').notNull(),
    actor: text('actor').notNull(),
    id: text('id').notNull(),
    browserHash: text('browserHash').notNull(),
    verifier: text('verifier').notNull(),
    expires: integer('expires').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.actor, t.id] })],
);
export const googleExports = sqliteTable(
  'googleExports',
  {
    org: text('org').notNull(),
    actor: text('actor').notNull(),
    sourceKey: text('sourceKey').notNull(),
    calendarId: text('calendarId').notNull(),
    eventId: text('eventId').notNull(),
    fingerprint: text('fingerprint').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.actor, t.sourceKey] })],
);

export const calendarHistory = sqliteTable(
  'calendarHistory',
  {
    ...identity(),
    eventId: text('eventId').notNull(),
    snapshot: text('snapshot').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);

export const dailyPlans = sqliteTable(
  'dailyPlans',
  {
    ...identity(),
    day: text('day').notNull(),
    actor: text('actor').notNull(),
    sourceText: text('sourceText').notNull(),
    summary: text('summary').notNull(),
    createdAt: text('createdAt').notNull(),
    fingerprint: text('fingerprint').notNull(),
    lastMutation: text('lastMutation').notNull(),
    deliveryStatus: text('deliveryStatus').notNull().default('not_connected'),
    deliveryError: text('deliveryError').notNull().default(''),
    deliveryClaim: text('deliveryClaim').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('plans_by_day').on(t.org, t.actor, t.day),
  ],
);
export const dailyPlanTasks = sqliteTable(
  'dailyPlanTasks',
  {
    org: text('org').notNull(),
    planId: text('planId').notNull(),
    taskId: text('taskId').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.planId, t.taskId] })],
);

export const notes = sqliteTable(
  'notes',
  {
    ...identity(),
    taskId: text('taskId').notNull(),
    body: text('body').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('notes_by_task').on(t.org, t.taskId),
  ],
);
export const activities = sqliteTable(
  'activities',
  {
    ...identity(),
    taskId: text('taskId').notNull(),
    body: text('body').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('activities_by_task').on(t.org, t.taskId),
  ],
);
export const reviews = sqliteTable(
  'reviews',
  {
    ...identity(),
    taskId: text('taskId').notNull(),
    version: integer('version').notNull(),
    reviewer: text('reviewer').notNull(),
    decision: text('decision').notNull(),
    feedback: text('feedback').notNull(),
    createdAt: text('createdAt').notNull(),
    snapshot: text('snapshot').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('reviews_by_task').on(t.org, t.taskId, t.version),
  ],
);
export const notices = sqliteTable(
  'notices',
  {
    ...identity(),
    taskId: text('taskId').notNull(),
    recipient: text('recipient').notNull(),
    body: text('body').notNull(),
    read: integer('read').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('notices_by_recipient').on(t.org, t.recipient),
  ],
);
export const tools = sqliteTable(
  'tools',
  {
    ...identity(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    projectId: text('projectId').notNull(),
    owner: text('owner').notNull(),
    url: text('url').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
export const documents = sqliteTable(
  'documents',
  {
    ...identity(),
    title: text('title').notNull(),
    collection: text('collection').notNull(),
    body: text('body').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);

export const meetings = sqliteTable(
  'meetings',
  {
    ...identity(),
    spaceId: text('spaceId'),
    prospectId: text('prospectId'),
    participants: text('participants').notNull().default(''),
    fingerprint: text('fingerprint').notNull().default(''),
    title: text('title').notNull(),
    startsAt: text('startsAt').notNull(),
    agenda: text('agenda').notNull(),
    notes: text('notes').notNull(),
    decisions: text('decisions').notNull(),
    status: text('status').notNull(),
    revision: integer('revision').notNull(),
    updatedAt: text('updatedAt').notNull(),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('meetings_by_space').on(t.org, t.spaceId, t.startsAt),
    index('meetings_by_prospect').on(t.org, t.prospectId, t.startsAt),
  ],
);
export const spaceEvents = sqliteTable(
  'spaceEvents',
  {
    ...identity(),
    spaceId: text('spaceId'),
    prospectId: text('prospectId'),
    meetingId: text('meetingId'),
    body: text('body').notNull(),
    snapshot: text('snapshot').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('events_by_space').on(t.org, t.spaceId, t.createdAt),
  ],
);

export const resources = sqliteTable(
  'resources',
  {
    ...identity(),
    title: text('title').notNull(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    description: text('description').notNull().default(''),
    url: text('url').notNull().default(''),
    content: text('content').notNull().default(''),
    category: text('category').notNull().default(''),
    folderId: text('folderId'),
    owner: text('owner').notNull(),
    filename: text('filename').notNull().default(''),
    mime: text('mime').notNull().default(''),
    size: integer('size').notNull().default(0),
    fileKey: text('fileKey').notNull().default(''),
    driveFileId: text('driveFileId').notNull().default(''),
    shared: integer('shared').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    lastMutation: text('lastMutation').notNull().default(''),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('resources_by_kind').on(t.org, t.kind, t.archived),
  ],
);
export const resourceLinks = sqliteTable(
  'resourceLinks',
  {
    ...identity(),
    resourceId: text('resourceId').notNull(),
    targetType: text('targetType').notNull(),
    targetId: text('targetId').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('links_by_target').on(t.org, t.targetType, t.targetId),
  ],
);
export const folders = sqliteTable(
  'folders',
  { ...identity(), name: text('name').notNull(), parentId: text('parentId') },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
export const blueprints = sqliteTable(
  'blueprints',
  {
    ...identity(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    spaceId: text('spaceId'),
    projectId: text('projectId'),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
export const resourceUpgrades = sqliteTable('resourceUpgrades', {
  org: text('org').primaryKey(),
  version: integer('version').notNull(),
});
export const vaultConfig = sqliteTable('vaultConfig', {
  org: text('org').primaryKey(),
  id: text('id').notNull(),
  salt: text('salt').notNull(),
  verifier: text('verifier').notNull(),
  iterations: integer('iterations').notNull(),
  version: integer('version').notNull(),
});
export const vaultEntries = sqliteTable(
  'vaultEntries',
  { ...identity(), sealed: text('sealed').notNull() },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);

export const prospects = sqliteTable(
  'prospects',
  {
    ...identity(),
    name: text('name').notNull(),
    nameKey: text('nameKey').notNull(),
    clientId: text('clientId'),
    convertedAt: text('convertedAt').notNull().default(''),
    conversionFingerprint: text('conversionFingerprint').notNull().default(''),
    owner: text('owner').notNull(),
    stage: text('stage').notNull(),
    revision: integer('revision').notNull().default(0),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    uniqueIndex('prospects_by_name').on(t.org, t.nameKey),
  ],
);
export const prospectEvents = sqliteTable(
  'prospectEvents',
  {
    ...identity(),
    prospectId: text('prospectId').notNull(),
    taskId: text('taskId'),
    body: text('body').notNull(),
    kind: text('kind').notNull(),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
    fingerprint: text('fingerprint').notNull().default(''),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('events_by_prospect').on(t.org, t.prospectId),
  ],
);

export const captureEntries = sqliteTable(
  'captureEntries',
  {
    ...identity(),
    kind: text('kind').notNull(),
    sourceText: text('sourceText').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    targetType: text('targetType').notNull(),
    targetId: text('targetId').notNull(),
    spaceId: text('spaceId'),
    projectId: text('projectId'),
    taskId: text('taskId'),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
    fingerprint: text('fingerprint').notNull().default(''),
    lastMutation: text('lastMutation').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('captures_by_actor').on(t.org, t.actor, t.createdAt),
  ],
);

export const slackMessages = sqliteTable(
  'slackMessages',
  {
    ...identity(),
    kind: text('kind').notNull(),
    refId: text('refId').notNull(),
    body: text('body').notNull(),
    createdAt: text('createdAt').notNull(),
    deliveryStatus: text('deliveryStatus').notNull().default('not_connected'),
    deliveryError: text('deliveryError').notNull().default(''),
    deliveryClaim: text('deliveryClaim').notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('slack_messages_by_status').on(t.org, t.deliveryStatus, t.createdAt),
  ],
);
export const slackInbound = sqliteTable(
  'slackInbound',
  {
    ...identity(),
    createdAt: text('createdAt').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.org, t.id] }),
    index('slack_inbound_by_time').on(t.org, t.createdAt),
  ],
);
export const clientRemovals = sqliteTable(
  'clientRemovals',
  {
    ...identity(),
    revision: integer('revision').notNull(),
    action: text('action').notNull(),
    prospectId: text('prospectId'),
    actor: text('actor').notNull(),
    createdAt: text('createdAt').notNull(),
    mutation: text('mutation').notNull(),
  },
  (t) => [primaryKey({ columns: [t.org, t.id] })],
);
