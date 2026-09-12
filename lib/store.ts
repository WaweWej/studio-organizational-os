import { changeDayWork } from './day-work-store';
import { googleStatus } from './google-calendar-sync';
import { driveStatus } from './google-drive';
import type { GoogleConfig } from './google-calendar-auth';
import { mutateClientLifecycle } from './client-lifecycle-store';
import { mutateProjectCapture } from './project-capture-store';
import { blockerRecipients, type CaptureEntry } from './entry-model';
import {
  slackMessageRow,
  deliverSlackMessages,
  slackEventTransport,
  slackInboundConfig,
  type SlackEnv,
  type SlackEventKind,
} from './slack';
import { mutateEntry, captureInsert } from './entry-store';
import { validRecurrence, nextDueDate } from './recurrence';
import { mutateSales } from './sales-store';
import { mutateResource, upgradeResources } from './resource-store';
import { materializeRecurringMeetings } from './meeting-store';
import { mutateClient } from './client-store';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { emptyWorkspace, type Workspace, type Task } from './model';
import { mutateTaskLifecycle } from './task-lifecycle-store';
import { commitDailyPlan } from './daily-plan-store';
import {
  deliverDailyPlan,
  slackUrl,
  type SlackConfig,
} from './daily-plan-slack';
import { mutateCalendar, timeValue } from './calendar-store';
import {
  AppError,
  textValue,
  revisionValue,
  stageValue,
  canSubmit,
  dateValue,
} from './validation';

const collections = [
  'dailyPlans',
  'calendarEvents',
  'captureEntries',
  'prospects',
  'prospectEvents',
  'members',
  'spaces',
  'projects',
  'tasks',
  'notes',
  'activities',
  'reviews',
  'notices',
  'tools',
  'documents',
  'meetings',
  'spaceEvents',
  'resources',
  'resourceLinks',
  'folders',
  'blueprints',
] as const;
type Table = (typeof collections)[number];
export type Context = {
  org: string;
  actor: string;
  name: string;
  db: D1Database;
  // Present only for API-token identities; mutate() gates commands on it.
  tokenScopes?: string[];
};
type DataRow = Record<string, string | number | null>;
function insert(
  db: D1Database,
  table: Table | 'slackMessages',
  org: string,
  row: object,
  guard?: { id: string; nonce: string },
) {
  const fields = ['org', ...Object.keys(row)],
    values = [org, ...Object.values(row)];
  if (table === 'tasks') {
    return db
      .prepare(
        `INSERT OR IGNORE INTO tasks (${fields.map((k) => `"${k}"`).join(',')}) SELECT ${fields.map(() => '?').join(',')} WHERE NOT EXISTS (SELECT 1 FROM taskDeletions WHERE org=? AND id=?)`,
      )
      .bind(...values, org, (row as Task).id);
  }
  const sql = `INSERT OR IGNORE INTO "${table}" (${fields.map((k) => `"${k}"`).join(',')}) ${guard ? `SELECT ${fields.map(() => '?').join(',')} WHERE EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)` : `VALUES (${fields.map(() => '?').join(',')})`}`;
  return db
    .prepare(sql)
    .bind(...values, ...(guard ? [org, guard.id, guard.nonce] : []));
}
export async function context(): Promise<Context> {
  let user: {
    userId: string;
    displayName: string;
    email: string;
    fullName: string | null;
  } | null = await getChatGPTUser();
  if (!user) {
    // Self-hosted identity: Cloudflare Access's verified JWT when those
    // settings exist, otherwise the app's own signed session from GitHub or
    // Google sign-in. Both fail closed when unconfigured.
    const { headers } = await import('next/headers');
    const requestHeaders = await headers();
    const { getAccessUser } = await import('./access-auth');
    user = await getAccessUser({ headers: requestHeaders });
    if (!user && env.DB) {
      const { sessionUser } = await import('./session');
      user = await sessionUser({ db: env.DB }, requestHeaders.get('cookie'));
    }
    if (!user && env.DB) {
      // Scoped API tokens speak as their workspace, with provenance and
      // with the scope gate applied to every command.
      const { tokenFromHeader, parseScopes } = await import('./api-tokens');
      const row = await tokenFromHeader(
        { db: env.DB },
        requestHeaders.get('authorization'),
      );
      if (row) {
        const c = {
          org: row.org,
          actor: 'api:' + row.name,
          name: row.name,
          db: env.DB,
          tokenScopes: parseScopes(row.scopes),
        };
        await seed(c);
        return c;
      }
    }
  }
  if (!user && import.meta.env.DEV)
    user = {
      userId: 'local-studio-owner',
      displayName: 'Gabri',
      email: 'local@example.invalid',
      fullName: 'Gabri',
    };
  if (!user) throw new AppError('Sign in to access your workspace.', 401);
  if (!env.DB)
    throw new AppError('The workspace database is unavailable.', 503);
  const c = {
    org: user.userId,
    actor: 'me',
    name: user.fullName || user.displayName.split('@')[0],
    db: env.DB,
  };
  await seed(c);
  await upgradeResources(c);
  try {
    await materializeRecurringMeetings(c);
  } catch {
    /* Reading the workspace never fails on rhythm bookkeeping. */
  }
  return c;
}
async function seed(c: Context) {
  if (
    await c.db
      .prepare('SELECT id FROM organizations WHERE id=?')
      .bind(c.org)
      .first()
  )
    return;
  const data = emptyWorkspace(c.name);
  const statements: D1PreparedStatement[] = [
    c.db
      .prepare(
        'INSERT OR IGNORE INTO organizations (id,name,createdAt) VALUES (?,?,?)',
      )
      .bind(c.org, 'Studio workspace', new Date().toISOString()),
  ];
  for (const table of collections) {
    for (const row of data[table] || []) {
      const extra =
        table === 'reviews'
          ? {
              snapshot:
                data.tasks.find(
                  (t) => t.id === (row as { taskId: string }).taskId,
                )?.deliverable || '',
            }
          : {};
      statements.push(
        insert(c.db, table, c.org, { ...row, ...extra } as DataRow),
      );
    }
  }
  await c.db.batch(statements);
}
export async function readWorkspace(c: Context): Promise<Workspace> {
  const results = await c.db.batch(
    collections.map((table) =>
      c.db
        .prepare(
          `SELECT * FROM "${table}" WHERE org=?${['activities', 'notes', 'notices', 'reviews', 'spaceEvents'].includes(table) ? ' ORDER BY createdAt DESC' : ''}`,
        )
        .bind(c.org),
    ),
  );
  const out: Record<string, unknown> = { environment: import.meta.env.DEV ? 'local' : 'hosted', currentMember: c.actor, draftScope: c.org + ':' + c.actor, demo: false };
  collections.forEach(
    (table, i) =>
      (out[table] = results[i].results.map((raw) => {
        const row = raw as Record<string, unknown>;
        const {
          org,
          lastMutation,
          fileKey,
          fingerprint,
          deliveryClaim,
          conversionFingerprint,
          ...record
        } = row;
        void conversionFingerprint;
        void deliveryClaim;
        if (
          table === 'dailyPlans' &&
          record.deliveryStatus === 'sending' &&
          Date.now() - Number(String(deliveryClaim).split(':')[0]) > 60000
        ) {
          record.deliveryStatus = 'unknown';
          record.deliveryError =
            'Delivery could not be confirmed. Check Slack before sending again.';
        }
        void fingerprint;
        void org;
        void lastMutation;
        void fileKey;
        return record;
      })),
  );
  const allTasks = out.tasks as Task[];
  out.googleCalendar = await googleStatus(c, env as unknown as GoogleConfig);
  out.googleDrive = await driveStatus(c, env as unknown as GoogleConfig);
  out.slackConnected = !!slackUrl(env as unknown as SlackConfig, c.org);
  const slackDeliveryCounts = await c.db
    .prepare(
      "SELECT deliveryStatus AS s, COUNT(*) AS n FROM slackMessages WHERE org=? AND deliveryStatus IN ('pending','failed','unknown','sending') GROUP BY deliveryStatus",
    )
    .bind(c.org)
    .all<{ s: string; n: number }>();
  out.slackCoverage = {
    plan: out.slackConnected,
    events: !!slackEventTransport(env as unknown as SlackEnv, c.org),
    inbound: !!slackInboundConfig(env as unknown as SlackEnv),
    undelivered: (slackDeliveryCounts.results || []).reduce(
      (sum, row) => sum + Number(row.n),
      0,
    ),
  };
  out.calendarEvents = (
    out.calendarEvents as NonNullable<Workspace['calendarEvents']>
  ).filter((e) => (!e.archived || e.googleEventId) && (!e.googleEventId || e.actor === c.actor));
  out.tasks = allTasks.filter((t) => !t.archived);
  out.archivedTasks = allTasks.filter((t) => t.archived);
  const activeIds = new Set((out.tasks as Task[]).map((t) => t.id));
  out.notices = (out.notices as Workspace['notices']).filter((n) =>
    activeIds.has(n.taskId) && n.recipient === c.actor,
  );
  return out as Workspace;
}
async function exists(c: Context, table: Table, id: string) {
  if (
    !(await c.db
      .prepare(`SELECT id FROM "${table}" WHERE org=? AND id=?`)
      .bind(c.org, id)
      .first())
  )
    throw new AppError(`The selected ${table} record does not exist.`, 404);
}
function newTask(
  id: string,
  title: string,
  description: string,
  projectId: string | null,
  position: number,
): Task {
  return {
    id,
    title,
    description,
    projectId,
    spaceId: null,
    assignee: 'me',
    reviewer: 'me',
    stage: 'Up next',
    due: '',
    priority: 'Normal',
    blocked: '',
    deliverable: '',
    delivery: 'Not configured',
    version: 0,
    revision: 0,
    position,
    updatedAt: new Date().toISOString(),
    meetingId: null,
  };
}
export async function mutate(
  c: Context,
  input: Record<string, unknown>,
  capture?: { row: CaptureEntry; fingerprint: string },
) {
  const type = textValue(input.type, 'Action', 40, true),
    now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  if (c.tokenScopes) {
    const { enforceTokenScopes } = await import('./api-tokens');
    enforceTokenScopes(c.tokenScopes, type);
  }
  if (type === 'token-create' || type === 'token-revoke') {
    const { createToken, revokeToken } = await import('./api-tokens');
    if (type === 'token-create') await createToken(c, input);
    else await revokeToken(c, input);
    return;
  }
  if (type === 'day-work') { await changeDayWork(c,input); return; }
  if (type === 'daily-plan-commit') {
    await commitDailyPlan(
      c,
      input,
      await readWorkspace(c),
      !!slackUrl(env as unknown as SlackConfig, c.org),
    );
    try {
      await deliverDailyPlan(
        c,
        String(input.id),
        env as unknown as SlackConfig,
      );
    } catch {
      /* The plan is committed even if delivery bookkeeping is unavailable. */
    }
    return;
  }
  if (type === 'daily-plan-deliver') {
    const id = textValue(input.id, 'Plan', 36, true);
    await deliverDailyPlan(c, id, env as unknown as SlackConfig);
    return;
  }
  if (['task-archive', 'task-restore', 'task-delete'].includes(type)) {
    await mutateTaskLifecycle(c, input);
    return;
  }
  if (type.startsWith('calendar-')) {
    await mutateCalendar(c, input);
    return;
  }
  if (type === 'project-capture') {
    await mutateProjectCapture(c, input);
    return;
  }
  if (type === 'capture-entry') {
    await mutateEntry(c, input);
    return;
  }
  if (type.startsWith('sales-')) {
    await mutateSales(c, input);
    return;
  }
  if (
    type.startsWith('resource-') ||
    type === 'folder-create' ||
    type === 'blueprint-create'
  ) {
    await mutateResource(c, input);
    return;
  }
  if (type === 'client-delete' || type === 'client-to-prospect') {
    await mutateClientLifecycle(c, input);
    return;
  }
  if (
    type.startsWith('client-') ||
    type.startsWith('meeting-') ||
    type === 'project-deadline'
  ) {
    await mutateClient(c, input);
    return;
  }
  if (type === 'create' || type === 'quick-create') {
    const title = textValue(input.title, 'Task name', 180, true),
      description = textValue(input.description ?? '', 'Description'),
      projectId = textValue(input.projectId ?? '', 'Project', 100) || null;
    if (projectId) await exists(c, 'projects', projectId);
    const directSpaceId = textValue(input.spaceId ?? '', 'Client', 100) || null;
    if (directSpaceId) await exists(c, 'spaces', directSpaceId);
    if (projectId && directSpaceId) {
      const project = await c.db
        .prepare('SELECT spaceId FROM projects WHERE org=? AND id=?')
        .bind(c.org, projectId)
        .first<{ spaceId: string | null }>();
      if (project?.spaceId !== directSpaceId)
        throw new AppError('The client and project do not match.');
    }
    const captureId =
      type === 'quick-create'
        ? textValue(input.captureId, 'Capture ID', 36, true)
        : nonce;
    if (
      type === 'quick-create' &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        captureId,
      )
    )
      throw new AppError('Invalid capture ID.');
    const captureText =
      type === 'quick-create'
        ? textValue(input.captureText ?? '', 'Capture text', 2000, true)
        : '';
    const count = await c.db
      .prepare(
        type === 'quick-create'
          ? 'SELECT COALESCE(MIN(position),0)-1 AS position FROM tasks WHERE org=?'
          : 'SELECT COALESCE(MAX(position),0)+1 AS position FROM tasks WHERE org=?',
      )
      .bind(c.org)
      .first<{ position: number }>();
    const t = newTask(
      captureId,
      title,
      description,
      projectId,
      count?.position ?? 1,
    );
    t.spaceId = projectId ? null : directSpaceId;
    t.due = dateValue(input.due ?? '');
    t.plannedFor = dateValue(input.plannedFor ?? '');
    t.dueTime = t.due ? timeValue(input.dueTime ?? '') : '';
    if(input.reviewRequired !== undefined && ![0,1].includes(input.reviewRequired as number)) throw new AppError('Choose whether review is required.');
    t.reviewRequired = input.reviewRequired === 0 ? 0 : 1;
    t.assignee = textValue(
      type === 'quick-create' ? c.actor : (input.assignee ?? c.actor),
      'Responsible person',
      100,
      true,
    );
    await exists(c, 'members', t.assignee);
    const meetingId = textValue(input.meetingId ?? '', 'Meeting', 100) || null;
    if (meetingId) {
      const meeting = await c.db
        .prepare('SELECT spaceId,prospectId FROM meetings WHERE org=? AND id=?')
        .bind(c.org, meetingId)
        .first<{ spaceId: string | null; prospectId: string | null }>();
      if (!meeting) throw new AppError('Meeting not found.', 404);
      const project = projectId
        ? await c.db
            .prepare('SELECT spaceId FROM projects WHERE org=? AND id=?')
            .bind(c.org, projectId)
            .first<{ spaceId: string }>()
        : null;
      if (projectId && (!project || !meeting.spaceId || project.spaceId !== meeting.spaceId))
        throw new AppError('Choose a project belonging to this meeting’s client.');
      if (directSpaceId && directSpaceId !== meeting.spaceId) throw new AppError('The task and meeting must have the same client.');
      t.spaceId = projectId ? null : meeting.spaceId;
      t.prospectId = meeting.prospectId;
      t.meetingId = meetingId;
    }
    const sameCapture = (existing: Task) =>
      existing.title === t.title &&
      existing.description === t.description &&
      existing.projectId === t.projectId &&
      existing.meetingId === t.meetingId &&
      (existing.prospectId || null) === (t.prospectId || null) &&
      existing.spaceId === t.spaceId &&
      existing.due === t.due &&
      existing.assignee === t.assignee && (existing.reviewRequired ?? 1) === t.reviewRequired;
    if (type === 'quick-create') {
      const existing = await c.db
        .prepare('SELECT * FROM tasks WHERE org=? AND id=?')
        .bind(c.org, t.id)
        .first<Task>();
      if (existing) {
        if (!sameCapture(existing))
          throw new AppError(
            'This capture was already saved with different details.',
            409,
          );
        return;
      }
    }
    const result = await c.db.batch([
      insert(c.db, 'tasks', c.org, { ...t, lastMutation: nonce }),
      insert(
        c.db,
        'activities',
        c.org,
        {
          id: crypto.randomUUID(),
          taskId: t.id,
          body: captureText ? 'Captured: ' + captureText : 'Created the task',
          actor: c.actor,
          createdAt: now,
        },
        { id: t.id, nonce },
      ),
      ...(type === 'quick-create'
        ? [
            captureInsert(
              c,
              {
                id: t.id,
                kind: 'task',
                sourceText: captureText,
                title: t.title,
                body: '',
                targetType: 'task',
                targetId: t.id,
                spaceId: directSpaceId,
                projectId: t.projectId,
                taskId: t.id,
                actor: c.actor,
                createdAt: now,
              },
              nonce,
              '',
              { taskId: t.id },
            ),
          ]
        : []),
    ]);
    if (!result[0].meta.changes && type === 'quick-create') {
      const existing = await c.db
        .prepare('SELECT * FROM tasks WHERE org=? AND id=?')
        .bind(c.org, t.id)
        .first<Task>();
      if (!existing || !sameCapture(existing))
        throw new AppError(
          'This capture was already saved with different details.',
          409,
        );
    }
    return;
  }
  if (type === 'template') {
    const spaceId = textValue(input.spaceId, 'Space', 100, true);
    await exists(c, 'spaces', spaceId);
    const p = {
      id: nonce,
      name: 'New campaign',
      spaceId,
      description: 'Campaign template · brief, production, and review.',
      due: '',
    };
    const taskNames = [
      'Confirm the campaign brief',
      'Create the campaign deliverables',
      'Prepare the campaign handoff',
    ];
    await c.db.batch([
      insert(c.db, 'projects', c.org, p),
      ...taskNames.map((name, i) =>
        insert(
          c.db,
          'tasks',
          c.org,
          newTask(
            crypto.randomUUID(),
            name,
            'Define the expected outcome and acceptance criteria.',
            p.id,
            100 + i,
          ),
        ),
      ),
    ]);
    return;
  }
  const id = textValue(input.id, 'Record', 100, true);
  if (type === 'read-notice') {
    await c.db
      .prepare('UPDATE notices SET read=1 WHERE org=? AND id=? AND recipient=?')
      .bind(c.org, id, c.actor)
      .run();
    return;
  }
  const task = await c.db
    .prepare('SELECT * FROM tasks WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<Task>();
  if (!task) throw new AppError('Task not found.', 404);
  if (task.archived)
    throw new AppError('Restore this task before changing it.', 409);
  if (type === 'note') {
    const body = textValue(input.body, 'Note', 10000, true);
    const result = await c.db.batch([
      c.db
        .prepare(
          'UPDATE tasks SET revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND archived=0',
        )
        .bind(now, nonce, c.org, id, task.revision),
      insert(
        c.db,
        'notes',
        c.org,
        {
          id: nonce,
          taskId: id,
          body,
          actor: c.actor,
          createdAt: now,
        },
        { id, nonce },
      ),
      insert(
        c.db,
        'activities',
        c.org,
        {
          id: crypto.randomUUID(),
          taskId: id,
          body: 'Added a note',
          actor: c.actor,
          createdAt: now,
        },
        { id, nonce },
      ),
    ]);
    if (!result[0].meta.changes)
      throw new AppError('This task changed. Refresh and try again.', 409);
    return;
  }
  const revision = revisionValue(input.revision);
  if (task.revision !== revision)
    throw new AppError(
      'This task changed in another session. Close and reopen it to get the latest version.',
      409,
    );
  const updates: DataRow = {
    revision: revision + 1,
    updatedAt: now,
    lastMutation: nonce,
  };
  let activity = 'Updated task';
  const secondary: D1PreparedStatement[] = [];
  const guard = { id, nonce };
  const guardSql =
    'EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND lastMutation=?)';
  const invalidate = () =>
    secondary.push(
      c.db
        .prepare(
          `UPDATE reviews SET decision='Superseded' WHERE org=? AND taskId=? AND decision IN ('Pending','Approved') AND ${guardSql}`,
        )
        .bind(c.org, id, c.org, id, nonce),
    );
  const notify = (recipient: string, body: string) =>
    secondary.push(
      insert(
        c.db,
        'notices',
        c.org,
        {
          id: crypto.randomUUID(),
          taskId: id,
          recipient,
          body,
          read: 0,
          createdAt: now,
        },
        guard,
      ),
    );
  let slackQueued = false;
  // Workspace events queue for Slack atomically with their mutation. The row is
  // 'pending' only when a transport is configured; delivery happens after commit.
  const slackEvent = (kind: SlackEventKind, body: string) => {
    slackQueued = true;
    secondary.push(
      insert(
        c.db,
        'slackMessages',
        c.org,
        slackMessageRow(env as unknown as SlackEnv, c.org, kind, id, body, now),
        guard,
      ),
    );
  };
  const submit = async () => {
    const reviewer = textValue(input.reviewer ?? task.reviewer, 'Reviewer', 100, true);
    canSubmit({ ...task, reviewer });
    if (reviewer === c.actor) throw new AppError('Choose another team member to review this task.');
    await exists(c, 'members', reviewer);
    updates.stage = 'Review';
    updates.reviewer = reviewer;
    updates.version = task.version + 1;
    updates.delivery = 'Not configured';
    activity = `Submitted version ${task.version + 1} for review`;
    invalidate();
    secondary.push(
      insert(
        c.db,
        'reviews',
        c.org,
        {
          id: crypto.randomUUID(),
          taskId: id,
          version: task.version + 1,
          reviewer,
          decision: 'Pending',
          feedback: '',
          snapshot: task.deliverable.trim() || task.description.trim() || task.title,
          createdAt: now,
        },
        guard,
      ),
    );
    notify(reviewer, `Ready for review: ${task.title}`);
    slackEvent('review-request', c.name + ' submitted for review: ' + task.title);
  };
  const complete = () => {
    if (task.stage === 'Done')
      throw new AppError('The task is already complete.');
    updates.stage = 'Done';
    updates.delivery = 'Internal completion';
    activity = task.stage === 'Review' ? 'Completed task and closed the review request' : 'Completed task';
    // A recurring task spawns its next occurrence in the same transaction that
    // completes it: no scheduler, exactly once per completion, and an
    // unattended task stays a single overdue item instead of multiplying.
    if (task.recurrence && validRecurrence(task.recurrence)) {
      const nextDue = nextDueDate(task.recurrence, task.due, now.slice(0, 10));
      activity += ' · next occurrence scheduled for ' + nextDue;
      secondary.push(
        insert(
          c.db,
          'tasks',
          c.org,
          {
            id: crypto.randomUUID(),
            title: task.title,
            prospectId: task.prospectId ?? null,
            projectId: task.projectId,
            spaceId: task.spaceId,
            assignee: task.assignee,
            reviewer: task.reviewer,
            stage: 'Up next',
            description: task.description,
            due: nextDue,
            dueTime: task.dueTime || '',
            priority: task.priority,
            blocked: '',
            deliverable: task.deliverable,
            delivery: 'Not configured',
            version: 0,
            recurrence: task.recurrence,
            recurrenceOf: task.recurrenceOf || task.id,
            reviewRequired: task.reviewRequired ?? 0,
            revision: 0,
            position: task.position,
            plannedFor: '',
            focusFor: '',
            archived: 0,
            updatedAt: now,
          },
          guard,
        ),
      );
    }
    // Completion closes a pending request without claiming the work was approved.
    // Existing decisions and their version snapshots remain in the history.
    secondary.push(
      c.db.prepare(`UPDATE reviews SET decision='Superseded' WHERE org=? AND taskId=? AND decision='Pending' AND ${guardSql}`)
        .bind(c.org, id, c.org, id, nonce),
      c.db.prepare(`UPDATE notices SET read=1 WHERE org=? AND taskId=? AND body LIKE 'Ready for review:%' AND ${guardSql}`)
        .bind(c.org, id, c.org, id, nonce),
    );
  };
  if (type === 'progress' || type === 'blocker') {
    if (!capture) throw new AppError('Record this update through capture.');
    const body = textValue(
      input.body,
      'Update',
      type === 'blocker' ? 520 : 2000,
      true,
    );
    if (type === 'blocker') {
      if (task.stage === 'Done')
        throw new AppError('Reopen the task before changing its blocker.');
      updates.blocked =
        input.clear === true
          ? ''
          : textValue(body, 'Blocking reason', 500, true);
      activity = input.clear === true ? body : 'Blocked: ' + body;
      for (const recipient of blockerRecipients(task, c.actor))
        notify(
          recipient,
          (input.clear === true ? 'Unblocked: ' : 'Needs help: ') +
            task.title +
            (input.clear === true ? '' : ' — ' + body),
        );
      slackEvent(
        'blocker',
        (input.clear === true ? 'Unblocked: ' : 'Needs help: ') +
          task.title +
          (input.clear === true ? '' : ' — ' + body),
      );
    } else activity = 'Progress: ' + body;
    secondary.push(
      insert(
        c.db,
        'notes',
        c.org,
        {
          id: capture.row.id,
          taskId: id,
          body: activity,
          actor: c.actor,
          createdAt: now,
        },
        guard,
      ),
    );
  } else if (type === 'deadline') {
    updates.due = dateValue(input.due);
    updates.dueTime = updates.due
      ? timeValue(input.dueTime ?? task.dueTime ?? '')
      : '';
    activity = updates.due
      ? 'Set the deadline to ' + updates.due
      : 'Cleared the deadline';
  } else if (type === 'edit') {
    updates.title = textValue(input.title, 'Task name', 180, true);
    updates.description = textValue(input.description, 'Description');
    updates.due = dateValue(input.due);
    updates.dueTime = updates.due
      ? timeValue(input.dueTime ?? task.dueTime ?? '')
      : '';
    updates.blocked = textValue(input.blocked, 'Blocking reason', 500);
    updates.assignee = textValue(
      input.assignee,
      'Responsible person',
      100,
      true,
    );
    updates.reviewer = textValue(input.reviewer, 'Reviewer', 100, true);
    if (input.recurrence !== undefined) {
      if (!validRecurrence(input.recurrence))
        throw new AppError('Choose a supported rhythm.');
      updates.recurrence = input.recurrence;
    }
    await exists(c, 'members', String(updates.assignee));
    await exists(c, 'members', String(updates.reviewer));
    if (task.reviewer !== updates.reviewer && task.stage === 'Review') {
      invalidate();
      updates.stage = 'Doing';
    }
    activity = 'Updated the brief and task details';
  } else if (type === 'move') {
    const stage = stageValue(input.stage);
    if (stage === task.stage && !capture) return;
    if (stage === task.stage) activity = 'Confirmed status: ' + stage;
    else if (stage === 'Review') await submit();
    else if (stage === 'Done') complete();
    else {
      updates.stage = stage;
      if (task.stage === 'Review' || task.stage === 'Done') {
        invalidate();
        updates.delivery = 'Not configured';
      }
      activity = `Moved from ${task.stage} to ${stage}`;
    }
  } else if (type === 'deliverable') {
    if (task.stage === 'Done')
      throw new AppError('Reopen the task before changing its deliverable.');
    updates.deliverable = textValue(input.body, 'Deliverable', 30000, true);
    updates.stage = task.stage === 'Review' ? 'Doing' : task.stage;
    updates.delivery = 'Not configured';
    invalidate();
    activity = 'Saved the deliverable draft';
  } else if (type === 'submit') await submit();
  else if (type === 'review') {
    const decision = textValue(input.decision, 'Decision', 30, true);
    if (!['Approved', 'Changes requested'].includes(decision))
      throw new AppError('Choose an approval or changes requested.');
    if (task.stage !== 'Review')
      throw new AppError('This task is not in review.');
    if (task.reviewer !== c.actor)
      throw new AppError('Only the requested reviewer can record a review decision.', 403);
    const pending = await c.db
      .prepare(
        "SELECT id FROM reviews WHERE org=? AND taskId=? AND version=? AND decision='Pending'",
      )
      .bind(c.org, id, task.version)
      .first<{ id: string }>();
    if (!pending)
      throw new AppError('This version has already been reviewed.', 409);
    const feedback = textValue(
      input.feedback ?? '',
      'Feedback',
      10000,
      decision === 'Changes requested',
    );
    secondary.push(
      c.db
        .prepare(
          `UPDATE reviews SET decision=?,feedback=? WHERE org=? AND id=? AND decision='Pending' AND ${guardSql}`,
        )
        .bind(decision, feedback, c.org, pending.id, c.org, id, nonce),
    );
    updates.stage = decision === 'Approved' ? 'Review' : 'Doing';
    activity = `${decision} for version ${task.version}`;
    notify(task.assignee, `${decision}: ${task.title}`);
    slackEvent('review-decision', `${decision}: ${task.title}`);
  } else if (type === 'complete') complete();
  else throw new AppError('Unknown action.');
  if (capture) {
    secondary.push(
      captureInsert(c, capture.row, nonce, capture.fingerprint, { taskId: id }),
    );
    if (capture.row.spaceId)
      secondary.push(
        insert(
          c.db,
          'spaceEvents',
          c.org,
          {
            id: crypto.randomUUID(),
            spaceId: capture.row.spaceId,
            meetingId: null,
            body: task.title + ' · ' + activity,
            snapshot: JSON.stringify({ captureId: capture.row.id, taskId: id }),
            actor: c.actor,
            createdAt: now,
          },
          guard,
        ),
      );
  }
  const fields = Object.keys(updates);
  const update = c.db
    .prepare(
      `UPDATE tasks SET ${fields.map((k) => `"${k}"=?`).join(',')} WHERE org=? AND id=? AND revision=?`,
    )
    .bind(...Object.values(updates), c.org, id, revision);
  const result = await c.db.batch([
    update,
    ...secondary,
    insert(
      c.db,
      'activities',
      c.org,
      {
        id: crypto.randomUUID(),
        taskId: id,
        body: activity,
        actor: c.actor,
        createdAt: now,
      },
      guard,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new AppError(
      'This task changed in another session. Close and reopen it to refresh.',
      409,
    );
  if (slackQueued) {
    try {
      await deliverSlackMessages(c, env as unknown as SlackEnv);
    } catch {
      /* The mutation is committed even if delivery bookkeeping is unavailable. */
    }
  }
}
