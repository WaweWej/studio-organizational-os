'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Day drop targets have an equivalent keyboard-accessible date editor on every entry. */
import {
  useEffect,
  useState,
  type CSSProperties,
  type SubmitEvent,
} from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  calendarEntries,
  dateKey,
  deadlineCommand,
  filterDeadlines,
  localDate,
  type DeadlineEntry,
} from '@/lib/calendar-model';
import {
  MeetingConnection,
  meetingConnection,
  meetingStartsAt,
} from './meeting-connection';
import type { Workspace } from '@/lib/model';

type Props = {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  openTask: (id: string) => void;
  openProject: (id: string) => void;
  openSpace: (id: string) => void;
  openMeeting: (id: string) => void;
  openCalendarMeeting: (id: string) => void;
};
const shiftDay = (day: string, amount: number) => {
  const date = localDate(day);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
};
const weekStart = (day: string) =>
  shiftDay(day, -((localDate(day).getDay() + 6) % 7));
const label = (day: string) =>
  localDate(day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const kindLabel = (entry: DeadlineEntry) =>
  ({
    task: 'Task deadline',
    project: 'Project deadline',
    meeting: 'Meeting',
    deadline: 'Deadline',
    event: 'Event',
  })[entry.kind];
const dragType = 'application/x-studio-calendar';
function Choice({
  label: name,
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
      <SelectTrigger aria-label={name}>
        <SelectValue>
          {options.find((o) => o.id === value)?.name || name}
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
export default function SharedCalendar({
  data,
  ready,
  busy,
  error,
  act,
  openTask,
  openProject,
  openSpace,
  openMeeting,
  openCalendarMeeting,
}: Props) {
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [start, setStart] = useState(() => weekStart(dateKey(new Date())));
  const [kind, setKind] = useState('all'),
    [space, setSpace] = useState('all'),
    [project, setProject] = useState('all');
  const [completed, setCompleted] = useState(false);
  const [draft, setDraft] = useState<{ id: string; day: string } | null>(null);
  const [selection, setSelection] = useState<DeadlineEntry | null>(null);
  const [list, setList] = useState<'unscheduled' | 'overdue' | null>(null);
  const [dragged, setDragged] = useState<DeadlineEntry | null>(null);
  const [feedback, setFeedback] = useState('');
  const [undo, setUndo] = useState<{
    entry: DeadlineEntry;
    due: string;
  } | null>(null);
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
  const days = Array.from({ length: 14 }, (_, index) => shiftDay(start, index));
  const unscheduled = entries.filter((e) => !e.due);
  const overdue = entries.filter(
    (e) =>
      e.due &&
      e.due < today &&
      !e.complete &&
      ['task', 'project', 'deadline'].includes(e.kind),
  );
  const disabled = !ready || busy;
  const add = (day: string) => {
    setFeedback('');
    setDraft({ id: crypto.randomUUID(), day });
  };
  const move = async (entry: DeadlineEntry, day: string) => {
    if (disabled || entry.due === day) return;
    try {
      if (await act(deadlineCommand(entry, day))) {
        setUndo({
          entry: {
            ...entry,
            due: day,
            revision:
              entry.revision === undefined ? undefined : entry.revision + 1,
          },
          due: entry.due,
        });
        setFeedback('Moved ' + entry.title + ' to ' + label(day) + '.');
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Could not move this entry.',
      );
    }
  };
  return (
    <section className="shared-calendar fortnight-calendar">
      <header className="fc-heading">
        <div>
          <h1>Calendar</h1>
          <p>
            {label(start)} — {label(days[13])}
          </p>
        </div>
        <div className="fc-controls">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous 14 days"
            onClick={() => setStart(shiftDay(start, -14))}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button variant="outline" onClick={() => setStart(weekStart(today))}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next 14 days"
            onClick={() => setStart(shiftDay(start, 14))}
          >
            <ChevronRight size={18} />
          </Button>
          <Button disabled={disabled} onClick={() => add(today)}>
            <Plus size={16} />
            Add to calendar
          </Button>
        </div>
      </header>
      <div className="fc-filters">
        <Choice
          label="Entry type"
          value={kind}
          onChange={setKind}
          options={[
            { id: 'all', name: 'Everything' },
            { id: 'meeting', name: 'Meetings' },
            { id: 'event', name: 'Events' },
            { id: 'deadline', name: 'Manual deadlines' },
            { id: 'task', name: 'Task deadlines' },
            { id: 'project', name: 'Project deadlines' },
          ]}
        />
        <Choice
          label="Client"
          value={space}
          onChange={(v) => {
            setSpace(v);
            setProject('all');
          }}
          options={[
            { id: 'all', name: 'All clients' },
            { id: 'internal', name: 'Internal & personal' },
            { id: 'prospects', name: 'Sales' },
            ...data.spaces.map((s) => ({ id: s.id, name: s.name })),
          ]}
        />
        <Choice
          label="Project"
          value={project}
          onChange={setProject}
          options={[
            { id: 'all', name: 'All projects' },
            ...data.projects
              .filter(
                (p) =>
                  space === 'all' ||
                  p.spaceId === space ||
                  (space === 'internal' && !p.spaceId),
              )
              .map((p) => ({ id: p.id, name: p.name })),
          ]}
        />
        <label className="fc-completed" htmlFor="calendar-completed">
          <Checkbox
            id="calendar-completed"
            checked={completed}
            onCheckedChange={(v) => setCompleted(!!v)}
          />
          Include completed
        </label>
        <Button
          variant="ghost"
          onClick={() => setList('unscheduled')}
          disabled={!ready}
        >
          <CalendarPlus size={16} />
          Unscheduled ({unscheduled.length})
        </Button>
        {!!overdue.length && (
          <Button variant="ghost" onClick={() => setList('overdue')}>
            {overdue.length} overdue
          </Button>
        )}
      </div>
      <div className="fc-grid" aria-label="14-day calendar">
        {days.map((day) => {
          const items = entries.filter((e) => e.due === day),
            date = localDate(day);
          return (
            <section
              key={day}
              aria-label={label(day)}
              className={
                'fc-day' +
                (day === today ? ' fc-today' : '') +
                ([0, 6].includes(date.getDay()) ? ' fc-weekend' : '')
              }
              onDragOver={(e) => {
                if (!disabled && e.dataTransfer.types.includes(dragType)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged && e.dataTransfer.getData(dragType) === dragged.key)
                  void move(dragged, day);
                setDragged(null);
              }}
            >
              <header>
                <div>
                  <span>
                    {date.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </span>
                  <strong>{date.getDate()}</strong>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={'Add to ' + label(day)}
                  onClick={() => add(day)}
                >
                  <Plus size={16} />
                </Button>
              </header>
              <div className="fc-day-entries">
                {items.map((entry) => (
                  <button
                    key={entry.key}
                    className={
                      'fc-entry' + (entry.complete ? ' fc-complete' : '')
                    }
                    style={{ '--entry-color': entry.color } as CSSProperties}
                    onClick={() => {
                      setFeedback('');
                      setSelection({ ...entry });
                    }}
                    draggable={!disabled}
                    onDragStart={(e) => {
                      setDragged(entry);
                      e.dataTransfer.setData(dragType, entry.key);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragged(null)}
                  >
                    <span className="fc-entry-time">
                      {entry.time || 'All day'} · {kindLabel(entry)}
                    </span>
                    <strong>{entry.title}</strong>
                    {(entry.spaceId || entry.prospectId) && (
                      <small>{entry.client}</small>
                    )}
                  </button>
                ))}
              </div>
              {!items.length && (
                <button
                  className="fc-add-empty"
                  disabled={disabled}
                  onClick={() => add(day)}
                >
                  + Add something
                </button>
              )}
            </section>
          );
        })}
      </div>
      <div className="fc-status">
        <output>{feedback}</output>
        {undo && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={async () => {
              try {
                if (await act(deadlineCommand(undo.entry, undo.due))) {
                  setFeedback('Move undone.');
                  setUndo(null);
                }
              } catch (error) {
                setFeedback(
                  error instanceof Error ? error.message : 'Could not undo.',
                );
              }
            }}
          >
            <RotateCcw size={14} />
            Undo move
          </Button>
        )}
      </div>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="fc-dialog">
          <DialogHeader>
            <DialogTitle>Add to calendar</DialogTitle>
            <DialogDescription>
              Events, meetings and deadlines stay here with your work.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <CalendarForm
              key={draft.id}
              data={data}
              day={draft.day}
              disabled={disabled}
              error={error}
              save={async (values) => {
                if (
                  await act({ type: 'calendar-save', id: draft.id, ...values })
                ) {
                  setDraft(null);
                  setUndo(null);
                  setFeedback('Added to calendar.');
                }
              }}
              saveDeadline={async (entry, date, time) => {
                if (await act(deadlineCommand(entry, date, time))) {
                  setDraft(null);
                  setUndo(null);
                  setFeedback('Deadline updated.');
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selection}
        onOpenChange={(open) => {
          if (!open && !busy) setSelection(null);
        }}
      >
        <DialogContent className="fc-dialog">
          <DialogHeader>
            <DialogTitle>{selection?.title}</DialogTitle>
            <DialogDescription>
              {selection && kindLabel(selection)}
              {selection?.spaceId ? ' · ' + selection.client : ''}
            </DialogDescription>
          </DialogHeader>
          {selection && (
            <CalendarForm
              key={selection.key}
              data={data}
              day={selection.due || today}
              entry={selection}
              disabled={disabled}
              error={error}
              save={async (values) => {
                if (
                  await act({
                    type: 'calendar-save',
                    id: selection.id,
                    revision: selection.revision,
                    ...values,
                  })
                ) {
                  setSelection(null);
                  setUndo(null);
                }
              }}
              saveDeadline={async (entry, date, time) => {
                if (await act(deadlineCommand(entry, date, time))) {
                  setSelection(null);
                  setUndo(null);
                }
              }}
            />
          )}
          {selection?.source === 'calendar' && selection.kind === 'meeting' && (
            <Button
              variant="outline"
              onClick={() => {
                openCalendarMeeting(selection.id);
                setSelection(null);
              }}
            >
              Open meeting notes
            </Button>
          )}
          {selection?.source === 'calendar' ? (
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={async () => {
                if (
                  await act({
                    type: 'calendar-remove',
                    id: selection.id,
                    revision: selection.revision,
                  })
                ) {
                  setSelection(null);
                  setUndo(null);
                }
              }}
            >
              Remove from calendar
            </Button>
          ) : (
            selection && (
              <Button
                variant="outline"
                onClick={() => {
                  if (selection.kind === 'task') openTask(selection.id);
                  else if (selection.kind === 'project')
                    openProject(selection.id);
                  else if (selection.source === 'meeting')
                    openMeeting(selection.id);
                  else if (selection.spaceId) openSpace(selection.spaceId);
                  setSelection(null);
                }}
              >
                Open{' '}
                {selection.kind === 'meeting'
                  ? 'meeting notes'
                  : selection.kind}
              </Button>
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!list} onOpenChange={(open) => !open && setList(null)}>
        <DialogContent className="fc-dialog">
          <DialogHeader>
            <DialogTitle>
              {list === 'overdue' ? 'Overdue' : 'Unscheduled work'}
            </DialogTitle>
            <DialogDescription>
              Choose an item to set its deadline.
            </DialogDescription>
          </DialogHeader>
          <div className="fc-unscheduled">
            {(list === 'overdue' ? overdue : unscheduled).map((entry) => (
              <button
                key={entry.key}
                onClick={() => {
                  setList(null);
                  setSelection({ ...entry });
                }}
              >
                <strong>{entry.title}</strong>
                <small>
                  {kindLabel(entry)}
                  {entry.due ? ' · ' + label(entry.due) : ''}
                </small>
              </button>
            ))}
            {!(list === 'overdue' ? overdue : unscheduled).length && (
              <p>No items here.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CalendarForm({
  data,
  day,
  entry,
  disabled,
  error,
  save,
  saveDeadline,
}: {
  data: Workspace;
  day: string;
  entry?: DeadlineEntry;
  disabled: boolean;
  error: string;
  save: (values: Record<string, unknown>) => Promise<void>;
  saveDeadline: (
    entry: DeadlineEntry,
    date: string,
    time: string,
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState(entry?.kind || 'event');
  const [title, setTitle] = useState(entry?.title || '');
  const [date, setDate] = useState(day),
    [time, setTime] = useState(entry?.time || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [target, setTarget] = useState('');
  const [localError, setLocalError] = useState('');
  const [connection, setConnection] = useState('none');
  const canonical = entry && entry.source !== 'calendar';
  const linking = !entry && (kind === 'task' || kind === 'project');
  const targets = calendarEntries(data).filter(
    (e) => e.kind === kind && (e.kind === 'task' || e.kind === 'project'),
  );
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError('');
    try {
      if (canonical) await saveDeadline(entry, date, time);
      else if (linking) {
        const selected = targets.find((t) => t.key === target);
        if (!selected) {
          setLocalError('Choose the work to schedule.');
          return;
        }
        await saveDeadline(selected, date, time);
      } else if (!entry && kind === 'meeting')
        await save({
          type: 'meeting-plan',
          title,
          startsAt: meetingStartsAt(date, time),
          notes: description,
          ...meetingConnection(connection),
        });
      else await save({ title, date, time, description, kind });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not save.');
    }
  };
  return (
    <form className="fc-form" onSubmit={submit}>
      {!canonical && (
        <Choice
          label="What are you adding?"
          value={kind}
          onChange={(v) => {
            setKind(v as DeadlineEntry['kind']);
            setTarget('');
          }}
          options={[
            { id: 'event', name: 'Event' },
            { id: 'meeting', name: 'Meeting' },
            { id: 'deadline', name: 'Deadline' },
            ...(!entry
              ? [
                  { id: 'task', name: 'Existing task deadline' },
                  { id: 'project', name: 'Existing project deadline' },
                ]
              : []),
          ]}
        />
      )}
      {!entry && kind === 'meeting' && (
        <MeetingConnection
          data={data}
          value={connection}
          onChange={setConnection}
        />
      )}
      {linking ? (
        <Choice
          label="Work to schedule"
          value={target}
          onChange={setTarget}
          options={targets.map((t) => ({ id: t.key, name: t.title }))}
        />
      ) : (
        !canonical && (
          <label htmlFor="calendar-title">
            Title
            <Input
              id="calendar-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={180}
              placeholder="What’s happening?"
            />
          </label>
        )
      )}
      <div className="fc-date-fields">
        <label htmlFor="calendar-date">
          Date
          <Input
            id="calendar-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required={
              !(
                canonical &&
                (entry.kind === 'task' || entry.kind === 'project')
              )
            }
          />
        </label>
        {kind !== 'project' && (
          <label htmlFor="calendar-time">
            {kind === 'task' || kind === 'deadline' ? 'Finish by' : 'Time'}
            <Input
              id="calendar-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required={
                entry?.source === 'meeting' || (!entry && kind === 'meeting')
              }
            />
          </label>
        )}
      </div>
      {!canonical && !linking && (
        <label htmlFor="calendar-description">
          Notes <span className="text-muted-foreground">(optional)</span>
          <Textarea
            id="calendar-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
      )}
      {(localError || error) && <p role="alert">{localError || error}</p>}
      <Button type="submit" disabled={disabled}>
        {disabled ? 'Saving…' : entry || linking ? 'Save' : 'Add to calendar'}
      </Button>
    </form>
  );
}
