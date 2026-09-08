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
import { Button } from '@/components/ui/button';
import type { Workspace } from '@/lib/model';
import {
  parseCapture,
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
};
export default function QuickCapture({
  data,
  ready,
  busy,
  error,
  act,
  projectId,
  enabled = true,
  close,
  onCreated,
  drafts,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  projectId?: string | null;
  enabled?: boolean;
  close: () => void;
  onCreated: (id: string, title: string) => void;
  drafts: Map<string, CaptureDraft>;
}) {
  const draftKey = projectId || 'workspace',
    initial = drafts.get(draftKey);
  const [text, setText] = useState(initial?.text || ''),
    [pins, setPins] = useState<CaptureMention[]>(initial?.pins || []),
    [contextProject, setContextProject] = useState(
      initial ? initial.contextProject : projectId || null,
    ),
    [caret, setCaret] = useState(text.length),
    [choice, setChoice] = useState(''),
    [dismissed, setDismissed] = useState(''),
    [attempted, setAttempted] = useState(false),
    [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    submitting = useRef(false),
    request = useRef<{ fingerprint: string; id: string } | null>(null),
    helpId = useId();
  const parsed = parseCapture(text, data, { projectId: contextProject, pins }),
    active = activeMention(text, caret, parsed.mentions),
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
    drafts.set(draftKey, { text, pins, contextProject });
  }, [drafts, draftKey, text, pins, contextProject]);
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
    setAttempted(false);
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
    setAttempted(false);
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
    setAttempted(true);
    if (parsed.errors.length || submitting.current || busy || !ready) return;
    submitting.current = true;
    setSaving(true);
    const command = {
      type: 'quick-create',
      title: parsed.title,
      spaceId: parsed.spaceId || '',
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
        onCreated(id, parsed.title);
        setText('');
        setPins([]);
        setCaret(0);
        setContextProject(projectId || null);
        setAttempted(false);
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
      aria-label="Quick task capture"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <header>
        <span>
          <span className="capture-pulse" />
          NEW TASK
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
          placeholder={`Book a meeting with @${data.spaces[0]?.name || 'client'} @tomorrow`}
          aria-label="Task sentence"
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
      <div className="capture-context" aria-label="Resolved task connections">
        <span className="capture-chip capture-assignee">
          <UserRound size={13} />
          {member?.name || 'You'}
          <small>you</small>
        </span>
        {parsed.space && (
          <span
            className="capture-chip"
            style={{ '--chip-color': parsed.space.color } as CSSProperties}
          >
            <BriefcaseBusiness size={13} />
            {parsed.space.name}
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
      {attempted && parsed.errors.length > 0 && (
        <p className="capture-error" role="alert">
          {parsed.errors[0]}
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
          Add task
          <CornerDownLeft size={12} />
        </Button>
      </footer>
    </form>
  );
}
