'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Native drag/drop has the equivalent keyboard-accessible Sales stage select in each prospect workspace. */
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
}) {
  const [closed, setClosed] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const prospect = data.prospects.find((p) => p.id === selected);
  const stages = closed ? salesStages.slice(4) : salesStages.slice(0, 4);
  const move = (p: Prospect, stage: SalesStage) =>
    void act({ type: 'sales-stage', id: p.id, revision: p.revision, stage });
  const example = 'Sales meeting with "", next step: ';
  return (
    <section className="sales-pipeline">
      <header className="desk-heading">
        <div>
          <p className="os-overline">Sales / Prospects</p>
          <h1>Every conversation leads somewhere.</h1>
          <p>The relationship, the history, and a clear next step.</p>
        </div>
        <button
          className="os-button"
          onClick={() => capture(example)}
          disabled={!ready}
        >
          <Plus size={16} /> Record a conversation
        </button>
      </header>
      <button
        className="sales-capture-invitation"
        onClick={() => capture(example)}
        disabled={!ready}
      >
        <MessageSquare size={20} />
        <span>
          <strong>
            Sales meeting with “a new name”, next step: calculate lead price
          </strong>
          <small>
            One sentence records the conversation, finds or creates the
            prospect, and connects a task.
          </small>
        </span>
        <ArrowRight size={19} />
      </button>
      <div className="sales-toolbar">
        <div>
          <button
            className={!closed ? 'active' : ''}
            onClick={() => setClosed(false)}
          >
            Open pipeline{' '}
            <span>
              {
                data.prospects.filter((p) => !['Won', 'Lost'].includes(p.stage))
                  .length
              }
            </span>
          </button>
          <button
            className={closed ? 'active' : ''}
            onClick={() => setClosed(true)}
          >
            Won & lost{' '}
            <span>
              {
                data.prospects.filter((p) => ['Won', 'Lost'].includes(p.stage))
                  .length
              }
            </span>
          </button>
        </div>
        <span>Sales stage and task progress stay distinct</span>
      </div>
      {!ready ? (
        <p className="desk-empty">Loading the sales pipeline…</p>
      ) : (
        <div className={`sales-lanes ${closed ? 'closed' : ''}`}>
          {stages.map((stage) => {
            const people = data.prospects.filter((p) => p.stage === stage);
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
                          · Prospect
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
                <h3 className="brief-label">The conversation, kept.</h3>
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
