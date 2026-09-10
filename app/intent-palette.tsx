'use client';
import { inferEntryKind, type CaptureEntry } from '@/lib/entry-model';

import {
  ScanLine,
  Plus,
  ArrowRight,
  CheckCheck,
  Layers,
  BriefcaseBusiness,
  FileText,
  Circle,
} from 'lucide-react';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  briefMatches,
  buildDailyBrief,
  taskContext,
} from '@/lib/workspace-brief';
import type { Workspace } from '@/lib/model';
import { ResourceCommands } from './resource-library';
import { parseSalesCapture } from '@/lib/sales-model';
import { useWorkspaceClock } from './today';

export default function IntentPalette({
  data,
  open,
  query,
  setQuery,
  setOpen,
  openTask,
  openSpace,
  openProject,
  openDocument,
  openBrief,
  openMeeting,
  capture,
  openBoard,
  openToday,
  openProspect,
  openSales,
  openEntry,
}: {
  data: Workspace;
  open: boolean;
  query: string;
  setQuery: (q: string) => void;
  setOpen: (v: boolean) => void;
  openTask: (id: string, focus?: 'brief' | 'work') => void;
  openSpace: (id: string) => void;
  openProject: (id: string) => void;
  openDocument: (id: string) => void;
  openProspect: (id: string) => void;
  openSales: () => void;
  openEntry: (entry: CaptureEntry) => void;
  openBrief: (id: string) => void;
  openMeeting: (id: string) => void;
  capture: (text?: string) => void;
  openBoard: () => void;
  openToday: () => void;
}) {
  const now = useWorkspaceClock();
  const { requested, spaces } = briefMatches(query, data);
  const sales = parseSalesCapture(query);
  const kind = inferEntryKind(query);
  const daily = buildDailyBrief(data, now);
  const next = daily.upcoming[0];
  const go = (action: () => void) => {
    setOpen(false);
    action();
  };
  const value = (label: string) => `${query} ${label}`;
  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="What would you like to do?"
      description="Prepare a client brief, find workspace context, or capture a task."
      className="intent-dialog"
    >
      <Command loop>
        <div className="intent-palette-heading">
          <ScanLine size={17} />
          <span>Studio / Find & act</span>
          <kbd>esc</kbd>
        </div>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Try “prepare Nord” or write a task…"
        />
        <CommandList>
          <CommandEmpty>
            No matching records. Try a client name, task title, or document.
          </CommandEmpty>
          <CommandGroup
            heading={query.trim() ? 'Actions' : 'Start with an intention'}
          >
            {!query.trim() && next && (
              <CommandItem
                value="prepare next meeting"
                onSelect={() => go(() => openMeeting(next.id))}
              >
                <ScanLine size={18} />
                <span>
                  Prepare for{' '}
                  {data.spaces.find((s) => s.id === next.spaceId)?.name}
                  <small>Agenda, decisions, work, and references</small>
                </span>
                <ArrowRight size={16} />
              </CommandItem>
            )}
            {(!query.trim() ||
              /\b(review|attention|blocked)\b/i.test(query)) && (
              <CommandItem
                value={value('attention reviews')}
                onSelect={() =>
                  go(() =>
                    daily.reviews.length
                      ? openTask(daily.reviews[0].id, 'work')
                      : openToday(),
                  )
                }
              >
                <CheckCheck size={18} />
                <span>
                  {daily.reviews.length
                    ? `Review waiting work · ${daily.reviews.length}`
                    : 'See what needs attention'}
                  <small>Open the current work and its context</small>
                </span>
                <ArrowRight size={16} />
              </CommandItem>
            )}
            {(!query.trim() || /\b(board|kanban|my work)\b/i.test(query)) && (
              <CommandItem
                value={value('my board')}
                onSelect={() => go(openBoard)}
              >
                <Layers size={18} />
                <span>
                  Open my board<small>Continue, capture, and move work</small>
                </span>
                <ArrowRight size={16} />
              </CommandItem>
            )}
            {spaces.slice(0, requested ? 10 : 3).map((s) => (
              <CommandItem
                key={s.id}
                value={value(`prepare ${s.name}`)}
                onSelect={() => go(() => openBrief(s.id))}
              >
                <ScanLine size={18} />
                <span>
                  Prepare {s.name}
                  <small>Assemble a brief from connected records</small>
                </span>
                <ArrowRight size={16} />
              </CommandItem>
            ))}
            {/\b(sales|pipeline|prospects)\b/i.test(query) && (
              <CommandItem
                value={value('sales pipeline')}
                onSelect={() => go(openSales)}
              >
                <BriefcaseBusiness size={18} />
                <span>
                  Open the sales pipeline
                  <small>
                    Prospects, conversations, and connected next steps
                  </small>
                </span>
                <ArrowRight size={16} />
              </CommandItem>
            )}
            <CommandItem
              value={value('capture task')}
              onSelect={() => go(() => capture(query.trim() || undefined))}
            >
              <Plus size={18} />
              <span>
                {sales
                  ? 'Record a sales conversation & next step'
                  : query.trim()
                    ? 'Capture this ' + kind
                    : 'Capture anything'}
                <small>
                  {query.trim() ||
                    'Write naturally. Connect @clients, @projects, and dates.'}
                </small>
              </span>
              <ArrowRight size={16} />
            </CommandItem>
          </CommandGroup>
          {!!query.trim() && (
            <>
              <CommandGroup heading="Tasks">
                {data.tasks.map((t) => {
                  const context = taskContext(data, t);
                  return (
                    <CommandItem
                      key={t.id}
                      value={`${t.title} ${t.id} ${context.space?.name || ''} ${context.prospect?.name || ''} ${context.project?.name || ''}`}
                      onSelect={() => go(() => openTask(t.id))}
                    >
                      <Circle size={16} />
                      <span>
                        {t.title}
                        <small>
                          {context.space?.name ||
                            context.prospect?.name ||
                            'Internal'}
                          {context.project ? ` / ${context.project.name}` : ''}
                        </small>
                      </span>
                      <span className="command-meta">{t.stage}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandGroup heading="Prospects">
                {data.prospects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => go(() => openProspect(p.id))}
                  >
                    <BriefcaseBusiness size={16} />
                    <span>
                      {p.name}
                      <small>Prospect · {p.stage}</small>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Spaces">
                {data.spaces.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.name}
                    onSelect={() => go(() => openSpace(s.id))}
                  >
                    <BriefcaseBusiness size={16} />
                    {s.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Projects">
                {data.projects.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => go(() => openProject(p.id))}
                  >
                    <Layers size={16} />
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <ResourceCommands done={() => setOpen(false)} />
              <CommandGroup heading="Saved notes">
                {data.captureEntries
                  .filter((e) => e.kind === 'note')
                  .map((e) => (
                    <CommandItem
                      key={e.id}
                      value={
                        e.title +
                        ' ' +
                        e.body +
                        ' ' +
                        (data.spaces.find((s) => s.id === e.spaceId)?.name ||
                          '') +
                        ' ' +
                        (data.projects.find((p) => p.id === e.projectId)
                          ?.name || '')
                      }
                      onSelect={() => go(() => openEntry(e))}
                    >
                      <FileText size={16} />
                      {e.title}
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Documents">
                {data.documents.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`${d.title} ${d.collection}`}
                    onSelect={() => go(() => openDocument(d.id))}
                  >
                    <FileText size={16} />
                    {d.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        <footer className="intent-palette-footer">
          <span>Workspace actions · AI not connected</span>
          <span>↑ ↓ to move · ↵ to open</span>
        </footer>
      </Command>
    </CommandDialog>
  );
}
