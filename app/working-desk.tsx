'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  FileText,
  Clock3,
  Plus,
  CornerDownLeft,
} from 'lucide-react';
import QuickCapture, { type CaptureDraft } from './quick-capture';
import type { Workspace } from '@/lib/model';
import {
  captureDestination,
  type CaptureEntry,
  type EntryTarget,
} from '@/lib/entry-model';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { readableDate, useWorkspaceClock } from './today';
import { taskSpaceId } from '@/lib/task-context';

const entryIcons = {
  note: FileText,
  task: Plus,
  meeting: CalendarDays,
  deadline: Clock3,
  sales: CheckCheck,
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
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  enabled: boolean;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  drafts: Map<string, CaptureDraft>;
  openEntry: (entry: CaptureEntry) => void;
}) {
  const now = useWorkspaceClock(),
    field = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(20);
  const entries = data.captureEntries
    .filter((e) => e.actor === data.currentMember)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    if (!enabled || !ready) return;
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
      field.current?.querySelector<HTMLInputElement>('input')?.focus();
      field.current?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, ready]);
  return (
    <div className="working-desk">
      <header className="working-desk-heading">
        <div>
          <p className="os-overline">
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1>Your working desk.</h1>
          <p>Leave this open. Jot things down as the day unfolds.</p>
        </div>
        <span>
          <CornerDownLeft size={15} /> Enter to capture
        </span>
      </header>
      <div className="desk-writing-surface" ref={field}>
        <QuickCapture
          data={data}
          ready={ready}
          busy={busy}
          error={error}
          act={act}
          drafts={drafts}
          enabled={enabled}
          close={() =>
            field.current?.querySelector<HTMLInputElement>('input')?.blur()
          }
          onCreated={() => {}}
          onOpenEntry={openEntry}
        />
      </div>
      <details className="desk-capture-guide">
        <summary>A few ways to write it</summary>
        <div>
          <p>
            <strong>A note</strong>Note @Nord & Form: the client prefers a
            calmer direction
          </p>
          <p>
            <strong>A task</strong>Edit the launch video @Autumn launch
            @tomorrow
          </p>
          <p>
            <strong>A meeting</strong>Meeting with @Nord & Form @tomorrow at
            14:00
          </p>
          <p>
            <strong>A deadline</strong>Deadline @Autumn launch @18/09
          </p>
          <p>
            <strong>A sales conversation</strong>Sales meeting with “Acme”, next
            step: calculate lead price
          </p>
        </div>
        <small>
          Unrecognized text stays as a note on your desk. Choose a type or
          destination when needed.
        </small>
      </details>
      <section className="desk-capture-history">
        <div className="desk-section-heading">
          <h2>Captured & connected</h2>
          <span>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        {!entries.length && (
          <div className="desk-history-empty">
            <FileText size={22} />
            <h3>The day can start here.</h3>
            <p>
              Your saved entries will appear here with a link to where each one
              belongs.
            </p>
          </div>
        )}
        {entries.slice(0, limit).map((entry) => {
          const Icon = entryIcons[entry.kind];
          return (
            <button
              className="desk-capture-row"
              key={entry.id}
              onClick={() => openEntry(entry)}
            >
              <span className={'entry-type-icon ' + entry.kind}>
                <Icon size={18} />
              </span>
              <span>
                <strong>{entry.title}</strong>
                <small>{captureDestination(entry, data)}</small>
              </span>
              <time>{readableDate(entry.createdAt, true)}</time>
              <ArrowUpRight size={17} />
            </button>
          );
        })}
        {entries.length > limit && (
          <button className="desk-more" onClick={() => setLimit((v) => v + 20)}>
            Show earlier entries
          </button>
        )}
      </section>
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
