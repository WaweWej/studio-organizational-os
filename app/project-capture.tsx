'use client';
import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  Paperclip,
  X,
  Layers,
  LoaderCircle,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Workspace } from '@/lib/model';
import type { CaptureDraft } from './quick-capture';
export type ProjectDraft = {
  captureId: string;
  name: string;
  description: string;
  spaceId: string;
  newClient?: string;
  due: string;
  files: { id: string; file: File; uploaded: boolean }[];
};
export default function ProjectCapture({
  data,
  ready,
  busy,
  error,
  act,
  drafts,
  draftKey,
  sourceText,
  initialName,
  initialSpace,
  initialDue,
  complete,
  back,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  drafts: Map<string, CaptureDraft>;
  draftKey: string;
  sourceText: string;
  initialName: string;
  initialSpace: string | null;
  initialDue: string;
  complete: (id: string, name: string) => void;
  back: () => void;
}) {
  const [draft, setDraft] = useState<ProjectDraft>(
    () =>
      drafts.get(draftKey)?.project || {
        captureId: crypto.randomUUID(),
        name: initialName,
        description: '',
        spaceId: initialSpace || '',
        due: initialDue,
        files: [],
      },
  );
  const [saving, setSaving] = useState(false),
    [filed, setFiled] = useState(false),
    [status, setStatus] = useState(''),
    [localError, setLocalError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null),
    nameInput = useRef<HTMLInputElement>(null),
    submitting = useRef(false),
    form = useRef<HTMLFormElement>(null),
    fieldId = useId();
  const remember = (value: ProjectDraft) => {
    setDraft(value);
    const existing = drafts.get(draftKey);
    if (existing) drafts.set(draftKey, { ...existing, project: value });
  };
  useEffect(() => {
    nameInput.current?.focus();
  }, []);
  const addFiles = (files: FileList | null) => {
    if (!files || saving) return;
    const incoming = Array.from(files);
    if (incoming.some((f) => !f.size || f.size > 20 * 1024 * 1024)) {
      setLocalError('Choose non-empty files up to 20 MB each.');
      return;
    }
    if (draft.files.length + incoming.length > 30) {
      setLocalError('You can add up to 30 files to this entry.');
      return;
    }
    setLocalError('');
    remember({
      ...draft,
      files: [
        ...draft.files,
        ...incoming.map((file) => ({
          id: crypto.randomUUID(),
          file,
          uploaded: false,
        })),
      ],
    });
  };
  const save = async () => {
    if (submitting.current || busy || !ready) return;
    if (!draft.name.trim()) {
      setLocalError('Give this project a name.');
      nameInput.current?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    setLocalError('');
    let saved = draft;
    remember(saved);
    try {
      for (const item of saved.files) {
        if (item.uploaded) continue;
        setStatus('Adding ' + item.file.name + '…');
        const body = new FormData();
        body.set('file', item.file);
        body.set('kind', 'asset');
        body.set('uploadId', item.id);
        const response = await fetch('/api/files', { method: 'POST', body });
        const result = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(result.error || 'That file could not be uploaded.');
        saved = {
          ...saved,
          files: saved.files.map((f) =>
            f.id === item.id ? { ...f, uploaded: true } : f,
          ),
        };
        remember(saved);
      }
      setStatus('Creating your project…');
      const success = await act({
        type: 'project-capture',
        captureId: saved.captureId,
        captureText: sourceText,
        name: saved.name,
        description: saved.description,
        spaceId: saved.spaceId === '__new' ? '' : saved.spaceId,
        newClient: saved.spaceId === '__new' ? (saved.newClient || '').trim() : '',
        due: saved.due,
        resourceIds: saved.files.map((f) => f.id),
      });
      if (success) {
        const previous = drafts.get(draftKey);
        if (previous) drafts.set(draftKey, { ...previous, project: undefined });
        setFiled(true);
        await new Promise((resolve) => setTimeout(resolve, 180));
        complete(saved.captureId, saved.name);
      }
    } catch (e) {
      setLocalError(
        e instanceof Error
          ? e.message
          : 'The project could not be saved. Your draft is kept.',
      );
    } finally {
      submitting.current = false;
      setSaving(false);
      setStatus('');
    }
  };
  return (
    <form
      ref={form}
      className={'desk-project-entry' + (filed ? ' is-filed' : '')}
      aria-label="Create a new project"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <header>
        <span>
          <Layers size={15} /> NEW PROJECT
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            remember(draft);
            back();
          }}
        >
          <ArrowLeft size={14} /> Back to writing
        </button>
      </header>

      <fieldset disabled={saving || busy || !ready}>
        <label htmlFor={fieldId + '-name'}>Name</label>
        <Input
          id={fieldId + '-name'}
          ref={nameInput}
          autoComplete="off"
          placeholder="Project name"
          className="desk-project-name"
          maxLength={180}
          value={draft.name}
          onChange={(e) => remember({ ...draft, name: e.target.value })}
        />
        <div className="desk-project-meta">
          <div>
            <label htmlFor={fieldId + '-client'}>Client</label>
            <Select
              value={draft.spaceId || 'internal'}
              onValueChange={(v) =>
                remember({ ...draft, spaceId: v === 'internal' ? '' : v || '' })
              }
            >
              <SelectTrigger
                id={fieldId + '-client'}
                aria-label="Project client"
              >
                <SelectValue>
                  {draft.spaceId === '__new'
                    ? 'New client'
                    : data.spaces.find((s) => s.id === draft.spaceId)?.name ||
                      'Internal · no client'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal · no client</SelectItem>
                {data.spaces.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new">+ New client…</SelectItem>
              </SelectContent>
            </Select>
            {draft.spaceId === '__new' && (
              <Input
                className="desk-project-new-client"
                value={draft.newClient || ''}
                placeholder="New client name"
                aria-label="New client name"
                onChange={(e) =>
                  remember({ ...draft, newClient: e.target.value })
                }
              />
            )}
          </div>
          <div>
            <label htmlFor={fieldId + '-due'}>Deadline</label>
            <Input
              id={fieldId + '-due'}
              type="date"
              value={draft.due}
              onChange={(e) => remember({ ...draft, due: e.target.value })}
            />
          </div>
        </div>
        <label htmlFor={fieldId + '-brief'}>Brief</label>
        <Textarea
          id={fieldId + '-brief'}
          placeholder="Describe the project"
          value={draft.description}
          maxLength={10000}
          onChange={(e) => remember({ ...draft, description: e.target.value })}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              (e.metaKey || e.ctrlKey) &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div
          className="desk-project-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          <button type="button" onClick={() => fileInput.current?.click()}>
            <Paperclip size={19} />
            <span>
              Add files<small>Drop or choose · 20 MB each</small>
            </span>
            <PlusMark />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            aria-label="Project files"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {draft.files.length > 0 && (
          <div className="desk-project-files">
            {draft.files.map((item) => (
              <div key={item.id}>
                <Paperclip size={14} />
                <span>{item.file.name}</span>
                <small>
                  {item.uploaded ? 'In library' : 'Ready to upload'}
                </small>
                {item.uploaded ? (
                  <Check size={14} />
                ) : (
                  <button
                    type="button"
                    aria-label={'Remove ' + item.file.name}
                    onClick={() =>
                      remember({
                        ...draft,
                        files: draft.files.filter((f) => f.id !== item.id),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </fieldset>
      {(localError || error) && (
        <p className="capture-error" role="alert">
          {localError || error} Your project draft is kept.
        </p>
      )}
      <footer>
        <span>
          {saving
            ? status
            : draft.files.some((f) => f.uploaded)
              ? 'Uploaded files are in the library. Saving connects them to this project.'
              : 'Work' +
                (draft.spaceId === '__new'
                  ? draft.newClient?.trim()
                    ? ' · ' + draft.newClient.trim() + ' (new client)'
                    : ' · name the new client'
                  : draft.spaceId
                    ? ' · ' +
                      (data.spaces.find((s) => s.id === draft.spaceId)?.name ||
                        'Client')
                    : '') +
                (draft.due ? ' · ' + draft.due : '')}
        </span>
        <Button
          type="submit"
          disabled={
            saving ||
            busy ||
            !ready ||
            (draft.spaceId === '__new' && !draft.newClient?.trim())
          }
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : null}
          Create project
        </Button>
      </footer>
    </form>
  );
}
function PlusMark() {
  return (
    <span aria-hidden="true" className="desk-upload-plus">
      +
    </span>
  );
}
