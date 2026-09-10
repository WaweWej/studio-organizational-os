'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Native drag/drop has an equivalent keyboard-accessible Move menu on every card. */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Plus,
  CornerDownLeft,
  AtSign,
  Circle,
  CircleDot,
  Clock3,
  CircleCheck,
  MessageSquare,
  Link2,
  GripVertical,
  Flag,
  Archive,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { localDay } from '@/lib/workspace-brief';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { stages, type Workspace, type Task, type Stage } from '@/lib/model';
import { taskSpaceId } from '@/lib/task-context';
import { relatedResources } from '@/lib/resource-model';
import type { CaptureEntry } from '@/lib/entry-model';
import QuickCapture, { type CaptureDraft } from './quick-capture';
const stageIcons = [Circle, CircleDot, Clock3, CircleCheck];
export default function WorkBoard({
  data,
  tasks,
  archivedTasks = [],
  ready,
  busy,
  error,
  act,
  openTask,
  projectId,
  captureRequested = 0,
  onOpenEntry,
  enabled,
  drafts,
}: {
  data: Workspace;
  tasks: Task[];
  archivedTasks?: Task[];
  ready: boolean;
  busy: boolean;
  error: string;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  projectId: string | null;
  captureRequested?: number;
  onOpenEntry?: (entry: CaptureEntry) => void;
  enabled: boolean;
  drafts: Map<string, CaptureDraft>;
}) {
  const [waiting, setWaiting] = useState<Task | null>(null);
  const [waitingText, setWaitingText] = useState('');
  const [undo, setUndo] = useState<Task | null>(null);
  const planTask = async (task: Task, mode: string) => {
    const now = new Date(),
      day = localDay(now);
    now.setDate(now.getDate() + 1);
    if (
      await act({
        type: 'day-work',
        mode,
        day,
        items: [{ id: task.id, revision: task.revision }],
        ...(mode === 'plan'
          ? { plannedFor: localDay(now) }
          : { focus: task.focusFor !== day }),
      })
    ) {
      if (mode === 'plan') setUndo(task);
    }
  };
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const requestDelete = (task: Task) => {
    setDeleteError(false);
    setDeleting(task);
  };
  const [capturing, setCapturing] = useState(false),
    [recent, setRecent] = useState<{ id: string; title: string } | null>(null),
    [over, setOver] = useState<Stage | null>(null);
  const capture = useRef<HTMLDivElement>(null),
    dragged = useRef<Task | null>(null),
    lastRequest = useRef(captureRequested);
  const start = () => {
    setCapturing(true);
    requestAnimationFrame(() => {
      capture.current?.querySelector<HTMLInputElement>('input')?.focus();
      capture.current?.scrollIntoView({ block: 'nearest' });
    });
  };
  useEffect(() => {
    if (captureRequested !== lastRequest.current) {
      lastRequest.current = captureRequested;
      setCapturing(true);
      requestAnimationFrame(() =>
        capture.current?.querySelector<HTMLInputElement>('input')?.focus(),
      );
    }
  }, [captureRequested]);
  useEffect(() => {
    if (!enabled || !ready || archiveOpen || deleting) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.key !== 'Enter' ||
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey
      )
        return;
      const element = e.target as HTMLElement | null;
      if (
        element?.closest(
          'input,textarea,select,button,a,[contenteditable="true"],[role="combobox"],[role="menuitem"]',
        ) ||
        document.querySelector(
          '[role="dialog"],[role="alertdialog"],[role="menu"]',
        )
      )
        return;
      e.preventDefault();
      setCapturing(true);
      requestAnimationFrame(() => {
        capture.current?.querySelector<HTMLInputElement>('input')?.focus();
        capture.current?.scrollIntoView({ block: 'nearest' });
      });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, ready, archiveOpen, deleting]);
  const move = (task: Task, stage: Stage) =>
    void act({ type: 'move', id: task.id, revision: task.revision, stage });
  return (
    <section className="workboard" aria-label="Task board">
      {undo && (
        <output className="day-undo">
          Moved “{undo.title}” to tomorrow.{' '}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (
                await act({
                  type: 'day-work',
                  mode: 'plan',
                  day: localDay(new Date()),
                  plannedFor: undo.plannedFor || '',
                  focusFor: undo.focusFor || '',
                  items: [{ id: undo.id, revision: undo.revision + 1 }],
                })
              )
                setUndo(null);
            }}
          >
            Undo
          </Button>
          <Button variant="ghost" onClick={() => setUndo(null)}>
            Dismiss
          </Button>
        </output>
      )}
      <Dialog
        open={!!waiting}
        onOpenChange={(open) => !open && !busy && setWaiting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>What are you waiting for?</DialogTitle>
            <DialogDescription>{waiting?.title}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Waiting for"
            value={waitingText}
            onChange={(e) => setWaitingText(e.target.value)}
            placeholder="Feedback from the client"
          />
          {error && <p role="alert">{error}</p>}
          <Button
            disabled={busy}
            onClick={async () => {
              if (
                waiting &&
                (await act({
                  type: 'day-work',
                  mode: 'waiting',
                  day: localDay(new Date()),
                  blocked: waitingText,
                  items: [{ id: waiting.id, revision: waiting.revision }],
                }))
              )
                setWaiting(null);
            }}
          >
            Save
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setWaiting(null)}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
      <div className="board-toolbar">
        <Button
          variant="ghost"
          onClick={() => setArchiveOpen(true)}
          disabled={!ready}
        >
          <Archive size={16} /> Archive ({archivedTasks.length})
        </Button>
      </div>
      <div ref={capture} className="board-capture-area">
        <div hidden={capturing}>
          <button
            className="board-capture-trigger"
            onClick={start}
            disabled={!ready}
          >
            <span className="board-capture-plus">
              <Plus size={19} />
            </span>
            <span>
              Add work
              <small>
                Notes, meetings, tasks. Connect the context with{' '}
                <AtSign size={12} />.
              </small>
            </span>
            <kbd>
              <CornerDownLeft size={13} />
              Enter
            </kbd>
          </button>
        </div>
        <div hidden={!capturing}>
          <QuickCapture
            key={projectId || 'workspace'}
            data={data}
            ready={ready}
            busy={busy}
            error={error}
            act={act}
            projectId={projectId}
            enabled={capturing && enabled}
            close={() => setCapturing(false)}
            drafts={drafts}
            onOpenEntry={onOpenEntry}
            onCreated={(id, title, kind) =>
              setRecent(
                kind === 'task' || kind === 'sales' ? { id, title } : null,
              )
            }
          />
        </div>
      </div>
      <div className="workboard-lanes">
        {stages.map((stage, i) => {
          const Icon = stageIcons[i],
            items = tasks.filter((t) => t.stage === stage);
          return (
            <section
              className={`workboard-lane lane-${i} ${over === stage ? 'is-drag-over' : ''}`}
              aria-label={`${stage}, ${items.length} tasks`}
              key={stage}
              onDragOver={(e) => {
                if (
                  ready &&
                  !busy &&
                  e.dataTransfer.types.includes('application/x-studio-task')
                ) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setOver(stage);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const snapshot = dragged.current;
                if (
                  snapshot &&
                  snapshot.id ===
                    e.dataTransfer.getData('application/x-studio-task')
                )
                  move(snapshot, stage);
                dragged.current = null;
              }}
            >
              <header>
                <span className="lane-stage">
                  <Icon size={16} />
                  <h2>{stage}</h2>
                  <span className="lane-count">
                    {String(items.length).padStart(2, '0')}
                  </span>
                </span>
                {stage === 'Up next' && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Add a task to Up next"
                    onClick={start}
                    disabled={!ready}
                  >
                    <Plus size={17} />
                  </Button>
                )}
              </header>
              <div className="workboard-cards">
                {items.map((task) => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    data={data}
                    busy={busy || !ready}
                    fresh={recent?.id === task.id}
                    openTask={openTask}
                    planTask={planTask}
                    waitFor={(task) => {
                      setWaiting(task);
                      setWaitingText(task.blocked);
                    }}
                    move={move}
                    archive={(task) =>
                      void act({
                        type: 'task-archive',
                        id: task.id,
                        revision: task.revision,
                      })
                    }
                    remove={requestDelete}
                    drag={(t) => {
                      dragged.current = t;
                    }}
                  />
                ))}
                {!items.length && (
                  <div className="workboard-empty">
                    <Icon size={22} />
                    <p>No tasks</p>
                    <small>
                      {stage === 'Up next'
                        ? 'Press Enter to capture a task.'
                        : stage === 'Doing'
                          ? 'Move a task here when you start.'
                          : stage === 'Review'
                            ? 'Save a deliverable, then request review.'
                            : 'Finished work lands here.'}
                    </small>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <Sheet open={archiveOpen} onOpenChange={setArchiveOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Archived tasks</SheetTitle>
            <SheetDescription>
              Restore a task to its previous stage, or delete it permanently.
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 space-y-4">
            {error && <p role="alert">{error}</p>}
            {!archivedTasks.length && <p>No archived tasks.</p>}
            {archivedTasks.map((task) => (
              <div key={task.id} className="border-b pb-4">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-sm text-muted-foreground">{task.stage}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        type: 'task-restore',
                        id: task.id,
                        revision: task.revision,
                      })
                    }
                  >
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => requestDelete(task)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” and its notes, reviews and task history will
              be permanently removed. Shared files and the source meeting or
              sales conversation remain. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert">
              {error || 'Could not delete the task. Refresh and try again.'}
            </p>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deleting) return;
                const saved = await act({
                  type: 'task-delete',
                  id: deleting.id,
                  revision: deleting.revision,
                });
                if (saved) setDeleting(null);
                else setDeleteError(true);
              }}
            >
              {busy ? 'Deleting…' : 'Delete task'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
function BoardCard({
  task,
  data,
  busy,
  fresh,
  openTask,
  move,
  archive,
  planTask,
  waitFor,
  remove,
  drag,
}: {
  task: Task;
  data: Workspace;
  busy: boolean;
  fresh: boolean;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  move: (t: Task, stage: Stage) => void;
  archive: (t: Task) => void;
  planTask: (t: Task, mode: string) => void;
  waitFor: (t: Task) => void;
  remove: (t: Task) => void;
  drag: (t: Task | null) => void;
}) {
  const prospect = data.prospects.find((p) => p.id === task.prospectId);
  const project = data.projects.find((p) => p.id === task.projectId),
    space = data.spaces.find((s) => s.id === taskSpaceId(data, task)),
    member = data.members.find((m) => m.id === task.assignee),
    notes = data.notes.filter((n) => n.taskId === task.id).length,
    resources = relatedResources(data, { type: 'task', id: task.id }).length;
  return (
    <article
      className={`work-card ${fresh ? 'is-fresh' : ''} ${task.stage === 'Done' ? 'is-done' : ''}`}
      style={{ '--task-brand': space?.color || '#7788a0' } as CSSProperties}
      draggable={!busy}
      onDragStart={(e) => {
        drag(task);
        e.dataTransfer.setData('application/x-studio-task', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => drag(null)}
    >
      <button className="work-card-main" onClick={() => openTask(task.id)}>
        <span className="work-card-client">
          <span />
          {space?.name || prospect?.name || (project ? 'Studio' : 'Personal')}
          <GripVertical size={14} />
        </span>
        <h3>{task.title}</h3>
        {task.focusFor === localDay(new Date()) && task.stage !== 'Done' && (
          <span className="work-card-priority">Today’s priority</span>
        )}
        {task.reviewRequired === 0 && task.version === 0 && (
          <span className="work-card-simple">No review needed</span>
        )}
        <p>
          {project?.name ||
            (prospect
              ? 'Prospect · ' + prospect.stage
              : space
                ? 'Client task'
                : 'Personal task')}
        </p>
        {task.blocked && (
          <span className="work-card-blocked">
            <Flag size={12} />
            Blocked
          </span>
        )}
      </button>
      <footer>
        <span className="work-card-owner">
          <span
            className="work-card-avatar"
            style={{ background: member?.color || '#7788a0' }}
          >
            {member?.name.slice(0, 1) || '?'}
          </span>
          {member?.id === data.currentMember ? 'You' : member?.name}
        </span>
        <div className="work-card-context">
          <button
            aria-label={`Open ${task.title}: ${notes} notes`}
            onClick={() => openTask(task.id, 'brief')}
          >
            <MessageSquare size={14} />
            {notes}
          </button>
          <button
            aria-label={`Open ${task.title}: ${resources} connected resources`}
            onClick={() => openTask(task.id, 'brief')}
          >
            <Link2 size={14} />
            {resources}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy}
              className="work-card-move"
              aria-label={`Actions for ${task.title}`}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="work-actions-menu">
              {task.assignee === data.currentMember &&
                task.stage !== 'Done' && (
                  <>
                    <DropdownMenuItem onClick={() => planTask(task, 'focus')}>
                      {task.focusFor === localDay(new Date())
                        ? 'Remove daily priority'
                        : 'Make a priority today'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => planTask(task, 'plan')}>
                      Plan for tomorrow
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => waitFor(task)}>
                      {task.blocked ? 'Update waiting reason' : 'Waiting for…'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

              {stages.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  disabled={busy || task.stage === stage}
                  onClick={() => move(task, stage)}
                >
                  Move to {stage}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onClick={() => archive(task)}>
                <Archive size={16} />
                Archive task
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                variant="destructive"
                onClick={() => remove(task)}
              >
                <Trash2 size={16} />
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>
    </article>
  );
}
