import type { Workspace, Task } from './model';

// A project remains the source of its client's identity. Standalone tasks can
// belong directly to a client, without requiring a placeholder project.
export function taskSpaceId(
  data: Pick<Workspace, 'projects'> & Partial<Pick<Workspace, 'prospects'>>,
  task: Pick<Task, 'projectId' | 'spaceId' | 'prospectId'>,
): string | null {
  const direct = task.projectId
    ? (data.projects.find((p) => p.id === task.projectId)?.spaceId ?? null)
    : (task.spaceId ?? null);
  return (
    direct ||
    data.prospects?.find((p) => p.id === task.prospectId)?.clientId ||
    null
  );
}
