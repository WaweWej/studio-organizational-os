import type { Context } from './store';
import type { Workspace, Task } from './model';
import { AppError, textValue, dateValue, revisionValue } from './validation';
import { timeValue } from './calendar-store';
import { normalized } from './daily-plan';
import { prospectNameKey } from './sales-model';
import { taskSpaceId } from './task-context';

export async function commitDailyPlan(
  c: Context,
  input: Record<string, unknown>,
  data: Workspace,
  slackConnected: boolean,
) {
  const id = textValue(input.id, 'Plan ID', 36, true);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('Invalid plan ID.');
  const day = dateValue(input.day);
  if (!day) throw new AppError('Choose the day to plan.');
  const sourceText = textValue(input.sourceText, 'Daily plan', 15000, true);
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 30
  )
    throw new AppError('Plan between 1 and 30 tasks at a time.');
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new AppError('Invalid task.');
    const r = raw as Record<string, unknown>;
    const due = dateValue(r.due || '');
    return {
      source: textValue(r.source, 'Original task', 2000, true),
      title: textValue(r.title, 'Task title', 180, true),
      taskId: textValue(r.taskId || '', 'Task', 100),
      revision: r.taskId ? revisionValue(r.revision) : null,
      spaceId: textValue(r.spaceId || '', 'Client', 100),
      prospectId: textValue(r.prospectId || '', 'Prospect', 100),
      newProspect: textValue(r.newProspect || '', 'New prospect name', 140),
      projectId: textValue(r.projectId || '', 'Project', 100),
      newSpace: textValue(r.newSpace || '', 'New client name', 180),
      newProject: textValue(r.newProject || '', 'New project name', 180),
      reviewRequired: r.reviewRequired === undefined ? 1 : r.reviewRequired === 0 ? 0 : r.reviewRequired === 1 ? 1 : (() => {throw new AppError('Choose whether review is required.');})(),
      due,
      dueTime: due ? timeValue(r.dueTime || '') : '',
    };
  });
  const fingerprint = JSON.stringify({ day, sourceText, items });
  const previous = await c.db
    .prepare('SELECT fingerprint,actor FROM dailyPlans WHERE org=? AND id=?')
    .bind(c.org, id)
    .first<{ fingerprint: string; actor: string }>();
  if (previous) {
    if (previous.fingerprint === fingerprint && previous.actor === c.actor)
      return;
    throw new AppError(
      'This plan was already committed with different details.',
      409,
    );
  }
  const now = new Date().toISOString(),
    nonce = crypto.randomUUID();
  const guard =
    'EXISTS (SELECT 1 FROM dailyPlans WHERE org=? AND id=? AND lastMutation=?)';
  const work: D1PreparedStatement[] = [];
  const insert = (table: string, row: Record<string, unknown>) => {
    const record = { org: c.org, ...row },
      fields = Object.keys(record);
    work.push(
      c.db
        .prepare(
          'INSERT INTO ' +
            table +
            ' (' +
            fields.join(',') +
            ') SELECT ' +
            fields.map(() => '?').join(',') +
            ' WHERE ' +
            guard,
        )
        .bind(...Object.values(record), c.org, id, nonce),
    );
  };
  const spaces = [...data.spaces],
    projects = [...data.projects],
    prospects = [...data.prospects];
  const checks: string[] = [],
    bindings: unknown[] = [],
    seen = new Set<string>();
  const summary: string[] = [];
  for (const item of items) {
    let prospectId = item.prospectId || null;
    if (
      (prospectId || item.newProspect) &&
      ((item.spaceId &&
        item.spaceId !==
          prospects.find((p) => p.id === prospectId)?.clientId) ||
        item.newSpace ||
        (!item.taskId && item.projectId) ||
        item.newProject)
    )
      throw new AppError('Choose sales prospect work or client/project work.');
    if (prospectId && !prospects.some((p) => p.id === prospectId))
      throw new AppError('A selected prospect is unavailable.', 404);
    if (prospectId && item.newProspect)
      throw new AppError('Choose an existing prospect or a new prospect.');
    if (item.newProspect) {
      const nameKey = prospectNameKey(item.newProspect);
      const match = prospects.find((p) => p.nameKey === nameKey);
      if (match) prospectId = match.id;
      else {
        prospectId = crypto.randomUUID();
        const row = {
          id: prospectId,
          name: item.newProspect,
          nameKey,
          owner: c.actor,
          stage: 'New' as const,
          revision: 0,
          createdAt: now,
          updatedAt: now,
        };
        insert('prospects', { ...row, lastMutation: nonce });
        prospects.push(row);
      }
    }
    let spaceId = item.spaceId || null,
      projectId = item.projectId || null;
    if (spaceId && !spaces.some((s) => s.id === spaceId))
      throw new AppError('A selected client is unavailable.', 404);
    if (item.newSpace && spaceId)
      throw new AppError('Choose an existing client or a new client.');
    if (item.newSpace) {
      const matches = spaces.filter(
        (s) => normalized(s.name) === normalized(item.newSpace),
      );
      if (matches.length > 1)
        throw new AppError('Choose the exact client from the list.');
      if (matches[0]) spaceId = matches[0].id;
      else {
        spaceId = crypto.randomUUID();
        const row = {
          id: spaceId,
          name: item.newSpace,
          type: 'Client',
          color: '#6471bf',
          brief: '',
          owner: c.actor,
          meeting: '',
          tagline: '',
          wants: '',
          needs: '',
          audience: '',
          voice: '',
          website: '',
          coverUrl: '',
          logoUrl: '',
          brandStyle: 'sans',
          revision: 0,
        };
        insert('spaces', row);
        spaces.push(row);
      }
    }
    if (item.newProject && projectId)
      throw new AppError('Choose an existing project or a new project.');
    if (item.newProject) {
      const matches = projects.filter(
        (p) =>
          normalized(p.name) === normalized(item.newProject) &&
          p.spaceId === spaceId,
      );
      if (matches.length > 1)
        throw new AppError('Choose the exact project from the list.');
      if (matches[0]) projectId = matches[0].id;
      else {
        projectId = crypto.randomUUID();
        const row = {
          id: projectId,
          name: item.newProject,
          spaceId,
          description: '',
          due: '',
        };
        insert('projects', row);
        projects.push(row);
      }
    }
    if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      if (!project)
        throw new AppError('A selected project is unavailable.', 404);
      if (spaceId && project.spaceId !== spaceId)
        throw new AppError('The client and project do not match.');
      spaceId =
        project.spaceId ||
        prospects.find((p) => p.id === prospectId)?.clientId ||
        null;
    }
    for (const [table, selected, original] of [
      ['spaces', spaceId, data.spaces],
      ['projects', projectId, data.projects],
      ['prospects', prospectId, data.prospects],
    ] as const) {
      if (selected && original.some((row) => row.id === selected)) {
        checks.push(
          'EXISTS (SELECT 1 FROM ' + table + ' WHERE org=? AND id=?)',
        );
        bindings.push(c.org, selected);
      }
    }
    let taskId = item.taskId;
    if (taskId) {
      const task = data.tasks.find((t) => t.id === taskId && !t.archived);
      if (!task || task.assignee !== c.actor || task.stage === 'Done')
        throw new AppError('Choose one of your unfinished tasks.');
      if (
        item.newSpace ||
        item.newProspect ||
        (task.prospectId || null) !== prospectId ||
        item.newProject ||
        task.projectId !== projectId ||
        taskSpaceId(data, task) !== spaceId
      )
        throw new AppError(
          'Existing tasks keep their prospect, client and project. Edit their context in task details.',
        );
      checks.push(
        "EXISTS (SELECT 1 FROM tasks WHERE org=? AND id=? AND revision=? AND archived=0 AND assignee=? AND stage<>'Done')",
      );
      bindings.push(c.org, taskId, item.revision, c.actor);
      work.push(
        c.db
          .prepare(
            'UPDATE tasks SET plannedFor=?,due=?,dueTime=?,revision=revision+1,updatedAt=?,lastMutation=? WHERE org=? AND id=? AND revision=? AND ' +
              guard,
          )
          .bind(
            day,
            item.due,
            item.dueTime,
            now,
            nonce,
            c.org,
            taskId,
            item.revision,
            c.org,
            id,
            nonce,
          ),
      );
    } else {
      taskId = crypto.randomUUID();
      const task: Task = {
        id: taskId,
        title: item.title,
        projectId,
        prospectId,
        spaceId: projectId ? null : spaceId,
        assignee: c.actor,
        reviewer: c.actor,
        stage: 'Up next',
        description: '',
        due: item.due,
        dueTime: item.dueTime,
        plannedFor: day,
        reviewRequired: item.reviewRequired,
        priority: 'Normal',
        blocked: '',
        deliverable: '',
        delivery: 'Not configured',
        version: 0,
        revision: 0,
        position: data.tasks.length + summary.length,
        updatedAt: now,
        meetingId: null,
        archived: 0,
      };
      insert('tasks', { ...task, lastMutation: nonce });
    }
    const key =
      item.taskId ||
      normalized(item.title) +
        ':' +
        (projectId || '') +
        ':' +
        (spaceId || '') +
        ':' +
        (prospectId || '');
    if (seen.has(key))
      throw new AppError('The same task appears twice in this plan.');
    seen.add(key);
    if (prospectId)
      insert('prospectEvents', {
        id: crypto.randomUUID(),
        prospectId,
        taskId,
        body: 'Planned: ' + item.title,
        kind: 'task',
        actor: c.actor,
        createdAt: now,
        fingerprint: '',
        lastMutation: nonce,
      });
    insert('dailyPlanTasks', { planId: id, taskId });
    insert('activities', {
      id: crypto.randomUUID(),
      taskId,
      body: 'Committed to daily plan for ' + day,
      actor: c.actor,
      createdAt: now,
    });
    const context = [
      prospects.find((p) => p.id === prospectId)?.name,
      spaces.find((s) => s.id === spaceId)?.name,
      projects.find((p) => p.id === projectId)?.name,
    ]
      .filter(Boolean)
      .join(' / ');
    const title = item.taskId
      ? data.tasks.find((t) => t.id === item.taskId)!.title
      : item.title;
    summary.push(
      '• ' +
        title +
        (context ? ' — ' + context : '') +
        (item.dueTime ? ' · by ' + item.dueTime : ''),
    );
  }
  const first = c.db
    .prepare(
      'INSERT OR IGNORE INTO dailyPlans (org,id,day,actor,sourceText,summary,createdAt,fingerprint,lastMutation,deliveryStatus) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ' +
        (checks.length ? checks.join(' AND ') : '1'),
    )
    .bind(
      c.org,
      id,
      day,
      c.actor,
      sourceText,
      summary.join('\n'),
      now,
      fingerprint,
      nonce,
      slackConnected ? 'pending' : 'not_connected',
      ...bindings,
    );
  insert('captureEntries', {
    id,
    kind: 'daily',
    sourceText,
    title: 'Daily plan · ' + day,
    body: summary.join('\n'),
    targetType: 'plan',
    targetId: id,
    spaceId: null,
    projectId: null,
    taskId: null,
    actor: c.actor,
    createdAt: now,
    fingerprint,
    lastMutation: nonce,
  });
  const results = await c.db.batch([first, ...work]);
  if (!results[0].meta.changes) {
    const raced = await c.db
      .prepare('SELECT fingerprint FROM dailyPlans WHERE org=? AND id=?')
      .bind(c.org, id)
      .first<{ fingerprint: string }>();
    if (raced?.fingerprint === fingerprint) return;
    throw new AppError(
      'One of these tasks changed. Review the plan again before committing.',
      409,
    );
  }
}
