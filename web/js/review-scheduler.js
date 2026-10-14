// @ts-check
// UX platform melhoria 5 (revisão espaçada): a pure Leitner
// scheduler. No DOM, no Date.now() — `today` is always a parameter — so
// it's fully deterministic and testable with `node --test`
// (review-scheduler.test.js), no framework needed.
export const BOX_INTERVALS_DAYS = [1, 2, 4, 8, 16, 32];

/**
 * @param {{ box: number } | undefined | null} state current card state —
 *   absent/null means the card has never been reviewed.
 * @param {boolean} correct whether the reader got it right this time
 *   ("lembrei" for a glossary card, or the right quiz answer).
 * @param {Date} today the reference date — always injected, never read
 *   from inside this function.
 * @returns {{ box: number, dueAt: string }} dueAt is "YYYY-MM-DD", always
 *   strictly after `today`.
 *
 * A new card (no state yet) starts resting in box 0; a correct answer
 * promotes it to the NEXT box before computing dueAt from that new box's
 * interval — so a brand-new card's first correct review already waits 2
 * days (box 1), not 1 (box 0). Box 0's 1-day interval is only ever reached
 * by a wrong answer resetting the card, never by a correct one: "acerto
 * sobe uma caixa" (a correct answer raises the card by one box) applies to
 * new cards exactly the same as reviewed ones.
 */
export function schedule(state, correct, today) {
  const currentBox = state && typeof state.box === 'number' ? state.box : 0;
  const box = correct ? Math.min(currentBox + 1, BOX_INTERVALS_DAYS.length - 1) : 0;
  const days = BOX_INTERVALS_DAYS[box];

  const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  due.setUTCDate(due.getUTCDate() + days);

  return { box, dueAt: due.toISOString().slice(0, 10) };
}

/** A card with no state yet, or whose dueAt has passed, is due today. */
export function isDue(state, today) {
  if (!state || !state.dueAt) return true;
  const todayISO = toISODate(today);
  return state.dueAt <= todayISO;
}

function toISODate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
