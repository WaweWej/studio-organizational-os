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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { stages, type Workspace, type Task, type Stage } from '@/lib/model';
import { taskSpaceId } from '@/lib/task-context';
import { relatedResources } from '@/lib/resource-model';
import type { CaptureEntry } from '@/lib/entry-model';
import QuickCapture, { type CaptureDraft } from './quick-capture';
const stageIcons = [Circle, CircleDot, Clock3, CircleCheck];
export default function WorkBoard({
  data,
  tasks,
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
    if (!enabled || !ready) return;
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
  }, [enabled, ready]);
  const move = (task: Task, stage: Stage) =>
    void act({ type: 'move', id: task.id, revision: task.revision, stage });
  return (
    <section className="workboard" aria-label="Task board">
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
              Capture what’s on your mind.
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
                    move={move}
                    drag={(t) => {
                      dragged.current = t;
                    }}
                  />
                ))}
                {!items.length && (
                  <div className="workboard-empty">
                    <Icon size={22} />
                    <p>
                      {stage === 'Up next'
                        ? 'Room for the next idea.'
                        : stage === 'Doing'
                          ? 'Ready when you are.'
                          : stage === 'Review'
                            ? 'A fresh pair of eyes.'
                            : 'Make room for the finished work.'}
                    </p>
                    <small>
                      {stage === 'Up next'
                        ? 'Press Enter to capture a task.'
                        : stage === 'Doing'
                          ? 'Move a task here when you start.'
                          : stage === 'Review'
                            ? 'Save a deliverable, then request review.'
                            : 'Approved work lands here.'}
                    </small>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
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
  drag,
}: {
  task: Task;
  data: Workspace;
  busy: boolean;
  fresh: boolean;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  move: (t: Task, stage: Stage) => void;
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
          <Select
            value={task.stage}
            onValueChange={(stage) => stage && move(task, stage as Stage)}
          >
            <SelectTrigger
              disabled={busy}
              className="work-card-move"
              aria-label={`Move ${task.title}`}
            >
              <SelectValue className="sr-only" />
              <span aria-hidden="true">···</span>
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem value={stage} key={stage}>
                  Move to {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </footer>
    </article>
  );
}
