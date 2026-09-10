'use client';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
  parseDailyPlan,
  type DailyPlanDraft,
  type PlanItem,
} from '@/lib/daily-plan';
import { stripEntryPrefix } from '@/lib/desk-intents';
import { localDay } from '@/lib/workspace-brief';
import { taskSpaceId } from '@/lib/task-context';
import type { Workspace } from '@/lib/model';
import type { CaptureDraft } from './quick-capture';

function Pick({
  label,
  value,
  options,
  change,
  disabled = false,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  change: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && change(v)}>
      <SelectTrigger disabled={disabled} aria-label={label}>
        <SelectValue>
          {options.find((o) => o.id === value)?.name || label}
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
export default function DailyPlanCapture({
  data,
  ready,
  busy,
  error,
  source,
  drafts,
  draftKey,
  act,
  back,
  complete,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  source: string;
  drafts: Map<string, CaptureDraft>;
  draftKey: string;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  back: () => void;
  complete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<DailyPlanDraft>(
    () =>
      drafts.get(draftKey)?.daily || {
        id: crypto.randomUUID(),
        text: stripEntryPrefix(source, 'daily').trim(),
        day: localDay(new Date()),
        items: [],
        reviewed: false,
      },
  );
  const [localError, setLocalError] = useState('');
  const writing = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    writing.current?.focus();
  }, []);
  const update = (changes: Partial<DailyPlanDraft>) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    const parent = drafts.get(draftKey);
    if (parent) drafts.set(draftKey, { ...parent, daily: next });
  };
  const edit = (index: number, changes: Partial<PlanItem>) =>
    update({
      items: draft.items.map((item, i) =>
        i === index ? { ...item, ...changes } : item,
      ),
    });
  const disabled = !ready || busy;
  return (
    <section className="daily-plan-entry" aria-label="Plan your day">
      <header>
        <div>
          <h2>Plan your day</h2>
          <p>
            One task per line. Choose a client, prospect or project when
            organizing.
          </p>
        </div>
        <Button variant="ghost" disabled={busy} onClick={back}>
          Back to writing
        </Button>
      </header>
      <label htmlFor="daily-plan-date">
        Planning for
        <Input
          id="daily-plan-date"
          type="date"
          value={draft.day}
          disabled={busy}
          onChange={(e) => update({ day: e.target.value, reviewed: false })}
        />
      </label>
      {!draft.reviewed ? (
        <>
          <Textarea
            ref={writing}
            aria-label="Tasks for the day"
            value={draft.text}
            rows={8}
            disabled={busy}
            placeholder={
              'Write the campaign copy\nEdit the launch video\nFollow up with the client'
            }
            onChange={(e) => update({ text: e.target.value })}
          />
          <Button
            disabled={disabled || !draft.text.trim() || !draft.day}
            onClick={() => {
              const items = parseDailyPlan(draft.text, data, draft.day);
              if (!items.length || items.length > 30) {
                setLocalError('Write between 1 and 30 tasks.');
                return;
              }
              setLocalError('');
              update({ items, reviewed: true });
            }}
          >
            Organize tasks
          </Button>
        </>
      ) : (
        <>
          <div className="daily-plan-preview">
            {draft.items.map((item, index) => (
              <article key={index} className="daily-plan-row">
                <div className="daily-plan-row-heading">
                  <span>{index + 1}</span>
                  <Input
                    aria-label={'Task ' + (index + 1) + ' title'}
                    value={item.title}
                    disabled={busy || !!item.taskId}
                    onChange={(e) => edit(index, { title: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      update({
                        items: draft.items.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <details
                  className="daily-plan-details"
                  open={item.errors.length ? true : undefined}
                >
                  <summary>
                    {item.newProspect ||
                      data.prospects.find((p) => p.id === item.prospectId)
                        ?.name ||
                      item.newSpace ||
                      data.spaces.find((s) => s.id === item.spaceId)?.name ||
                      'Internal / personal'}
                    {item.projectId && item.projectId !== '__new'
                      ? ' · ' +
                        data.projects.find((p) => p.id === item.projectId)?.name
                      : ''}
                    {item.due ? ' · Due ' + item.due : ''} · Edit details
                  </summary>
                  <div className="daily-plan-connections">
                    <Pick
                      label="New or existing task"
                      value={item.taskId || 'new'}
                      disabled={busy}
                      options={[
                        { id: 'new', name: 'New task' },
                        ...data.tasks
                          .filter(
                            (t) =>
                              !t.archived &&
                              t.assignee === data.currentMember &&
                              t.stage !== 'Done',
                          )
                          .map((t) => ({ id: t.id, name: t.title })),
                      ]}
                      change={(v) => {
                        const task = data.tasks.find((t) => t.id === v);
                        edit(
                          index,
                          task
                            ? {
                                taskId: task.id,
                                revision: task.revision,
                                title: task.title,
                                spaceId: taskSpaceId(data, task),
                                projectId: task.projectId,
                                prospectId: task.prospectId || null,
                                newProspect: '',
                                newSpace: '',
                                newProject: '',
                                reviewRequired: task.reviewRequired ?? 1,
                                due: task.due,
                                dueTime: task.dueTime || '',
                                errors: [],
                              }
                            : { taskId: null, revision: undefined },
                        );
                      }}
                    />
                    <Pick
                      label="Work destination"
                      value={
                        item.prospectId || item.newProspect ? 'sales' : 'work'
                      }
                      disabled={busy || !!item.taskId}
                      options={[
                        { id: 'work', name: 'Client / internal work' },
                        { id: 'sales', name: 'Sales prospect' },
                      ]}
                      change={(v) =>
                        edit(index, {
                          prospectId: v === 'sales' ? '__new' : null,
                          newProspect: '',
                          spaceId: null,
                          projectId: null,
                          newSpace: '',
                          newProject: '',
                        })
                      }
                    />
                    {item.prospectId || item.newProspect ? (
                      <>
                        <Pick
                          label="Prospect"
                          value={
                            item.newProspect
                              ? '__new'
                              : item.prospectId || '__new'
                          }
                          disabled={busy || !!item.taskId}
                          options={[
                            ...data.prospects
                              .filter((p) => !p.convertedAt)
                              .map((p) => ({
                                id: p.id,
                                name: p.name,
                              })),
                            { id: '__new', name: '+ New prospect' },
                          ]}
                          change={(v) =>
                            edit(index, { prospectId: v, newProspect: '' })
                          }
                        />
                        {(item.prospectId === '__new' || item.newProspect) && (
                          <Input
                            aria-label="New prospect name"
                            placeholder="Prospect name"
                            disabled={busy}
                            value={item.newProspect || ''}
                            onChange={(e) =>
                              edit(index, { newProspect: e.target.value })
                            }
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <Pick
                          label="Client"
                          value={
                            item.newSpace || item.spaceId === '__new'
                              ? '__new'
                              : item.spaceId || 'none'
                          }
                          disabled={busy || !!item.taskId}
                          options={[
                            { id: 'none', name: 'Internal / personal' },
                            ...data.spaces.map((s) => ({
                              id: s.id,
                              name: s.name,
                            })),
                            { id: '__new', name: '+ New client' },
                          ]}
                          change={(v) =>
                            edit(index, {
                              spaceId: v === 'none' ? null : v,
                              newSpace: '',
                              projectId: null,
                              newProject: '',
                            })
                          }
                        />
                        {(item.spaceId === '__new' || item.newSpace) && (
                          <Input
                            aria-label="New client name"
                            placeholder="Client name"
                            disabled={busy}
                            value={item.newSpace}
                            onChange={(e) =>
                              edit(index, { newSpace: e.target.value })
                            }
                          />
                        )}
                        <Pick
                          label="Project"
                          value={
                            item.newProject || item.projectId === '__new'
                              ? '__new'
                              : item.projectId || 'none'
                          }
                          disabled={busy || !!item.taskId}
                          options={[
                            { id: 'none', name: 'No project' },
                            ...data.projects
                              .filter(
                                (p) =>
                                  !item.spaceId || p.spaceId === item.spaceId,
                              )
                              .map((p) => ({ id: p.id, name: p.name })),
                            { id: '__new', name: '+ New project' },
                          ]}
                          change={(v) => {
                            const project = data.projects.find(
                              (p) => p.id === v,
                            );
                            edit(index, {
                              projectId: v === 'none' ? null : v,
                              newProject: '',
                              ...(project
                                ? { spaceId: project.spaceId, newSpace: '' }
                                : {}),
                            });
                          }}
                        />
                        {(item.projectId === '__new' || item.newProject) && (
                          <Input
                            aria-label="New project name"
                            placeholder="Project name"
                            disabled={busy}
                            value={item.newProject}
                            onChange={(e) =>
                              edit(index, { newProject: e.target.value })
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                  <div className="daily-plan-dates">
                    <label htmlFor={'daily-due-' + index}>
                      Deadline (optional)
                      <Input
                        id={'daily-due-' + index}
                        type="date"
                        value={item.due}
                        disabled={busy}
                        onChange={(e) => edit(index, { due: e.target.value })}
                      />
                    </label>
                    <label htmlFor={'daily-time-' + index}>
                      Finish by (optional)
                      <Input
                        id={'daily-time-' + index}
                        type="time"
                        value={item.dueTime}
                        disabled={busy}
                        onChange={(e) =>
                          edit(index, {
                            dueTime: e.target.value,
                            due: item.due || draft.day,
                          })
                        }
                      />
                    </label>
                  </div>
                </details>
                {!!item.errors.length && (
                  <div className="daily-plan-warning">
                    <p>{item.errors.join(' ')}</p>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => edit(index, { errors: [] })}
                    >
                      Use the details I selected above
                    </Button>
                  </div>
                )}
                {(item.newSpace || item.newProject || item.newProspect) && (
                  <p className="daily-plan-creates">
                    Will create{' '}
                    {item.newProspect
                      ? 'sales prospect “' + item.newProspect + '”'
                      : ''}
                    {item.newSpace ? 'client “' + item.newSpace + '”' : ''}
                    {item.newSpace && item.newProject ? ' and ' : ''}
                    {item.newProject ? 'project “' + item.newProject + '”' : ''}
                    .
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="daily-plan-delivery">
            {data.slackConnected
              ? 'Committing will post your daily plan to the connected Slack channel.'
              : 'Slack is not connected. Your plan will still be saved in Today.'}
          </p>
          <footer>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => update({ reviewed: false })}
            >
              Edit list
            </Button>
            <Button
              disabled={
                disabled ||
                !draft.items.length ||
                draft.items.some((i) => i.errors.length)
              }
              onClick={async () => {
                setLocalError('');
                if (
                  draft.items.some(
                    (i) =>
                      (i.prospectId === '__new' && !i.newProspect?.trim()) ||
                      (i.spaceId === '__new' && !i.newSpace.trim()) ||
                      (i.projectId === '__new' && !i.newProject.trim()),
                  )
                ) {
                  setLocalError('Name each new client, prospect and project.');
                  return;
                }
                const saved = await act({
                  type: 'daily-plan-commit',
                  id: draft.id,
                  day: draft.day,
                  sourceText: draft.text,
                  items: draft.items.map((i) => ({
                    ...i,
                    prospectId: i.prospectId === '__new' ? null : i.prospectId,
                    spaceId: i.spaceId === '__new' ? null : i.spaceId,
                    projectId: i.projectId === '__new' ? null : i.projectId,
                  })),
                });
                if (saved) {
                  const parent = drafts.get(draftKey);
                  if (parent)
                    drafts.set(draftKey, { ...parent, daily: undefined });
                  complete(draft.id);
                }
              }}
            >
              {busy ? 'Committing…' : 'Commit daily plan'}
            </Button>
          </footer>
        </>
      )}
      {(localError || error) && <p role="alert">{localError || error}</p>}
    </section>
  );
}
