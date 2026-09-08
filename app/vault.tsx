'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useId,
  type ReactNode,
} from 'react';
import {
  LockKeyhole,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createVault,
  unlockVault,
  generatePassword,
  type VaultConfig,
  type Credential,
} from '@/lib/vault-crypto';
export type VaultSession = { key: CryptoKey; config: VaultConfig };
const VaultContext = createContext<{
  session: VaultSession | null;
  config: VaultConfig | null;
  loading: boolean;
  error: string;
  unlock: (password: string, confirmation: string) => Promise<void>;
  lock: () => void;
} | null>(null);
export function VaultProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<VaultConfig | null>(null),
    [session, setSession] = useState<VaultSession | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const generation = useRef(0);
  const lock = useCallback(() => {
    generation.current++;
    setSession(null);
  }, []);
  useEffect(() => {
    fetch('/api/vault')
      .then(async (r) => {
        const b = (await r.json()) as {
          error?: string;
          config: VaultConfig | null;
        };
        if (!r.ok) throw new Error(b.error);
        setConfig(b.config);
      })
      .catch(() =>
        setError(
          'The vault could not be loaded. Reload the page to try again.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, 5 * 60 * 1000);
    };
    const hide = () => {
      if (document.hidden) lock();
    };
    reset();
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [session, lock]);
  const unlock = async (password: string, confirmation: string) => {
    setLoading(true);
    setError('');
    const attempt = generation.current;
    try {
      let next: VaultSession;
      if (config) {
        next = { config, key: await unlockVault(password, config) };
      } else {
        if (password !== confirmation)
          throw new Error('The master passphrases do not match.');
        next = await createVault(password);
        const r = await fetch('/api/vault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next.config),
        });
        const b = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(b.error);
        setConfig(next.config);
      }
      if (attempt === generation.current && !document.hidden) setSession(next);
    } catch (e) {
      setError(
        config
          ? 'Unable to unlock. Check the master passphrase.'
          : e instanceof Error
            ? e.message
            : 'Unable to create vault.',
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <VaultContext.Provider
      value={{ session, config, loading, error, unlock, lock }}
    >
      {children}
    </VaultContext.Provider>
  );
}
export function VaultAccess({
  children,
}: {
  children: (session: VaultSession) => ReactNode;
}) {
  const vault = useContext(VaultContext)!;
  const gateId = useId();
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    const clear = () => {
      if (document.hidden) {
        setPassword('');
        setConfirmation('');
      }
    };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  if (vault.session) return <>{children(vault.session)}</>;
  return (
    <form
      className="vault-gate"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = password,
          c = confirmation;
        setPassword('');
        setConfirmation('');
        await vault.unlock(p, c);
      }}
    >
      <span className="vault-symbol">
        <LockKeyhole size={28} />
      </span>
      <p className="eyebrow">PRIVATE BY DESIGN</p>
      <h2>
        {vault.loading
          ? 'Opening the vault…'
          : vault.config
            ? 'Your keys. Your vault.'
            : 'A home for your logins.'}
      </h2>
      <p>
        {vault.config
          ? 'Unlock to view or edit credentials. Your master passphrase stays in this browser.'
          : 'Choose a master passphrase. Credentials are encrypted in your browser before they are saved.'}
      </p>
      <label htmlFor={gateId + '-master'}>Master passphrase</label>
      <Input
        id={gateId + '-master'}
        type="password"
        autoComplete={vault.config ? 'current-password' : 'new-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={vault.config ? 1 : 16}
        required
        disabled={vault.loading}
      />
      {!vault.config && (
        <>
          <label htmlFor={gateId + '-confirm'}>Confirm master passphrase</label>
          <Input
            id={gateId + '-confirm'}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={16}
            required
            disabled={vault.loading}
          />
          <p className="vault-warning">
            Use at least 16 characters and keep a safe copy. There is no
            password reset; a lost master passphrase means lost access to the
            credentials.
          </p>
        </>
      )}
      {vault.error && (
        <p role="alert" className="resource-error">
          {vault.error}
        </p>
      )}
      <Button type="submit" disabled={vault.loading || !password}>
        {vault.config ? 'Unlock vault' : 'Create encrypted vault'}
      </Button>
      <small>
        Locks when you leave this tab or after 5 minutes of inactivity. Titles
        and connections remain visible to workspace members.
      </small>
    </form>
  );
}
export function VaultStatus() {
  const v = useContext(VaultContext)!;
  return (
    <Button variant="outline" disabled={!v.session} onClick={v.lock}>
      {v.session ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}{' '}
      {v.session ? 'Lock vault' : 'Vault locked'}
    </Button>
  );
}
export function CredentialFields({
  value,
  onChange,
}: {
  value: Credential;
  onChange: (value: Credential) => void;
}) {
  const [reveal, setReveal] = useState(false),
    [copied, setCopied] = useState('');
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label + ' copied');
    } catch {
      setCopied('Copy unavailable. Reveal and copy manually.');
    }
  };
  return (
    <fieldset className="credential-fields">
      <legend>Encrypted credential</legend>
      <label htmlFor="credential-url">Login page</label>
      <Input
        id="credential-url"
        type="url"
        placeholder="https://…"
        value={value.url}
        onChange={(e) => onChange({ ...value, url: e.target.value })}
      />
      <label htmlFor="credential-user">Username or email</label>
      <div className="resource-input-action">
        <Input
          id="credential-user"
          autoComplete="off"
          value={value.username}
          onChange={(e) => onChange({ ...value, username: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          aria-label="Copy username"
          onClick={() => void copy(value.username, 'Username')}
        >
          <Copy size={15} />
        </Button>
      </div>
      <label htmlFor="credential-password">Password</label>
      <div className="resource-input-action">
        <Input
          id="credential-password"
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          aria-label={reveal ? 'Hide password' : 'Show password'}
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Copy password"
          onClick={() => void copy(value.password, 'Password')}
        >
          <Copy size={15} />
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        onClick={() => onChange({ ...value, password: generatePassword() })}
      >
        <RefreshCw size={14} />
        Generate password
      </Button>
      <label htmlFor="credential-notes">Private notes</label>
      <Textarea
        id="credential-notes"
        value={value.notes}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
        maxLength={10000}
        rows={3}
      />
      <output className="muted">{copied}</output>
    </fieldset>
  );
}
