// Recurrence for tasks and meetings. Deliberately small vocabulary, fully
// deterministic date math, and no scheduler: a task spawns its next occurrence
// in the same transaction that completes it, and a meeting materializes its
// next occurrence once the current one's time has passed. An unattended
// recurring item simply stays overdue; it never multiplies on its own.

export const recurrenceOptions = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
] as const;
export type Recurrence = (typeof recurrenceOptions)[number] | '';

export function validRecurrence(value: unknown): value is Recurrence {
  return (
    value === '' ||
    recurrenceOptions.includes(value as (typeof recurrenceOptions)[number])
  );
}

export function recurrenceLabel(value: string) {
  return value === 'weekly'
    ? 'Repeats weekly'
    : value === 'biweekly'
      ? 'Repeats every two weeks'
      : value === 'monthly'
        ? 'Repeats monthly'
        : value === 'quarterly'
          ? 'Repeats quarterly'
          : '';
}

const pad = (n: number) => String(n).padStart(2, '0');

// Add the rhythm to a UTC date. Monthly and quarterly keep the day of month,
// clamped to the target month's length (Jan 31 → Feb 28/29).
function advance(rhythm: string, date: Date) {
  const next = new Date(date.getTime());
  if (rhythm === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (rhythm === 'biweekly') next.setUTCDate(next.getUTCDate() + 14);
  else {
    const months = rhythm === 'quarterly' ? 3 : 1;
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
    ).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next;
}

// Next due day for a task, as YYYY-MM-DD. Advancing starts from the later of
// the previous due date and the completion day, so a task finished weeks late
// recurs in the future instead of already overdue. Without a due date, the
// rhythm counts from the completion day.
export function nextDueDate(rhythm: string, due: string, completedDay: string) {
  const base =
    /^\d{4}-\d{2}-\d{2}$/.test(due) && due >= completedDay ? due : completedDay;
  const next = advance(rhythm, new Date(base + 'T00:00:00Z'));
  return (
    next.getUTCFullYear() +
    '-' +
    pad(next.getUTCMonth() + 1) +
    '-' +
    pad(next.getUTCDate())
  );
}

// Next start for a meeting, preserving its time of day. Advances from the
// meeting's own start repeatedly until the result is in the future, so a
// rhythm neglected for months yields one upcoming occurrence, not a backlog.
export function nextMeetingStart(rhythm: string, startsAt: string, now: Date) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  let next = advance(rhythm, start);
  for (let i = 0; i < 400 && next.getTime() <= now.getTime(); i++)
    next = advance(rhythm, next);
  if (next.getTime() <= now.getTime()) return null;
  return next.toISOString();
}
