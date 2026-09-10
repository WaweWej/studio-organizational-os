'use client';
/* eslint-disable next/no-img-element -- Client images use direct HTTPS addresses; no image proxy is configured. */

import { MeetingConnection, meetingConnection } from './meeting-connection';
import {
  readMeetingDraft,
  writeMeetingDraft,
  clearMeetingDraft,
} from '@/lib/meeting-draft';
import { taskSpaceId } from '@/lib/task-context';
import {
  useState,
  useEffect,
  useId,
  useRef,
  cloneElement,
  type CSSProperties,
  type ReactNode,
  type ReactElement,
  type SubmitEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  Flag,
  Layers,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Target,
  X,
} from 'lucide-react';
import { ConnectedNotes } from './working-desk';
import { RelatedResources } from './resource-library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import type { Meeting, Project, Space, Task, Workspace } from '@/lib/model';

type Action = (command: Record<string, unknown>) => Promise<boolean>;
type Props = {
  initialMeetingId?: string | null;
  space: Space;
  data: Workspace;
  busy: boolean;
  ready: boolean;
  error: string;
  act: Action;
  openTask: (id: string) => void;
  openProject: (id: string) => void;
  back: () => void;
};
type Deadline = {
  kind: 'task' | 'project';
  id: string;
  title: string;
  due: string;
  revision?: number;
};
const shortDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(value.length === 10 ? value + 'T12:00:00' : value))
    : 'No deadline';
const meetingDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
const localInputTime = (value: string) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const todayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const lines = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

function Choice({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  id?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger id={id} aria-label={label} className="cf-select">
        <SelectValue>
          {options.find((o) => o.id === value)?.name || 'Choose…'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="cf-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
function ColorInput({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="cf-color-input">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>{value}</span>
    </div>
  );
}
function Person({ id, data }: { id: string; data: Workspace }) {
  const member = data.members.find((m) => m.id === id);
  return (
    <span className="cf-person">
      <span style={{ background: member?.color || '#687568' }}>
        {member?.name.slice(0, 1)}
      </span>
      {member?.name || 'Unassigned'}
    </span>
  );
}
function PanelHeading({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="cf-panel-heading">
      <h2>
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}
function FormError({ error }: { error: string }) {
  return error ? (
    <p className="cf-form-error" role="alert">
      {error}
    </p>
  ) : null;
}
function Stage({ task }: { task: Task }) {
  return (
    <span
      className={`cf-stage cf-stage-${task.stage.replace(' ', '-').toLowerCase()}`}
    >
      {task.stage === 'Done' ? <Check size={12} /> : <span />}
      {task.stage}
    </span>
  );
}

export default function ClientFocus({
  initialMeetingId = null,
  space,
  data,
  busy,
  ready,
  error,
  act,
  openTask,
  openProject,
  back,
}: Props) {
  const [tab, setTab] = useState('overview');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [meetingDirty, setMeetingDirty] = useState(false);
  const [discardMeeting, setDiscardMeeting] = useState(false);
  const [editBrand, setEditBrand] = useState(false);
  const [clientAction, setClientAction] = useState<'sales' | 'delete' | null>(
    null,
  );
  const [newMeeting, setNewMeeting] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(initialMeetingId);
  const [newTask, setNewTask] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [deadline, setDeadline] = useState<Deadline | null>(null);
  const [workFilter, setWorkFilter] = useState('Open');
  const projects = data.projects.filter((p) => p.spaceId === space.id);
  const tasks = data.tasks.filter((t) => taskSpaceId(data, t) === space.id);
  const open = tasks.filter((t) => t.stage !== 'Done');
  const overdue = open.filter((t) => t.due && t.due < todayKey(now));
  const inReview = open.filter((t) => t.stage === 'Review');
  const meetings = data.meetings
    .filter((m) => m.spaceId === space.id)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const upcoming = meetings
    .filter((m) => m.status === 'Planned')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const next = upcoming.find((m) => Date.parse(m.startsAt) >= now);
  const previous = meetings.find((m) => m.status === 'Completed');
  const selectedMeeting = meetings.find((m) => m.id === meetingId);
  const deadlines = [...open]
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
    .slice(0, 4);
  const filteredTasks = tasks.filter(
    (t) =>
      workFilter === 'All' ||
      (workFilter === 'Open'
        ? t.stage !== 'Done'
        : workFilter === 'Overdue'
          ? t.due && t.due < todayKey(now) && t.stage !== 'Done'
          : t.stage === workFilter),
  );
  const editTaskDeadline = (task: Task) =>
    setDeadline({
      kind: 'task',
      id: task.id,
      title: task.title,
      due: task.due,
      revision: task.revision,
    });
  const taskRow = (task: Task) => (
    <div className="cf-task-row" key={task.id}>
      <button className="cf-task-name" onClick={() => openTask(task.id)}>
        {task.stage === 'Done' ? (
          <CircleCheck size={17} />
        ) : (
          <Circle size={17} />
        )}
        <span>
          <strong>{task.title}</strong>
          <small>
            {projects.find((p) => p.id === task.projectId)?.name ||
              'Client task'}
          </small>
        </span>
      </button>
      <Stage task={task} />
      <button
        className={`cf-date-button ${task.due && task.due < todayKey(now) && task.stage !== 'Done' ? 'is-overdue' : ''}`}
        disabled={!ready || busy}
        onClick={() => editTaskDeadline(task)}
        aria-label={`Set deadline for ${task.title}`}
      >
        <CalendarDays size={14} />
        {shortDate(task.due)}
      </button>
      <Person id={task.assignee} data={data} />
    </div>
  );
  const projectCard = (p: Project) => {
    const all = tasks.filter((t) => t.projectId === p.id),
      done = all.filter((t) => t.stage === 'Done').length;
    return (
      <article className="cf-project" key={p.id}>
        <div className="cf-project-top">
          <span className="cf-project-icon">
            <Layers size={18} />
          </span>
          <button onClick={() => openProject(p.id)}>
            <strong>{p.name}</strong>
            <ArrowUpRight size={17} />
          </button>
          <button
            className="cf-date-button"
            onClick={() =>
              setDeadline({
                kind: 'project',
                id: p.id,
                title: p.name,
                due: p.due,
              })
            }
            disabled={!ready || busy}
          >
            <CalendarDays size={14} />
            {shortDate(p.due)}
          </button>
        </div>
        <p>{p.description || 'Add tasks to start shaping this project.'}</p>
        <div className="cf-progress-label">
          <span>
            {done} of {all.length} tasks complete
          </span>
          <strong>
            {all.length ? Math.round((done / all.length) * 100) : 0}%
          </strong>
        </div>
        <Progress
          value={all.length ? (done / all.length) * 100 : 0}
          className="cf-progress"
          aria-label={`${p.name} completion`}
        />
        <div className="cf-project-stages">
          <span>
            <i className="doing" />
            {all.filter((t) => t.stage === 'Doing').length} doing
          </span>
          <span>
            <i className="review" />
            {all.filter((t) => t.stage === 'Review').length} in review
          </span>
          <span>
            <i />
            {all.filter((t) => t.stage === 'Up next').length} up next
          </span>
        </div>
      </article>
    );
  };

  return (
    <div
      className="client-focus"
      style={{ '--client-color': space.color } as CSSProperties}
    >
      <div className="cf-topline">
        <button onClick={back}>
          <ArrowLeft size={15} />
          All spaces
        </button>
        <div>
          <Person id={space.owner} data={data} />
          <span className="cf-account-label">Account lead</span>
          <Button
            variant="outline"
            onClick={() => setEditBrand(true)}
            disabled={!ready}
          >
            <Pencil size={14} />
            Edit space
          </Button>
          {space.type === 'Client' && (
            <Button
              variant="ghost"
              disabled={!ready || busy}
              onClick={() => setClientAction('sales')}
            >
              Move to Sales
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={!ready || busy}
            onClick={() => setClientAction('delete')}
          >
            Remove client
          </Button>
        </div>
      </div>
      <section
        className={`cf-brand-cover cf-type-${space.brandStyle} ${space.coverUrl ? 'has-cover' : ''}`}
      >
        {space.coverUrl && (
          <img
            className="cf-cover-image"
            src={space.coverUrl}
            alt=""
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        )}
        <div className="cf-brand-wash" />
        <div className="cf-brand-copy">
          <span className="cf-kicker">
            <span />
            {space.type} space
          </span>
          {space.logoUrl && (
            <img
              className="cf-client-logo"
              src={space.logoUrl}
              alt={`${space.name} logo`}
            />
          )}
          <h1>{space.name}</h1>
          <p>{space.tagline || space.brief}</p>
        </div>
        <span className="cf-cover-label">
          {data.demo ? 'Sample brand' : 'Your client workspace'}
        </span>
      </section>
      <div className="cf-navigation">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList variant="line" className="cf-tabs">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="work">
              Work<span>{open.length}</span>
            </TabsTrigger>
            <TabsTrigger value="meetings">Meetings</TabsTrigger>
            <TabsTrigger value="brand">Brand & context</TabsTrigger>
            <TabsTrigger value="resources">Library & tools</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          className="cf-primary"
          onClick={() => setNewTask(true)}
          disabled={!ready || projects.length === 0}
        >
          <Plus size={15} />
          Add task
        </Button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="cf-pulse">
            <span>
              <span className="cf-live-dot" />
              {open.length} open tasks across {projects.length}{' '}
              {projects.length === 1 ? 'project' : 'projects'}
            </span>
            <div>
              {inReview.length > 0 && (
                <button
                  onClick={() => {
                    setWorkFilter('Review');
                    setTab('work');
                  }}
                >
                  <Clock3 size={14} />
                  {inReview.length} in review
                  <ChevronRight size={13} />
                </button>
              )}
              {overdue.length > 0 && (
                <button
                  className="cf-overdue"
                  onClick={() => {
                    setWorkFilter('Overdue');
                    setTab('work');
                  }}
                >
                  <Flag size={14} />
                  {overdue.length} overdue
                  <ChevronRight size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="cf-main-grid">
            <section className="cf-panel cf-meeting-focus">
              <PanelHeading
                icon={<CalendarDays size={17} />}
                title={
                  next && Date.parse(next.startsAt) < now
                    ? 'Meeting to follow up'
                    : 'Your next conversation'
                }
                action={
                  <button
                    className="cf-quiet-button"
                    aria-label="Plan a meeting"
                    onClick={() => setNewMeeting(true)}
                    disabled={!ready}
                  >
                    <Plus size={17} />
                  </button>
                }
              />
              {next ? (
                <>
                  <div className="cf-meeting-title">
                    <div className="cf-calendar-tile">
                      <span>
                        {new Date(next.startsAt).toLocaleDateString('en', {
                          month: 'short',
                        })}
                      </span>
                      <strong>{new Date(next.startsAt).getDate()}</strong>
                    </div>
                    <div>
                      <h3>{next.title}</h3>
                      <p>{meetingDate(next.startsAt)}</p>
                    </div>
                  </div>
                  <div className="cf-agenda">
                    <span className="cf-section-label">ON THE AGENDA</span>
                    {next.agenda ? (
                      <ol>
                        {lines(next.agenda)
                          .slice(0, 3)
                          .map((line, i) => (
                            <li key={i}>
                              <span>{String(i + 1).padStart(2, '0')}</span>
                              {line}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="cf-muted">
                        Set an agenda so everyone arrives with the same context.
                      </p>
                    )}
                  </div>
                  <div className="cf-meeting-footer">
                    <span>Brief, decisions & follow-ups</span>
                    <Button
                      className="cf-primary"
                      onClick={() => setMeetingId(next.id)}
                    >
                      Open meeting
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="cf-empty">
                  <h3>Make room for the next conversation.</h3>
                  <p>Set a date and collect the things you want to discuss.</p>
                  <Button
                    className="cf-primary"
                    onClick={() => setNewMeeting(true)}
                    disabled={!ready}
                  >
                    <Plus size={15} />
                    Plan a meeting
                  </Button>
                </div>
              )}
            </section>
            <section className="cf-panel cf-deadlines">
              <PanelHeading
                icon={<Flag size={17} />}
                title="What needs to move"
                action={
                  <button
                    className="cf-text-button"
                    onClick={() => {
                      setTab('work');
                      setWorkFilter('Open');
                    }}
                  >
                    All work
                    <ArrowUpRight size={14} />
                  </button>
                }
              />
              {deadlines.length ? (
                deadlines.map((task) => (
                  <div className="cf-deadline-row" key={task.id}>
                    <button
                      className={`cf-deadline-date ${task.due && task.due < todayKey(now) ? 'is-overdue' : ''}`}
                      onClick={() => editTaskDeadline(task)}
                      disabled={!ready || busy}
                      aria-label={`Set deadline for ${task.title}`}
                    >
                      <span>{task.due ? shortDate(task.due) : 'Set date'}</span>
                      {task.due && task.due < todayKey(now) ? (
                        <small>Overdue</small>
                      ) : (
                        <Pencil size={11} />
                      )}
                    </button>
                    <button
                      className="cf-deadline-task"
                      onClick={() => openTask(task.id)}
                    >
                      <strong>{task.title}</strong>
                      <span>
                        <Stage task={task} />
                        {data.members.find((m) => m.id === task.assignee)?.name}
                      </span>
                    </button>
                    <ChevronRight size={14} />
                  </div>
                ))
              ) : (
                <div className="cf-empty">
                  <CircleCheck size={24} />
                  <p>
                    No open tasks. Add the next piece of work when you’re ready.
                  </p>
                </div>
              )}
            </section>
            <section className="cf-panel">
              <PanelHeading
                icon={<Layers size={17} />}
                title="Moving forward"
                action={
                  <button
                    className="cf-text-button"
                    onClick={() => setNewProject(true)}
                    disabled={!ready}
                  >
                    <Plus size={14} />
                    Project
                  </button>
                }
              />
              {projects.length ? (
                projects.slice(0, 2).map(projectCard)
              ) : (
                <div className="cf-empty">
                  <p>Give this client’s work a home.</p>
                  <Button
                    variant="outline"
                    onClick={() => setNewProject(true)}
                    disabled={!ready}
                  >
                    Create a project
                  </Button>
                </div>
              )}
              {projects.length > 2 && (
                <button
                  className="cf-text-button cf-panel-end"
                  onClick={() => setTab('work')}
                >
                  View all {projects.length} projects
                  <ArrowRight size={15} />
                </button>
              )}
            </section>
            <section className="cf-panel cf-compass">
              <PanelHeading
                icon={<Target size={17} />}
                title="Keep this in mind"
                action={
                  <button
                    className="cf-quiet-button"
                    onClick={() => setEditBrand(true)}
                    disabled={!ready}
                    aria-label="Edit client goals"
                  >
                    <Pencil size={15} />
                  </button>
                }
              />
              <div>
                <span className="cf-section-label">WHAT THEY WANT</span>
                <p>
                  {space.wants ||
                    'Capture what success looks like for this client.'}
                </p>
              </div>
              <div>
                <span className="cf-section-label">WHAT THEY NEED FROM US</span>
                <p>
                  {space.needs ||
                    'Keep the practical needs and non-negotiables close to the work.'}
                </p>
              </div>
            </section>
          </div>
          <section className="cf-last-meeting">
            <span className="cf-last-icon">
              <CheckCheck size={20} />
            </span>
            <div>
              <span className="cf-section-label">
                WHERE WE LEFT OFF
                {previous ? ` · ${shortDate(previous.startsAt)}` : ''}
              </span>
              <p>
                {previous?.decisions
                  ? lines(previous.decisions)[0]
                  : 'Decisions from completed meetings will stay here.'}
              </p>
            </div>
            {previous && (
              <button
                className="cf-text-button"
                onClick={() => setMeetingId(previous.id)}
              >
                Meeting notes
                <ArrowUpRight size={15} />
              </button>
            )}
          </section>
        </>
      )}

      {tab === 'overview' && (
        <ConnectedNotes data={data} target={{ type: 'space', id: space.id }} />
      )}
      {tab === 'work' && (
        <div className="cf-tab-body">
          <PanelHeading
            title="Projects"
            action={
              <Button
                variant="outline"
                onClick={() => setNewProject(true)}
                disabled={!ready}
              >
                <Plus size={14} />
                New project
              </Button>
            }
          />
          <div className="cf-project-grid">{projects.map(projectCard)}</div>
          {!projects.length && (
            <p className="cf-muted">
              Start with a project, then add the tasks that move it forward.
            </p>
          )}
          <div className="cf-work-toolbar">
            <h2>The work</h2>
            <Choice
              label="Filter tasks"
              value={workFilter}
              onChange={setWorkFilter}
              options={['Open', 'Review', 'Overdue', 'Done', 'All'].map(
                (id) => ({ id, name: id }),
              )}
            />
          </div>
          <div className="cf-work-list">
            {filteredTasks.length ? (
              filteredTasks.map(taskRow)
            ) : (
              <div className="cf-empty">
                <p>No tasks in this view.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="cf-tab-body">
          <PanelHeading
            title="Every conversation, kept together"
            action={
              <Button
                className="cf-primary"
                onClick={() => setNewMeeting(true)}
                disabled={!ready}
              >
                <Plus size={14} />
                Plan a meeting
              </Button>
            }
          />
          <div className="cf-meeting-list">
            {meetings.length ? (
              meetings.map((m) => (
                <button
                  className="cf-meeting-list-row"
                  key={m.id}
                  onClick={() => setMeetingId(m.id)}
                >
                  <div className="cf-calendar-tile">
                    <span>
                      {new Date(m.startsAt).toLocaleDateString('en', {
                        month: 'short',
                      })}
                    </span>
                    <strong>{new Date(m.startsAt).getDate()}</strong>
                  </div>
                  <div>
                    <span
                      className={`cf-meeting-status status-${m.status.toLowerCase()}`}
                    >
                      {m.status}
                    </span>
                    <h3>{m.title}</h3>
                    <p>{meetingDate(m.startsAt)}</p>
                    {m.decisions && (
                      <p className="cf-meeting-excerpt">
                        {lines(m.decisions)[0]}
                      </p>
                    )}
                  </div>
                  <span className="cf-meeting-action">
                    {m.status === 'Completed' ? 'Read notes' : 'Prepare'}
                    <ArrowUpRight size={16} />
                  </span>
                </button>
              ))
            ) : (
              <div className="cf-empty">
                <p>
                  No meetings yet. Plan one to start collecting the context.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'brand' && (
        <div className="cf-tab-body">
          <PanelHeading
            title="The people and purpose behind the work"
            action={
              <Button
                variant="outline"
                onClick={() => setEditBrand(true)}
                disabled={!ready}
              >
                <Pencil size={14} />
                Edit brief
              </Button>
            }
          />
          <div className="cf-brand-grid">
            <section className="cf-panel cf-brief-panel">
              <span className="cf-section-label">THE BRIEF</span>
              <p>{space.brief || 'Add the client brief.'}</p>
              <span className="cf-section-label">WHO WE ARE SPEAKING TO</span>
              <p>{space.audience || 'Define the audience.'}</p>
              <span className="cf-section-label">HOW THE BRAND SOUNDS</span>
              <p>
                {space.voice ||
                  'Capture the tone and language that feel right.'}
              </p>
            </section>
            <section className="cf-panel cf-brand-details">
              <span className="cf-section-label">BRAND IDENTITY</span>
              <div className="cf-color-sample">
                <span style={{ background: space.color }} />
                <div>
                  <strong>Signature color</strong>
                  <p>{space.color.toUpperCase()}</p>
                </div>
              </div>
              <div className={`cf-type-sample cf-type-${space.brandStyle}`}>
                {space.name}
                <small>
                  {space.brandStyle === 'serif'
                    ? 'Classic serif'
                    : space.brandStyle === 'editorial'
                      ? 'Editorial serif'
                      : 'Modern sans'}
                </small>
              </div>
              <span className="cf-section-label">ACCOUNT LEAD</span>
              <Person id={space.owner} data={data} />
              {space.website && (
                <a
                  className="cf-resource-link"
                  href={space.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Link2 size={16} />
                  Client website
                  <ArrowUpRight size={16} />
                </a>
              )}
            </section>
          </div>
          <RelatedResources target={{ type: 'space', id: space.id }} />
        </div>
      )}

      {tab === 'resources' && (
        <RelatedResources target={{ type: 'space', id: space.id }} />
      )}
      {data.prospects.some((p) => p.clientId === space.id) && (
        <section className="cf-panel">
          <h2>Sales history</h2>
          {data.prospectEvents
            .filter((e) =>
              data.prospects.some(
                (p) => p.clientId === space.id && p.id === e.prospectId,
              ),
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map((e) => (
              <div key={e.id} className="prospect-event">
                <div>
                  <p>{e.body}</p>
                  <small>{new Date(e.createdAt).toLocaleDateString()}</small>
                </div>
              </div>
            ))}
        </section>
      )}
      <Dialog
        open={!!clientAction}
        onOpenChange={(open) => !busy && !open && setClientAction(null)}
      >
        <DialogContent className="cf-dialog">
          <DialogHeader>
            <DialogTitle>
              {clientAction === 'sales'
                ? 'Move ' + space.name + ' to Sales?'
                : 'Remove ' + space.name + '?'}
            </DialogTitle>
            <DialogDescription>
              {clientAction === 'sales'
                ? 'Create or reuse the prospect in Sales and connect its tasks. The client profile leaves Spaces; projects remain in Work, and files remain in Library.'
                : 'Permanently delete the client profile and its meeting history. Tasks, projects, notes and shared files remain, with their client connection removed.'}
            </DialogDescription>
          </DialogHeader>
          <p>
            {tasks.length} tasks · {projects.length} projects ·{' '}
            {meetings.length} meetings
          </p>
          {clientAction === 'sales' && meetings.length > 0 && (
            <p role="alert">
              This client has meeting records. Moving to Sales is available for
              clients without meetings.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <Button
            variant={clientAction === 'delete' ? 'destructive' : 'default'}
            disabled={busy || (clientAction === 'sales' && meetings.length > 0)}
            onClick={async () => {
              if (
                await act({
                  type:
                    clientAction === 'sales'
                      ? 'client-to-prospect'
                      : 'client-delete',
                  id: space.id,
                  revision: space.revision,
                })
              ) {
                setClientAction(null);
                back();
              }
            }}
          >
            {busy
              ? 'Saving…'
              : clientAction === 'sales'
                ? 'Move to Sales'
                : 'Remove client'}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setClientAction(null)}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={editBrand} onOpenChange={setEditBrand}>
        <DialogContent className="cf-dialog cf-brand-dialog">
          <DialogHeader>
            <DialogTitle>Make this space theirs</DialogTitle>
            <DialogDescription>
              Shape the brand and brief. The workspace structure stays familiar.
            </DialogDescription>
          </DialogHeader>
          {editBrand && (
            <BrandEditor
              space={space}
              data={data}
              busy={busy}
              error={error}
              save={async (fields) => {
                if (await act({ ...fields, type: 'client-edit', id: space.id }))
                  setEditBrand(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={newMeeting} onOpenChange={setNewMeeting}>
        <DialogContent className="cf-dialog">
          <DialogHeader>
            <DialogTitle>Plan a conversation</DialogTitle>
            <DialogDescription>
              {space.name} · saved in this space
            </DialogDescription>
          </DialogHeader>
          {newMeeting && (
            <NewMeeting
              busy={busy}
              error={error}
              save={async (fields) => {
                if (
                  await act({ type: 'meeting-create', id: space.id, ...fields })
                )
                  setNewMeeting(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={newTask} onOpenChange={setNewTask}>
        <DialogContent className="cf-dialog">
          <DialogHeader>
            <DialogTitle>What needs to happen?</DialogTitle>
            <DialogDescription>
              A task here is the same task on your project and daily board.
            </DialogDescription>
          </DialogHeader>
          {newTask && (
            <TaskComposer
              projects={projects}
              data={data}
              busy={busy}
              error={error}
              save={async (fields) => {
                if (await act({ type: 'create', ...fields })) {
                  setNewTask(false);
                  return true;
                }
                return false;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={newProject} onOpenChange={setNewProject}>
        <DialogContent className="cf-dialog">
          <DialogHeader>
            <DialogTitle>A new project for {space.name}</DialogTitle>
            <DialogDescription>
              Give the work an outcome and a deadline.
            </DialogDescription>
          </DialogHeader>
          <form
            className="cf-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act({
                  type: 'client-project',
                  id: space.id,
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                })
              )
                setNewProject(false);
            }}
          >
            <FormError error={error} />
            <Field label="Project name">
              <Input
                name="name"
                required
                maxLength={180}
                placeholder="e.g. Autumn campaign"
              />
            </Field>
            <Field label="The outcome">
              <Textarea
                name="description"
                rows={3}
                placeholder="What are we working towards?"
              />
            </Field>
            <Field label="Deadline">
              <Input type="date" name="due" />
            </Field>
            <Button className="cf-primary" disabled={busy} type="submit">
              Create project
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deadline} onOpenChange={(v) => !v && setDeadline(null)}>
        <DialogContent className="cf-dialog cf-date-dialog">
          <DialogHeader>
            <DialogTitle>Set a deadline</DialogTitle>
            <DialogDescription>{deadline?.title}</DialogDescription>
          </DialogHeader>
          {deadline && (
            <form
              className="cf-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const due = new FormData(e.currentTarget).get('due');
                if (
                  await act(
                    deadline.kind === 'task'
                      ? {
                          type: 'deadline',
                          id: deadline.id,
                          revision: deadline.revision,
                          due,
                        }
                      : {
                          type: 'client-project-deadline',
                          id: deadline.id,
                          previous: deadline.due,
                          due,
                        },
                  )
                )
                  setDeadline(null);
              }}
            >
              <FormError error={error} />
              <Field label="Due date">
                <Input type="date" name="due" defaultValue={deadline.due} />
              </Field>
              <p className="cf-form-hint">
                Leave empty to remove the deadline.
              </p>
              <Button className="cf-primary" disabled={busy} type="submit">
                Save deadline
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selectedMeeting}
        onOpenChange={(v) => {
          if (!v) {
            if (meetingDirty) setDiscardMeeting(true);
            else setMeetingId(null);
          }
        }}
      >
        <SheetContent className="cf-meeting-sheet">
          <SheetHeader>
            <SheetTitle>{space.name} · meeting workspace</SheetTitle>
            <SheetDescription>
              Prepare, capture decisions, and give the next steps an owner.
            </SheetDescription>
          </SheetHeader>
          {selectedMeeting && (
            <MeetingEditor
              key={selectedMeeting.id}
              onDirtyChange={setMeetingDirty}
              meeting={selectedMeeting}
              data={data}
              projects={projects}
              busy={busy}
              error={error}
              act={act}
              openTask={(id) => {
                setMeetingDirty(false);
                setMeetingId(null);
                openTask(id);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={discardMeeting} onOpenChange={setDiscardMeeting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep your meeting notes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Return to the meeting to save them, or
              discard this draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                setDiscardMeeting(false);
                if (selectedMeeting)
                  clearMeetingDraft(data.draftScope || '', selectedMeeting.id);
                setMeetingDirty(false);
                setMeetingId(null);
              }}
            >
              Discard draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BrandEditor({
  space,
  data,
  busy,
  error,
  save,
}: {
  space: Space;
  data: Workspace;
  busy: boolean;
  error: string;
  save: (fields: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState({ ...space });
  const [tab, setTab] = useState('brief');
  const field = (key: keyof Space, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="cf-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <FormError error={error} />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList>
          <TabsTrigger value="brief">Brief & goals</TabsTrigger>
          <TabsTrigger value="identity">Visual identity</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'brief' ? (
        <>
          <div className="cf-fields">
            <Field label="Client name">
              <Input
                value={draft.name}
                onChange={(e) => field('name', e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Account lead">
              <Choice
                label="Account lead"
                value={draft.owner}
                options={data.members}
                onChange={(v) => field('owner', v)}
              />
            </Field>
          </div>
          <Field label="The brief">
            <Textarea
              value={draft.brief}
              onChange={(e) => field('brief', e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="What they want">
            <Textarea
              value={draft.wants}
              onChange={(e) => field('wants', e.target.value)}
              rows={2}
              placeholder="What does success look like?"
            />
          </Field>
          <Field label="What they need from us">
            <Textarea
              value={draft.needs}
              onChange={(e) => field('needs', e.target.value)}
              rows={2}
              placeholder="The practical needs and non-negotiables"
            />
          </Field>
          <div className="cf-fields">
            <Field label="Audience">
              <Textarea
                value={draft.audience}
                onChange={(e) => field('audience', e.target.value)}
                rows={3}
              />
            </Field>
            <Field label="Brand voice">
              <Textarea
                value={draft.voice}
                onChange={(e) => field('voice', e.target.value)}
                rows={3}
              />
            </Field>
          </div>
        </>
      ) : (
        <>
          <Field label="Brand line">
            <Input
              value={draft.tagline}
              onChange={(e) => field('tagline', e.target.value)}
              maxLength={180}
            />
          </Field>
          <div className="cf-fields">
            <Field label="Signature color">
              <ColorInput
                value={draft.color}
                onChange={(v) => field('color', v)}
              />
            </Field>
            <Field label="Typography">
              <Choice
                label="Typography"
                value={draft.brandStyle}
                options={[
                  { id: 'sans', name: 'Modern sans' },
                  { id: 'serif', name: 'Classic serif' },
                  { id: 'editorial', name: 'Editorial serif' },
                ]}
                onChange={(v) => field('brandStyle', v)}
              />
            </Field>
          </div>
          <div
            className={`cf-brand-preview cf-type-${draft.brandStyle}`}
            style={{ borderColor: draft.color }}
          >
            <span style={{ background: draft.color }} />
            <strong>{draft.name}</strong>
            <p>{draft.tagline}</p>
          </div>
          <Field label="Cover image address">
            <Input
              value={draft.coverUrl}
              onChange={(e) => field('coverUrl', e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Logo image address">
            <Input
              value={draft.logoUrl}
              onChange={(e) => field('logoUrl', e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Client website">
            <Input
              value={draft.website}
              onChange={(e) => field('website', e.target.value)}
              placeholder="https://…"
            />
          </Field>
          <p className="cf-form-hint">
            Use a hosted image address. Leave it empty for a cover using the
            brand color.
          </p>
        </>
      )}
      <div className="cf-form-footer">
        <span>Changes apply across this client space.</span>
        <Button className="cf-primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save space'}
        </Button>
      </div>
    </form>
  );
}

function NewMeeting({
  busy,
  error,
  save,
}: {
  busy: boolean;
  error: string;
  save: (fields: Record<string, unknown>) => void;
}) {
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    save({
      title: form.get('title'),
      startsAt: new Date(form.get('startsAt') as string).toISOString(),
      agenda: form.get('agenda'),
    });
  };
  return (
    <form className="cf-form" onSubmit={submit}>
      <FormError error={error} />
      <Field label="Meeting title">
        <Input
          name="title"
          required
          maxLength={180}
          placeholder="e.g. Monthly progress & priorities"
        />
      </Field>
      <Field label="Date & time">
        <Input type="datetime-local" name="startsAt" required />
      </Field>
      <p className="cf-form-hint">
        Your local time · this does not send a calendar invitation.
      </p>
      <Field label="What do we need to discuss?">
        <Textarea
          name="agenda"
          rows={5}
          placeholder={
            'Review progress\nDecide the next priorities\nAgree owners and deadlines'
          }
        />
      </Field>
      <Button type="submit" className="cf-primary" disabled={busy}>
        Plan meeting
      </Button>
    </form>
  );
}

function TaskComposer({
  allowNoProject = false,
  projects,
  data,
  busy,
  error,
  save,
}: {
  allowNoProject?: boolean;
  projects: Project[];
  data: Workspace;
  busy: boolean;
  error: string;
  save: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const [projectId, setProjectId] = useState(
    projects[0]?.id || (allowNoProject ? 'none' : ''),
  );
  const [assignee, setAssignee] = useState(data.currentMember);
  return (
    <form
      className="cf-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fields = Object.fromEntries(new FormData(form));
        if (
          await save({
            ...fields,
            projectId: projectId === 'none' ? '' : projectId,
            assignee,
          })
        )
          form.reset();
      }}
    >
      <FormError error={error} />
      <Field label="The next step">
        <Input
          name="title"
          required
          maxLength={180}
          placeholder="Give the task a clear outcome"
        />
      </Field>
      <Field label="Context">
        <Textarea
          name="description"
          rows={3}
          placeholder="The decision, the brief, or what good looks like"
        />
      </Field>
      <Field label="Project">
        <Choice
          label="Project"
          value={projectId}
          options={
            allowNoProject
              ? [{ id: 'none', name: 'No project' }, ...projects]
              : projects
          }
          onChange={setProjectId}
        />
      </Field>
      <div className="cf-fields">
        <Field label="Responsible">
          <Choice
            label="Responsible"
            value={assignee}
            options={data.members}
            onChange={setAssignee}
          />
        </Field>
        <Field label="Deadline">
          <Input type="date" name="due" />
        </Field>
      </div>
      <Button
        type="submit"
        className="cf-primary"
        disabled={busy || (!allowNoProject && !projectId)}
      >
        <Plus size={15} />
        Create task
      </Button>
      {!projects.length && !allowNoProject && (
        <p className="cf-form-hint">
          Create a project in this client space before adding follow-up tasks.
        </p>
      )}
    </form>
  );
}

export function MeetingEditor({
  meeting,
  data,
  projects,
  busy,
  error,
  act,
  openTask,
  onDirtyChange,
}: {
  meeting: Meeting;
  data: Workspace;
  projects: Project[];
  busy: boolean;
  error: string;
  act: Action;
  openTask: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const draftScope = data.draftScope || '';
  const [draft, setDraft] = useState(
    () => readMeetingDraft(draftScope, meeting) || { ...meeting },
  );
  const [saved, setSaved] = useState({ ...meeting });
  const draftRef = useRef(draft);
  const [tab, setTab] = useState('notes');
  const [connection, setConnection] = useState('none');
  const [savedMessage, setSavedMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  const update = (key: keyof Meeting, value: string) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    setDraft(next);
    writeMeetingDraft(draftScope, next);
    onDirtyChange(true);
  };
  const save = async (status = draft.status) => {
    const next = {
      ...draft,
      status,
      ...(!meeting.spaceId && !meeting.prospectId
        ? meetingConnection(connection)
        : {}),
    };
    if (await act({ type: 'meeting-edit', ...next })) {
      const result = { ...next, revision: next.revision + 1 };
      const unchanged =
        JSON.stringify(draftRef.current) === JSON.stringify(draft);
      const latest = unchanged
        ? result
        : { ...draftRef.current, revision: result.revision };
      draftRef.current = latest;
      setDraft(latest);
      if (unchanged) clearMeetingDraft(draftScope, meeting.id);
      else writeMeetingDraft(draftScope, latest);
      onDirtyChange(!unchanged);
      setSaved(result);
      setSavedMessage(
        status === 'Completed'
          ? 'Meeting completed. Decisions are saved.'
          : 'Meeting saved.',
      );
      return true;
    }
    return false;
  };
  const followups = data.tasks.filter((t) => t.meetingId === meeting.id);
  const history = data.spaceEvents
    .filter((e) => e.meetingId === meeting.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <div className="cf-meeting-editor">
      <div className="cf-editor-heading">
        <span
          className={`cf-meeting-status status-${draft.status.toLowerCase()}`}
        >
          {draft.status}
        </span>
        <h2>{draft.title}</h2>
        <p>
          <CalendarDays size={15} />
          {meetingDate(draft.startsAt)}
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="cf-tabs">
          <TabsTrigger value="prepare">Prepare</TabsTrigger>
          <TabsTrigger value="notes">Notes & decisions</TabsTrigger>
          <TabsTrigger value="followups">
            Tasks<span>{followups.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <FormError error={error} />
      {draft.revision !== meeting.revision && dirty && (
        <p role="alert">
          This meeting has a newer saved version. Your draft is still here. Copy
          your changes before reopening it.
        </p>
      )}
      {!meeting.spaceId && !meeting.prospectId && (
        <MeetingConnection
          data={data}
          value={connection}
          onChange={(v) => {
            setConnection(v);
            onDirtyChange(true);
          }}
        />
      )}
      {tab === 'prepare' && (
        <div className="cf-form">
          <Field label="Meeting title">
            <Input
              value={draft.title}
              onChange={(e) => update('title', e.target.value)}
              maxLength={180}
            />
          </Field>
          <Field label="Date & time">
            <Input
              type="datetime-local"
              value={localInputTime(draft.startsAt)}
              onChange={(e) => {
                if (e.target.value && !Number.isNaN(Date.parse(e.target.value)))
                  update('startsAt', new Date(e.target.value).toISOString());
              }}
            />
          </Field>
          <p className="cf-form-hint">
            Your local time. Calendar sync is not connected.
          </p>
          <Field label="On the agenda">
            <Textarea
              rows={7}
              value={draft.agenda}
              onChange={(e) => update('agenda', e.target.value)}
              placeholder="One discussion point per line"
            />
          </Field>
          {meeting.spaceId && (
            <div className="cf-meeting-context">
              <Target size={17} />
              <div>
                <strong>Keep the client’s goal in view</strong>
                <p>
                  {data.spaces.find((s) => s.id === meeting.spaceId)?.wants ||
                    'Add the client’s goals in their brand brief.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {tab === 'notes' && (
        <div className="cf-form">
          <Field label="Participants">
            <Input
              value={draft.participants || ''}
              onChange={(e) => update('participants', e.target.value)}
              maxLength={3000}
            />
          </Field>
          <Field label="Meeting notes">
            <Textarea
              rows={9}
              value={draft.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="What came up? What changed? What should we remember?"
            />
          </Field>
          <Field label="Decisions we agreed">
            <Textarea
              rows={5}
              value={draft.decisions}
              onChange={(e) => update('decisions', e.target.value)}
              placeholder="Capture each decision on its own line."
            />
          </Field>
          <button
            className="cf-followup-prompt"
            onClick={() => setTab('followups')}
          >
            <ListChecks size={18} />
            <span>Give the next steps an owner and a deadline.</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {tab === 'followups' && (
        <div className="cf-followups">
          <p>
            These tasks stay connected to this meeting and the responsible
            person’s board.
          </p>
          {followups.map((t) => (
            <button
              className="cf-followup-row"
              key={t.id}
              onClick={async () => {
                if (!dirty || (await save())) openTask(t.id);
              }}
            >
              <Circle size={15} />
              <span>
                <strong>{t.title}</strong>
                <small>
                  {data.members.find((m) => m.id === t.assignee)?.name} ·{' '}
                  {shortDate(t.due)}
                </small>
              </span>
              <Stage task={t} />
              <ChevronRight size={15} />
            </button>
          ))}
          <h3>Add a next step</h3>
          <TaskComposer
            allowNoProject
            projects={projects}
            data={data}
            busy={busy}
            error=""
            save={(fields) =>
              act({
                type: 'create',
                ...fields,
                meetingId: meeting.id,
                reviewRequired: 0,
              })
            }
          />
        </div>
      )}
      {tab === 'history' && (
        <div className="cf-history">
          {history.length ? (
            history.map((event) => {
              const snapshot = JSON.parse(
                event.snapshot || '{}',
              ) as Partial<Meeting>;
              return (
                <details key={event.id}>
                  <summary>
                    <Clock3 size={15} />
                    <span>
                      {event.body}
                      <small>
                        {meetingDate(event.createdAt)} ·{' '}
                        {data.members.find((m) => m.id === event.actor)?.name}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </summary>
                  <div>
                    <p className="cf-section-label">
                      {snapshot.revision !== undefined
                        ? `PREVIOUS VERSION · ${snapshot.revision}`
                        : 'CREATED WITH'}
                    </p>
                    {snapshot.agenda && (
                      <>
                        <h4>Agenda</h4>
                        <p>{snapshot.agenda}</p>
                      </>
                    )}
                    {snapshot.notes && (
                      <>
                        <h4>Notes</h4>
                        <p>{snapshot.notes}</p>
                      </>
                    )}
                    {snapshot.decisions && (
                      <>
                        <h4>Decisions</h4>
                        <p>{snapshot.decisions}</p>
                      </>
                    )}
                  </div>
                </details>
              );
            })
          ) : (
            <p className="cf-muted">
              Saved changes to this meeting will appear here.
            </p>
          )}
        </div>
      )}
      <div className="cf-meeting-save">
        <div>
          <output>
            {dirty ? 'Unsaved changes' : savedMessage || 'All changes saved'}
          </output>
          {draft.status === 'Planned' && (
            <button
              className="cf-cancel-meeting"
              onClick={() => void save('Cancelled')}
              disabled={busy}
            >
              <X size={12} />
              Cancel meeting
            </button>
          )}
        </div>
        <div>
          <Button
            variant="outline"
            disabled={
              busy || (!dirty && connection === 'none') || !draft.title.trim()
            }
            onClick={() => void save()}
          >
            Save notes
          </Button>
          {draft.status === 'Planned' && (
            <Button
              className="cf-primary"
              disabled={busy || !draft.title.trim()}
              onClick={() => void save('Completed')}
            >
              <Check size={14} />
              Complete meeting
            </Button>
          )}
          {draft.status !== 'Planned' && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save('Planned')}
            >
              Reopen meeting
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
