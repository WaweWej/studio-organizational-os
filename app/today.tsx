'use client';
import { taskSpaceId } from '@/lib/task-context';
import FinishDay from './finish-day';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildDailyBrief, localDay, taskContext } from '@/lib/workspace-brief';
import type { DailyPlan, Workspace } from '@/lib/model';

export function useWorkspaceClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function readableDate(value: string, time = false) {
  if (!value) return 'No date set';
  const date = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}
export default function Today({
  data,
  ready,
  busy,
  openTask,
  openBrief,
  openMeeting,
  error,
  openPlan,
  openBoard,
  openCalendar,
  openCalendarMeeting,

  act,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  openBrief: (id: string) => void;
  openMeeting: (spaceId: string | null, meetingId: string) => void;
  error: string;
  openPlan: () => void;
  openBoard: () => void;
  openCalendar: () => void;
  openCalendarMeeting: (id: string) => void;

  act: (command: Record<string, unknown>) => Promise<boolean>;
}) {
  const [finishing, setFinishing] = useState(false);
  const now = useWorkspaceClock(),
    day = localDay(now),
    brief = buildDailyBrief(data, now);
  const plans = (data.dailyPlans || [])
    .filter((p) => p.day === day && p.actor === data.currentMember)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const plan = plans[0];
  const statuses = {
    not_connected: 'Slack not connected',
    pending: 'Slack message pending',
    sending: 'Sending to Slack',
    sent: 'Posted to Slack',
    failed: 'Slack delivery failed',
    unknown: 'Slack delivery needs checking',
  };
  return (
    <div className="today-plan">
      <header className="today-plan-heading">
        <div>
          <p>
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1>Today</h1>
        </div>
        <div className="today-heading-actions">
          <Button
            variant="outline"
            disabled={!ready || busy}
            onClick={() => setFinishing(true)}
          >
            Finish day
          </Button>
          <Button onClick={openPlan} disabled={!ready}>
            <ClipboardList size={17} />
            {plan ? 'Add to today’s plan' : 'Plan my day'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </header>
      {finishing && (
        <FinishDay
          tasks={brief.todayTasks}
          busy={busy}
          error={error}
          act={act}
          close={() => setFinishing(false)}
        />
      )}
      {!ready ? (
        <p>Opening your day…</p>
      ) : (
        <>
          {plan ? (
            <TodaysPlan
              plan={plan}
              data={data}
              act={act}
              busy={busy}
              openTask={openTask}
              slackStatus={statuses[plan.deliveryStatus]}
            />
          ) : (
            <section className="today-plan-spine today-plan-empty">
              <header>
                <h2>Today&rsquo;s plan</h2>
              </header>
              <p className="muted">
                No plan committed yet · {brief.carryover.length} carried over.
                Commit one and it becomes the spine of this page.
              </p>
            </section>
          )}
          {plan?.deliveryError && (
            <p className="daily-plan-warning">{plan.deliveryError}</p>
          )}
          <section className="today-priorities">
            <header>
              <h2>Priorities</h2>
              <span>{brief.priorities.length} / 3</span>
            </header>
            {brief.priorities.map((task) => (
              <button key={task.id} onClick={() => openTask(task.id)}>
                {task.title}
              </button>
            ))}
            {!brief.priorities.length && (
              <p>
                Use a task’s menu to choose up to three priorities for today.
              </p>
            )}
          </section>
          <div className="today-context-grid">
            <section>
              <header>
                <h2>
                  <CalendarDays size={18} />
                  Today & upcoming meetings
                </h2>
                <Button variant="ghost" onClick={openCalendar}>
                  Calendar
                </Button>
              </header>
              {brief.schedule.slice(0, 5).map((entry) => (
                <button
                  className="today-context-row"
                  key={entry.key}
                  onClick={() =>
                    entry.source === 'meeting'
                      ? openMeeting(entry.spaceId, entry.id)
                      : entry.source === 'calendar' && entry.kind === 'meeting'
                        ? openCalendarMeeting(entry.id)
                        : entry.spaceId
                          ? openBrief(entry.spaceId)
                          : openCalendar()
                  }
                >
                  <span>
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.spaceId || entry.prospectId
                        ? entry.client
                        : entry.kind === 'meeting'
                          ? 'Meeting'
                          : 'Event'}
                    </small>
                  </span>
                  <span>
                    {readableDate(entry.due)}
                    {entry.time ? ' · ' + entry.time : ' · All day'}
                  </span>
                </button>
              ))}
              {!brief.schedule.length && <p>No upcoming meetings or events.</p>}
            </section>
            <section>
              <header>
                <h2>
                  <CheckCheck size={18} />
                  Reviews & attention
                </h2>
                <span>{brief.attention.length}</span>
              </header>
              {brief.attention.map(({ task, kind, reason }) => (
                <button
                  className="today-context-row"
                  key={task.id}
                  onClick={() =>
                    openTask(task.id, kind === 'review' ? 'work' : 'brief')
                  }
                >
                  <span>
                    <strong>{task.title}</strong>
                    <small>{reason}</small>
                  </span>
                  <span>
                    {kind === 'review'
                      ? 'Review'
                      : kind === 'blocked'
                        ? 'Blocked'
                        : 'Overdue'}
                  </span>
                </button>
              ))}
              {!brief.attention.length && (
                <p>No reviews, blockers or overdue tasks need you.</p>
              )}
            </section>
          </div>
          <section className="today-board-section">
            {!!brief.carryover.length && (
              <details className="today-carryover">
                <summary>
                  {brief.carryover.length} tasks carried forward
                </summary>
                {brief.carryover.map((task) => (
                  <button key={task.id} onClick={() => openTask(task.id)}>
                    {task.title}
                    <small>
                      {taskContext(data, task).project?.name || 'Personal'}
                      {task.plannedFor
                        ? ' · planned ' + readableDate(task.plannedFor)
                        : ''}
                    </small>
                  </button>
                ))}
              </details>
            )}
            <div className="today-footer">
              <Button variant="ghost" onClick={openBoard}>
                All my work <ArrowRight size={15} />
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// The committed plan is the spine of Today: its tasks, checkable in place,
// with honest progress and the Slack delivery state alongside.
function TodaysPlan({
  plan,
  data,
  act,
  busy,
  openTask,
  slackStatus,
}: {
  plan: DailyPlan;
  data: Workspace;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  openTask: (id: string) => void;
  slackStatus: string;
}) {
  const links = (data.dailyPlanTasks || []).filter(
    (link) => link.planId === plan.id,
  );
  const tasks = links
    .map((link) => data.tasks.find((t) => t.id === link.taskId))
    .filter((t): t is NonNullable<typeof t> => !!t);
  const done = tasks.filter((t) => t.stage === 'Done').length;
  return (
    <section className="today-plan-spine">
      <header>
        <h2>Today&rsquo;s plan</h2>
        <span className="muted">
          {done} of {tasks.length} done · {slackStatus}
          {data.slackConnected &&
            ['failed', 'pending', 'not_connected'].includes(
              plan.deliveryStatus,
            ) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act({ type: 'daily-plan-deliver', id: plan.id })
                }
              >
                Send to Slack
              </Button>
            )}
        </span>
      </header>
      {tasks.length ? (
        <ul className="today-plan-lines">
          {tasks.map((task) => {
            const space = data.spaces.find(
              (s) => s.id === taskSpaceId(data, task),
            );
            return (
              <li key={task.id} className={task.stage === 'Done' ? 'done' : ''}>
                <button
                  className="today-plan-check"
                  aria-label={
                    task.stage === 'Done' ? 'Completed' : 'Mark done'
                  }
                  disabled={busy || task.stage === 'Done'}
                  onClick={() =>
                    void act({
                      type: 'complete',
                      id: task.id,
                      revision: task.revision,
                    })
                  }
                >
                  {task.stage === 'Done' ? <Check size={15} /> : null}
                </button>
                <button
                  className="today-plan-title"
                  onClick={() => openTask(task.id)}
                >
                  {task.title}
                </button>
                {space && <span className="muted">{space.name}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">
          The plan&rsquo;s tasks are done and archived, or it was committed
          before task linking existed.
        </p>
      )}
    </section>
  );
}
