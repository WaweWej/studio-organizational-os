'use client';
/* eslint-disable next/no-img-element -- Client covers include explicitly configured remote images; preserve the existing direct cover loading behavior. */
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CornerDownLeft,
  Layers,
  Plus,
  ScanLine,
  CalendarDays,
  CheckCheck,
  CircleDot,
  AlertCircle,
} from 'lucide-react';
import { buildDailyBrief, taskContext } from '@/lib/workspace-brief';
import type { Workspace } from '@/lib/model';

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
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
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
  openTask,
  openBrief,
  openSpace,
  openIntent,
  openDesk,
  capture,
  openBoard,
  openCalendar,
}: {
  data: Workspace;
  ready: boolean;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  openBrief: (id: string) => void;
  openSpace: (id: string) => void;
  openIntent: (query?: string) => void;
  openDesk: () => void;
  capture: () => void;
  openBoard: () => void;
  openCalendar: () => void;
}) {
  const now = useWorkspaceClock();
  const [allAttention, setAllAttention] = useState(false);
  const brief = buildDailyBrief(data, now);
  const meeting = brief.upcoming[0];
  const client = data.spaces.find((s) => s.id === meeting?.spaceId);
  const member = data.members.find((m) => m.id === data.currentMember);
  const greeting =
    now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  const activeSpaces = data.spaces.filter((s) =>
    data.tasks.some(
      (t) => t.stage !== 'Done' && taskContext(data, t).space?.id === s.id,
    ),
  );
  return (
    <div className="today-desk">
      <header className="desk-heading">
        <div>
          <p className="os-overline">
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1>
            {greeting}
            {member ? `, ${member.name.split(' ')[0]}` : ''}
            <span>.</span>
          </h1>
          <p>Your work, with the context already here.</p>
        </div>
        <button className="os-button" onClick={capture} disabled={!ready}>
          <Plus size={16} /> Capture anything <kbd>↵</kbd>
        </button>
      </header>
      <button className="desk-intent" onClick={openDesk} disabled={!ready}>
        <span className="intent-symbol">
          <ScanLine size={23} />
        </span>
        <span>
          <strong>Your desk for the whole day.</strong>
          <small>
            Jot notes, meetings, tasks, and deadlines. Keep everything
            connected.
          </small>
        </span>
        <span className="intent-shortcut">
          <span>Open desk</span>
          <ArrowRight size={20} />
        </span>
      </button>
      {!ready ? (
        <div className="desk-empty">
          Your brief will appear when the workspace has loaded.
        </div>
      ) : (
        <>
          <div className="desk-grid">
            <div className="desk-primary">
              <section className="desk-section">
                <div className="desk-section-heading">
                  <h2>
                    Needs your attention <span>{brief.attention.length}</span>
                  </h2>
                  {brief.attention.length > 2 && (
                    <button onClick={() => setAllAttention(!allAttention)}>
                      {allAttention ? 'Show less' : 'See all'}{' '}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                <div className="attention-stack">
                  {(allAttention
                    ? brief.attention
                    : brief.attention.slice(0, 2)
                  ).map(({ task, kind, reason }) => {
                    const context = taskContext(data, task);
                    return (
                      <button
                        className={`desk-attention ${kind}`}
                        key={task.id}
                        onClick={() =>
                          openTask(
                            task.id,
                            kind === 'review' ? 'work' : 'brief',
                          )
                        }
                      >
                        <span className="attention-mark">
                          {kind === 'review' ? (
                            <CheckCheck size={19} />
                          ) : (
                            <AlertCircle size={19} />
                          )}
                        </span>
                        <span className="attention-copy">
                          <small>
                            {context.space?.name ||
                              context.prospect?.name ||
                              'Internal'}{' '}
                            ·{' '}
                            {kind === 'review'
                              ? 'Review'
                              : kind === 'blocked'
                                ? 'Blocked'
                                : 'Overdue'}
                          </small>
                          <strong>{task.title}</strong>
                          <p>{reason}</p>
                        </span>
                        <span className="attention-action">
                          {kind === 'review' ? 'Review' : 'Open'}{' '}
                          <ArrowUpRight size={16} />
                        </span>
                      </button>
                    );
                  })}
                  {!brief.attention.length && (
                    <p className="desk-empty">
                      <CheckCheck size={20} /> No pending reviews, recorded
                      blockers, or overdue tasks assigned to you.
                    </p>
                  )}
                </div>
              </section>
              <section className="desk-section focus-section">
                <div className="desk-section-heading">
                  <h2>Pick up where you left off</h2>
                  <button onClick={openBoard}>
                    My board <ArrowRight size={13} />
                  </button>
                </div>
                <p className="section-caption">
                  Your in-progress work first, then your queue.
                </p>
                {brief.focus.slice(0, 3).map((task) => {
                  const context = taskContext(data, task);
                  return (
                    <button
                      className="desk-focus-row"
                      key={task.id}
                      onClick={() => openTask(task.id)}
                    >
                      <span className="focus-state">
                        <CircleDot size={18} />
                      </span>
                      <span>
                        <strong>{task.title}</strong>
                        <small>
                          <i
                            style={{
                              background: context.space?.color || '#8c919b',
                            }}
                          />
                          {context.space?.name ||
                            context.prospect?.name ||
                            'Internal'}
                          {context.project ? ` / ${context.project.name}` : ''}
                        </small>
                      </span>
                      <span className="focus-stage">
                        {task.stage === 'Doing' ? 'In progress' : 'Up next'}
                      </span>
                      <ArrowUpRight size={17} />
                    </button>
                  );
                })}
                {!brief.focus.length && (
                  <div className="desk-empty">
                    A clear desk.{' '}
                    <button onClick={capture}>
                      Capture your next task <Plus size={14} />
                    </button>
                  </div>
                )}
              </section>
            </div>
            <aside className="desk-aside">
              <section className="next-meeting">
                <div className="desk-section-heading">
                  <h2>Next conversation</h2>
                  <button
                    onClick={openCalendar}
                    aria-label="Open shared calendar"
                  >
                    <CalendarDays size={17} />
                  </button>
                </div>
                {meeting && client ? (
                  <>
                    <div
                      className="meeting-brand"
                      style={{ background: client.color }}
                    >
                      {client.coverUrl && <img src={client.coverUrl} alt="" />}
                      <span>{client.name}</span>
                    </div>
                    <div className="meeting-preview">
                      <p className="os-overline">
                        {readableDate(meeting.startsAt, true)}
                      </p>
                      <h3>{meeting.title}</h3>
                      <p>
                        {meeting.agenda
                          ? 'Agenda, last decisions, and current work. Together.'
                          : 'Gather the context and shape your agenda.'}
                      </p>
                      <button
                        className="os-button os-button-dark"
                        onClick={() => openBrief(client.id)}
                      >
                        <ScanLine size={17} /> Prepare me{' '}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="meeting-preview">
                    <h3>Room for a conversation.</h3>
                    <p>
                      No upcoming meeting is recorded. You can still prepare a
                      client brief.
                    </p>
                    <button
                      className="os-button"
                      onClick={() => openIntent('prepare')}
                    >
                      Choose a client <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </section>
              <div className="context-footnote">
                <span className="status-dot" />
                <span>
                  {data.demo ? 'Sample workspace' : 'Workspace records'}
                  <small>
                    This brief reads saved tasks and meetings. External channels
                    aren’t connected yet.
                  </small>
                </span>
              </div>
            </aside>
          </div>
          <section className="desk-section space-shelf-section">
            <div className="desk-section-heading">
              <h2>Where things are moving</h2>
              <span className="section-caption">Spaces with open work</span>
            </div>
            <div className="desk-spaces">
              {activeSpaces.slice(0, 4).map((s) => {
                const work = data.tasks.filter(
                  (t) =>
                    t.stage !== 'Done' &&
                    taskContext(data, t).space?.id === s.id,
                );
                return (
                  <button
                    className="desk-space"
                    key={s.id}
                    onClick={() => openSpace(s.id)}
                  >
                    <span
                      className="desk-space-mark"
                      style={{ color: s.color, background: `${s.color}15` }}
                    >
                      {s.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {work.length} open{' '}
                        {work.length === 1 ? 'task' : 'tasks'}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                );
              })}
              {!activeSpaces.length && (
                <p className="section-caption">
                  Client work will appear here as it starts.
                </p>
              )}
            </div>
          </section>
          <footer className="desk-footer">
            <Layers size={14} />
            <span>One workspace. Every change stays with its work.</span>
            <button onClick={capture}>
              <CornerDownLeft size={13} /> Enter to capture
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
