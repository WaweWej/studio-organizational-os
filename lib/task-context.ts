import type { Workspace, Task } from './model';

// A project remains the source of its client's identity. Standalone tasks can
// belong directly to a client, without requiring a placeholder project.
export function taskSpaceId(
  data: Pick<Workspace, 'projects'>,
  task: Pick<Task, 'projectId' | 'spaceId'>,
): string | null {
  return task.projectId
    ? (data.projects.find((p) => p.id === task.projectId)?.spaceId ?? null)
    : (task.spaceId ?? null);
}
