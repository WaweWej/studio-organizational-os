'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { Task, Workspace } from '@/lib/model';

export default function ReviewRequest({ task, data, busy, error, act, close }: {
  task: Task;
  data: Workspace;
  busy: boolean;
  error: string;
  act: (command: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
}) {
  const reviewers = data.members.filter(member => member.id !== data.currentMember);
  const [reviewer, setReviewer] = useState(reviewers.some(member => member.id === task.reviewer) ? task.reviewer : reviewers.length === 1 ? reviewers[0].id : '');
  const [failed, setFailed] = useState(false);
  return <Dialog open onOpenChange={open => !open && !busy && close()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Request review</DialogTitle>
        <DialogDescription>{task.title}</DialogDescription>
      </DialogHeader>
      {reviewers.length ? <form className="edit-form" onSubmit={async event => {
        event.preventDefault();
        setFailed(false);
        if (await act({ type: 'submit', id: task.id, revision: task.revision, reviewer })) close();
        else setFailed(true);
      }}>
        <label>Reviewer
          <select aria-label="Reviewer" value={reviewer} onChange={event => setReviewer(event.target.value)} required disabled={busy}>
            <option value="" disabled>Choose a team member</option>
            {reviewers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <p className="muted">They’ll receive an in-app review request. You can still mark this task Done at any time.</p>
        {failed && <p role="alert">{error || 'The review request was not saved. Please try again.'}</p>}
        <Button type="submit" disabled={busy || !reviewer}>Request review</Button>
      </form> : null}
      <div className="review-external">
        <Button variant="outline" disabled={busy} onClick={async () => {
          setFailed(false);
          if (await act({ type: 'move', id: task.id, revision: task.revision, stage: 'Review' })) close();
          else setFailed(true);
        }}>In review externally — no reviewer</Button>
        <p className="muted">For work sitting with the client or another outside party. No review request is sent.</p>
      </div>
      {!reviewers.length && failed && <p role="alert">{error || 'The move was not saved. Please try again.'}</p>}
      <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
    </DialogContent>
  </Dialog>;
}
