'use client';
import { DraftCache } from '@/lib/draft-cache';
import {
  parseSurfaceIntent,
  type SurfaceIntent,
} from '@/lib/desk-surfaces';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  commandQuery,
  commandSuggestions,
  stripEntryPrefix,
  type DeskIntent,
} from '@/lib/desk-intents';
import ProjectCapture, { type ProjectDraft } from './project-capture';
import DailyPlanCapture from './daily-plan-capture';
import type { DailyPlanDraft } from '@/lib/daily-plan';
import {
  useState,
  useEffect,
  useRef,
  useId,
  type CSSProperties,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
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
  Ellipsis,
  Check,
} from 'lucide-react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
import { Textarea } from '@/components/ui/textarea';
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
  isTaskUpdate,
  blockerRecipients,
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
  reviewRequired?: number;
  request?: { fingerprint: string; id: string };
  text: string;
  pins: CaptureMention[];
  contextProject: string | null;
  contextSpace?: string | null;
  kind?: EntryKind | 'auto';
  target?: EntryTarget | null;
  meetingDate?: string;
  meetingTime?: string;
  project?: ProjectDraft;
  daily?: DailyPlanDraft;
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
  variant = 'standard',
  focusTaskId,
  onDraftChange,
  onNavigate,
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
  variant?: 'standard' | 'desk';
  focusTaskId?: string | null;
  onDraftChange?: (text: string) => void;
  onNavigate?: (intent: SurfaceIntent) => void;
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
    [saving, setSaving] = useState(false),
    [optionsOpen, setOptionsOpen] = useState(false),
    [attempted, setAttempted] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(initial?.reviewRequired ?? 0);
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null),
    submitting = useRef(false),
    request = useRef<{ fingerprint: string; id: string } | null>(
      initial?.request || null,
    ),
    helpId = useId();
  const entry = interpretEntry(text, data, {
    kind,
    projectId: contextProject,
    spaceId: contextSpace,
    pins,
    target,
    meetingDate,
    meetingTime,
    focusTaskId,
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
  const slash = commandQuery(text),
    actionMenuOpen = slash !== null;
  const actions = actionMenuOpen ? commandSuggestions(slash) : [];
  // A surface intent opens a place instead of creating an entry.
  // Navigation intents only exist where the host can navigate.
  const surface =
    !actionMenuOpen && kind === 'auto'
      ? parseSurfaceIntent(text, data, { navigation: !!onNavigate })
      : null;
  const [logPanel, setLogPanel] = useState<{
    spaceId: string;
    spaceName: string;
    body: string;
  } | null>(null);
  const [logSaving, setLogSaving] = useState(false);
  const logRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const saveLog = async () => {
    if (!logPanel || !logPanel.body.trim() || logSaving || busy || !ready)
      return;
    const command = {
      type: 'capture-entry',
      kind: 'note',
      captureText: logPanel.body,
      captureDay: localDay(new Date()),
      contextProject: null,
      contextSpace: logPanel.spaceId,
      pins: [],
      targetType: 'space',
      targetId: logPanel.spaceId,
      meetingDate: '',
      meetingTime: '',
      meetingOffset: null,
    };
    const fingerprint = JSON.stringify(command);
    if (logRequest.current?.fingerprint !== fingerprint)
      logRequest.current = { fingerprint, id: crypto.randomUUID() };
    setLogSaving(true);
    try {
      if (await act({ ...command, captureId: logRequest.current.id })) {
        logRequest.current = null;
        setLogPanel(null);
        requestAnimationFrame(() => input.current?.focus());
      }
    } finally {
      setLogSaving(false);
    }
  };
  const action = actions.find((a) => 'action:' + a.id === choice) || actions[0];
  const update = isTaskUpdate(entry.kind);
  const updatingTask = data.tasks.find((t) => t.id === entry.taskId);
  const recipients = updatingTask
    ? entry.kind === 'blocker'
      ? blockerRecipients(updatingTask, data.currentMember)
      : entry.kind === 'status' &&
          entry.nextStage === 'Review' &&
          updatingTask.stage !== 'Review'
        ? [updatingTask.reviewer]
        : []
    : [];
  const impact =
    entry.kind === 'progress'
      ? 'Adds a progress note to the task and its activity.'
      : entry.kind === 'blocker'
        ? entry.clearBlocker
          ? 'Clears the blocker.'
          : 'Marks the task as blocked.'
        : entry.nextStage
          ? (updatingTask?.stage || 'Current status') +
            ' → ' +
            entry.nextStage +
            (entry.nextStage === 'Done' ? ' · Current approval required.' : '')
          : '';
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
    onDraftChange?.(text);
  }, [text, onDraftChange]);
  useEffect(() => {
    drafts.set(draftKey, {
      ...drafts.get(draftKey),
      text,
      reviewRequired,
      pins,
      contextProject,
      contextSpace,
      kind,
      target:
        target ||
        (text.trim() &&
        focusTaskId &&
        !parsed.mentions.some((m) => m.kind !== 'date') &&
        (entry.kind === 'note' || entry.kind === 'deadline' || update)
          ? { type: 'task', id: focusTaskId }
          : null),
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
    reviewRequired,
    focusTaskId,
    entry.kind,
    update,
    parsed.mentions,
  ]);
  useEffect(() => {
    if (enabled) input.current?.focus();
  }, [enabled]);
  useEffect(() => {
    if (drafts instanceof DraftCache && drafts.available) return;
    if (!text.trim() && !drafts.get(draftKey)?.project) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [text, drafts, draftKey]);
  const edit = (next: string, nextCaret?: number) => {
    setAttempted(false);
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
  const chooseAction = (action: DeskIntent) => {
    setKind('auto');
    setTarget(null);
    setText(action.insert);
    setPins([]);
    setCaret(action.insert.length);
    setChoice('');
    setOptionsOpen(false);
    setAttempted(false);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        action.insert.length,
        action.insert.length,
      );
    });
  };
  const setDeadlineDate = (value: string) => {
    let next = text;
    for (const m of [...parsed.mentions]
      .filter((m) => m.kind === 'date')
      .sort((a, b) => b.start - a.start))
      next = next.slice(0, m.start) + next.slice(m.end);
    next = next.trimEnd() + (value ? ' @' + value : '');
    edit(next, next.length);
  };
  const save = async () => {
    if (actionMenuOpen) {
      if (action) chooseAction(action);
      return;
    }
    setAttempted(true);
    if (surface) {
      if (surface.type === 'client-log')
        setLogPanel({
          spaceId: surface.spaceId,
          spaceName: surface.spaceName,
          body: surface.seed,
        });
      else onNavigate?.(surface);
      setText('');
      setPins([]);
      setCaret(0);
      setAttempted(false);
      return;
    }
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
            targetType: entry.target?.type || '',
            targetId: entry.target?.id || '',
            meetingDate,
            meetingTime,
            meetingOffset:
              entry.kind === 'meeting'
                ? new Date(
                    `${entry.meetingDate}T${entry.meetingTime}:00`,
                  ).getTimezoneOffset()
                : null,
            ...(entry.kind === 'deadline' || update
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
            reviewRequired,
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
    const pendingDraft = drafts.get(draftKey);
    if (pendingDraft)
      drafts.set(draftKey, { ...pendingDraft, request: request.current });
    try {
      if (await act({ ...command, captureId: id })) {
        setSavedId(id);
        onCreated(id, entry.title, entry.kind);
        setTarget(null);
        setMeetingDate('');
        setMeetingTime('');
        setKind('auto');
        setReviewRequired(0);
        setOptionsOpen(false);
        setText('');
        setPins([]);
        setCaret(0);
        setContextProject(projectId || null);
        setContextSpace(spaceId || null);

        request.current = null;
        drafts.delete(draftKey);
      }
    } finally {
      submitting.current = false;
      setSaving(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  };
  const onWritingKey = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (e.nativeEvent.isComposing) {
      e.stopPropagation();
      return;
    }
    if (actionMenuOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setText('');
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (!actions.length) return;
        if (e.key === 'Enter' || e.key === 'Tab') chooseAction(action);
        else {
          const index = actions.indexOf(action);
          setChoice(
            'action:' +
              actions[
                (index + (e.key === 'ArrowDown' ? 1 : -1) + actions.length) %
                  actions.length
              ].id,
          );
        }
        return;
      }
    }
    if (variant === 'desk' && e.key === 'Enter' && e.shiftKey) {
      e.stopPropagation();
      return;
    }
    if (
      menuOpen &&
      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
      suggestions.length
    ) {
      e.preventDefault();
      e.stopPropagation();
      const index = suggestions.findIndex(
        (o) => optionKey(o) === optionKey(selected),
      );
      setChoice(
        optionKey(
          suggestions[
            (index + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) %
              suggestions.length
          ],
        ),
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (menuOpen && selected && !resolvedAtCaret && !e.metaKey && !e.ctrlKey)
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
  };
  const writingProps = {
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      input.current = node;
    },
    value: text,
    onSelect: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCaret(e.currentTarget.selectionStart ?? text.length),
    onClick: (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCaret(e.currentTarget.selectionStart ?? text.length),
    disabled: !ready || saving,
    maxLength: 2000,
    autoComplete: 'off',
    'aria-label': 'Capture sentence',
    'aria-describedby': helpId,
    'aria-expanded': menuOpen || actionMenuOpen,
    onKeyDown: onWritingKey,
  };
  if (entry.kind === 'daily' && slash === null)
    return (
      <DailyPlanCapture
        data={data}
        ready={ready}
        busy={busy}
        error={error}
        source={text}
        drafts={drafts}
        draftKey={draftKey}
        act={act}
        back={() => {
          setText('');
          setKind('auto');
          setReviewRequired(0);
        }}
        complete={(id) => {
          setSavedId(id);
          onCreated(id, 'Daily plan committed', 'daily');
          setText('');
          setKind('auto');
          setReviewRequired(0);
          setPins([]);
          setTarget(null);
          requestAnimationFrame(() => input.current?.focus());
        }}
      />
    );
  if (entry.kind === 'project' && slash === null)
    return (
      <ProjectCapture
        data={data}
        ready={ready}
        busy={busy}
        error={error}
        act={act}
        drafts={drafts}
        draftKey={draftKey}
        sourceText={text || 'Create new project'}
        initialName={stripEntryPrefix(entry.title, 'project')}
        initialSpace={entry.spaceId}
        initialDue={entry.due}
        back={() => {
          setText('');
          setKind('auto');
          setReviewRequired(0);
          setPins([]);
          setTarget(null);
          requestAnimationFrame(() => input.current?.focus());
        }}
        complete={(id, name) => {
          setSavedId(id);
          onCreated(id, name, 'project');
          setText('');
          setPins([]);
          setTarget(null);
          setKind('auto');
          setReviewRequired(0);
          setOptionsOpen(false);
          setContextProject(projectId || null);
          setContextSpace(spaceId || null);
          requestAnimationFrame(() => input.current?.focus());
        }}
      />
    );
  const member = data.members.find((m) => m.id === data.currentMember);
  return (
    <form
      className={
        'quick-capture' +
        (variant === 'desk' ? ' desk-composer' : '') +
        (!text.trim() ? ' is-empty' : '') +
        (actionMenuOpen ? ' is-choosing-action' : '')
      }
      aria-label="Capture notes, work, and updates"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {(variant !== 'desk' || !!text.trim()) && (
        <header>
          <span>
            {variant !== 'desk' && <span className="capture-pulse" />}
            {text.trim() ? entry.kind.toUpperCase() : 'CAPTURE ANYTHING'}
          </span>
          {variant === 'desk' ? (
            <button
              type="button"
              className="desk-adjust-capture"
              aria-label="Entry options"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((v) => !v)}
            >
              <Ellipsis size={18} />
            </button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              type="button"
              aria-label="Close capture and keep draft"
              onClick={close}
            >
              <X size={16} />
            </Button>
          )}
        </header>
      )}
      {(variant !== 'desk' || optionsOpen) && (
        <fieldset className="capture-kind-picker" aria-label="Entry type">
          {(
            [
              'auto',
              'note',
              'task',
              'meeting',
              'deadline',
              'progress',
              'blocker',
              'status',
              'project',
            ] as const
          ).map((value) => (
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
          ))}
        </fieldset>
      )}
      {!text.trim() && drafts.get(draftKey)?.project && (
        <button
          type="button"
          className="desk-resume-project"
          onClick={() => setKind('project')}
        >
          Resume project draft <ArrowUp size={13} />
        </button>
      )}
      <Command
        shouldFilter={false}
        loop
        value={choice}
        onValueChange={setChoice}
        className="capture-command"
      >
        {variant === 'desk' ? (
          <Textarea
            {...writingProps}
            className="desk-paper-input"
            title="Enter to save. Shift+Enter for a new line. Use @ to connect a client, project, or date."
            rows={4}
            onChange={(e) => edit(e.target.value)}
            placeholder="Write, or / for actions…"
            aria-controls={
              actionMenuOpen
                ? helpId + '-actions'
                : menuOpen
                  ? helpId + '-suggestions'
                  : undefined
            }
          />
        ) : (
          <CommandInput
            {...writingProps}
            onValueChange={(value) => edit(value)}
            placeholder="Jot a note, a meeting, or what needs to happen…"
          />
        )}
        {actionMenuOpen && (
          <CommandList
            className="desk-action-menu"
            id={helpId + '-actions'}
            aria-label="Desk actions"
          >
            {actions.map((item) => (
              <CommandItem
                key={item.id}
                value={'action:' + item.id}
                onSelect={() => chooseAction(item)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.example}</small>
                </span>
                <kbd>/{item.id}</kbd>
              </CommandItem>
            ))}
            <CommandEmpty>
              No matching action. Type /help for all actions.
            </CommandEmpty>
          </CommandList>
        )}
        {menuOpen && (
          <CommandList
            className="capture-suggestions"
            id={helpId + '-suggestions'}
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
      {surface && text.trim() && !actionMenuOpen && (
        <div className="entry-routing">
          <div className="entry-route-copy">
            <span>Opens</span>
            <strong>
              {surface.type === 'client-log'
                ? surface.spaceName + ' — log'
                : surface.type === 'open-view'
                  ? surface.label
                  : surface.type === 'open-space'
                    ? surface.spaceName
                    : surface.projectName}
            </strong>
            {surface.type === 'client-log' && (
              <small className="capture-impact">
                Write the entry there; it is stored on the client&rsquo;s
                timeline.
              </small>
            )}
          </div>
        </div>
      )}
      {!surface &&
        [
        'note',
        'meeting',
        'deadline',
        'progress',
        'blocker',
        'status',
      ].includes(entry.kind) &&
        text.trim() &&
        !actionMenuOpen && (
          <div className="entry-routing">
            <div className="entry-route-copy">
              {variant !== 'desk' && <span>Will save to</span>}
              <strong>{captureDestination(entry, data)}</strong>
              {update && (
                <small className="capture-impact">
                  {impact}
                  {recipients.length > 0 &&
                    ' In-app alert → ' +
                      recipients
                        .map(
                          (id) =>
                            data.members.find((m) => m.id === id)?.name ||
                            'Reviewer',
                        )
                        .join(', ')}
                </small>
              )}
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
                  {(entry.kind === 'deadline' || update) &&
                  !entry.taskId &&
                  !entry.projectId
                    ? 'Choose work'
                    : variant === 'desk'
                      ? 'Change'
                      : target
                        ? 'Change destination'
                        : 'Choose destination'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">From the sentence</SelectItem>
                {!update &&
                  entry.kind !== 'deadline' &&
                  data.spaces.map((s) => (
                    <SelectItem key={s.id} value={'space:' + s.id}>
                      {s.name} · Client
                    </SelectItem>
                  ))}
                {!update &&
                  data.projects.map((p) => (
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
      {entry.kind === 'deadline' && !actionMenuOpen && (
        <div className="entry-deadline-field">
          <label htmlFor={helpId + '-deadline'}>Deadline</label>
          <Input
            id={helpId + '-deadline'}
            type="date"
            value={entry.due}
            onChange={(e) => setDeadlineDate(e.target.value)}
          />
        </div>
      )}
      {entry.kind === 'status' && !actionMenuOpen && (
        <div className="entry-deadline-field">
          <label htmlFor={helpId + '-status'}>Status</label>
          <Select
            value={entry.nextStage || ''}
            onValueChange={(value) => {
              if (!value) return;
              setTarget(entry.target?.type === 'task' ? entry.target : null);
              setPins([]);
              setKind('status');
              setText('Status: ' + value);
              setAttempted(false);
            }}
          >
            <SelectTrigger id={helpId + '-status'} aria-label="New task status">
              <SelectValue>{entry.nextStage || 'Choose status'}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {['Up next', 'Doing', 'Review', 'Done'].map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {entry.kind === 'meeting' && !actionMenuOpen && (
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
      {actionMenuOpen ? null : sales ? (
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
      {!actionMenuOpen &&
        text.trim() &&
        attempted &&
        entry.errors.length > 0 && (
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
            aria-label="Connect a client, project, or date"
            type="button"
            onClick={mention}
          >
            <AtSign size={16} />
            {variant !== 'desk' && 'Connect'}
          </button>
          <span
            id={helpId}
            className={variant === 'desk' ? 'desk-key-help' : undefined}
          >
            {menuOpen && !resolvedAtCaret
              ? 'Enter or Tab selects a connection.'
              : variant === 'desk'
                ? 'Enter to save'
                : 'Enter saves · Esc keeps your draft · dates are DD/MM'}
          </span>
        </div>
        <Button
          type="submit"
          disabled={!ready || busy || saving || !text.trim()}
          className="capture-save"
        >
          {variant !== 'desk' &&
            (saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <ArrowUp size={17} />
            ))}
          {surface
            ? 'Open log'
            : variant === 'desk'
            ? saving
              ? 'Saving…'
              : 'Save'
            : update
              ? 'Save update'
              : sales
                ? 'Save conversation'
                : entry.kind === 'task'
                  ? 'Add task'
                  : entry.kind === 'deadline'
                    ? 'Set deadline'
                    : entry.kind === 'meeting'
                      ? 'Save meeting'
                      : 'Save note'}
          {variant !== 'desk' && <CornerDownLeft size={12} />}
        </Button>
      </footer>
      {savedEntry && (
        <output className="entry-saved" aria-live="polite">
          <Check size={17} />
          <span>
            <strong>Saved · {captureDestination(savedEntry, data)}</strong>
            <small>{savedEntry.title}</small>
          </span>
          {onOpenEntry && (
            <button type="button" onClick={() => onOpenEntry(savedEntry)}>
              Open <ArrowUp size={14} />
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss saved confirmation"
            onClick={() => setSavedId(null)}
          >
            <X size={14} />
          </button>
        </output>
      )}
      <Dialog
        open={!!logPanel}
        onOpenChange={(value) => {
          if (!value && !logSaving) setLogPanel(null);
        }}
      >
        <DialogContent className="fc-dialog log-panel-dialog">
          <DialogHeader>
            <DialogTitle>{logPanel?.spaceName} — log</DialogTitle>
            <DialogDescription>
              Saved to this client&rsquo;s timeline when you store it.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="log-panel-body"
            rows={6}
            ref={(node) => node?.focus()}
            value={logPanel?.body || ''}
            placeholder="What happened?"
            onChange={(e) =>
              setLogPanel(
                (previous) =>
                  previous && { ...previous, body: e.target.value },
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void saveLog();
              }
            }}
          />
          <footer className="log-panel-actions">
            <Button
              type="button"
              variant="ghost"
              disabled={logSaving}
              onClick={() => setLogPanel(null)}
            >
              Discard
            </Button>
            <Button
              type="button"
              disabled={logSaving || !logPanel?.body.trim() || busy || !ready}
              onClick={() => void saveLog()}
            >
              {logSaving ? 'Storing…' : 'Store & close'}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>
    </form>
  );
}
