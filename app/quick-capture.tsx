'use client';
import { useState, useEffect, useRef, useId, type CSSProperties } from 'react';
import {
  AtSign,
  ArrowUp,
  CalendarDays,
  Layers,
  BriefcaseBusiness,
  UserRound,
  X,
  CornerDownLeft,
  LoaderCircle,
} from 'lucide-react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  interpretEntry,
  captureDestination,
  type CaptureEntry,
  type EntryKind,
  type EntryTarget,
} from '@/lib/entry-model';
import { Button } from '@/components/ui/button';
import type { Workspace } from '@/lib/model';
import { parseSalesCapture } from '@/lib/sales-model';
import { localDay } from '@/lib/workspace-brief';
import {
  activeMention,
  mentionSuggestions,
  shiftMentionPins,
  displayCaptureDate,
  type CaptureMention,
  type MentionOption,
} from '@/lib/task-capture';
export type CaptureDraft = {
  text: string;
  pins: CaptureMention[];
  contextProject: string | null;
  contextSpace?: string | null;
  kind?: EntryKind | 'auto';
  target?: EntryTarget | null;
  meetingDate?: string;
  meetingTime?: string;
};
export default function QuickCapture({
  data,
  ready,
  busy,
  error,
  act,
  projectId,
  spaceId,
  enabled = true,
  close,
  onCreated,
  onOpenEntry,
  drafts,
  draftId,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  projectId?: string | null;
  spaceId?: string | null;
  enabled?: boolean;
  close: () => void;
  onCreated: (id: string, title: string, kind?: EntryKind) => void;
  onOpenEntry?: (entry: CaptureEntry) => void;
  drafts: Map<string, CaptureDraft>;
  draftId?: string;
}) {
  const draftKey = draftId || projectId || 'workspace',
    initial = drafts.get(draftKey);
  const [text, setText] = useState(initial?.text || ''),
    [pins, setPins] = useState<CaptureMention[]>(initial?.pins || []),
    [contextProject, setContextProject] = useState(
      initial?.text.trim() ? initial.contextProject : projectId || null,
    ),
    [contextSpace, setContextSpace] = useState(
      initial?.text.trim() ? initial.contextSpace || null : spaceId || null,
    ),
    [kind, setKind] = useState<EntryKind | 'auto'>(initial?.kind || 'auto'),
    [target, setTarget] = useState<EntryTarget | null>(initial?.target || null),
    [meetingDate, setMeetingDate] = useState(initial?.meetingDate || ''),
    [meetingTime, setMeetingTime] = useState(initial?.meetingTime || ''),
    [savedId, setSavedId] = useState<string | null>(null),
    [caret, setCaret] = useState(text.length),
    [choice, setChoice] = useState(''),
    [dismissed, setDismissed] = useState(''),
    [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    submitting = useRef(false),
    request = useRef<{ fingerprint: string; id: string } | null>(null),
    helpId = useId();
  const entry = interpretEntry(text, data, {
    kind,
    projectId: contextProject,
    spaceId: contextSpace,
    pins,
    target,
    meetingDate,
    meetingTime,
  });
  if (
    entry.kind === 'meeting' &&
    entry.meetingDate &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.meetingTime)
  ) {
    const local = new Date(`${entry.meetingDate}T${entry.meetingTime}:00`);
    if (
      !Number.isFinite(local.getTime()) ||
      localDay(local) !== entry.meetingDate ||
      `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}` !==
        entry.meetingTime
    )
      entry.errors.push(
        'That local time does not exist on this date. Choose another time.',
      );
  }
  const sales = entry.kind === 'sales' ? parseSalesCapture(text) : null;
  const selectedSpace = data.spaces.find((s) => s.id === entry.spaceId);
  const savedEntry = data.captureEntries.find((e) => e.id === savedId);
  const existingProspect = sales
    ? data.prospects.find((p) => p.nameKey === sales.nameKey)
    : undefined;
  const parsed = entry.parsed,
    active = sales ? null : activeMention(text, caret, parsed.mentions),
    queryKey = active ? `${active.start}:${active.query}` : '',
    suggestions =
      active && dismissed !== queryKey
        ? mentionSuggestions(active.query, data)
        : [],
    menuOpen = !!active && dismissed !== queryKey;
  const optionKey = (o: MentionOption) => o.kind + ':' + o.id;
  const selected =
    suggestions.find((o) => optionKey(o) === choice) || suggestions[0];
  const resolvedAtCaret = parsed.mentions.some(
    (m) =>
      active &&
      m.start === active.start &&
      m.end === caret &&
      m.kind === selected?.kind &&
      m.id === selected?.id,
  );
  useEffect(() => {
    drafts.set(draftKey, {
      text,
      pins,
      contextProject,
      contextSpace,
      kind,
      target,
      meetingDate,
      meetingTime,
    });
  }, [
    drafts,
    draftKey,
    text,
    pins,
    contextProject,
    contextSpace,
    kind,
    target,
    meetingDate,
    meetingTime,
  ]);
  useEffect(() => {
    if (enabled) input.current?.focus();
  }, [enabled]);
  useEffect(() => {
    if (!text.trim()) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [text]);
  const edit = (next: string, nextCaret?: number) => {
    setPins((previous) => shiftMentionPins(text, next, previous));
    setText(next);
    setCaret(nextCaret ?? input.current?.selectionStart ?? next.length);

    setDismissed('');
  };
  const choose = (option: MentionOption) => {
    if (!active) return;
    const currentToken = parsed.mentions.find((m) => m.start === active.start);
    const end = Math.max(active.end, currentToken?.end || 0),
      inserted = '@' + option.label + ' ',
      next = text.slice(0, active.start) + inserted + text.slice(end),
      position = active.start + inserted.length;
    const shifted = shiftMentionPins(text, next, pins);
    if (option.kind !== 'date')
      shifted.push({
        kind: option.kind,
        id: option.id,
        label: option.label,
        start: active.start,
        end: position - 1,
      });
    setPins(shifted);
    setText(next);
    setCaret(position);
    setDismissed('');

    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  };
  const remove = (kind: CaptureMention['kind']) => {
    let next = text;
    for (const m of parsed.mentions
      .filter((m) => m.kind === kind)
      .sort((a, b) => b.start - a.start))
      next = next.slice(0, m.start) + next.slice(m.end);
    if (kind === 'project') setContextProject(null);
    if (kind === 'space') setContextSpace(null);
    edit(next, next.length);
    requestAnimationFrame(() => input.current?.focus());
  };
  const mention = () => {
    const start = input.current?.selectionStart ?? text.length,
      end = input.current?.selectionEnd ?? start;
    const add = (start > 0 && !/\s/.test(text[start - 1]) ? ' ' : '') + '@';
    const next = text.slice(0, start) + add + text.slice(end);
    edit(next, start + add.length);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(start + add.length, start + add.length);
    });
  };
  const save = async () => {
    if (entry.errors.length || submitting.current || busy || !ready) return;
    if (entry.kind === 'meeting') {
      const date = new Date(`${entry.meetingDate}T${entry.meetingTime}:00`);
      if (
        !Number.isFinite(date.getTime()) ||
        localDay(date) !== entry.meetingDate ||
        `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` !==
          entry.meetingTime
      )
        return;
    }
    submitting.current = true;
    setSaving(true);
    const command = sales
      ? {
          type: 'sales-capture',
          captureText: text,
          captureDay: localDay(new Date()),
        }
      : entry.kind !== 'task'
        ? {
            type: 'capture-entry',
            kind: entry.kind,
            captureText: text,
            captureDay: localDay(new Date()),
            contextProject,
            contextSpace,
            pins: pins.filter((p) => p.kind !== 'date'),
            targetType: target?.type || '',
            targetId: target?.id || '',
            meetingDate,
            meetingTime,
            meetingOffset:
              entry.kind === 'meeting'
                ? new Date(
                    `${entry.meetingDate}T${entry.meetingTime}:00`,
                  ).getTimezoneOffset()
                : null,
            ...(entry.kind === 'deadline'
              ? entry.taskId
                ? {
                    revision: data.tasks.find((t) => t.id === entry.taskId)
                      ?.revision,
                  }
                : {
                    previous: data.projects.find(
                      (p) => p.id === entry.projectId,
                    )?.due,
                  }
              : {}),
          }
        : {
            type: 'quick-create',
            title: entry.title,
            spaceId: entry.spaceId || '',
            projectId: parsed.projectId || '',
            due: parsed.due,
            captureText: text,
          };
    const fingerprint = JSON.stringify(command);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    const id = request.current.id;
    try {
      if (await act({ ...command, captureId: id })) {
        setSavedId(id);
        onCreated(id, entry.title, entry.kind);
        setTarget(null);
        setMeetingDate('');
        setMeetingTime('');
        setKind('auto');
        setText('');
        setPins([]);
        setCaret(0);
        setContextProject(projectId || null);
        setContextSpace(spaceId || null);

        request.current = null;
      }
    } finally {
      submitting.current = false;
      setSaving(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  };
  const member = data.members.find((m) => m.id === data.currentMember);
  return (
    <form
      className="quick-capture"
      aria-label="Capture a note, task, meeting, or deadline"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <header>
        <span>
          <span className="capture-pulse" />
          {text.trim() ? entry.kind.toUpperCase() : 'CAPTURE ANYTHING'}
        </span>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          aria-label="Close capture and keep draft"
          onClick={close}
        >
          <X size={16} />
        </Button>
      </header>
      <fieldset className="capture-kind-picker" aria-label="Entry type">
        {(['auto', 'note', 'task', 'meeting', 'deadline'] as const).map(
          (value) => (
            <button
              type="button"
              key={value}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
              }}
            >
              {value === 'auto'
                ? 'Recognize'
                : value[0].toUpperCase() + value.slice(1)}
            </button>
          ),
        )}
      </fieldset>
      <Command
        shouldFilter={false}
        loop
        value={choice}
        onValueChange={setChoice}
        className="capture-command"
      >
        <CommandInput
          ref={input}
          value={text}
          onValueChange={(value) => edit(value)}
          onSelect={(e) =>
            setCaret(e.currentTarget.selectionStart ?? text.length)
          }
          onClick={(e) =>
            setCaret(e.currentTarget.selectionStart ?? text.length)
          }
          disabled={!ready || saving}
          maxLength={2000}
          autoComplete="off"
          placeholder="Jot a note, a meeting, or what needs to happen…"
          aria-label="Capture sentence"
          aria-describedby={helpId}
          aria-expanded={menuOpen}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) {
              e.stopPropagation();
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              if (
                menuOpen &&
                selected &&
                !resolvedAtCaret &&
                !e.metaKey &&
                !e.ctrlKey
              )
                choose(selected);
              else void save();
            } else if (e.key === 'Tab' && menuOpen && selected) {
              e.preventDefault();
              e.stopPropagation();
              choose(selected);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (menuOpen) setDismissed(queryKey);
              else close();
            }
          }}
        />
        {menuOpen && (
          <CommandList
            className="capture-suggestions"
            aria-label="Clients, projects, and dates"
          >
            <div className="capture-suggestion-heading">
              {active?.query ? 'MATCHING CONNECTIONS' : 'CONNECT AS YOU TYPE'}
              <span>↑ ↓ to choose</span>
            </div>
            {suggestions.map((option) => {
              const Icon =
                option.kind === 'space'
                  ? BriefcaseBusiness
                  : option.kind === 'project'
                    ? Layers
                    : CalendarDays;
              return (
                <CommandItem
                  key={optionKey(option)}
                  value={optionKey(option)}
                  onSelect={() => choose(option)}
                >
                  <span
                    className="mention-option-icon"
                    style={
                      {
                        '--mention-color': option.color || '#697db0',
                      } as CSSProperties
                    }
                  >
                    <Icon size={17} />
                  </span>
                  <span>
                    <strong>
                      {option.kind === 'date'
                        ? option.label === 'nextweek'
                          ? 'Next week'
                          : option.label[0].toUpperCase() +
                            option.label.slice(1)
                        : option.label}
                    </strong>
                    <small>{option.detail}</small>
                  </span>
                  <span className="mention-kind">
                    {option.kind === 'space'
                      ? 'Client'
                      : option.kind === 'project'
                        ? 'Project'
                        : 'Deadline'}
                  </span>
                </CommandItem>
              );
            })}
            <CommandEmpty>
              No match. Dates use @DD/MM or @DD/MM/YYYY.
            </CommandEmpty>
          </CommandList>
        )}
      </Command>
      {['note', 'meeting', 'deadline'].includes(entry.kind) && text.trim() && (
        <div className="entry-routing">
          <div className="entry-route-copy">
            <span>Will save to</span>
            <strong>{captureDestination(entry, data)}</strong>
          </div>
          <Select
            value={target ? target.type + ':' + target.id : 'auto'}
            onValueChange={(value) => {
              if (!value || value === 'auto') setTarget(null);
              else {
                const colon = value.indexOf(':');
                setTarget({
                  type: value.slice(0, colon) as EntryTarget['type'],
                  id: value.slice(colon + 1),
                });
              }
            }}
          >
            <SelectTrigger aria-label="Capture destination">
              <SelectValue>
                {target ? 'Change destination' : 'Choose destination'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">From the sentence</SelectItem>
              {entry.kind !== 'deadline' &&
                data.spaces.map((s) => (
                  <SelectItem key={s.id} value={'space:' + s.id}>
                    {s.name} · Client
                  </SelectItem>
                ))}
              {data.projects.map((p) => (
                <SelectItem key={p.id} value={'project:' + p.id}>
                  {p.name} · Project
                </SelectItem>
              ))}
              {entry.kind !== 'meeting' &&
                data.tasks.map((t) => (
                  <SelectItem key={t.id} value={'task:' + t.id}>
                    {t.title} · Task
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {entry.kind === 'meeting' && (
        <div className="entry-meeting-fields">
          <label htmlFor={helpId + '-date'}>
            Meeting date
            <Input
              id={helpId + '-date'}
              type="date"
              value={meetingDate || entry.meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </label>
          <label htmlFor={helpId + '-time'}>
            Time
            <Input
              id={helpId + '-time'}
              type="time"
              value={meetingTime || entry.meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
            />
          </label>
          <span>Saved in the client’s meetings. No invitation is sent.</span>
        </div>
      )}
      {sales ? (
        <div className="sales-capture-preview">
          <div>
            <span>Prospect</span>
            <strong>{sales.name || 'Name the prospect'}</strong>
            <small>
              {existingProspect
                ? 'Existing prospect · ' + existingProspect.stage
                : 'New prospect · Discovery'}
            </small>
          </div>
          <ArrowUp size={17} />
          <div>
            <span>Next action · assigned to you</span>
            <strong>{sales.nextStep || 'Describe the next step'}</strong>
            <small>
              {sales.due
                ? displayCaptureDate(sales.due)
                : 'Connected to this prospect and your board'}
            </small>
          </div>
        </div>
      ) : entry.kind === 'task' ? (
        <div className="capture-context" aria-label="Resolved task connections">
          <span className="capture-chip capture-assignee">
            <UserRound size={13} />
            {member?.name || 'You'}
            <small>you</small>
          </span>
          {selectedSpace && (
            <span
              className="capture-chip"
              style={{ '--chip-color': selectedSpace.color } as CSSProperties}
            >
              <BriefcaseBusiness size={13} />
              {selectedSpace.name}
              {!parsed.project ||
              parsed.mentions.some((m) => m.kind === 'space') ? (
                <button
                  type="button"
                  onClick={() => remove('space')}
                  aria-label="Remove client"
                >
                  <X size={12} />
                </button>
              ) : (
                <small>client</small>
              )}
            </span>
          )}
          {parsed.project && (
            <span className="capture-chip">
              <Layers size={13} />
              {parsed.project.name}
              <button
                type="button"
                onClick={() => remove('project')}
                aria-label="Remove project"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {parsed.due && (
            <span className="capture-chip capture-date">
              <CalendarDays size={13} />
              {displayCaptureDate(parsed.due)}
              <button
                type="button"
                onClick={() => remove('date')}
                aria-label="Remove deadline"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      ) : null}
      {text.trim() && entry.errors.length > 0 && (
        <p className="capture-error" role="alert">
          {entry.errors[0]}
        </p>
      )}
      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <div>
          <button
            hidden={!!sales}
            className="capture-mention-button"
            type="button"
            onClick={mention}
          >
            <AtSign size={16} />
            Connect
          </button>
          <span id={helpId}>
            {menuOpen && !resolvedAtCaret
              ? 'Enter or Tab selects a connection.'
              : 'Enter saves · Esc keeps your draft · dates are DD/MM'}
          </span>
        </div>
        <Button
          type="submit"
          disabled={!ready || busy || saving || !text.trim()}
          className="capture-save"
        >
          {saving ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <ArrowUp size={17} />
          )}
          {sales
            ? 'Save conversation'
            : entry.kind === 'task'
              ? 'Add task'
              : entry.kind === 'deadline'
                ? 'Set deadline'
                : entry.kind === 'meeting'
                  ? 'Save meeting'
                  : 'Save note'}
          <CornerDownLeft size={12} />
        </Button>
      </footer>
      {savedEntry && (
        <output className="entry-saved">
          <span>
            <strong>Saved · {captureDestination(savedEntry, data)}</strong>
            <small>{savedEntry.title}</small>
          </span>
          {onOpenEntry && (
            <button type="button" onClick={() => onOpenEntry(savedEntry)}>
              Open <ArrowUp size={14} />
            </button>
          )}
        </output>
      )}
    </form>
  );
}
