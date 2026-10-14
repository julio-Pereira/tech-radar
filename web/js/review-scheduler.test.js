// @ts-check
// node --test web/js/review-scheduler.test.js — no framework, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, isDue, BOX_INTERVALS_DAYS } from './review-scheduler.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERENCE_DATES = [
  new Date('2026-01-01T12:00:00Z'),
  new Date('2026-02-28T00:00:00Z'), // day before a leap-year Feb 29
  new Date('2026-12-31T23:59:59Z'), // year boundary
  new Date('2024-02-28T06:00:00Z'), // leap year itself
];

test('interval never decreases across a run of consecutive correct answers', () => {
  for (const today of REFERENCE_DATES) {
    let state;
    let prevDays = 0;
    for (let i = 0; i < BOX_INTERVALS_DAYS.length + 2; i++) {
      state = schedule(state, true, today);
      const days = BOX_INTERVALS_DAYS[state.box];
      assert.ok(days >= prevDays, `interval regressed: ${days} < ${prevDays} at step ${i}`);
      prevDays = days;
    }
    // Caps at the last box instead of growing forever.
    assert.equal(state.box, BOX_INTERVALS_DAYS.length - 1);
  }
});

test('a wrong answer always resets to box 0, regardless of the starting box', () => {
  for (const startBox of [0, 1, 3, BOX_INTERVALS_DAYS.length - 1]) {
    const result = schedule({ box: startBox }, false, REFERENCE_DATES[0]);
    assert.equal(result.box, 0);
  }
  // Also true for a card that's never been reviewed before.
  assert.equal(schedule(undefined, false, REFERENCE_DATES[0]).box, 0);
});

test('dueAt is never in the past (always strictly after today), for every box and both outcomes', () => {
  for (const today of REFERENCE_DATES) {
    const todayISO = today.toISOString().slice(0, 10);
    for (const startBox of [0, 1, 3, BOX_INTERVALS_DAYS.length - 1]) {
      for (const correct of [true, false]) {
        const result = schedule({ box: startBox }, correct, today);
        assert.ok(result.dueAt > todayISO, `${result.dueAt} is not after ${todayISO}`);
      }
    }
  }
});

test('determinism: identical inputs (distinct Date objects, same instant) produce identical output', () => {
  const a = schedule({ box: 2 }, true, new Date('2026-05-15T10:00:00Z'));
  const b = schedule({ box: 2 }, true, new Date('2026-05-15T10:00:00Z'));
  assert.deepEqual(a, b);
});

test('a run of correct answers climbs the interval table one box at a time, then caps', () => {
  // A brand-new card starts "resting" in box 0; a correct answer promotes it
  // to box 1 BEFORE computing this due date — so the first correct answer
  // already uses box 1's (2-day) interval, not box 0's (1-day) interval.
  // That's intentional: box 0 (1 day) is only ever reached by a wrong
  // answer resetting the card, never by a correct one.
  let state;
  const today = REFERENCE_DATES[0];
  const expectedIntervals = [2, 4, 8, 16, 32, 32]; // BOX_INTERVALS_DAYS[1..5], then capped
  for (const expectedDays of expectedIntervals) {
    state = schedule(state, true, today);
    const expected = new Date(today.getTime());
    expected.setUTCDate(expected.getUTCDate() + expectedDays);
    assert.equal(state.dueAt, expected.toISOString().slice(0, 10));
  }
});

test('isDue: a never-reviewed card is always due', () => {
  assert.equal(isDue(undefined, new Date()), true);
  assert.equal(isDue(null, new Date()), true);
});

test('isDue: true once dueAt is today or earlier, false while still in the future', () => {
  const today = new Date('2026-06-15T00:00:00Z');
  assert.equal(isDue({ dueAt: '2026-06-14' }, today), true); // overdue
  assert.equal(isDue({ dueAt: '2026-06-15' }, today), true); // due today
  assert.equal(isDue({ dueAt: '2026-06-16' }, today), false); // not yet
});
