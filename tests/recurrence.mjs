import assert from 'node:assert/strict';
import {
  validRecurrence,
  recurrenceLabel,
  nextDueDate,
  nextMeetingStart,
} from '../lib/recurrence.ts';

// Vocabulary.
assert.equal(validRecurrence(''), true);
assert.equal(validRecurrence('weekly'), true);
assert.equal(validRecurrence('monthly'), true);
assert.equal(validRecurrence('daily'), false);
assert.equal(validRecurrence(null), false);
assert.equal(recurrenceLabel('quarterly'), 'Repeats quarterly');
assert.equal(recurrenceLabel(''), '');

// Task due dates advance from the later of due and completion day.
assert.equal(nextDueDate('weekly', '2026-09-11', '2026-09-11'), '2026-09-18');
assert.equal(nextDueDate('biweekly', '2026-09-11', '2026-09-11'), '2026-09-25');
// Completed three weeks late: the next occurrence is upcoming, not overdue.
assert.equal(nextDueDate('weekly', '2026-08-21', '2026-09-11'), '2026-09-18');
// Completed early: the rhythm holds to the planned cadence.
assert.equal(nextDueDate('weekly', '2026-09-11', '2026-09-09'), '2026-09-18');
// No due date: count from the completion day.
assert.equal(nextDueDate('monthly', '', '2026-09-11'), '2026-10-11');

// Month-length clamping.
assert.equal(nextDueDate('monthly', '2026-01-31', '2026-01-31'), '2026-02-28');
assert.equal(nextDueDate('monthly', '2028-01-31', '2028-01-31'), '2028-02-29');
assert.equal(nextDueDate('monthly', '2026-08-31', '2026-08-31'), '2026-09-30');
assert.equal(nextDueDate('quarterly', '2026-11-30', '2026-11-30'), '2027-02-28');
// Year rollover.
assert.equal(nextDueDate('monthly', '2026-12-15', '2026-12-15'), '2027-01-15');

// Meetings preserve their time of day.
const now = new Date('2026-09-11T10:00:00Z');
assert.equal(
  nextMeetingStart('monthly', '2026-09-04T13:00:00.000Z', now),
  '2026-10-04T13:00:00.000Z',
);
assert.equal(
  nextMeetingStart('weekly', '2026-09-10T09:30:00.000Z', now),
  '2026-09-17T09:30:00.000Z',
);
// A rhythm neglected for months yields one upcoming occurrence, not a backlog.
assert.equal(
  nextMeetingStart('monthly', '2026-01-08T14:00:00.000Z', now),
  '2026-10-08T14:00:00.000Z',
);
assert.equal(
  nextMeetingStart('weekly', '2025-01-02T08:00:00.000Z', now),
  '2026-09-17T08:00:00.000Z',
);
// Invalid input yields nothing rather than a guess.
assert.equal(nextMeetingStart('weekly', 'not-a-date', now), null);

console.log(
  'PASS: recurrence vocabulary, later-of-due-and-completion advancement, month-length clamping, leap years, year rollover, meeting time preservation, catch-up to a single upcoming occurrence, and invalid-input refusal.',
);
