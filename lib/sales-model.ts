import { parseCapture } from './task-capture';
export const salesStages = [
  'New',
  'Discovery',
  'Proposal',
  'Negotiation',
  'Won',
  'Lost',
] as const;
export type SalesStage = (typeof salesStages)[number];
export type Prospect = {
  id: string;
  name: string;
  nameKey: string;
  owner: string;
  stage: SalesStage;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type ProspectEvent = {
  id: string;
  prospectId: string;
  taskId: string | null;
  body: string;
  kind: string;
  actor: string;
  createdAt: string;
};
export const prospectNameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
export function parseSalesCapture(text: string, now = new Date()) {
  if (!/^\s*sales\s+meeting\s+with\b/i.test(text)) return null;
  const source = text.replace(/^\s*sales\s+meeting\s+with\s*/i, '').trim();
  const match =
    /^(?:"([^"]+)"|“([^”]+)”|'([^']+)'|([^,;]+?))\s*[,;]?\s*next\s+step\s*:\s*([\s\S]*)$/i.exec(
      source,
    );
  if (!match)
    return {
      name: '',
      nameKey: '',
      nextStep: '',
      due: '',
      errors: ['Use: Sales meeting with "Name", next step: what happens next'],
    };
  const name = (match[1] || match[2] || match[3] || match[4]).trim();
  const step = parseCapture(match[5], { spaces: [], projects: [] }, { now });
  const errors = [...step.errors];
  if (!name || name.length > 140)
    errors.unshift('Use a prospect name of 1–140 characters.');
  return {
    name,
    nameKey: prospectNameKey(name),
    nextStep: step.title,
    due: step.due,
    errors,
  };
}
