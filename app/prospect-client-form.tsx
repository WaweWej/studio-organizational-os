'use client';
import { useState, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Workspace } from '@/lib/model';
import type { Prospect } from '@/lib/sales-model';
export default function ProspectClientForm({
  prospect,
  data,
  busy,
  error,
  act,
  close,
  complete,
}: {
  prospect: Prospect;
  data: Workspace;
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
  complete: () => void;
}) {
  const fieldId = useId();
  const client = data.spaces.find((s) => s.id === prospect.clientId);
  const [draft, setDraft] = useState(() => ({
    name: client?.name || prospect.name,
    owner: client?.owner || prospect.owner,
    website: client?.website || '',
    brief: client?.brief || '',
    wants: client?.wants || '',
    needs: client?.needs || '',
  }));
  const [revision] = useState(prospect.revision),
    [clientRevision] = useState(client?.revision);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="cf-dialog cf-brand-dialog">
        <DialogHeader>
          <DialogTitle>Create client record</DialogTitle>
          <DialogDescription>
            Confirm the details to move {prospect.name} from Sales into Clients.
            Its tasks and sales history will stay connected.
          </DialogDescription>
        </DialogHeader>
        <form
          className="prospect-client-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act({
                type: 'sales-convert',
                id: prospect.id,
                revision,
                clientRevision,
                ...draft,
              })
            )
              complete();
          }}
        >
          <label htmlFor={fieldId + "-name"}>
            Client name
            <Input
              id={fieldId + "-name"}
              required
              maxLength={100}
              value={draft.name}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Account lead
            <select
              value={draft.owner}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
            >
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={fieldId + "-website"}>
            Website
            <Input
              id={fieldId + "-website"}
              type="url"
              placeholder="https://"
              value={draft.website}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
            />
          </label>
          {(['brief', 'wants', 'needs'] as const).map((key) => (
            <label key={key} htmlFor={fieldId + key}>
              {key === 'brief'
                ? 'Client brief'
                : key === 'wants'
                  ? 'Goals'
                  : 'Needs'}
              <Textarea
                id={fieldId + key}
                rows={3}
                value={draft[key]}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          <footer>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Confirm and create client'}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
