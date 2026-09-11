'use client';
/* eslint-disable next/no-img-element -- Authenticated file previews must use the private no-store endpoint directly. */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  Folder,
  FolderPlus,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Image,
  Blocks,
  LockKeyhole,
  Link2,
  Upload,
  Download,
  Copy,
  Check,
  Trash2,
  BookOpen,
  ChevronRight,
  LayoutGrid,
  List,
  Workflow,
  X,
  HardDriveUpload,
  CloudCheck,
} from 'lucide-react';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { Workspace } from '@/lib/model';
import {
  relatedResources,
  targetLabel,
  templateCategories,
  resourceSize,
  type Resource,
  type ResourceKind,
  type ResourceTarget,
} from '@/lib/resource-model';
import { seal, unseal, type Credential, type Sealed } from '@/lib/vault-crypto';
import {
  VaultProvider,
  VaultAccess,
  VaultStatus,
  CredentialFields,
  type VaultSession,
} from './vault';
type API = {
  data: Workspace;
  ready: boolean;
  busy: boolean;
  error: string;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  refresh: () => Promise<void>;
};
type ResourceActions = API & {
  open: (r: Resource) => void;
  add: (
    kind: ResourceKind,
    target?: ResourceTarget,
    folderId?: string | null,
  ) => void;
  attach: (target: ResourceTarget) => void;
};
const LibraryContext = createContext<ResourceActions | null>(null);
const useLibrary = () => useContext(LibraryContext)!;
const icons = {
  asset: Image,
  template: BookOpen,
  tool: Blocks,
  vault: LockKeyhole,
};
const blankCredential: Credential = {
  username: '',
  password: '',
  url: '',
  notes: '',
};
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
      <SelectTrigger aria-label={label}>
        <SelectValue>
          {items.find((i) => i.value === value)?.label || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem value={i.value} key={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function ResourceProvider({
  children,
  ...api
}: API & { children: ReactNode }) {
  const [editing, setEditing] = useState<{
      kind: ResourceKind;
      resource?: Resource;
      target?: ResourceTarget;
      folderId?: string | null;
    } | null>(null),
    [attaching, setAttaching] = useState<ResourceTarget | null>(null),
    [runner, setRunner] = useState<Resource | null>(null);
  const actions = {
    ...api,
    open: (r: Resource) => setEditing({ kind: r.kind, resource: r }),
    add: (
      kind: ResourceKind,
      target?: ResourceTarget,
      folderId?: string | null,
    ) => setEditing({ kind, target, folderId }),
    attach: setAttaching,
  };
  return (
    <LibraryContext.Provider value={actions}>
      <VaultProvider>
        {children}
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <DialogContent className="resource-dialog">
            <DialogHeader>
              <DialogTitle>
                {editing?.resource?.title ||
                  `New ${editing?.kind || 'resource'}`}
              </DialogTitle>
              <DialogDescription>
                {editing?.kind === 'vault'
                  ? 'Credentials stay encrypted. Connect this login to the work that needs it.'
                  : 'One shared record, available everywhere it is connected.'}
              </DialogDescription>
            </DialogHeader>
            {editing &&
              (editing.kind === 'vault' ? (
                <VaultAccess>
                  {(session) => (
                    <ResourceForm
                      key={editing.resource?.id || 'new-vault'}
                      {...editing}
                      session={session}
                      close={() => setEditing(null)}
                      run={(r) => {
                        setEditing(null);
                        setRunner(r);
                      }}
                    />
                  )}
                </VaultAccess>
              ) : (
                <ResourceForm
                  key={editing.resource?.id || 'new'}
                  {...editing}
                  close={() => setEditing(null)}
                  run={(r) => {
                    setEditing(null);
                    setRunner(r);
                  }}
                />
              ))}
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!attaching}
          onOpenChange={(v) => !v && setAttaching(null)}
        >
          <DialogContent className="resource-dialog">
            <DialogHeader>
              <DialogTitle>Connect something useful</DialogTitle>
              <DialogDescription>
                Choose from the shared library. The original stays in one place.
              </DialogDescription>
            </DialogHeader>
            {attaching && (
              <AttachPicker
                target={attaching}
                close={() => setAttaching(null)}
              />
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={!!runner} onOpenChange={(v) => !v && setRunner(null)}>
          <DialogContent className="tool-runner">
            <DialogHeader>
              <DialogTitle>{runner?.title}</DialogTitle>
              <DialogDescription>
                Isolated tool · no access to workspace data or vault credentials
              </DialogDescription>
            </DialogHeader>
            {runner && (
              <iframe
                title={runner.title}
                src={`/api/files?id=${encodeURIComponent(runner.id)}&run=1`}
                sandbox="allow-scripts allow-forms allow-downloads"
                referrerPolicy="no-referrer"
              />
            )}
          </DialogContent>
        </Dialog>
      </VaultProvider>
    </LibraryContext.Provider>
  );
}
function ResourceCard({
  resource: r,
  list = false,
}: {
  resource: Resource;
  list?: boolean;
}) {
  const { data, open } = useLibrary(),
    Icon = icons[r.kind];
  const connections = data.resourceLinks.filter((l) => l.resourceId === r.id);
  const first = connections[0],
    context = first
      ? targetLabel(data, { type: first.targetType, id: first.targetId })
      : r.shared
        ? 'Organization-wide'
        : 'Shared library';
  return (
    <button
      className={`library-card ${list ? 'is-list' : ''} kind-${r.kind}`}
      onClick={() => open(r)}
    >
      <div className="library-card-art">
        {r.source === 'file' &&
        ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
          r.mime,
        ) ? (
          <img
            src={`/api/files?id=${encodeURIComponent(r.id)}&preview=1`}
            alt=""
            loading="lazy"
          />
        ) : (
          <>
            <Icon size={list ? 23 : 35} />
            {!list && (
              <span>
                {r.kind === 'template'
                  ? r.category || 'TEMPLATE'
                  : r.source === 'html'
                    ? 'CUSTOM HTML'
                    : r.kind === 'vault'
                      ? 'ENCRYPTED'
                      : r.source === 'drive'
                        ? 'GOOGLE DRIVE'
                        : r.source === 'link'
                          ? r.url
                            ? 'CONNECTED LINK'
                            : 'LINK NEEDED'
                          : 'STUDIO LIBRARY'}
              </span>
            )}
          </>
        )}
      </div>
      <div className="library-card-copy">
        <small>
          {r.category || r.kind}
          {r.size ? ` · ${resourceSize(r.size)}` : ''}
        </small>
        <h3>{r.title}</h3>
        <p>{r.description || context}</p>
        <footer>
          <span>
            {context}
            {connections.length > 1 ? ` +${connections.length - 1}` : ''}
          </span>
          <ArrowUpRight size={16} />
        </footer>
      </div>
    </button>
  );
}
export function RelatedResources({ target }: { target: ResourceTarget }) {
  const { data, open, attach, ready } = useLibrary(),
    resources = relatedResources(data, target);
  return (
    <section className="related-library">
      <header>
        <div>
          <p className="eyebrow">AT HAND</p>
          <h3>Files, templates & tools</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready}
          onClick={() => attach(target)}
        >
          <Link2 size={14} />
          Connect
        </Button>
      </header>
      {resources.length ? (
        <div className="related-resource-list">
          {resources.map((r) => {
            const Icon = icons[r.kind],
              direct = data.resourceLinks.some(
                (l) =>
                  l.resourceId === r.id &&
                  l.targetType === target.type &&
                  l.targetId === target.id,
              );
            return (
              <button key={r.id} onClick={() => open(r)}>
                <span className={`resource-mini kind-${r.kind}`}>
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{r.title}</strong>
                  <small>
                    {r.kind} ·{' '}
                    {direct
                      ? 'Connected here'
                      : r.shared
                        ? 'Organization-wide'
                        : 'From connected work'}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="library-empty-inline">
          Keep the right files, references, logins, and tools close to this
          work.
        </p>
      )}
    </section>
  );
}
export default function ResourceLibrary({
  mode = 'library',
}: {
  mode?: 'library' | 'tools';
}) {
  const { data, add, ready, busy, act, refresh } = useLibrary();
  const [tab, setTab] = useState<ResourceKind>(
      mode === 'tools' ? 'tool' : 'asset',
    ),
    [query, setQuery] = useState(''),
    [folder, setFolder] = useState<string | null>(null),
    [category, setCategory] = useState('all'),
    [space, setSpace] = useState('all'),
    [list, setList] = useState(false),
    [archived, setArchived] = useState(false),
    [uploading, setUploading] = useState(false),
    [status, setStatus] = useState(''),
    [folderDialog, setFolderDialog] = useState(false),
    [folderName, setFolderName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const kind = tab;
  const scoped =
    space === 'all'
      ? null
      : new Set(
          relatedResources(data, { type: 'space', id: space }).map((r) => r.id),
        );
  const results = data.resources.filter(
    (r) =>
      r.kind === kind &&
      !!r.archived === archived &&
      (!scoped || scoped.has(r.id)) &&
      (!query && !archived ? r.folderId === folder : true) &&
      (category === 'all' || (r.category || 'Other') === category) &&
      `${r.title} ${r.description} ${r.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const visibleFolders = data.folders.filter((f) => f.parentId === folder),
    currentFolder = data.folders.find((f) => f.id === folder);
  const breadcrumbs = [];
  let cursor = currentFolder;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    breadcrumbs.unshift(cursor);
    seen.add(cursor.id);
    cursor = data.folders.find((f) => f.id === cursor?.parentId);
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length || uploading || !ready) return;
    setUploading(true);
    let count = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error(
            `${file.name} exceeds 20 MB. Add a link for larger files.`,
          );
        setStatus(`Uploading ${file.name}…`);
        const form = new FormData();
        form.set('file', file);
        form.set('kind', kind);
        form.set('folderId', folder || '');
        if (space !== 'all')
          form.set('targets', JSON.stringify([{ type: 'space', id: space }]));
        const r = await fetch('/api/files', { method: 'POST', body: form });
        const body = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(body.error);
        count++;
      }
      setStatus(`${count} ${count === 1 ? 'file' : 'files'} added.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      await refresh().catch(() =>
        setStatus('Uploaded files could not be refreshed. Reload the page.'),
      );
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };
  const content = (
    <>
      <div className="library-toolbar">
        <div className="library-search">
          <Search size={17} />
          <Input
            aria-label="Search library"
            placeholder={
              kind === 'template'
                ? 'Find a deck, guideline, script…'
                : 'Find something useful…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Picker
          label="Filter by client"
          value={space}
          onChange={setSpace}
          items={[
            { value: 'all', label: 'All spaces' },
            ...data.spaces.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        {kind === 'template' && (
          <Picker
            label="Template category"
            value={category}
            onChange={setCategory}
            items={[
              { value: 'all', label: 'All categories' },
              ...templateCategories.map((c) => ({ value: c, label: c })),
            ]}
          />
        )}
        <Button
          variant="ghost"
          onClick={() => setList(!list)}
          aria-label={list ? 'Show grid' : 'Show list'}
        >
          {list ? <LayoutGrid size={18} /> : <List size={18} />}
        </Button>
        <Button
          variant="ghost"
          aria-pressed={archived}
          onClick={() => setArchived(!archived)}
        >
          <Trash2 size={16} />
          {archived ? 'Back to library' : 'Archive'}
        </Button>
      </div>
      <div className="library-breadcrumbs">
        <button
          onClick={() => {
            setFolder(null);
            setQuery('');
          }}
        >
          {archived
            ? 'Archive'
            : 'All ' +
              (kind === 'asset'
                ? 'assets'
                : kind === 'template'
                  ? 'templates'
                  : kind === 'tool'
                    ? 'tools'
                    : 'logins')}
        </button>
        {breadcrumbs.map((f) => (
          <span key={f.id}>
            <ChevronRight size={12} />
            <button onClick={() => setFolder(f.id)}>{f.name}</button>
          </span>
        ))}
        <small>
          {results.length} {results.length === 1 ? 'item' : 'items'}
        </small>
      </div>
      {!query && !archived && visibleFolders.length > 0 && kind !== 'vault' && (
        <div className="library-folders">
          {visibleFolders.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)}>
              <Folder size={21} />
              <span>{f.name}</span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      )}
      {results.length ? (
        <div className={list ? 'library-list' : 'library-grid'}>
          {results.map((r) => (
            <ResourceCard resource={r} list={list} key={r.id} />
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <span>
            {kind === 'template' ? (
              <BookOpen size={30} />
            ) : kind === 'tool' ? (
              <Blocks size={30} />
            ) : kind === 'vault' ? (
              <LockKeyhole size={30} />
            ) : (
              <Folder size={30} />
            )}
          </span>
          <h2>
            {query || category !== 'all' || space !== 'all'
              ? 'Nothing matches yet.'
              : archived
                ? 'The archive is clear.'
                : kind === 'template'
                  ? 'The starting point for good work.'
                  : kind === 'tool'
                    ? 'Bring your tools together.'
                    : kind === 'vault'
                      ? 'Keep the keys close.'
                      : 'A place for everything worth keeping.'}
          </h2>
          <p>
            {kind === 'template'
              ? 'Pitch decks, logos, brand guidelines, sales templates, call scripts, and your best work. Ready to find and use again.'
              : kind === 'tool'
                ? 'Register a hosted system or upload a self-contained HTML tool. Connect it to the clients and projects that use it.'
                : kind === 'vault'
                  ? 'Save a login once and connect it wherever your team needs it.'
                  : 'Upload a file or save a link. Connect it once; find it with the work.'}
          </p>
          {!archived && (
            <Button
              variant="outline"
              disabled={!ready}
              onClick={() =>
                add(
                  kind,
                  space !== 'all' ? { type: 'space', id: space } : undefined,
                  folder,
                )
              }
            >
              <Plus size={15} />
              Add {kind === 'vault' ? 'login' : kind}
            </Button>
          )}
        </div>
      )}
    </>
  );
  return (
    <section
      className="library-page"
      onDragOver={(e) => {
        if (kind !== 'vault' && e.dataTransfer.types.includes('Files'))
          e.preventDefault();
      }}
      onDrop={(e) => {
        if (kind !== 'vault' && e.dataTransfer.files.length) {
          e.preventDefault();
          void upload(e.dataTransfer.files);
        }
      }}
    >
      <header className="library-heading">
        <div>
          <p className="eyebrow">
            {kind === 'tool' ? 'THE STUDIO TOOLBOX' : 'THE SHARED COLLECTION'}
          </p>
          <h1>
            {kind === 'tool' ? 'Made to make things.' : 'Everything, at hand.'}
          </h1>
          <p>
            {kind === 'tool'
              ? 'Your custom tools and systems, connected to the work.'
              : 'The assets, starting points, and knowledge behind the work.'}
          </p>
        </div>
        <div className="library-heading-actions">
          {kind === 'vault' ? (
            <VaultStatus />
          ) : (
            <>
              <Button
                variant="outline"
                disabled={!ready || uploading}
                onClick={() => input.current?.click()}
              >
                <Upload size={15} />
                {uploading
                  ? 'Uploading…'
                  : kind === 'tool'
                    ? 'Upload HTML'
                    : 'Upload files'}
              </Button>
              <Button
                variant="ghost"
                aria-label="New folder"
                disabled={!ready}
                onClick={() => setFolderDialog(true)}
              >
                <FolderPlus size={19} />
              </Button>
            </>
          )}
          <Button
            disabled={!ready}
            onClick={() =>
              add(
                kind,
                space !== 'all' ? { type: 'space', id: space } : undefined,
                folder,
              )
            }
          >
            <Plus size={16} />
            {kind === 'vault'
              ? 'New login'
              : kind === 'tool'
                ? 'Register tool'
                : kind === 'template'
                  ? 'New template'
                  : 'Add link'}
          </Button>
        </div>
      </header>
      {kind !== 'vault' && kind !== 'tool' && (
        <DriveStrip space={space} refresh={refresh} />
      )}
      {
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as ResourceKind);
            setFolder(null);
            setCategory('all');
            setQuery('');
            setArchived(false);
          }}
        >
          <TabsList className="library-tabs" variant="line">
            <TabsTrigger value="asset">
              <Image size={15} />
              Assets
            </TabsTrigger>
            <TabsTrigger value="template">
              <BookOpen size={15} />
              Templates
            </TabsTrigger>
            <TabsTrigger value="tool">
              <Blocks size={15} />
              Tools
            </TabsTrigger>
            <TabsTrigger value="vault">
              <LockKeyhole size={15} />
              Vault
            </TabsTrigger>
          </TabsList>
        </Tabs>
      }
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Upload library files"
        accept={kind === 'tool' ? '.html,.htm' : undefined}
        onChange={(e) => void upload(e.target.files)}
      />
      {status && <output className="library-status">{status}</output>}
      {kind === 'vault' ? <VaultAccess>{() => content}</VaultAccess> : content}
      {kind !== 'vault' && (
        <p className="library-footnote">
          Drop files anywhere here · Up to 20 MB per file · Save links for
          larger files and live documents
        </p>
      )}
      <Dialog open={folderDialog} onOpenChange={setFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Inside {currentFolder?.name || 'the library'}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await act({
                  type: 'folder-create',
                  name: folderName,
                  parentId: folder,
                })
              ) {
                setFolderName('');
                setFolderDialog(false);
              }
            }}
          >
            <label htmlFor="folder-name">Folder name</label>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              maxLength={100}
              required
            />
            <Button type="submit" disabled={busy}>
              Create folder
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function Connections({
  targets,
  setTargets,
}: {
  targets: ResourceTarget[];
  setTargets: (targets: ResourceTarget[]) => void;
}) {
  const { data } = useLibrary(),
    [query, setQuery] = useState(''),
    [type, setType] = useState<ResourceTarget['type']>('space');
  const options =
    type === 'space'
      ? data.spaces.map((s) => ({ id: s.id, name: s.name }))
      : type === 'project'
        ? data.projects
        : type === 'task'
          ? data.tasks.map((t) => ({ id: t.id, name: t.title }))
          : data.blueprints;
  return (
    <section className="resource-connections">
      <h3>Connected to</h3>
      <p className="muted">
        Project resources appear with the client and its tasks automatically.
      </p>
      <div className="connection-chips">
        {targets.map((t) => (
          <span key={t.type + ':' + t.id}>
            {targetLabel(data, t) || t.id}
            <button
              type="button"
              aria-label={`Remove connection to ${targetLabel(data, t)}`}
              onClick={() =>
                setTargets(
                  targets.filter((x) => x.type !== t.type || x.id !== t.id),
                )
              }
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="resource-input-action">
        <Picker
          label="Connection type"
          value={type}
          onChange={(v) => setType(v as ResourceTarget['type'])}
          items={[
            { value: 'space', label: 'Spaces' },
            { value: 'project', label: 'Projects' },
            { value: 'task', label: 'Tasks' },
            { value: 'blueprint', label: 'Blueprints' },
          ]}
        />
        <Input
          aria-label="Find a connection"
          placeholder="Find a connection…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="connection-options">
        {options
          .filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
          .map((o) => {
            const selected = targets.some(
              (t) => t.type === type && t.id === o.id,
            );
            return (
              <button
                type="button"
                key={o.id}
                aria-pressed={selected}
                onClick={() =>
                  setTargets(
                    selected
                      ? targets.filter((t) => t.type !== type || t.id !== o.id)
                      : [...targets, { type, id: o.id }],
                  )
                }
              >
                {o.name}
                {selected ? <Check size={14} /> : <Plus size={14} />}
              </button>
            );
          })}
        {!options.length && (
          <p className="muted">Create a {type} first to connect it here.</p>
        )}
      </div>
    </section>
  );
}
function ResourceForm({
  kind,
  resource: r,
  target,
  folderId,
  session,
  close,
  run,
}: {
  kind: ResourceKind;
  resource?: Resource;
  target?: ResourceTarget;
  folderId?: string | null;
  session?: VaultSession;
  close: () => void;
  run: (r: Resource) => void;
}) {
  const { data, act, busy, error } = useLibrary();
  const [id] = useState(r?.id || crypto.randomUUID()),
    [source, setSource] = useState(
      r?.source || (kind === 'vault' ? 'vault' : 'link'),
    ),
    [category, setCategory] = useState(
      r?.category || (kind === 'template' ? 'Other' : ''),
    ),
    [folder, setFolder] = useState(r?.folderId || folderId || ''),
    [owner, setOwner] = useState(r?.owner || data.currentMember),
    [shared, setShared] = useState(!!r?.shared),
    [targets, setTargets] = useState<ResourceTarget[]>(
      r
        ? data.resourceLinks
            .filter((l) => l.resourceId === r.id)
            .map((l) => ({ type: l.targetType, id: l.targetId }))
        : target
          ? [target]
          : [],
    ),
    [credential, setCredential] = useState<Credential>(blankCredential),
    [loading, setLoading] = useState(kind === 'vault' && !!r),
    [localError, setLocalError] = useState(''),
    [saving, setSaving] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!session || !r || kind !== 'vault') return;
    let cancelled = false;
    fetch(`/api/vault?id=${encodeURIComponent(r.id)}`)
      .then(async (response) => {
        const b = (await response.json()) as { error?: string; sealed: Sealed };
        if (!response.ok) throw new Error(b.error);
        return unseal<Credential>(
          session.key,
          session.config.id,
          r.id,
          b.sealed,
        );
      })
      .then((value) => {
        if (!cancelled) {
          setCredential(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled)
          setLocalError(
            'This credential could not be decrypted. Close it and unlock the vault again.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [session, r, kind]);
  const save = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || saving) return;
    setSaving(true);
    setLocalError('');
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const sealed =
        kind === 'vault' && session
          ? await seal(session.key, session.config.id, id, credential)
          : undefined;
      if (
        await act({
          type: 'resource-save',
          id,
          ...fields,
          kind,
          source,
          revision: r?.revision,
          category,
          folderId: folder,
          owner,
          shared,
          targets,
          sealed,
        })
      )
        close();
    } catch {
      setLocalError('The credential could not be encrypted. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r?.content || r?.url || '');
      setCopied(true);
    } catch {
      setLocalError(
        'Clipboard access is unavailable. Select and copy the text manually.',
      );
    }
  };
  return (
    <form className="resource-form" onSubmit={save}>
      {(localError || error) && (
        <p className="resource-error" role="alert">
          {localError || error}
        </p>
      )}
      {r && (
        <div className="resource-open-actions">
          {r.source === 'html' ? (
            <Button type="button" onClick={() => run(r)}>
              <Blocks size={15} />
              Open tool
            </Button>
          ) : r.url ? (
            <a
              className="resource-open-link"
              href={r.url}
              target="_blank"
              rel="noreferrer"
            >
              Open{' '}
              {r.source === 'drive'
                ? 'in Drive'
                : kind === 'template'
                  ? 'original'
                  : 'link'}
              <ArrowUpRight size={15} />
            </a>
          ) : null}
          {['file', 'html'].includes(r.source) && (
            <a
              className="resource-open-link"
              href={`/api/files?id=${encodeURIComponent(r.id)}`}
              download
            >
              <Download size={15} />
              Download{kind === 'template' ? ' a copy' : ''}
            </a>
          )}
          {kind === 'template' && (r.content || r.url) && (
            <Button type="button" variant="outline" onClick={() => void copy()}>
              <Copy size={15} />
              {copied
                ? 'Copied'
                : r.content
                  ? 'Copy template text'
                  : 'Copy template link'}
            </Button>
          )}
        </div>
      )}
      {r?.source === 'file' &&
        ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
          r.mime,
        ) && (
          <img
            className="resource-preview"
            src={`/api/files?id=${encodeURIComponent(r.id)}&preview=1`}
            alt={r.title}
          />
        )}
      <label htmlFor="resource-title">
        {kind === 'vault' ? 'Login name (visible in the workspace)' : 'Title'}
      </label>
      <Input
        id="resource-title"
        name="title"
        defaultValue={r?.title}
        required
        maxLength={180}
        placeholder={
          kind === 'vault'
            ? 'e.g. Nord & Form · hosting'
            : 'Give it a useful name'
        }
      />
      {!r && kind !== 'vault' && kind !== 'asset' && kind !== 'tool' && (
        <Picker
          label="Template format"
          value={source}
          onChange={(v) => setSource(v as Resource['source'])}
          items={[
            { value: 'link', label: 'Link to a document or deck' },
            { value: 'text', label: 'Reusable text or call script' },
          ]}
        />
      )}
      <label htmlFor="resource-description">
        {kind === 'vault'
          ? 'Public description — keep secrets below'
          : 'A little context'}
      </label>
      <Textarea
        id="resource-description"
        name="description"
        defaultValue={r?.description}
        maxLength={10000}
        rows={2}
        placeholder={
          kind === 'vault'
            ? 'What is this login for?'
            : 'What is it, and when should we use it?'
        }
      />
      {source === 'link' && (
        <>
          <label htmlFor="resource-url">Link</label>
          <Input
            id="resource-url"
            name="url"
            type="url"
            defaultValue={r?.url}
            required
            placeholder="https://…"
            maxLength={2000}
          />
        </>
      )}
      {source === 'text' && (
        <>
          <label htmlFor="resource-content">Template text</label>
          <Textarea
            id="resource-content"
            name="content"
            defaultValue={r?.content}
            required
            rows={9}
            maxLength={40000}
            placeholder="Write a call script, sales email, or reusable starting point…"
          />
        </>
      )}
      {kind === 'vault' &&
        (loading ? (
          <p className="muted">Decrypting credential…</p>
        ) : (
          <CredentialFields value={credential} onChange={setCredential} />
        ))}
      {kind === 'template' && (
        <Picker
          label="Template category"
          value={category || 'Other'}
          onChange={setCategory}
          items={templateCategories.map((c) => ({ value: c, label: c }))}
        />
      )}
      <div className="resource-field-pair">
        <div>
          <span>Owner</span>
          <Picker
            label="Resource owner"
            value={owner}
            onChange={setOwner}
            items={data.members.map((m) => ({ value: m.id, label: m.name }))}
          />
        </div>
        {kind !== 'vault' && (
          <div>
            <span>Folder</span>
            <Picker
              label="Resource folder"
              value={folder || 'root'}
              onChange={(v) => setFolder(v === 'root' ? '' : v)}
              items={[
                { value: 'root', label: 'Library root' },
                ...data.folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />
          </div>
        )}
      </div>
      <div className="resource-checkbox">
        <Checkbox
          id="resource-shared"
          checked={shared}
          onCheckedChange={(v) => setShared(v === true)}
        />
        <label htmlFor="resource-shared">
          Make available throughout the organization
        </label>
      </div>
      <Connections targets={targets} setTargets={setTargets} />
      <footer className="resource-form-footer">
        {r && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy || saving}
            onClick={async () => {
              if (
                await act({
                  type: 'resource-archive',
                  id: r.id,
                  revision: r.revision,
                  archived: !r.archived,
                })
              )
                close();
            }}
          >
            <Trash2 size={14} />
            {r.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
        <Button variant="outline" type="button" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || saving || loading}>
          {saving
            ? 'Saving…'
            : kind === 'vault'
              ? 'Encrypt & save'
              : 'Save connections'}
        </Button>
      </footer>
    </form>
  );
}
function AttachPicker({
  target,
  close,
}: {
  target: ResourceTarget;
  close: () => void;
}) {
  const { data, act, busy, add, refresh, error } = useLibrary(),
    [query, setQuery] = useState(''),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadHere = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError('');
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error('Choose a file up to 20 MB, or add a link.');
      const form = new FormData();
      form.set('file', file);
      form.set('kind', 'asset');
      form.set('targets', JSON.stringify([target]));
      const response = await fetch('/api/files', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Upload failed.');
      await refresh();
      close();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };
  const connect = async (r: Resource) => {
    const targets = data.resourceLinks
      .filter((l) => l.resourceId === r.id)
      .map((l) => ({ type: l.targetType, id: l.targetId }));
    if (!targets.some((t) => t.type === target.type && t.id === target.id))
      targets.push(target);
    if (await act({ ...r, type: 'resource-save', shared: !!r.shared, targets }))
      close();
  };
  return (
    <>
      <Input
        aria-label="Search resources to connect"
        placeholder="Find a file, template, tool, or login…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="attach-options">
        {data.resources
          .filter(
            (r) =>
              !r.archived &&
              `${r.title} ${r.kind} ${r.category}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((r) => {
            const Icon = icons[r.kind];
            return (
              <button
                key={r.id}
                disabled={busy}
                onClick={() => void connect(r)}
              >
                <Icon size={19} />
                <span>
                  {r.title}
                  <small>{r.kind}</small>
                </span>
                <Plus size={15} />
              </button>
            );
          })}
      </div>
      <div className="resource-add-options">
        <input
          type="file"
          ref={fileInput}
          hidden
          aria-label="Upload a connected asset"
          onChange={(e) => void uploadHere(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          disabled={uploading || busy}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
        {(['asset', 'template', 'tool', 'vault'] as const).map((kind) => (
          <Button
            variant="outline"
            key={kind}
            onClick={() => {
              close();
              add(kind, target);
            }}
          >
            <Plus size={13} />
            {kind === 'vault' ? 'New login' : `New ${kind}`}
          </Button>
        ))}
      </div>
      {(uploadError || error) && (
        <p role="alert" className="resource-error">
          {uploadError || error}
        </p>
      )}
    </>
  );
}
export function BlueprintRegistry() {
  const { data, act, busy, ready } = useLibrary();
  const [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false),
    [projectId, setProject] = useState('none');
  const blueprint = data.blueprints.find((b) => b.id === selected);
  if (blueprint)
    return (
      <>
        <button className="back-link" onClick={() => setSelected(null)}>
          <ArrowLeft size={14} />
          All blueprints
        </button>
        <section className="surface">
          <p className="eyebrow">SYSTEM REFERENCE</p>
          <h2>{blueprint.name}</h2>
          <p className="blueprint-description">{blueprint.description}</p>
          <p className="muted">
            {data.projects.find((p) => p.id === blueprint.projectId)?.name ||
              'Organization process'}
          </p>
          <RelatedResources target={{ type: 'blueprint', id: blueprint.id }} />
          <small className="muted">
            Process documentation · the visual editor and live monitoring are
            still planned.
          </small>
        </section>
      </>
    );
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          Keep a process reference and its connected tools together.
        </p>
        <Button disabled={!ready} onClick={() => setCreate(true)}>
          <Plus size={15} />
          New blueprint
        </Button>
      </div>
      {data.blueprints.length ? (
        <div className="project-grid">
          {data.blueprints.map((b) => (
            <button
              key={b.id}
              className="project-card"
              onClick={() => setSelected(b.id)}
            >
              <Workflow size={24} />
              <h2>{b.name}</h2>
              <p>{b.description}</p>
              <span>
                Open reference <ArrowUpRight size={15} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <section className="library-empty">
          <Workflow size={30} />
          <h2>Give each system a home.</h2>
          <p>
            Create a process reference, describe its flow, and connect the
            tools, assets, and logins behind it.
          </p>
        </section>
      )}
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New process reference</DialogTitle>
            <DialogDescription>
              Document the flow and connect its tools.
            </DialogDescription>
          </DialogHeader>
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (
                await act({
                  type: 'blueprint-create',
                  name: form.get('name'),
                  description: form.get('description'),
                  projectId: projectId === 'none' ? '' : projectId,
                })
              ) {
                setCreate(false);
              }
            }}
          >
            <label htmlFor="blueprint-name">Name</label>
            <Input id="blueprint-name" name="name" required maxLength={180} />
            <label htmlFor="blueprint-description">How does it work?</label>
            <Textarea
              id="blueprint-description"
              name="description"
              rows={5}
              maxLength={10000}
              placeholder="Ad → landing page → lead capture → SMS → booking…"
            />
            <Picker
              label="Blueprint project"
              value={projectId}
              onChange={setProject}
              items={[
                { value: 'none', label: 'Organization process' },
                ...data.projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Button type="submit" disabled={busy}>
              Create blueprint
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ResourceCommands({ done }: { done: () => void }) {
  const { data, open } = useLibrary();
  return (
    <CommandGroup heading="Library & tools">
      {data.resources
        .filter((r) => !r.archived)
        .map((r) => (
          <CommandItem
            key={r.id}
            value={r.title + ' ' + r.category + ' ' + r.kind + ' ' + r.id}
            onSelect={() => {
              open(r);
              done();
            }}
          >
            <Link2 size={16} />
            {r.title}
            <span className="command-meta">{r.kind}</span>
          </CommandItem>
        ))}
    </CommandGroup>
  );
}

// Google Drive connection strip. Shows the truthful state of the Drive link,
// offers connection through the same Google account flow Calendar uses, and
// opens the attach-from-Drive search when browsing access is granted.
function DriveStrip({
  space,
  refresh,
}: {
  space: string;
  refresh: () => Promise<unknown>;
}) {
  const { data, ready } = useLibrary();
  const drive = data.googleDrive;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  if (!drive?.configured) return null;
  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/google-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', drive: true }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url)
        throw new Error(body.error || 'Google Drive could not connect.');
      window.location.assign(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Drive could not connect.');
      setBusy(false);
    }
  };
  return (
    <output className="drive-strip">
      {drive.connected ? (
        <>
          <CloudCheck size={16} />
          <span>
            Uploads land in your Google Drive under <strong>Studio</strong>
            {drive.account ? ` (${drive.account})` : ''}.
          </span>
          {drive.access === 'full' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!ready}
              onClick={() => setAttachOpen(true)}
            >
              <HardDriveUpload size={14} />
              Attach from Drive
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={connect}>
              Enable Drive browsing
            </Button>
          )}
        </>
      ) : (
        <>
          <HardDriveUpload size={16} />
          <span>
            Connect Google Drive to store uploads there and attach existing
            files.
          </span>
          <Button variant="outline" size="sm" disabled={busy} onClick={connect}>
            {busy ? 'Opening Google…' : 'Connect Google Drive'}
          </Button>
        </>
      )}
      {error && (
        <p className="resource-error" role="alert">
          {error}
        </p>
      )}
      {attachOpen && (
        <DriveAttach
          space={space}
          close={() => setAttachOpen(false)}
          refresh={refresh}
        />
      )}
    </output>
  );
}

// Search Google Drive and attach a file as a canonical library resource. The
// file stays in Drive; Studio records what it is and what it belongs to.
function DriveAttach({
  space,
  close,
  refresh,
}: {
  space: string;
  close: () => void;
  refresh: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<
    { id: string; name: string; mimeType: string; modifiedTime: string }[]
  >([]);
  const [state, setState] = useState<'idle' | 'searching' | 'attaching'>('idle');
  const [message, setMessage] = useState('');
  const search = async (value: string) => {
    setState('searching');
    setMessage('');
    try {
      const response = await fetch(
        '/api/google-drive?q=' + encodeURIComponent(value),
      );
      const body = (await response.json()) as {
        files?: { id: string; name: string; mimeType: string; modifiedTime: string }[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setFiles(body.files || []);
      setMessage(body.files?.length ? '' : 'No matching Drive files.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Drive search failed.');
    } finally {
      setState('idle');
    }
  };
  const initial = useRef(false);
  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    void search('');
  });
  const attachFile = async (fileId: string, name: string) => {
    setState('attaching');
    setMessage('');
    try {
      const response = await fetch('/api/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'attach',
          attachId: crypto.randomUUID(),
          fileId,
          targets:
            space !== 'all' ? [{ type: 'space', id: space }] : [],
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      await refresh();
      setMessage(`Attached ${name}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The file could not be attached.');
    } finally {
      setState('idle');
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="drive-attach">
        <DialogHeader>
          <DialogTitle>Attach from Google Drive</DialogTitle>
          <DialogDescription>
            The file stays in Drive. Studio links it{' '}
            {space !== 'all' ? 'to this client' : 'in the shared library'}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
        >
          <Input
            value={query}
            placeholder="Search your Drive"
            aria-label="Search Google Drive"
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <div className="drive-attach-results">
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={state !== 'idle'}
              onClick={() => void attachFile(f.id, f.name)}
            >
              <span>{f.name}</span>
              <small>
                {f.mimeType.split('.').pop()?.split('/').pop()}
                {f.modifiedTime ? ` · ${f.modifiedTime.slice(0, 10)}` : ''}
              </small>
            </button>
          ))}
        </div>
        {(message || state !== 'idle') && (
          <output>
            {state === 'searching'
              ? 'Searching Drive…'
              : state === 'attaching'
                ? 'Attaching…'
                : message}
          </output>
        )}
      </DialogContent>
    </Dialog>
  );
}
