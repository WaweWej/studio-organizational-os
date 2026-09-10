'use client';
import { DraftCache } from '@/lib/draft-cache';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  FileText,
  Clock3,
  Plus,
  History,
  CircleCheck,
  CircleDot,
  Flag,
  X,
  Search,
  Layers,
} from 'lucide-react';
import QuickCapture, { type CaptureDraft } from './quick-capture';
import type { Workspace } from '@/lib/model';
import {
  captureDestination,
  type CaptureEntry,
  type EntryTarget,
} from '@/lib/entry-model';
import { deskAttention, deskEntries } from '@/lib/desk-model';
import { localDay } from '@/lib/workspace-brief';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { readableDate, useWorkspaceClock } from './today';
import { taskSpaceId } from '@/lib/task-context';

const entryIcons = {
  daily: CheckCheck,
  note: FileText,
  task: Plus,
  meeting: CalendarDays,
  deadline: Clock3,
  sales: CheckCheck,
  progress: CircleDot,
  blocker: Flag,
  status: CircleCheck,
  project: Layers,
};
export default function WorkingDesk({
  data,
  ready,
  busy,
  error,
  act,
  drafts,
  openEntry,
  enabled,
  focusTaskId,
  setFocusTask,
  openTask,
  openMeeting,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  enabled: boolean;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  drafts: Map<string, CaptureDraft>;
  openEntry: (entry: CaptureEntry) => void;
  focusTaskId: string | null;
  setFocusTask: (id: string | null) => void;
  openTask: (id: string) => void;
  openMeeting: (id: string) => void;
}) {
  const now = useWorkspaceClock(),
    field = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState(false),
    [planComposer, setPlanComposer] = useState(() => drafts instanceof DraftCache && drafts.lastKey === 'daily-planning' && !!drafts.get('daily-planning')?.daily?.text.trim()),
    [attentionOpen, setAttentionOpen] = useState(false),
    [query, setQuery] = useState(''),
    [limit, setLimit] = useState(20),
    [draftText, setDraftText] = useState(drafts.get('workspace')?.text || '');
  const entries = deskEntries(data),
    filtered = deskEntries(data, query);
  const todayCount = entries.filter(
    (e) => localDay(new Date(e.createdAt)) === localDay(now),
  ).length;
  const task = data.tasks.find((t) => t.id === focusTaskId);
  const project = data.projects.find((p) => p.id === task?.projectId);
  const client = task
    ? data.spaces.find((s) => s.id === taskSpaceId(data, task))
    : null;
  const attention = deskAttention(data, now);
  const nextMeeting = data.meetings
    .filter((m) => m.status === 'Planned' && new Date(m.startsAt) >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const meetingClient = data.spaces.find((s) => s.id === nextMeeting?.spaceId);
  useEffect(() => {
    if (!enabled || !ready || history) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.key !== 'Enter' ||
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      if (
        (e.target as HTMLElement | null)?.closest(
          'input,textarea,select,button,a,[contenteditable="true"]',
        ) ||
        document.querySelector(
          '[role="dialog"],[role="alertdialog"],[role="menu"]',
        )
      )
        return;
      e.preventDefault();
      field.current
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          'input,textarea',
        )
        ?.focus();
      field.current?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, ready, history]);
  return (
    <div className="working-desk">
      <header className="working-desk-heading">
        <p className="desk-date">
          {now.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <div className="desk-quiet-tools">
          <button
            disabled={!ready || busy}
            aria-pressed={planComposer}
            onClick={() => {
              if (!planComposer && !drafts.get('daily-planning')?.text.trim())
                drafts.set('daily-planning', {
                  text: 'Plan my day',
                  pins: [],
                  contextProject: null,
                  contextSpace: null,
                });
              setPlanComposer(!planComposer);
            }}
          >
            <CheckCheck size={16} />
            <span>{planComposer ? 'Back to writing' : 'Plan today'}</span>
          </button>
          <button
            aria-label="Open desk activity"
            onClick={() => setHistory(true)}
          >
            <History size={16} />
            <span>Activity</span>
            {todayCount > 0 && <small>{todayCount}</small>}
          </button>
          {attention.length > 0 && (
            <button
              aria-label={attention.length + ' items need your attention'}
              onClick={() => setAttentionOpen(true)}
            >
              <Flag size={15} />
              <small>{attention.length}</small>
            </button>
          )}
        </div>
      </header>
      <div className="desk-writing-surface" ref={field}>
        <QuickCapture
          key={planComposer ? 'daily-planning' : 'workspace'}
          draftId={planComposer ? 'daily-planning' : 'workspace'}
          variant="desk"
          focusTaskId={task?.id}
          onDraftChange={setDraftText}
          data={data}
          ready={ready}
          busy={busy}
          error={error}
          act={act}
          drafts={drafts}
          enabled={enabled && !history && !attentionOpen}
          close={() =>
            field.current
              ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
                'input,textarea',
              )
              ?.blur()
          }
          onCreated={() => {}}
          onOpenEntry={openEntry}
        />
      </div>
      <section className="desk-context-strip" aria-label="Current task">
        {task && (
          <>
            <span
              className="desk-client-dot"
              style={{ background: client?.color || '#8b98b0' }}
            />
            <button
              className="desk-context-task"
              onClick={() => openTask(task.id)}
            >
              <strong>{task.title}</strong>
              <span>{client?.name || project?.name || 'Studio'}</span>
            </button>
            <span
              className={
                'desk-compact-stage' + (task.blocked ? ' is-blocked' : '')
              }
            >
              {task.blocked ? 'Blocked' : task.stage}
            </span>
            {task.due && <time>{readableDate(task.due)}</time>}
          </>
        )}
        <Select
          value={task?.id || 'none'}
          onValueChange={(v) => setFocusTask(v === 'none' ? null : v)}
          disabled={!!draftText.trim() || busy}
        >
          <SelectTrigger aria-label="Task to keep on your desk">
            <SelectValue>{task ? 'Change' : 'Keep a task here'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No task selected</SelectItem>
            {data.tasks
              .filter((t) => t.stage !== 'Done' || t.id === task?.id)
              .sort(
                (a, b) =>
                  Number(b.assignee === data.currentMember) -
                  Number(a.assignee === data.currentMember),
              )
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title} ·{' '}
                  {data.members.find((m) => m.id === t.assignee)?.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </section>
      {nextMeeting && (
        <button
          className="desk-meeting-line"
          onClick={() => openMeeting(nextMeeting.id)}
        >
          <CalendarDays size={15} />
          <time>{readableDate(nextMeeting.startsAt, true)}</time>
          <span>{meetingClient?.name || nextMeeting.title}</span>
          <ArrowUpRight size={14} />
        </button>
      )}
      <Sheet open={attentionOpen} onOpenChange={setAttentionOpen}>
        <SheetContent className="desk-history-sheet">
          <SheetHeader>
            <SheetTitle>Needs your attention</SheetTitle>
            <SheetDescription>
              Reviews, alerts, blockers and deadlines connected to you.
            </SheetDescription>
          </SheetHeader>
          <div className="desk-history-body desk-attention-items">
            {attention.map((item) => (
              <button
                key={item.taskId}
                onClick={() => {
                  setAttentionOpen(false);
                  openTask(item.taskId);
                }}
              >
                <span className={'desk-attention-dot ' + item.kind} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
            {!attention.length && <p>Nothing waiting for you.</p>}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={history} onOpenChange={setHistory}>
        <SheetContent className="desk-history-sheet">
          <SheetHeader>
            <SheetTitle>Your desk activity</SheetTitle>
            <SheetDescription>
              Everything you captured, with a path back to its context.
            </SheetDescription>
          </SheetHeader>
          <div className="desk-history-body">
            <div className="desk-history-search">
              <Search size={16} />
              <Input
                aria-label="Search desk activity"
                placeholder="Search a note, client, task or update…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(20);
                }}
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="desk-history-count">
              {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
              {query ? ' found' : ' kept for you'}
            </p>
            {filtered.slice(0, limit).map((entry) => {
              const Icon = entryIcons[entry.kind] || FileText;
              return (
                <button
                  className="desk-capture-row"
                  key={entry.id}
                  onClick={() => {
                    setHistory(false);
                    openEntry(entry);
                  }}
                >
                  <span className={'entry-type-icon ' + entry.kind}>
                    <Icon size={17} />
                  </span>
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{captureDestination(entry, data)}</small>
                    <time>{readableDate(entry.createdAt, true)}</time>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              );
            })}
            {!filtered.length && (
              <div className="desk-history-empty">
                <FileText size={23} />
                <h3>{query ? 'No matching entries.' : 'A fresh page.'}</h3>
                <p>
                  {query
                    ? 'Try another word or client name.'
                    : 'Your notes and updates will be kept here, while your desk stays clear.'}
                </p>
              </div>
            )}
            {filtered.length > limit && (
              <button
                className="desk-more"
                onClick={() => setLimit((v) => v + 20)}
              >
                Show earlier entries
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
export function ConnectedNotes({
  data,
  target,
}: {
  data: Workspace;
  target: EntryTarget;
}) {
  const task =
    target.type === 'task' ? data.tasks.find((t) => t.id === target.id) : null;
  const projectId = target.type === 'project' ? target.id : task?.projectId;
  const spaceId =
    target.type === 'space'
      ? target.id
      : task
        ? taskSpaceId(data, task)
        : data.projects.find((p) => p.id === projectId)?.spaceId;
  const entries = data.captureEntries
    .filter(
      (e) =>
        e.kind === 'note' &&
        (target.type === 'space'
          ? e.spaceId === target.id
          : target.type === 'project'
            ? e.projectId === target.id ||
              (!e.taskId && !e.projectId && !!spaceId && e.spaceId === spaceId)
            : e.taskId === target.id ||
              (!e.taskId && !!projectId && e.projectId === projectId) ||
              (!e.taskId &&
                !e.projectId &&
                !!spaceId &&
                e.spaceId === spaceId)),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!entries.length) return null;
  return (
    <section className="connected-notes">
      <h3>Notes kept with this work</h3>
      {entries.map((e) => (
        <article key={e.id}>
          <header>
            <span>
              {data.members.find((m) => m.id === e.actor)?.name || 'Workspace'}
            </span>
            <small>
              {readableDate(e.createdAt, true)} · {captureDestination(e, data)}
            </small>
          </header>
          <p>{e.body}</p>
        </article>
      ))}
    </section>
  );
}
export function CapturedNote({
  entry,
  data,
  close,
  openSpace,
  openProject,
  openTask,
}: {
  entry?: CaptureEntry;
  data: Workspace;
  close: () => void;
  openSpace: (id: string) => void;
  openProject: (id: string) => void;
  openTask: (id: string) => void;
}) {
  const go = (action: () => void) => {
    close();
    action();
  };
  return (
    <Sheet open={!!entry} onOpenChange={(open) => !open && close()}>
      <SheetContent className="captured-note-sheet">
        <SheetHeader>
          <SheetTitle>Saved note</SheetTitle>
          <SheetDescription>
            {entry ? captureDestination(entry, data) : 'Workspace context'}
          </SheetDescription>
        </SheetHeader>
        {entry && (
          <div className="sheet-body">
            <p className="captured-note-meta">
              {data.members.find((m) => m.id === entry.actor)?.name} ·{' '}
              {readableDate(entry.createdAt, true)}
            </p>
            <p className="captured-note-body">{entry.body}</p>
            <div className="captured-note-links">
              {entry.taskId && (
                <button onClick={() => go(() => openTask(entry.taskId!))}>
                  Open task <ArrowUpRight size={15} />
                </button>
              )}
              {entry.projectId && (
                <button onClick={() => go(() => openProject(entry.projectId!))}>
                  Open project <ArrowUpRight size={15} />
                </button>
              )}
              {entry.spaceId && (
                <button onClick={() => go(() => openSpace(entry.spaceId!))}>
                  Open client space <ArrowUpRight size={15} />
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
