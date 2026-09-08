import { taskSpaceId } from './task-context';
import type { Workspace } from './model';
export type ResourceKind = 'asset' | 'template' | 'tool' | 'vault';
export type Resource = {
  id: string;
  title: string;
  kind: ResourceKind;
  source: 'link' | 'file' | 'html' | 'text' | 'vault';
  description: string;
  url: string;
  content: string;
  category: string;
  folderId: string | null;
  owner: string;
  filename: string;
  mime: string;
  size: number;
  shared: number;
  archived: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type ResourceLink = {
  id: string;
  resourceId: string;
  targetType: TargetType;
  targetId: string;
};
export type Folder = { id: string; name: string; parentId: string | null };
export type Blueprint = {
  id: string;
  name: string;
  description: string;
  projectId: string | null;
  spaceId: string | null;
};
export type TargetType = 'space' | 'project' | 'task' | 'blueprint';
export type ResourceTarget = { type: TargetType; id: string };
export const templateCategories = [
  'Pitch decks',
  'Logos',
  'Brand guidelines',
  'Sales templates',
  'Call scripts',
  'Case studies & portfolio',
  'Other',
];
export function targetLabel(data: Workspace, target: ResourceTarget) {
  return target.type === 'space'
    ? data.spaces.find((s) => s.id === target.id)?.name
    : target.type === 'project'
      ? data.projects.find((p) => p.id === target.id)?.name
      : target.type === 'task'
        ? data.tasks.find((t) => t.id === target.id)?.title
        : data.blueprints.find((b) => b.id === target.id)?.name;
}
export function relatedResources(
  data: Workspace,
  target: ResourceTarget,
): Resource[] {
  const targets = new Set([target.type + ':' + target.id]);
  const addProject = (id: string, children = false) => {
    targets.add('project:' + id);
    data.blueprints
      .filter((b) => b.projectId === id)
      .forEach((b) => targets.add('blueprint:' + b.id));
    const p = data.projects.find((p) => p.id === id);
    if (p?.spaceId) targets.add('space:' + p.spaceId);
    if (children)
      data.tasks
        .filter((t) => t.projectId === id)
        .forEach((t) => targets.add('task:' + t.id));
  };
  if (target.type === 'task') {
    const t = data.tasks.find((t) => t.id === target.id);
    if (t?.projectId) addProject(t.projectId);
    if (t) {
      const spaceId = taskSpaceId(data, t);
      if (spaceId) targets.add('space:' + spaceId);
    }
  }
  if (target.type === 'project') addProject(target.id, true);
  if (target.type === 'space') {
    data.tasks
      .filter((t) => taskSpaceId(data, t) === target.id)
      .forEach((t) => targets.add('task:' + t.id));
    data.projects
      .filter((p) => p.spaceId === target.id)
      .forEach((p) => addProject(p.id, true));
    data.blueprints
      .filter(
        (b) =>
          b.spaceId === target.id ||
          data.projects.some(
            (p) => p.id === b.projectId && p.spaceId === target.id,
          ),
      )
      .forEach((b) => targets.add('blueprint:' + b.id));
  }
  if (target.type === 'blueprint') {
    const b = data.blueprints.find((b) => b.id === target.id);
    if (b?.projectId) addProject(b.projectId);
    if (b?.spaceId) targets.add('space:' + b.spaceId);
  }
  const ids = new Set(
    data.resourceLinks
      .filter((l) => targets.has(l.targetType + ':' + l.targetId))
      .map((l) => l.resourceId),
  );
  return data.resources
    .filter((r) => !r.archived && (r.shared || ids.has(r.id)))
    .sort((a, b) => a.title.localeCompare(b.title));
}
export function resourceSize(bytes: number) {
  return bytes > 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : Math.ceil(bytes / 1024) + ' KB';
}
