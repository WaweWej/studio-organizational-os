'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Native drag/drop has the equivalent keyboard-accessible Sales stage select in each prospect workspace. */
import ProspectClientForm from './prospect-client-form';
import { useState } from 'react';
import {
  ArrowUpRight,
  Plus,
  ArrowRight,
  CircleDot,
  CheckCheck,
  MessageSquare,
  GripVertical,
} from 'lucide-react';
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
import type { Workspace } from '@/lib/model';
import { salesStages, type Prospect, type SalesStage } from '@/lib/sales-model';
import { readableDate } from './today';

export default function SalesPipeline({
  data,
  ready,
  busy,
  error,
  selected,
  select,
  capture,
  act,
  openTask,
  openClient,
  openMeeting,
  planMeeting,
}: {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  selected: string | null;
  select: (id: string | null) => void;
  capture: (text?: string) => void;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  openTask: (id: string) => void;
  openClient: (id: string) => void;
  openMeeting: (id: string) => void;
  planMeeting: (prospectId?: string) => void;
}) {
  const [created, setCreated] = useState<string | null>(null);
  const createdClient = data.prospects.find((p) => p.id === created)?.clientId;
  const [converting, setConverting] = useState<string | null>(null);
  const pipeline = data.prospects.filter((p) => !p.convertedAt);
  const conversion = pipeline.find((p) => p.id === converting);
  const [closed, setClosed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const prospect = pipeline.find((p) => p.id === selected);
  const stages = closed ? salesStages.slice(4) : salesStages;
  const move = (p: Prospect, stage: SalesStage) =>
    void act({ type: 'sales-stage', id: p.id, revision: p.revision, stage });
  const example = 'Sales meeting with "", next step: ';
  return (
    <section className="sales-pipeline">
      <header className="desk-heading">
        <div>
          <p className="os-overline">Sales / Prospects</p>
          <h1>Sales</h1>
        </div>
        <div className="sales-header-actions">
          <button
            className="os-button"
            disabled={!ready}
            onClick={() => planMeeting()}
          >
            <MessageSquare size={16} /> Meeting notes
          </button>
          <button
            className="os-button"
            onClick={() => capture(example)}
            disabled={!ready}
          >
            <Plus size={16} /> Record a conversation
          </button>
        </div>
      </header>

      {createdClient && (
        <output>
          Client record created.{' '}
          <button
            className="os-button"
            onClick={() => openClient(createdClient)}
          >
            Open client space <ArrowUpRight size={15} />
          </button>
        </output>
      )}
      <div className="sales-toolbar">
        <div>
          <button
            className={!closed ? 'active' : ''}
            onClick={() => setClosed(false)}
          >
            Full pipeline <span>{pipeline.length}</span>
          </button>
          <button
            className={closed ? 'active' : ''}
            onClick={() => setClosed(true)}
          >
            Won & lost{' '}
            <span>
              {pipeline.filter((p) => ['Won', 'Lost'].includes(p.stage)).length}
            </span>
          </button>
        </div>
        <span>Won → review details → create client record</span>
      </div>
      {error && !prospect && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p className="desk-empty">Loading the sales pipeline…</p>
      ) : (
        <div className={`sales-lanes ${closed ? 'closed' : ''}`}>
          {stages.map((stage) => {
            const people = pipeline.filter((p) => p.stage === stage);
            return (
              <section
                key={stage}
                className="sales-lane"
                aria-label={`${stage} prospects`}
                onDragOver={(e) => {
                  if (dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const p = data.prospects.find((p) => p.id === dragging);
                  if (p && !busy) move(p, stage);
                  setDragging(null);
                }}
              >
                <h2>
                  <span className={`sales-stage-dot ${stage.toLowerCase()}`} />
                  {stage}
                  <small>{people.length}</small>
                </h2>
                {people.map((p) => {
                  const tasks = data.tasks.filter((t) => t.prospectId === p.id);
                  const next = tasks
                    .filter((t) => t.stage !== 'Done')
                    .sort((a, b) => a.position - b.position)[0];
                  return (
                    <article
                      className="prospect-card"
                      key={p.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        setDragging(p.id);
                        e.dataTransfer.setData(
                          'application/x-studio-prospect',
                          p.id,
                        );
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragging(null)}
                    >
                      <button onClick={() => select(p.id)}>
                        <span className="prospect-card-top">
                          <i>{p.name.slice(0, 1)}</i>
                          <GripVertical size={14} />
                        </span>
                        <h3>{p.name}</h3>
                        <small>
                          {data.members.find((m) => m.id === p.owner)?.name ||
                            'Workspace'}{' '}
                          · {p.clientId ? 'Client' : 'Prospect'}
                        </small>
                        <span className="prospect-next">
                          <span>Next action</span>
                          <strong>{next?.title || 'No open next step'}</strong>
                          {next?.due && (
                            <small>Due {readableDate(next.due)}</small>
                          )}
                        </span>
                        <footer>
                          {tasks.filter((t) => t.stage === 'Done').length} /{' '}
                          {tasks.length} actions complete{' '}
                          <ArrowUpRight size={15} />
                        </footer>
                      </button>
                      {p.stage === 'Won' && (
                        <button
                          className="sales-create-client"
                          disabled={busy}
                          onClick={() => setConverting(p.id)}
                        >
                          Create client record <ArrowUpRight size={15} />
                        </button>
                      )}
                    </article>
                  );
                })}
                {!people.length && (
                  <p className="sales-lane-empty">
                    {stage === 'Discovery'
                      ? 'New sales conversations arrive here.'
                      : `Move a prospect here when ${stage === 'Won' ? 'the opportunity is won' : stage === 'Lost' ? 'the opportunity closes' : `it reaches ${stage.toLowerCase()}`}.`}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {conversion && (
        <ProspectClientForm
          key={conversion.id}
          prospect={conversion}
          data={data}
          busy={busy}
          error={error}
          act={act}
          close={() => setConverting(null)}
          complete={() => {
            setCreated(conversion.id);
            setConverting(null);
            select(null);
          }}
        />
      )}
      <Sheet open={!!prospect} onOpenChange={(open) => !open && select(null)}>
        <SheetContent className="prospect-sheet">
          <SheetHeader>
            <SheetTitle>Prospect workspace</SheetTitle>
            <SheetDescription>
              The conversation and the work it leads to.
            </SheetDescription>
          </SheetHeader>
          {prospect && (
            <div className="sheet-body">
              <p className="os-overline">Sales / Prospect</p>
              <h2 className="task-title">{prospect.name}</h2>
              {error && (
                <p className="error-banner" role="alert">
                  {error}
                </p>
              )}
              <div className="prospect-stage-control">
                <span>Sales stage</span>
                <Select
                  value={prospect.stage}
                  onValueChange={(stage) =>
                    stage && move(prospect, stage as SalesStage)
                  }
                >
                  <SelectTrigger disabled={busy} aria-label="Sales stage">
                    <SelectValue>{prospect.stage}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {salesStages.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {prospect.stage === 'Won' && (
                <button
                  className="os-button"
                  disabled={busy}
                  onClick={() => {
                    select(null);
                    setConverting(prospect.id);
                  }}
                >
                  Create client record <ArrowUpRight size={16} />
                </button>
              )}
              {prospect.clientId &&
                data.spaces.some((s) => s.id === prospect.clientId) && (
                  <button
                    className="os-button"
                    onClick={() => {
                      select(null);
                      openClient(prospect.clientId!);
                    }}
                  >
                    Open client space <ArrowUpRight size={16} />
                  </button>
                )}
              <button
                className="os-button"
                disabled={!ready}
                onClick={() => {
                  select(null);
                  capture(`Sales meeting with "${prospect.name}", next step: `);
                }}
              >
                <Plus size={15} /> Record the next conversation
              </button>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>Meetings</h3>
                  <button
                    className="os-button"
                    disabled={busy}
                    onClick={() => {
                      select(null);
                      planMeeting(prospect.id);
                    }}
                  >
                    <Plus size={15} /> Add meeting
                  </button>
                </div>
                {data.meetings
                  .filter((m) => m.prospectId === prospect.id)
                  .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
                  .map((m) => (
                    <button
                      key={m.id}
                      className="brief-work-row"
                      onClick={() => {
                        select(null);
                        openMeeting(m.id);
                      }}
                    >
                      <MessageSquare size={17} />
                      <span>
                        <strong>{m.title}</strong>
                        <small>
                          {readableDate(m.startsAt, true)} · {m.status}
                        </small>
                      </span>
                      <span>Open notes</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                {!data.meetings.some((m) => m.prospectId === prospect.id) && (
                  <p className="desk-empty">No meetings recorded.</p>
                )}
              </section>
              <section className="brief-section">
                <div className="desk-section-heading">
                  <h3>Connected next steps</h3>
                  <span className="section-caption">
                    Also on the work board
                  </span>
                </div>
                {data.tasks
                  .filter((t) => t.prospectId === prospect.id)
                  .map((t) => (
                    <button
                      className="brief-work-row"
                      key={t.id}
                      onClick={() => {
                        select(null);
                        openTask(t.id);
                      }}
                    >
                      {t.stage === 'Done' ? (
                        <CheckCheck size={17} />
                      ) : (
                        <CircleDot size={17} />
                      )}
                      <span>
                        <strong>{t.title}</strong>
                        <small>
                          {data.members.find((m) => m.id === t.assignee)?.name}
                          {t.due ? ` · ${readableDate(t.due)}` : ''}
                        </small>
                      </span>
                      <span className="brief-state">{t.stage}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </section>
              <section className="brief-section">
                <h3 className="brief-label">Conversation history</h3>
                {data.prospectEvents
                  .filter((e) => e.prospectId === prospect.id)
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((e) => (
                    <div className="prospect-event" key={e.id}>
                      <span>
                        {e.kind === 'meeting' ? (
                          <MessageSquare size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )}
                      </span>
                      <div>
                        <p>{e.body}</p>
                        <small>
                          {readableDate(e.createdAt, true)} ·{' '}
                          {data.members.find((m) => m.id === e.actor)?.name}
                        </small>
                      </div>
                    </div>
                  ))}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
