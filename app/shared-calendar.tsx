'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { DayProps, DayButtonProps } from 'react-day-picker';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flag,
  Layers,
  List,
  RotateCcw,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import {
  calendarEntries,
  dateKey,
  deadlineCommand,
  filterDeadlines,
  localDate,
  monthKey,
  shiftMonth,
  type DeadlineEntry,
} from '@/lib/calendar-model';
import type { Workspace } from '@/lib/model';

type Action = (command: Record<string, unknown>) => Promise<boolean>;
type Props = {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: Action;
  openTask: (id: string) => void;
  openProject: (id: string) => void;
  openSpace: (id: string) => void;
};
const monthLabel = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(
    date,
  );
const fullDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(localDate(date));
const shortDate = (date: string) =>
  date
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
      }).format(localDate(date))
    : 'Not scheduled';
const dragType = 'application/x-studio-deadline';

type PlannerContextValue = {
  byDay: Map<string, DeadlineEntry[]>;
  disabled: boolean;
  today: string;
  dragged: DeadlineEntry | null;
  startDrag: (entry: DeadlineEntry | null) => void;
  move: (entry: DeadlineEntry, due: string) => void;
  openEntry: (entry: DeadlineEntry) => void;
  openDay: (due: string) => void;
};
const PlannerContext = createContext<PlannerContextValue | null>(null);

function PlannerDayButton({ day, modifiers, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      {...props}
      ref={ref}
      variant="ghost"
      className="sc-day-number"
      data-today={modifiers.today || undefined}
      data-outside={modifiers.outside || undefined}
    >
      {day.date.getDate()}
    </Button>
  );
}

function PlannerDay({ day, modifiers, children, ...props }: DayProps) {
  const context = useContext(PlannerContext);
  const [over, setOver] = useState(false);
  if (!context) return <td {...props}>{children}</td>;
  const due = dateKey(day.date),
    entries = context.byDay.get(due) || [];
  return (
    <td
      {...props}
      className={`${props.className || ''} ${over ? 'sc-drop-target' : ''}`}
      onDragOver={(e) => {
        if (
          !context.disabled &&
          context.dragged &&
          e.dataTransfer.types.includes(dragType)
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (
          !context.disabled &&
          context.dragged?.key === e.dataTransfer.getData(dragType)
        )
          context.move(context.dragged, due);
        context.startDrag(null);
      }}
    >
      {children}
      <div className="sc-day-entries">
        {entries.slice(0, 3).map((entry) => (
          <button
            key={entry.key}
            className={`sc-event sc-event-${entry.kind} ${entry.complete ? 'sc-event-complete' : ''}`}
            style={{ '--event-color': entry.color } as CSSProperties}
            onClick={() => context.openEntry(entry)}
            title={`${entry.title} · ${entry.client} · ${shortDate(entry.due)}`}
            aria-label={`${entry.kind === 'project' ? 'Project' : 'Task'}: ${entry.title}, ${entry.client}, due ${shortDate(entry.due)}`}
            draggable={!context.disabled}
            onDragStart={(e) => {
              context.startDrag(entry);
              e.dataTransfer.setData(dragType, entry.key);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              context.startDrag(null);
              setOver(false);
            }}
          >
            {entry.kind === 'project' ? (
              <Flag size={11} />
            ) : (
              <span className="sc-event-dot" />
            )}
            <span>{entry.title}</span>
            {entry.complete && <Check size={11} />}
          </button>
        ))}
      </div>
      {entries.length > 3 && (
        <button className="sc-more" onClick={() => context.openDay(due)}>
          +{entries.length - 3} more
        </button>
      )}
      {modifiers.outside && (
        <span className="sr-only">Outside the displayed month</span>
      )}
    </td>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="sc-select" aria-label={label}>
        <SelectValue>
          {options.find((o) => o.id === value)?.name || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NoDeadlines({ title, children }: { title: string; children: string }) {
  return (
    <Empty className="sc-empty">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DeadlineRows({
  entries,
  data,
  today,
  open,
  dates = true,
}: {
  entries: DeadlineEntry[];
  data: Workspace;
  today: string;
  open: (entry: DeadlineEntry) => void;
  dates?: boolean;
}) {
  return (
    <div className="sc-deadline-list">
      {entries.map((entry) => {
        const owner = data.members.find((m) => m.id === entry.ownerId);
        const project = data.projects.find((p) => p.id === entry.projectId);
        return (
          <button
            className="sc-list-entry"
            key={entry.key}
            onClick={() => open(entry)}
          >
            <span
              className={`sc-list-symbol sc-list-symbol-${entry.kind}`}
              style={{ '--event-color': entry.color } as CSSProperties}
            >
              {entry.kind === 'project' ? (
                <Flag size={15} />
              ) : (
                <Circle size={15} />
              )}
            </span>
            <span className="sc-list-copy">
              <strong>{entry.title}</strong>
              <small>
                {entry.client}
                {entry.kind === 'task' && project
                  ? ` / ${project.name}`
                  : ' / Project deadline'}
              </small>
            </span>
            <span className="sc-list-meta">
              <span
                className={
                  entry.due && entry.due < today && !entry.complete
                    ? 'sc-overdue-text'
                    : ''
                }
              >
                {dates ? shortDate(entry.due) : entry.stage}
              </span>
              {owner && (
                <small>
                  {owner.name}
                  {entry.kind === 'project' ? ' · client lead' : ''}
                </small>
              )}
            </span>
            <ChevronRight size={14} />
          </button>
        );
      })}
    </div>
  );
}

export default function SharedCalendar({
  data,
  ready,
  busy,
  error,
  act,
  openTask,
  openProject,
  openSpace,
}: Props) {
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [month, setMonth] = useState(() => shiftMonth(new Date(), 0));
  const [view, setView] = useState('month');
  const [kind, setKind] = useState('all');
  const [space, setSpace] = useState('all');
  const [project, setProject] = useState('all');
  const [completed, setCompleted] = useState(false);
  const [selectedDay, setSelectedDay] = useState(today);
  const [dayAgenda, setDayAgenda] = useState<string | null>(null);
  const [list, setList] = useState<'unscheduled' | 'overdue' | null>(null);
  const [selection, setSelection] = useState<DeadlineEntry | null>(null);
  const [dragged, setDragged] = useState<DeadlineEntry | null>(null);
  const [lastMove, setLastMove] = useState<{
    entry: DeadlineEntry;
    previous: string;
  } | null>(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setToday(dateKey(new Date())), 60000);
    return () => clearInterval(timer);
  }, []);

  const entries = filterDeadlines(calendarEntries(data), {
    kind,
    space,
    project,
    completed,
  });
  const inMonth = entries.filter((e) => e.due.startsWith(monthKey(month)));
  const undated = entries.filter((e) => !e.due);
  const overdue = entries.filter((e) => e.due && e.due < today && !e.complete);
  const upcomingProjects = entries
    .filter((e) => e.kind === 'project' && e.due >= today && !e.complete)
    .slice(0, 4);
  const byDay = new Map<string, DeadlineEntry[]>();
  for (const entry of entries) {
    if (entry.due)
      byDay.set(entry.due, [...(byDay.get(entry.due) || []), entry]);
  }
  const days = [...new Set(inMonth.map((e) => e.due))];
  const hasFilters =
    kind !== 'all' || space !== 'all' || project !== 'all' || completed;
  const projectOptions = data.projects.filter(
    (p) =>
      space === 'all' ||
      (space === 'internal' ? !p.spaceId : p.spaceId === space),
  );
  const disabled = busy || !ready;
  const openEntry = (entry: DeadlineEntry) => {
    setList(null);
    setDayAgenda(null);
    setSelection({ ...entry });
  };
  const openDay = (due: string) => {
    setSelectedDay(due);
    setDayAgenda(due);
  };
  const move = async (entry: DeadlineEntry, due: string) => {
    if (disabled || due === entry.due) return;
    if (await act(deadlineCommand(entry, due))) {
      setLastMove({
        entry: {
          ...entry,
          due,
          revision:
            entry.revision === undefined ? undefined : entry.revision + 1,
        },
        previous: entry.due,
      });
      setFeedback(`${entry.title} moved to ${shortDate(due)}.`);
    }
  };
  const resetFilters = () => {
    setKind('all');
    setSpace('all');
    setProject('all');
    setCompleted(false);
  };

  return (
    <section className="shared-calendar">
      <div className="sc-page-heading">
        <div>
          <span className="sc-eyebrow">THE SHARED PICTURE</span>
          <h1>
            Our calendar<span>.</span>
          </h1>
          <p>Projects, deadlines, and the work that connects them.</p>
        </div>
        <span className="sc-workspace-badge">
          <span />
          Whole workspace
        </span>
      </div>
      <div className="sc-toolbar">
        <div className="sc-month-controls">
          <h2>{monthLabel(month)}</h2>
          <div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight size={17} />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setMonth(shiftMonth(localDate(today), 0));
                setSelectedDay(today);
              }}
            >
              Today
            </Button>
          </div>
        </div>
        <div className="sc-view-actions">
          <Tabs value={view} onValueChange={(v) => setView(String(v))}>
            <TabsList className="sc-view-tabs">
              <TabsTrigger value="month">
                <CalendarDays size={15} />
                Month
              </TabsTrigger>
              <TabsTrigger value="agenda">
                <List size={15} />
                Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            onClick={() => setList('unscheduled')}
            disabled={!ready}
          >
            <CalendarPlus size={15} />
            Unscheduled<span className="sc-count">{undated.length}</span>
          </Button>
        </div>
      </div>
      <div className="sc-filters">
        <div>
          <FilterSelect
            label="Deadline type"
            value={kind}
            onChange={setKind}
            options={[
              { id: 'all', name: 'Projects & tasks' },
              { id: 'project', name: 'Project deadlines' },
              { id: 'task', name: 'Task deadlines' },
            ]}
          />
          <FilterSelect
            label="Client space"
            value={space}
            onChange={(v) => {
              setSpace(v);
              setProject('all');
            }}
            options={[
              { id: 'all', name: 'All spaces' },
              { id: 'internal', name: 'Internal & inbox' },
              { id: 'prospects', name: 'Sales prospects' },
              ...data.spaces.map((s) => ({ id: s.id, name: s.name })),
            ]}
          />
          <FilterSelect
            label="Project"
            value={project}
            onChange={setProject}
            options={[
              { id: 'all', name: 'All projects' },
              ...projectOptions.map((p) => ({ id: p.id, name: p.name })),
            ]}
          />
          {hasFilters && (
            <button className="sc-clear" onClick={resetFilters}>
              Clear filters
            </button>
          )}
        </div>
        <label className="sc-completed" htmlFor="calendar-completed">
          <Checkbox
            id="calendar-completed"
            checked={completed}
            onCheckedChange={(v) => setCompleted(!!v)}
          />
          Include completed
        </label>
      </div>
      <div className="sc-month-summary">
        <p>
          <Flag size={13} />
          <strong>
            {inMonth.filter((e) => e.kind === 'project').length}
          </strong>{' '}
          project deadlines<span>·</span>
          <strong>
            {inMonth.filter((e) => e.kind === 'task').length}
          </strong>{' '}
          task deadlines this month
        </p>
        {overdue.length > 0 && (
          <button
            onClick={() => setList('overdue')}
            className="sc-overdue-link"
          >
            {overdue.length} overdue across all dates
            <ArrowRight size={13} />
          </button>
        )}
      </div>
      <div className="sc-layout">
        <div className="sc-main-surface">
          {view === 'month' ? (
            <>
              <PlannerContext.Provider
                value={{
                  byDay,
                  disabled,
                  today,
                  dragged,
                  startDrag: setDragged,
                  move: (entry, due) => void move(entry, due),
                  openEntry,
                  openDay,
                }}
              >
                <Calendar
                  mode="single"
                  required
                  selected={localDate(selectedDay)}
                  onSelect={(date) => {
                    if (date) openDay(dateKey(date));
                  }}
                  month={month}
                  onMonthChange={setMonth}
                  weekStartsOn={1}
                  showOutsideDays
                  hideNavigation
                  className="sc-calendar"
                  components={{ Day: PlannerDay, DayButton: PlannerDayButton }}
                  classNames={{
                    root: 'sc-month-picker',
                    months: 'sc-months',
                    month: 'sc-month',
                    month_grid: 'sc-month-grid',
                    month_caption: 'sc-hidden-caption',
                    weekdays: 'sc-weekdays',
                    weekday: 'sc-weekday',
                    week: 'sc-week',
                    day: 'sc-day',
                    outside: 'sc-outside',
                    today: 'sc-today',
                    selected: 'sc-selected',
                  }}
                />
              </PlannerContext.Provider>
              {inMonth.length === 0 && (
                <div className="sc-month-empty">
                  No deadlines in {monthLabel(month)}
                  {hasFilters ? ' for these filters' : ''}.
                  {undated.length > 0 && (
                    <button onClick={() => setList('unscheduled')}>
                      Schedule undated work
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="sc-agenda">
              {days.length ? (
                days.map((due) => (
                  <section className="sc-agenda-day" key={due}>
                    <div
                      className={`sc-agenda-date ${due === today ? 'sc-agenda-today' : ''}`}
                    >
                      <span>
                        {localDate(due).toLocaleDateString('en-GB', {
                          weekday: 'short',
                        })}
                      </span>
                      <strong>{localDate(due).getDate()}</strong>
                      <small>
                        {localDate(due).toLocaleDateString('en-GB', {
                          month: 'short',
                        })}
                      </small>
                    </div>
                    <div>
                      <h3>{due === today ? 'Today' : fullDate(due)}</h3>
                      <DeadlineRows
                        entries={byDay.get(due) || []}
                        data={data}
                        today={today}
                        open={openEntry}
                        dates={false}
                      />
                    </div>
                  </section>
                ))
              ) : (
                <NoDeadlines title="A little breathing room.">
                  No deadlines match this month and these filters. Change the
                  month, clear filters, or give unscheduled work a date.
                </NoDeadlines>
              )}
            </div>
          )}
          <div className="sc-calendar-footer">
            <div>
              <span>
                <Flag size={12} />
                Project deadline
              </span>
              <span>
                <i />
                Task deadline
              </span>
            </div>
            <p>Open a deadline to edit it, or drag it to another day.</p>
          </div>
        </div>
        <aside className="sc-sidebar">
          <div className="sc-sidebar-heading">
            <span>ON THE HORIZON</span>
            <ArrowUpRight size={16} />
          </div>
          <h2>
            What we’re
            <br />
            <em>working towards.</em>
          </h2>
          {upcomingProjects.length ? (
            upcomingProjects.map((entry) => (
              <button
                className="sc-horizon-item"
                key={entry.key}
                onClick={() => openEntry(entry)}
              >
                <span className="sc-horizon-client">
                  <span style={{ background: entry.color }} />
                  {entry.client}
                </span>
                <strong>{entry.title}</strong>
                <span className="sc-horizon-date">
                  <Flag size={13} />
                  {shortDate(entry.due)}
                  <ArrowUpRight size={14} />
                </span>
                <Progress
                  className="sc-horizon-progress"
                  value={
                    entry.taskCount
                      ? ((entry.doneCount || 0) / entry.taskCount) * 100
                      : 0
                  }
                  aria-label={`${entry.title} task completion`}
                />
                <small>
                  {entry.doneCount} of {entry.taskCount} tasks complete
                </small>
              </button>
            ))
          ) : (
            <p className="sc-side-empty">
              No upcoming project deadlines match these filters.
            </p>
          )}
          <button
            className="sc-undated-card"
            onClick={() => setList('unscheduled')}
            disabled={!ready}
          >
            <CalendarPlus size={20} />
            <strong>{undated.length} without a date</strong>
            <span>
              Give the next steps a place.
              <ArrowRight size={14} />
            </span>
          </button>
          <p className="sc-calendar-note">
            Deadlines follow their projects and tasks. Employee meetings stay in
            their meeting spaces.
          </p>
        </aside>
      </div>
      <div className="sc-change-status">
        <output>{feedback}</output>
        {lastMove && (
          <button
            disabled={disabled}
            onClick={async () => {
              if (
                await act(deadlineCommand(lastMove.entry, lastMove.previous))
              ) {
                setFeedback('Deadline move undone.');
                setLastMove(null);
              }
            }}
          >
            <RotateCcw size={13} />
            Undo move
          </button>
        )}
      </div>

      <Dialog
        open={!!selection}
        onOpenChange={(open) => !open && setSelection(null)}
      >
        <DialogContent className="sc-dialog">
          <DialogHeader>
            <DialogTitle>{selection?.title}</DialogTitle>
            <DialogDescription>
              {selection?.kind === 'project'
                ? 'Project deadline'
                : 'Task deadline'}{' '}
              · {selection?.client}
            </DialogDescription>
          </DialogHeader>
          {selection && (
            <DeadlineEditor
              key={selection.key}
              entry={selection}
              data={data}
              disabled={disabled}
              error={error}
              save={async (due) => {
                if (await act(deadlineCommand(selection, due))) {
                  setFeedback(
                    due
                      ? `Deadline set for ${shortDate(due)}.`
                      : 'Deadline removed. The work is now in Unscheduled.',
                  );
                  setLastMove(null);
                  setSelection(null);
                }
              }}
              openRecord={() => {
                setSelection(null);
                if (selection.kind === 'task') openTask(selection.id);
                else openProject(selection.id);
              }}
              openClient={
                selection.spaceId
                  ? () => {
                      setSelection(null);
                      openSpace(selection.spaceId!);
                    }
                  : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!dayAgenda}
        onOpenChange={(open) => !open && setDayAgenda(null)}
      >
        <DialogContent className="sc-dialog sc-list-dialog">
          <DialogHeader>
            <DialogTitle>
              {dayAgenda ? fullDate(dayAgenda) : 'Day agenda'}
            </DialogTitle>
            <DialogDescription>
              Project and task deadlines · all day
            </DialogDescription>
          </DialogHeader>
          {dayAgenda &&
            ((byDay.get(dayAgenda)?.length || 0) > 0 ? (
              <DeadlineRows
                entries={byDay.get(dayAgenda) || []}
                data={data}
                today={today}
                open={openEntry}
              />
            ) : (
              <NoDeadlines title="Nothing due on this day.">
                Open an item in Unscheduled to give it a deadline.
              </NoDeadlines>
            ))}
        </DialogContent>
      </Dialog>
      <Dialog open={!!list} onOpenChange={(open) => !open && setList(null)}>
        <DialogContent className="sc-dialog sc-list-dialog">
          <DialogHeader>
            <DialogTitle>
              {list === 'overdue'
                ? 'Deadlines that need attention'
                : 'Work without a date'}
            </DialogTitle>
            <DialogDescription>
              {list === 'overdue'
                ? 'Unfinished work with a deadline before today, across all months.'
                : 'Choose a project or task to give it a deadline.'}{' '}
              Your current filters apply.
            </DialogDescription>
          </DialogHeader>
          {(list === 'overdue' ? overdue : undated).length ? (
            <DeadlineRows
              entries={list === 'overdue' ? overdue : undated}
              data={data}
              today={today}
              open={openEntry}
            />
          ) : (
            <NoDeadlines
              title={
                list === 'overdue' ? 'All caught up.' : 'Everything has a date.'
              }
            >
              No matching work in this view.
            </NoDeadlines>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function DeadlineEditor({
  entry,
  data,
  disabled,
  error,
  save,
  openRecord,
  openClient,
}: {
  entry: DeadlineEntry;
  data: Workspace;
  disabled: boolean;
  error: string;
  save: (due: string) => Promise<void>;
  openRecord: () => void;
  openClient?: () => void;
}) {
  const [due, setDue] = useState(entry.due);
  const owner = data.members.find((m) => m.id === entry.ownerId);
  const project = data.projects.find((p) => p.id === entry.projectId);
  return (
    <form
      className="sc-deadline-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(due);
      }}
    >
      {error && (
        <p className="sc-error" role="alert">
          {error}
        </p>
      )}
      <div className="sc-editor-context">
        <span className="sc-editor-type">
          {entry.kind === 'project' ? (
            <Layers size={16} />
          ) : (
            <Circle size={16} />
          )}
          <strong>{entry.stage}</strong>
        </span>
        {owner && (
          <span>
            <span
              className="sc-owner-avatar"
              style={{ background: owner.color }}
            >
              {owner.name.slice(0, 1)}
            </span>
            {owner.name}
            <small>
              {entry.kind === 'project' ? 'Client lead' : 'Responsible'}
            </small>
          </span>
        )}
      </div>
      {entry.kind === 'task' && project && (
        <p className="sc-project-context">
          Part of <strong>{project.name}</strong>
        </p>
      )}
      {entry.kind === 'project' && (
        <div className="sc-editor-progress">
          <Progress
            value={
              entry.taskCount
                ? ((entry.doneCount || 0) / entry.taskCount) * 100
                : 0
            }
            aria-label="Project task completion"
          />
          <span>
            {entry.doneCount} of {entry.taskCount} tasks complete
          </span>
        </div>
      )}
      <label htmlFor="shared-calendar-deadline">
        Deadline
        <Input
          id="shared-calendar-deadline"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <p className="sc-date-hint">
        An all-day date. Saving updates this {entry.kind} everywhere in Studio.
      </p>
      <div className="sc-date-shortcuts">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setDue(dateKey(new Date()))}
        >
          Today
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = new Date();
            next.setDate(next.getDate() + 7);
            setDue(dateKey(next));
          }}
        >
          In a week
        </button>
        {due && (
          <button type="button" disabled={disabled} onClick={() => setDue('')}>
            Remove date
          </button>
        )}
      </div>
      <div className="sc-editor-links">
        <button type="button" onClick={openRecord} disabled={disabled}>
          Open {entry.kind}
          <ArrowUpRight size={14} />
        </button>
        {openClient && (
          <button type="button" onClick={openClient} disabled={disabled}>
            Client space
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="sc-editor-save">
        <p>Project and task dates can be set independently.</p>
        <Button type="submit" disabled={disabled}>
          {disabled ? 'Saving…' : 'Save deadline'}
        </Button>
      </div>
    </form>
  );
}
