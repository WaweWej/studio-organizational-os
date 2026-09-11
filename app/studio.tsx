'use client';
import { taskSpaceId } from '@/lib/task-context';
import { localDay } from '@/lib/workspace-brief';
import WorkingDesk, { ConnectedNotes, CapturedNote } from './working-desk';
import type { CaptureEntry } from '@/lib/entry-model';
import { DraftCache } from '@/lib/draft-cache';
import MeetingPanel, { type MeetingTarget } from './meeting-panel';
import ClientFocus from './client-focus';
import SalesPipeline from './sales-pipeline';
import Today, { readableDate } from './today';
import ContextBrief from './context-brief';
import IntentPalette from './intent-palette';
import ConnectionCoverage from './connection-coverage';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import WorkBoard from './work-board';
import ReviewRequest from './review-request';
import QuickCapture, { type CaptureDraft } from './quick-capture';
import ClientDirectory from './client-directory';
import SharedCalendar from './shared-calendar';
import { useGoogleCalendarSync } from './google-calendar';
import ResourceLibrary, {
  ResourceProvider,
  RelatedResources,
  BlueprintRegistry,
} from './resource-library';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  Sun,
  CalendarDays,
  Columns3,
  BookOpen,
  Layers,
  BriefcaseBusiness,
  Handshake,
  Workflow,
  Search,
  Bell,
  Plus,
  ChevronRight,
  ArrowUpRight,
  Check,
  FileText,
  Inbox,
  PanelTop,
  LoaderCircle,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  stages,
  emptyWorkspace,
  type Workspace,
  type Task,
  type Member,
} from '@/lib/model';

const navigation = [
  { id: 'desk', name: 'Desk', icon: PanelTop },
  { id: 'day', name: 'Today', icon: Sun },
  { id: 'boards', name: 'Boards', icon: Columns3 },
  { id: 'spaces', name: 'Spaces', icon: BriefcaseBusiness },
  { id: 'sales', name: 'Sales', icon: Handshake },
  { id: 'work', name: 'Projects', icon: Layers },
  { id: 'calendar', name: 'Calendar', icon: CalendarDays },
  { id: 'library', name: 'Library', icon: BookOpen },
  { id: 'blueprints', name: 'Systems', icon: Workflow },
];
const pages = [
  ...navigation.map((n) => n.id),
  'tools',
  'insights',
  'organization',
  'sales',
];
const parentPage = (page: string) =>
  ({
    tools: 'library',
    insights: 'blueprints',
  })[page] || page;
function Avatar({
  member,
  small = false,
}: {
  member?: Member;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? 'small' : ''}`}
      style={{ '--member-color': member?.color || '#778291' } as CSSProperties}
      aria-label={member?.name}
    >
      {member?.name.slice(0, 2) || '?'}
    </span>
  );
}
function Picker({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="field-picker">
        <SelectValue>
          {items.find((i) => i.value === value)?.label || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Studio() {
  const captureDrafts = useRef(new DraftCache<CaptureDraft>());
  const [capturedNoteId, setCapturedNoteId] = useState<string | null>(null);
  const [prospectId, setProspectId] = useState<string | null>(null);
  const [deskTaskId, setDeskTaskId] = useState<string | null>(null);
  const [intentQuery, setIntentQuery] = useState('');
  const [briefSpaceId, setBriefSpaceId] = useState<string | null>(null);
  const [meetingTarget, setMeetingTarget] = useState<MeetingTarget | null>(null);
  const [captureKey, setCaptureKey] = useState(0);
  const [captureRequested, setCaptureRequested] = useState(0);
  const [taskFocus, setTaskFocus] = useState<'brief' | 'work' | undefined>(
    undefined,
  );
  const [data, setData] = useState<Workspace>(emptyWorkspace),
    [ready, setReady] = useState(false),
    [page, setPage] = useState('desk'),
    [scope, setScope] = useState('mine'),
    [selected, setSelected] = useState<string | null>(null),
    [spaceId, setSpaceId] = useState<string | null>(null),
    [projectId, setProjectId] = useState<string | null>(null),
    [create, setCreate] = useState(false),
    [search, setSearch] = useState(false),
    [notices, setNotices] = useState(false),
    [documentId, setDocumentId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [needsSignIn, setNeedsSignIn] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch('/api/workspace');
    if (r.status === 401) {
      setReady(false);
      captureDrafts.current.configure("locked", null);
      setNeedsSignIn(true);
      return;
    }
    const body = (await r.json()) as Workspace & { error?: string };
    if (!r.ok) throw new Error(body.error || 'Unable to load the workspace.');
    let draftStorage: Storage | null = null;
    try { draftStorage = window.sessionStorage; } catch { /* Recovery may be disabled by browser policy. */ }
    captureDrafts.current.configure(body.draftScope || body.currentMember, draftStorage);
    setData(body);
    setReady(true);
    setNeedsSignIn(false);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useGoogleCalendarSync(ready && !!data.googleCalendar?.connected && data.googleCalendar.status !== 'reconnect', refresh);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!selected && !busy && !create) refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [selected, busy, create, refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIntentQuery('');
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    const params = new URLSearchParams(window.location.search);
    if (pages.includes(params.get('view') || '')) setPage(params.get('view')!);
    if (params.get('view') === 'boards') {
      setScope(params.get('scope') === 'team' ? 'team' : 'mine');
    }
    if (params.get('prospect')) {
      setPage('sales');
      setProspectId(params.get('prospect'));
    }
    if (params.get('desk') === '1') {
      setPage('desk');
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'desk');
      url.searchParams.delete('desk');
      window.history.replaceState(null, '', url);
    }
    if (params.get('task')) setSelected(params.get('task'));
    if (params.get('project')) {
      setPage('work');
      setProjectId(params.get('project'));
    }
    if (params.get('space')) {
      setPage('spaces');
      setSpaceId(params.get('space'));
    }
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (
      page === 'desk' ||
      page === 'boards' ||
      page === 'day' ||
      (page === 'work' && !!projectId) ||
      prospectId ||
      capturedNoteId ||
      !ready ||
      search ||
      create ||
      selected ||
      briefSpaceId ||
      notices ||
      documentId
    )
      return;
    const key = (e: KeyboardEvent) => {
      if (
        e.key !== 'Enter' ||
        e.defaultPrevented ||
        e.isComposing ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey
      )
        return;
      if (
        (e.target as HTMLElement | null)?.closest(
          'input,textarea,select,button,a,[contenteditable="true"],[role="combobox"]',
        ) ||
        document.querySelector(
          '[role="dialog"],[role="alertdialog"],[role="menu"]',
        )
      )
        return;
      e.preventDefault();
      setCreate(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [
    page,
    prospectId,
    capturedNoteId,
    projectId,
    ready,
    search,
    create,
    selected,
    briefSpaceId,
    notices,
    documentId,
  ]);
  const openIntent = (query = '') => {
    setIntentQuery(query);
    setSearch(true);
  };
  const capture = (text?: string) => {
    if (text)
      captureDrafts.current.set('overlay', {
        text,
        pins: [],
        contextProject: projectId,
        contextSpace: spaceId,
      });
    setCaptureKey((v) => v + 1);
    setCreate(true);
  };
  const openTask = (id: string, focus?: 'brief' | 'work') => {
    setTaskFocus(focus);
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.replaceState(null, '', url);
  };
  const closeTask = () => {
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.replaceState(null, '', url);
  };
  const act = async (command: Record<string, unknown>) => {
    if (busy || !ready) return false;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const body = (await r.json()) as Workspace & { error?: string };
      if (!r.ok)
        throw new Error(body.error || 'The change could not be saved.');
      setData(body);
      setMessage('Saved to your workspace');
      window.dispatchEvent(new Event('studio-work-saved'));
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The change could not be saved.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const updateSpaceUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('desk');
    if (id) url.searchParams.set('space', id);
    else url.searchParams.delete('space');
    window.history.replaceState(null, '', url);
  };
  const navigate = (id: string) => {
    updateSpaceUrl(null);
    const url = new URL(window.location.href);
    url.searchParams.set('view', id);
    url.searchParams.delete('scope');
    if (id === 'boards') url.searchParams.set('scope', scope);
    url.searchParams.delete('project');
    url.searchParams.delete('prospect');
    url.searchParams.delete('desk');
    window.history.replaceState(null, '', url);
    setPage(id);
    setProspectId(null);
    setSpaceId(null);
    setProjectId(null);
    closeTask();
    setError('');
  };
  const space = (id: string) => {
    updateSpaceUrl(id);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'spaces');
    url.searchParams.delete('project');
    url.searchParams.delete('prospect');
    window.history.replaceState(null, '', url);
    setPage('spaces');
    setSpaceId(id);
    setProjectId(null);
    closeTask();
  };
  const project = (id: string) => {
    updateSpaceUrl(null);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'work');
    url.searchParams.set('project', id);
    url.searchParams.delete('prospect');
    window.history.replaceState(null, '', url);
    setPage('work');
    setProjectId(id);
    setSpaceId(null);
    closeTask();
  };
  const selectProspect = (id: string | null) => {
    setProspectId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('prospect', id);
    else url.searchParams.delete('prospect');
    window.history.replaceState(null, '', url);
  };
  const openProspect = (id: string) => {
    navigate('sales');
    selectProspect(id);
  };
  const openMeeting = (_clientId: string | null, meetingId: string) => {
    setMeetingTarget({meetingId});
    setBriefSpaceId(null);
  };
  const openBoard = (mode = 'mine') => {
    navigate('boards');
    setScope(mode);
    const url = new URL(window.location.href);
    url.searchParams.set('scope', mode);
    window.history.replaceState(null, '', url);
  };
  const openDailyPlan = () => {
    const draft = captureDrafts.current.get('workspace');
    if (!draft?.text.trim())
      captureDrafts.current.set('workspace', {
        text: 'Plan my day',
        pins: [],
        contextProject: null,
        contextSpace: null,
      });
    navigate('desk');
  };
  const openEntry = (entry: CaptureEntry) => {
    setCreate(false);
    if (entry.targetType === 'note') setCapturedNoteId(entry.id);
    else if (entry.targetType === 'plan') navigate('day');
    else if (entry.targetType === 'meeting' && entry.spaceId)
      openMeeting(entry.spaceId, entry.targetId);
    else if (entry.targetType === 'project') project(entry.targetId);
    else openTask(entry.targetId);
  };
  const currentTask = data.tasks.find((t) => t.id === selected),
    currentSpace = data.spaces.find((s) => s.id === spaceId),
    currentProject = data.projects.find((p) => p.id === projectId),
    doc = data.documents.find((d) => d.id === documentId);
  const shown = data.tasks
    .filter(
      (t) =>
        page !== 'boards' ||
        scope === 'team' ||
        t.assignee === data.currentMember,
    )
    .filter((t) => !projectId || t.projectId === projectId)
    .filter((t) => !spaceId || taskSpaceId(data, t) === spaceId)
    .sort((a, b) => a.position - b.position);
  const renderBoard = (tasks: Task[], personal = false) => (
    <WorkBoard
      key={(data.draftScope || 'loading') + ':' + (projectId || 'workspace')}
      data={data}
      tasks={tasks}
      archivedTasks={(data.archivedTasks || []).filter(
        (t) =>
          (!projectId || t.projectId === projectId) &&
          (!spaceId || taskSpaceId(data, t) === spaceId) &&
          ((!personal && page !== 'boards') ||
            (!personal && scope === 'team') ||
            t.assignee === data.currentMember),
      )}
      ready={ready}
      busy={busy}
      error={error}
      act={(command) =>
        act(
          page === 'day' &&
            ['create', 'quick-create'].includes(String(command.type))
            ? { ...command, plannedFor: localDay(new Date()) }
            : command,
        )
      }
      openTask={openTask}
      projectId={projectId}
      captureRequested={captureRequested}
      enabled={
        !selected &&
        !search &&
        !notices &&
        !create &&
        !documentId &&
        !capturedNoteId &&
        !briefSpaceId
      }
      onOpenEntry={openEntry}
      drafts={captureDrafts.current}
    />
  );
  const board = renderBoard(shown);
  return (
    <ResourceProvider
      data={data}
      ready={ready}
      busy={busy}
      error={error}
      act={act}
      refresh={refresh}
    >
      <SidebarProvider
        className="studio-os"
        style={{ '--sidebar-width': '104px' } as CSSProperties}
      >
        <Sidebar className="studio-sidebar">
          <SidebarHeader className="brand">
            <span className="brand-symbol">
              <Layers size={19} />
            </span>
            <strong>studio</strong>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {navigation.map((n) => (
                  <SidebarMenuItem key={n.id}>
                    <SidebarMenuButton
                      isActive={parentPage(page) === n.id}
                      onClick={() => navigate(n.id)}
                      className="nav-item"
                    >
                      <n.icon size={18} />
                      <span>{n.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <button
              className="rail-workspace"
              onClick={() => navigate('organization')}
              aria-label="Workspace, people and documents"
            >
              <Avatar
                member={data.members.find((m) => m.id === data.currentMember)}
              />
              <span>Workspace</span>
            </button>
          </SidebarFooter>
        </Sidebar>
        <div className="studio-main">
          <header className="topbar">
            <div className="crumb">
              <SidebarTrigger />
              {page !== 'desk' && (
                <>
                  <span>Studio</span>
                  <ChevronRight size={14} />
                </>
              )}
              <strong>
                {currentSpace?.name ||
                  currentProject?.name ||
                  (page === 'organization'
                    ? 'Workspace'
                    : navigation.find((n) => n.id === parentPage(page))?.name)}
              </strong>
            </div>
            <div className="top-actions">
              <button className="search-button" onClick={() => openIntent()}>
                <Search size={16} />
                <span>Find or do anything</span>
                <kbd>⌘ / Ctrl K</kbd>
              </button>
              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() => setNotices(true)}
              >
                <Bell size={19} />
                {data.notices.some(
                  (n) => !n.read && n.recipient === data.currentMember,
                ) && <span className="notification-dot" />}
              </button>
              {page !== 'desk' && (
                <span className="top-workspace-state">
                  {data.environment === 'local' ? 'Local preview' : 'Private workspace'}
                </span>
              )}
            </div>
          </header>
          <main
            className={
              'workspace-content' + (page === 'desk' ? ' desk-page' : '')
            }
          >
            <nav className="context-nav" aria-label="Workspace views">
              {page === 'boards' && (
                <>
                  <button
                    className={scope === 'mine' ? 'active' : ''}
                    aria-current={scope === 'mine' ? 'page' : undefined}
                    onClick={() => openBoard('mine')}
                  >
                    My board
                  </button>
                  <button
                    className={scope === 'team' ? 'active' : ''}
                    aria-current={scope === 'team' ? 'page' : undefined}
                    onClick={() => openBoard('team')}
                  >
                    Team board
                  </button>
                </>
              )}
              {['blueprints', 'insights'].includes(page) && (
                <>
                  <button
                    className={page === 'blueprints' ? 'active' : ''}
                    onClick={() => navigate('blueprints')}
                  >
                    Processes
                  </button>
                  <button
                    className={page === 'insights' ? 'active' : ''}
                    onClick={() => navigate('insights')}
                  >
                    Connection coverage
                  </button>
                </>
              )}
              {currentSpace && (
                <button
                  className="context-prepare"
                  onClick={() => setBriefSpaceId(currentSpace.id)}
                >
                  Prepare client brief <ArrowUpRight size={14} />
                </button>
              )}
            </nav>
            {![
              'desk',
              'day',
              'sales',
              'spaces',
              'calendar',
              'library',
              'tools',
              'insights',
            ].includes(page) && (
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {new Intl.DateTimeFormat('en', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    }).format(new Date())}
                  </p>
                  <h1>
                    {currentProject?.name ||
                      {
                        day: 'My day',
                        work: 'Projects',
                        spaces: 'A space for every client',
                        blueprints: 'Process blueprints',
                        tools: 'Your tools',
                        insights: 'Insights',
                        organization: 'The organization',
                      }[page]}
                  </h1>
                  <p className="subtitle">
                    {currentProject?.description ||
                      {
                        day: 'Pick up where you left off.',
                        work: '',
                        spaces:
                          'Clients, owned platforms, and everything connected to them.',
                        blueprints:
                          'Understand the journey. Know what connects.',
                        tools: 'Every tool has a purpose and a place.',
                        insights:
                          'Understand what is happening, with evidence.',
                        organization:
                          'The practical things, in one shared place.',
                      }[page]}
                  </p>
                </div>
                {['day', 'work'].includes(page) && (
                  <Button
                    className="primary-button"
                    onClick={() => {
                      if (page === 'day' || projectId)
                        setCaptureRequested((v) => v + 1);
                      else setCreate(true);
                    }}
                    disabled={!ready}
                  >
                    <Plus size={16} />
                    Capture
                  </Button>
                )}
              </div>
            )}
            {needsSignIn && (
              <div className="attention-box">
                <span>Sign in to open your private workspace.</span>
                <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                  Sign in with ChatGPT →
                </a>
              </div>
            )}
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <button
                  onClick={() => {
                    setError('');
                    void refresh().catch((e) => setError(e.message));
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {!ready && !needsSignIn && !error && (
              <div className="connection-bar">
                <LoaderCircle size={16} className="animate-spin" />
                Opening your workspace…
              </div>
            )}
            {page === 'desk' && ready && (
              <WorkingDesk
                openMeeting={id=>setMeetingTarget({meetingId:id})}
                key={data.draftScope || "loading"}
                data={data}
                ready={ready}
                busy={busy}
                error={error}
                act={act}
                drafts={captureDrafts.current}
                openEntry={openEntry}
                focusTaskId={deskTaskId}
                setFocusTask={setDeskTaskId}
                openTask={openTask}
                enabled={
                  !selected &&
                  !create &&
                  !search &&
                  !notices &&
                  !briefSpaceId &&
                  !capturedNoteId
                }
              />
            )}
            {page === 'day' && (
              <Today
                data={data}
                error={error}
                openMeeting={openMeeting}
                ready={ready}
                openTask={openTask}
                openBrief={setBriefSpaceId}
                openPlan={openDailyPlan}
                renderBoard={(tasks) => renderBoard(tasks, true)}
                act={act}
                busy={busy}
                openBoard={() => openBoard()}
                openCalendar={() => navigate('calendar')}
                openCalendarMeeting={id=>setMeetingTarget({calendarId:id})}
              />
            )}
            {page === 'boards' && (
              <>
                <div className="board-page-heading">
                  <div>
                    <h1>{scope === 'team' ? 'Team board' : 'My board'}</h1>
                  </div>
                  <span className="quiet-meta">
                    {shown.filter((t) => t.stage !== 'Done').length} open tasks
                  </span>
                </div>
                {board}
              </>
            )}
            {page === 'work' &&
              (projectId ? (
                <>
                  <button
                    className="back-link"
                    onClick={() => navigate('work')}
                  >
                    ← All projects
                  </button>
                  {board}
                  <ConnectedNotes
                    data={data}
                    target={{ type: 'project', id: projectId }}
                  />
                  <RelatedResources
                    target={{ type: 'project', id: projectId }}
                  />
                </>
              ) : (
                <>
                  <div className="section-toolbar">
                    <span className="quiet-meta">
                      Client projects and internal work
                    </span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void act({ type: 'template', spaceId: 'nord' })
                      }
                      disabled={!ready || busy}
                    >
                      <Plus size={15} />
                      Use campaign template
                    </Button>
                  </div>
                  <div className="project-grid">
                    {data.projects.map((p) => {
                      const s = data.spaces.find((s) => s.id === p.spaceId),
                        tasks = data.tasks.filter((t) => t.projectId === p.id),
                        done = tasks.filter((t) => t.stage === 'Done').length;
                      return (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => project(p.id)}
                        >
                          <span className="card-context">
                            <span
                              className="brand-dot"
                              style={{ background: s?.color || '#8491a2' }}
                            />
                            {s?.name || 'Internal'}
                          </span>
                          <h2>{p.name}</h2>
                          <p>{p.description}</p>
                          <div className="progress-track">
                            <div
                              style={{
                                width: tasks.length
                                  ? `${(done / tasks.length) * 100}%`
                                  : '0%',
                              }}
                            />
                          </div>
                          <footer>
                            <span>
                              {done} of {tasks.length} tasks complete
                            </span>
                            <ArrowUpRight size={16} />
                          </footer>
                        </button>
                      );
                    })}
                  </div>
                </>
              ))}
            {page === 'sales' && (
              <SalesPipeline
                data={data}
                ready={ready}
                busy={busy}
                error={error}
                selected={prospectId}
                select={selectProspect}
                capture={capture}
                act={act}
                openTask={openTask}
                openClient={space}
                openMeeting={id=>setMeetingTarget({meetingId:id})}
                planMeeting={prospectId=>setMeetingTarget({prospectId})}
              />
            )}
            {page === 'calendar' && (
              <SharedCalendar
                refresh={refresh}
                data={data}
                ready={ready}
                busy={busy}
                error={error}
                act={act}
                openTask={openTask}
                openProject={project}
                openSpace={space}
                openMeeting={id=>setMeetingTarget({meetingId:id})}
                openCalendarMeeting={id=>setMeetingTarget({calendarId:id})}
              />
            )}
            {page === 'spaces' &&
              (currentSpace ? (
                <ClientFocus
                  key={currentSpace.id}
                  space={currentSpace}
                  data={data}
                  busy={busy}
                  ready={ready}
                  error={error}
                  act={act}
                  openTask={openTask}
                  openProject={project}
                  back={() => navigate('spaces')}
                />
              ) : (
                <ClientDirectory
                  data={data}
                  openSpace={space}
                  act={act}
                  ready={ready}
                />
              ))}
            {page === 'library' && <ResourceLibrary key="library" />}
            {page === 'tools' && <ResourceLibrary key="tools" mode="tools" />}
            {page === 'organization' && (
              <div className="client-columns">
                <section className="surface">
                  <span className="eyebrow">PEOPLE & CULTURE</span>
                  <h2>The shared library</h2>
                  {data.documents.map((d) => (
                    <button
                      className="resource-row"
                      key={d.id}
                      onClick={() => setDocumentId(d.id)}
                    >
                      <FileText size={18} />
                      <span>
                        {d.title}
                        <small>{d.collection}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </section>
                <section className="surface">
                  <h2>The team</h2>
                  {data.members.map((m) => (
                    <div className="member-row" key={m.id}>
                      <Avatar member={m} />
                      <span>
                        {m.name}
                        <small>{m.role}</small>
                      </span>
                    </div>
                  ))}
                  <p className="muted small-text">
                    Workspace invitations are not available yet.
                  </p>
                </section>
              </div>
            )}
            {page === 'blueprints' && <BlueprintRegistry />}
            {page === 'insights' && (
              <ConnectionCoverage
                data={data}
                ready={ready}
                openTools={() => navigate('tools')}
              />
            )}
            {(busy || message) && <div
              className={
                'save-status' + (page === 'desk' ? ' desk-global-status' : '')
              }
              role="status"
              aria-live="polite"
            >
              {busy ? (
                <>
                  <LoaderCircle size={13} className="animate-spin" />
                  Saving…
                </>
              ) : message ? (
                <>
                  <Check size={13} />
                  {message}
                </>
              ) : (
                <>
                  <span className="status-dot" />
                  {ready
                    ? 'Saved'
                    : 'Connecting to your workspace'}
                </>
              )}
            </div>}
          </main>
        </div>
        {ready && meetingTarget && <MeetingPanel key={JSON.stringify(meetingTarget)+data.draftScope} target={meetingTarget} data={data} busy={busy} error={error} act={act} close={()=>setMeetingTarget(null)} openTask={openTask} />}
        <ContextBrief
          data={data}
          spaceId={briefSpaceId}
          close={() => setBriefSpaceId(null)}
          openSpace={space}
          openTask={openTask}
          openProject={project}
          openMeeting={openMeeting}
        />
        <Sheet
          open={!!currentTask}
          onOpenChange={(open) => !open && closeTask()}
        >
          <SheetContent className="task-sheet" showCloseButton>
            <SheetHeader>
              <SheetTitle>Task workspace</SheetTitle>
              <SheetDescription>
                Brief, work, and review in one place.
              </SheetDescription>
            </SheetHeader>
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            {currentTask && (
              <TaskDetail
                key={currentTask.id + ':' + (taskFocus || 'default')}
                openProspect={openProspect}
                initialTab={taskFocus}
                error={error}
                task={currentTask}
                data={data}
                busy={busy}
                act={act}
                openProject={project}
                openSpace={space}
                openMeetingNotes={() => {closeTask();setMeetingTarget({taskId:currentTask.id});}}
              />
            )}
          </SheetContent>
        </Sheet>
        <Dialog open={create} onOpenChange={setCreate}>
          <DialogContent className="create-dialog universal-capture-dialog">
            <DialogHeader>
              <DialogTitle>Capture what’s on your mind</DialogTitle>
              <DialogDescription>
                A note, task, meeting, or deadline. See where it belongs.
              </DialogDescription>
            </DialogHeader>
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            <QuickCapture
              key={captureKey}
              draftId="overlay"
              spaceId={spaceId}
              onOpenEntry={openEntry}
              data={data}
              ready={ready}
              busy={busy}
              error={error}
              act={act}
              projectId={projectId}
              close={() => setCreate(false)}
              drafts={captureDrafts.current}
              onCreated={() => {}}
            />
          </DialogContent>
        </Dialog>
        <CapturedNote
          entry={data.captureEntries.find((e) => e.id === capturedNoteId)}
          data={data}
          close={() => setCapturedNoteId(null)}
          openSpace={space}
          openProject={project}
          openTask={openTask}
        />
        <IntentPalette
          openMeeting={id=>setMeetingTarget({meetingId:id})}
          openEntry={openEntry}
          openSales={() => navigate('sales')}
          openProspect={openProspect}
          data={data}
          open={search}
          setOpen={setSearch}
          query={intentQuery}
          setQuery={setIntentQuery}
          openTask={openTask}
          openSpace={space}
          openProject={project}
          openDocument={setDocumentId}
          openBrief={setBriefSpaceId}
          capture={capture}
          openBoard={() => openBoard()}
          openToday={() => navigate('day')}
        />
        <Sheet open={notices} onOpenChange={setNotices}>
          <SheetContent className="notification-sheet">
            <SheetHeader>
              <SheetTitle>Your inbox</SheetTitle>
              <SheetDescription>
                Review requests and changes that need you.
              </SheetDescription>
            </SheetHeader>
            <div className="sheet-body">
              {data.notices.length ? (
                data.notices.map((n) => (
                  <button
                    className="notice-row"
                    key={n.id}
                    onClick={() => {
                      void act({ type: 'read-notice', id: n.id });
                      setNotices(false);
                      openTask(n.taskId);
                    }}
                  >
                    <Inbox size={18} />
                    <span>
                      {n.body}
                      <small>{new Date(n.createdAt).toLocaleString()}</small>
                    </span>
                    {!n.read && <span className="status-dot" />}
                  </button>
                ))
              ) : (
                <p className="muted">
                  You’re caught up. New review requests will appear here.
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>
        <Dialog
          open={!!doc}
          onOpenChange={(open) => !open && setDocumentId(null)}
        >
          <DialogContent className="document-dialog">
            <DialogHeader>
              <DialogTitle>{doc?.title}</DialogTitle>
              <DialogDescription>{doc?.collection}</DialogDescription>
            </DialogHeader>
            <div className="document-content">{doc?.body}</div>
          </DialogContent>
        </Dialog>
      </SidebarProvider>
    </ResourceProvider>
  );
}
function TaskDetail({
  openProspect,
  initialTab,
  error,
  task,
  data,
  busy,
  act,
  openProject,
  openSpace,
  openMeetingNotes,
}: {
  openProspect: (id: string) => void;
  initialTab?: 'brief' | 'work';
  error: string;
  task: Task;
  data: Workspace;
  busy: boolean;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  openProject: (id: string) => void;
  openSpace: (id: string) => void;
  openMeetingNotes: () => void;
}) {
  const [tab, setTab] = useState<string>(
      initialTab || (task.stage === 'Review' ? 'work' : 'brief'),
    ),
    [assignee, setAssignee] = useState(task.assignee),
    [requestingReview, setRequestingReview] = useState(false),
    [feedback, setFeedback] = useState(''),
    [note, setNote] = useState('');
  const prospect = data.prospects.find((p) => p.id === task.prospectId);
  const project = data.projects.find((p) => p.id === task.projectId),
    space = data.spaces.find((s) => s.id === taskSpaceId(data, task)),
    member = data.members.find((m) => m.id === task.assignee),
    reviews = data.reviews.filter((r) => r.taskId === task.id),
    currentReview = reviews.find(
      (r) =>
        r.version === task.version &&
        ['Pending', 'Approved'].includes(r.decision),
    );
  const cmd = (type: string, extra: Record<string, unknown> = {}) =>
    act({ type, id: task.id, revision: task.revision, ...extra });
  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void cmd('edit', {
      title: f.get('title'),
      description: f.get('description'),
      due: f.get('due'),
      dueTime: f.get('dueTime'),
      blocked: f.get('blocked'),
      assignee,
      reviewer: task.reviewer,
    });
  };
  return (
    <div className="sheet-body">
      {requestingReview && <ReviewRequest task={task} data={data} busy={busy} error={error} act={act} close={() => setRequestingReview(false)} />}
      <div className="task-breadcrumb">
        {space && (
          <button onClick={() => openSpace(space.id)}>{space.name}</button>
        )}
        {project && (
          <>
            <ChevronRight size={12} />
            <button onClick={() => openProject(project.id)}>
              {project.name}
            </button>
          </>
        )}
      </div>
      <h2 className="task-title">{task.title}</h2>
      <div className="task-meta">
        <Picker
          label="Task stage"
          value={task.stage}
          onChange={(stage) => stage === 'Review' && task.stage !== 'Review' ? setRequestingReview(true) : void cmd('move', { stage })}
          items={stages.map((s) => ({ value: s, label: s }))}
        />
        <Avatar member={member} small />
        <span>{member?.name}</span>
        {task.version > 0 && <span className="quiet-meta">Version {task.version}</span>}
        {task.stage !== 'Done' && <Button disabled={busy} onClick={() => void cmd('complete')}>Complete task</Button>}
      </div>
      {task.blocked && (
        <div className="blocked-note">Blocked · {task.blocked}</div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="detail-tabs">
          <TabsTrigger value="brief">Overview</TabsTrigger>
          <TabsTrigger value="work">Work & review</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'brief' && (
        <>
          {prospect && !prospect.convertedAt && (
            <section className="task-client-context">
              <header>
                <strong>{prospect.name} · Prospect</strong>
                <button onClick={() => openProspect(prospect.id)}>
                  Open sales history <ArrowUpRight size={13} />
                </button>
              </header>
              <p>
                Sales stage: {prospect.stage}. This next step stays connected to
                the original conversation.
              </p>
            </section>
          )}
          {space && (
            <section className="task-client-context">
              <header>
                <strong>{space.name}</strong>
                <button onClick={() => openSpace(space.id)}>
                  Brief, meetings & notes
                  <ArrowUpRight size={13} />
                </button>
              </header>
              <p>{space.brief}</p>
            </section>
          )}
          <section className="task-client-context">
            <header><strong>{data.meetings.find(m=>m.id===task.meetingId)?.title || 'Meeting'}</strong><button disabled={busy} onClick={openMeetingNotes}>{task.meetingId ? 'Open meeting notes' : 'Link meeting & take notes'} <ArrowUpRight size={13}/></button></header>
          </section>
          <section className="task-read-brief">
            <p>
              {task.description ||
                'Add a brief so the next step has the context it needs.'}
            </p>
            <dl>
              <div>
                <dt>Deadline</dt>
                <dd>{readableDate(task.due)}</dd>
              </div>
              <div>
                <dt>Reviewer</dt>
                <dd>
                  {task.stage === 'Review' ? data.members.find((m) => m.id === task.reviewer)?.name || 'Unassigned' : 'Not requested'}
                </dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{task.priority || 'Normal'}</dd>
              </div>
            </dl>
          </section>
          <Collapsible className="task-edit-disclosure">
            <CollapsibleTrigger className="task-edit-trigger">
              Edit task details <ChevronRight size={15} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <form className="edit-form" onSubmit={save}>
                <label>
                  Task name
                  <Input
                    name="title"
                    defaultValue={task.title}
                    required
                    maxLength={180}
                  />
                </label>
                <label>
                  The brief
                  <Textarea
                    name="description"
                    defaultValue={task.description}
                    rows={7}
                  />
                </label>
                <div className="field-grid">
                  <label>
                    Responsible
                    <Picker
                      label="Responsible"
                      value={assignee}
                      onChange={setAssignee}
                      items={data.members.map((m) => ({
                        value: m.id,
                        label: m.name,
                      }))}
                    />
                  </label>
                  <label>
                    Due date
                    <Input name="due" type="date" defaultValue={task.due} />
                  </label>
                  <label>
                    Finish by (optional)
                    <Input
                      name="dueTime"
                      type="time"
                      defaultValue={task.dueTime || ''}
                    />
                  </label>
                  <label>
                    Blocking reason
                    <Input
                      name="blocked"
                      defaultValue={task.blocked}
                      placeholder="Nothing blocking"
                    />
                  </label>
                </div>
                <Button type="submit" variant="outline" disabled={busy}>
                  Save changes
                </Button>
              </form>
            </CollapsibleContent>
          </Collapsible>
          <ConnectedNotes data={data} target={{ type: 'task', id: task.id }} />
          <RelatedResources target={{ type: 'task', id: task.id }} />
          <h3 className="detail-heading">Notes & decisions</h3>
          {data.notes
            .filter((n) => n.taskId === task.id)
            .map((n) => (
              <div className="note" key={n.id}>
                <span className="note-author">
                  {data.members.find((m) => m.id === n.actor)?.name}
                  <small>{new Date(n.createdAt).toLocaleDateString()}</small>
                </span>
                <p>{n.body}</p>
              </div>
            ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await cmd('note', { body: note })) setNote('');
            }}
            className="note-form"
          >
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Keep a decision or useful context with this task…"
              aria-label="Add a note"
              required
            />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !note.trim()}
            >
              <Plus size={14} />
              Add note
            </Button>
          </form>
        </>
      )}
      {tab === 'work' && (
        <>
          <div className="work-heading">
            <h3>Deliverable</h3>
            <span className="quiet-meta">
              {task.version
                ? `Version ${task.version}`
                : 'No version submitted'}
            </span>
          </div>
          <form
            className="edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              void cmd('deliverable', {
                body: new FormData(e.currentTarget).get('body'),
              });
            }}
          >
            <Textarea
              name="body"
              defaultValue={task.deliverable}
              rows={9}
              placeholder="Add the work, draft copy, or a link to the deliverable…"
              required
              aria-label="Deliverable content"
            />
            <Button variant="outline" disabled={busy} type="submit">
              Save deliverable
            </Button>
          </form>
          <section className="review-panel">
            <h3>
              {task.stage === 'Done' ? 'Task completed' : currentReview?.decision === 'Approved'
                ? 'Approved and ready for handoff'
                : task.stage === 'Review'
                  ? task.reviewer === data.currentMember ? 'Ready for your review' : 'Review requested'
                  : 'Request a review (optional)'}
            </h3>
            <p>
              {task.stage === 'Done' ? 'Previous review decisions are kept in the history.' : currentReview?.decision === 'Approved'
                ? 'Approval is recorded. Delivery is a separate step.'
                : task.stage === 'Review'
                  ? task.reviewer === data.currentMember ? 'Review this version, then approve it or explain what needs to change.' : 'Waiting for ' + (data.members.find(member => member.id === task.reviewer)?.name || 'the reviewer') + '.'
                  : 'Choose a team member when you want feedback on this task.'}
            </p>
            {task.stage !== 'Review' && task.stage !== 'Done' && (
              <Button
                disabled={busy}
                onClick={() => setRequestingReview(true)}
              >
                <ArrowUpRight size={15} />
                Request review
              </Button>
            )}
            {task.stage === 'Review' &&
              currentReview?.decision === 'Pending' && task.reviewer === data.currentMember && (
                <>
                  <Textarea
                    placeholder="Feedback or requested changes…"
                    aria-label="Review feedback"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <div className="review-actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void cmd('review', { decision: 'Approved', feedback })
                      }
                    >
                      <Check size={15} />
                      Approve version
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !feedback.trim()}
                      onClick={() =>
                        void cmd('review', {
                          decision: 'Changes requested',
                          feedback,
                        })
                      }
                    >
                      Request changes
                    </Button>
                  </div>
                </>
              )}
            {currentReview?.decision === 'Approved' &&
              task.stage !== 'Done' && (
                <>
                  <span className="status-label">
                    External delivery · not configured
                  </span>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void cmd('complete')}
                  >
                    Complete internal work
                  </Button>
                </>
              )}
            {task.stage === 'Done' && (
              <span className="status-label">Completed · {task.delivery}</span>
            )}
          </section>
          {reviews.length > 0 && (
            <>
              <h3 className="detail-heading">Review history</h3>
              {reviews.map((r) => (
                <div className="note" key={r.id}>
                  <span className="note-author">
                    Version {r.version}
                    <small>{r.decision}</small>
                  </span>
                  {r.feedback && <p>{r.feedback}</p>}
                </div>
              ))}
            </>
          )}
        </>
      )}
      {tab === 'activity' && (
        <div className="activity-list">
          {data.activities.filter((a) => a.taskId === task.id).length ? (
            data.activities
              .filter((a) => a.taskId === task.id)
              .map((a) => (
                <div className="activity" key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    <p>{a.body}</p>
                    <small>
                      {data.members.find((m) => m.id === a.actor)?.name} ·{' '}
                      {new Date(a.createdAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))
          ) : (
            <p className="muted">
              Changes to this task will appear here, with the person and time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
