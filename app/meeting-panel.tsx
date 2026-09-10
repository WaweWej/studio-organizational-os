'use client';
import { useState, useId, useEffect } from 'react';
import {
  MeetingConnection,
  meetingConnection,
  meetingStartsAt,
} from './meeting-connection';
import { MeetingEditor } from './client-focus';
import type { CalendarEvent, Workspace } from '@/lib/model';
import { dateKey } from '@/lib/calendar-model';
import { taskSpaceId } from '@/lib/task-context';
import {
  readMeetingPlanDraft,
  writeMeetingPlanDraft,
  clearMeetingDraft,
} from '@/lib/meeting-draft';
import { readableDate } from './today';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export type MeetingTarget =
  | { meetingId: string }
  | { taskId: string }
  | { calendarId: string }
  | { prospectId?: string; spaceId?: string; day?: string };
export default function MeetingPanel({
  target,
  data,
  busy,
  error,
  act,
  close,
  openTask,
}: {
  target: MeetingTarget;
  data: Workspace;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
  openTask: (id: string) => void;
}) {
  const [created, setCreated] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [dirty, setDirty] = useState(false),
    [leaving, setLeaving] = useState(false);
  const meeting = data.meetings.find(
    (m) =>
      m.id === (created || ('meetingId' in target ? target.meetingId : '')),
  );
  const calendar =
    'calendarId' in target
      ? data.calendarEvents?.find((e) => e.id === target.calendarId)
      : undefined;
  const linked = calendar?.meetingId
    ? data.meetings.find((m) => m.id === calendar.meetingId)
    : undefined;
  const task =
    'taskId' in target
      ? data.tasks.find((t) => t.id === target.taskId)
      : undefined;
  const current =
    meeting || linked || data.meetings.find((m) => m.id === task?.meetingId);
  const taskSpace = task ? taskSpaceId(data, task) : null;
  const candidates = task
    ? data.meetings
        .filter(
          (m) =>
            m.status !== 'Cancelled' &&
            ((!taskSpace && !task.prospectId) ||
              (taskSpace && m.spaceId === taskSpace) ||
              (task.prospectId && m.prospectId === task.prospectId) ||
              (!m.spaceId && !m.prospectId)),
        )
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    : [];
  const contextName = current
    ? data.spaces.find((s) => s.id === current.spaceId)?.name ||
      data.prospects.find((p) => p.id === current.prospectId)?.name
    : '';
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !busy) {
            if (dirty) setLeaving(true);
            else close();
          }
        }}
      >
        <SheetContent className="cf-meeting-sheet">
          <SheetHeader>
            <SheetTitle>
              {contextName ? contextName + ' · Meeting notes' : 'Meeting notes'}
            </SheetTitle>
            <SheetDescription>
              {current
                ? 'Notes, decisions and follow-ups for this meeting.'
                : 'Connect the call to a prospect or client and save its notes.'}
            </SheetDescription>
          </SheetHeader>
          {current ? (
            <MeetingEditor
              key={current.id + ':' + data.draftScope}
              meeting={current}
              data={data}
              projects={data.projects.filter(
                (p) => current.spaceId && p.spaceId === current.spaceId,
              )}
              busy={busy}
              error={error}
              act={act}
              onDirtyChange={setDirty}
              openTask={(id) => {
                close();
                openTask(id);
              }}
            />
          ) : task && !planning ? (
            <div className="cf-form meeting-plan-form">
              <p>Choose the meeting for “{task.title}”.</p>
              {candidates.map((m) => (
                <button
                  className="brief-work-row"
                  key={m.id}
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await act({
                        type: 'meeting-link-task',
                        id: m.id,
                        revision: m.revision,
                        taskId: task.id,
                        taskRevision: task.revision,
                      })
                    )
                      setCreated(m.id);
                  }}
                >
                  <span>
                    <strong>{m.title}</strong>
                    <small>{readableDate(m.startsAt, true)}</small>
                  </span>
                  <span>Link & open notes</span>
                </button>
              ))}
              {error && <p role="alert">{error}</p>}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPlanning(true)}
              >
                Use a calendar entry or add a meeting
              </Button>
            </div>
          ) : (
            <PlanMeeting
              target={target}
              data={data}
              calendar={calendar}
              busy={busy}
              error={error}
              act={act}
              created={(id) => {
                setDirty(false);
                setCreated(id);
              }}
              onDirtyChange={setDirty}
            />
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your meeting notes first?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes have not been saved to the workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={close}>
              Close without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PlanMeeting({
  target,
  data,
  calendar,
  busy,
  error,
  act,
  created,
  onDirtyChange,
}: {
  target: MeetingTarget;
  data: Workspace;
  calendar?: CalendarEvent;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  created: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const draftKey = 'plan:' + JSON.stringify(target);
  const draftScope = data.draftScope || '';
  const [recovered] = useState(() =>
    readMeetingPlanDraft(draftScope, draftKey),
  );
  const [touched, setTouched] = useState(!!recovered);
  const [id] = useState(() => recovered?.id || crypto.randomUUID());
  const controlId = useId();
  const task =
    'taskId' in target
      ? data.tasks.find((t) => t.id === target.taskId)
      : undefined;
  const taskSpace = task ? taskSpaceId(data, task) : null;
  const initialProspect =
    'prospectId' in target
      ? target.prospectId
      : !taskSpace
        ? task?.prospectId
        : undefined;
  const initialSpace = 'spaceId' in target ? target.spaceId : taskSpace;
  const name =
    data.prospects.find((p) => p.id === initialProspect)?.name ||
    data.spaces.find((s) => s.id === initialSpace)?.name;
  const [source, setSource] = useState(
    recovered?.source || calendar?.id || 'new',
  );
  const [connection, setConnection] = useState(
    recovered?.connection ||
      (initialProspect
        ? 'prospect:' + initialProspect
        : initialSpace
          ? 'space:' + initialSpace
          : 'none'),
  );
  const [title, setTitle] = useState(
    recovered?.title ??
      (calendar?.title || task?.title || (name ? 'Call with ' + name : '')),
  );
  const [day, setDay] = useState(
    recovered?.day ??
      (calendar?.date ||
        ('day' in target && target.day) ||
        task?.plannedFor ||
        task?.due ||
        dateKey(new Date())),
  );
  const [time, setTime] = useState(
    recovered?.time ??
      (calendar?.time ||
        task?.dueTime ||
        new Date().toTimeString().slice(0, 5)),
  );
  const [notes, setNotes] = useState(
    recovered?.notes ?? calendar?.description ?? '',
  );
  const [participants, setParticipants] = useState(
    recovered?.participants || '',
  );
  const [localError, setLocalError] = useState('');
  const available = (data.calendarEvents || []).filter(
    (e) => e.kind === 'meeting' && !e.meetingId && !e.archived,
  );
  const event = available.find((e) => e.id === source);
  useEffect(() => {
    if (!touched) return;
    onDirtyChange(true);
    writeMeetingPlanDraft(draftScope, draftKey, {
      id,
      source,
      connection,
      title,
      day,
      time,
      notes,
      participants,
    });
  }, [
    touched,
    draftScope,
    draftKey,
    id,
    source,
    connection,
    title,
    day,
    time,
    notes,
    participants,
    onDirtyChange,
  ]);
  useEffect(() => {
    if (!touched) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [touched]);
  useEffect(() => {
    if (data.meetings.some((m) => m.id === id)) {
      clearMeetingDraft(draftScope, draftKey);
      created(id);
    }
  }, [data.meetings, id, draftScope, draftKey, created]);

  return (
    <form
      className="cf-form meeting-plan-form"
      onChange={() => setTouched(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        setLocalError('');
        try {
          if (
            await act({
              type: 'meeting-plan',
              id,
              ...meetingConnection(connection),
              title,
              startsAt: meetingStartsAt(day, time),
              notes,
              participants,
              calendarId: event?.id,
              calendarRevision: event?.revision,
              taskId: task?.id,
              taskRevision: task?.revision,
            })
          ) {
            clearMeetingDraft(draftScope, draftKey);
            setTouched(false);
            created(id);
          }
        } catch (e) {
          setLocalError(
            e instanceof Error ? e.message : 'Could not save this meeting.',
          );
        }
      }}
    >
      <fieldset disabled={busy} className="meeting-plan-fields">
        {!calendar && available.length > 0 && (
          <label htmlFor={controlId + '-source'}>
            Meeting
            <Select
              value={source}
              onValueChange={(v) => {
                if (!v) return;
                setSource(v);
                const e = available.find((e) => e.id === v);
                if (e) {
                  setTitle(e.title);
                  setDay(e.date);
                  setTime(e.time);
                  setNotes(e.description);
                }
                setTouched(true);
              }}
            >
              <SelectTrigger
                id={controlId + '-source'}
                aria-label="Scheduled meeting"
              >
                <SelectValue>
                  {event ? `${event.title} · ${event.date}` : 'New meeting'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New meeting</SelectItem>
                {available.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title} · {e.date} {e.time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <MeetingConnection
          disabled={!!(taskSpace || task?.prospectId)}
          data={data}
          value={connection}
          onChange={(v) => {
            setConnection(v);
            setTouched(true);
          }}
        />
        <label htmlFor={controlId + '-title'}>
          Meeting title
          <Input
            id={controlId + '-title'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={180}
          />
        </label>
        <div className="cf-fields">
          <label htmlFor={controlId + '-day'}>
            Date
            <Input
              id={controlId + '-day'}
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </label>
          <label htmlFor={controlId + '-time'}>
            Time
            <Input
              id={controlId + '-time'}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </label>
        </div>
        <label htmlFor={controlId + '-participants'}>
          Participants
          <Input
            id={controlId + '-participants'}
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            maxLength={3000}
          />
        </label>
        <label htmlFor={controlId + '-notes'}>
          Meeting notes
          <Textarea
            id={controlId + '-notes'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={12}
            maxLength={30000}
          />
        </label>
        {(error || localError) && <p role="alert">{localError || error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save meeting notes'}
        </Button>
      </fieldset>
    </form>
  );
}
