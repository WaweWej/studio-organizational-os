'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { localDay } from '@/lib/workspace-brief';
import type { Task } from '@/lib/model';
export default function FinishDay({
  tasks,
  busy,
  error,
  act,
  close,
}: {
  tasks: Task[];
  busy: boolean;
  error: string;
  act: (v: Record<string, unknown>) => Promise<boolean>;
  close: () => void;
}) {
  const unfinished = tasks.filter((t) => t.stage !== 'Done');
  const [chosen, setChosen] = useState(
    () =>
      new Set(unfinished.filter((t) => t.stage !== 'Review').map((t) => t.id)),
  );
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent className="finish-day-dialog">
        <DialogHeader>
          <DialogTitle>Finish the day</DialogTitle>
          <DialogDescription>
            {tasks.filter((t) => t.stage === 'Done').length} completed. Choose
            unfinished work to plan for tomorrow. Deadlines stay unchanged;
            reviews remain available.
          </DialogDescription>
        </DialogHeader>
        <div className="finish-day-list">
          {unfinished.map((task) => (
            <label key={task.id}>
              <input
                type="checkbox"
                checked={chosen.has(task.id)}
                onChange={(e) =>
                  setChosen((previous) => {
                    const next = new Set(previous);
                    if (e.target.checked) next.add(task.id);
                    else next.delete(task.id);
                    return next;
                  })
                }
              />
              <span>
                {task.title}
                <small>
                  {task.blocked ? 'Waiting: ' + task.blocked : task.stage}
                  {task.due ? ' · Due ' + task.due : ''}
                </small>
              </span>
            </label>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <Button
          disabled={busy}
          onClick={async () => {
            if (
              !chosen.size ||
              (await act({
                type: 'day-work',
                mode: 'plan',
                day: localDay(new Date()),
                plannedFor: localDay(tomorrow),
                items: unfinished
                  .filter((t) => chosen.has(t.id))
                  .map((t) => ({ id: t.id, revision: t.revision })),
              }))
            )
              close();
          }}
        >
          {chosen.size
            ? 'Plan ' + chosen.size + ' for tomorrow'
            : 'Close day review'}
        </Button>
        <Button variant="outline" disabled={busy} onClick={close}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
