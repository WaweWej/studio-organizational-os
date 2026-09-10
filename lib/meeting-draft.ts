import type { Meeting } from './model';

const key = (scope: string, id: string) =>
  `studio:meeting-draft:v1:${scope}:${id}`;
export type MeetingPlanDraft = {
  id: string;
  source: string;
  connection: string;
  title: string;
  day: string;
  time: string;
  notes: string;
  participants: string;
};
export function readMeetingPlanDraft(
  scope: string,
  target: string,
): MeetingPlanDraft | null {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key(scope, target));
    if (!raw || raw.length > 150000) return null;
    const { savedAt, draft } = JSON.parse(raw);
    return Date.now() - savedAt < 7 * 86400000 &&
      [
        'id',
        'source',
        'connection',
        'title',
        'day',
        'time',
        'notes',
        'participants',
      ].every((k) => typeof draft?.[k] === 'string')
      ? draft
      : null;
  } catch {
    return null;
  }
}
export function writeMeetingPlanDraft(
  scope: string,
  target: string,
  draft: MeetingPlanDraft,
) {
  if (!scope || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      key(scope, target),
      JSON.stringify({ savedAt: Date.now(), draft }),
    );
  } catch {
    /* Keep the unsaved-change guard. */
  }
}
export function readMeetingDraft(
  scope: string,
  meeting: Meeting,
): Meeting | null {
  if (!scope || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key(scope, meeting.id));
    if (!raw || raw.length > 150000) return null;
    const { savedAt, draft } = JSON.parse(raw);
    if (
      Date.now() - savedAt > 7 * 86400000 ||
      draft?.id !== meeting.id ||
      !Number.isInteger(draft.revision) ||
      !['title', 'startsAt', 'agenda', 'notes', 'decisions'].every(
        (k) => typeof draft[k] === 'string',
      )
    )
      return null;
    // A response may have been lost after the server saved this exact draft.
    if (
      [
        'title',
        'startsAt',
        'agenda',
        'notes',
        'decisions',
        'status',
        'participants',
      ].every((k) => (draft[k] || '') === (meeting[k as keyof Meeting] || ''))
    )
      return null;
    return { ...meeting, ...draft };
  } catch {
    return null;
  }
}
export function writeMeetingDraft(scope: string, draft: Meeting) {
  if (!scope || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      key(scope, draft.id),
      JSON.stringify({ savedAt: Date.now(), draft }),
    );
  } catch {
    /* The editor retains the unsaved-change guard. */
  }
}
export function clearMeetingDraft(scope: string, id: string) {
  if (!scope || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key(scope, id));
  } catch {
    /* Saved notes are authoritative. */
  }
}
