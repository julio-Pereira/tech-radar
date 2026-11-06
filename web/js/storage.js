// @ts-check
// Learning tracks: all localStorage access, in one place. Every read/write is
// guarded so corrupt/unavailable storage degrades gracefully (0% progress,
// no "continue" offered) instead of throwing.
import { localDateISO } from './dom-helpers.js';

// Storage is per-course: tr:progress:<slug> → JSON array of completed
// milestone ids.
const PROGRESS_PREFIX = 'tr:progress:';

/** @returns {Set<string>} completed milestone ids for a course. */
export function getProgress(slug) {
  try {
    const raw = localStorage.getItem(PROGRESS_PREFIX + slug);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveProgress(slug, set) {
  try {
    localStorage.setItem(PROGRESS_PREFIX + slug, JSON.stringify([...set]));
  } catch {
    // Storage full or unavailable — progress simply won't persist.
  }
}

export function toggleMilestone(slug, id) {
  const set = getProgress(slug);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  saveProgress(slug, set);
  return set;
}

export function clearProgress(slug) {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + slug);
  } catch {
    // ignore
  }
}

// "Continue where you left off": separate from progress on purpose — a
// milestone can be opened and read without ever being marked complete, and
// that still counts as "where the reader was".
const LAST_VISITED_PREFIX = 'tr:lastvisited:';
const LAST_COURSE_KEY = 'tr:lastcourse';

export function getLastVisited(slug) {
  try {
    return localStorage.getItem(LAST_VISITED_PREFIX + slug) || null;
  } catch {
    return null;
  }
}

export function setLastVisited(slug, milestoneId) {
  try {
    localStorage.setItem(LAST_VISITED_PREFIX + slug, milestoneId);
  } catch {
    // Storage full or unavailable — "continue" just won't be offered.
  }
}

export function getLastCourse() {
  try {
    return localStorage.getItem(LAST_COURSE_KEY) || null;
  } catch {
    return null;
  }
}

export function setLastCourse(slug) {
  try {
    localStorage.setItem(LAST_COURSE_KEY, slug);
  } catch {
    // ignore
  }
}

// Hands-on blocks (UX item 10): one state object per course. `open`/`done`
// are keyed by "<milestoneId>:<blockKey>"; `seen` is keyed by milestoneId
// alone. A milestone's default open state (Tutorial, else its first block)
// is materialized into `open` the first time it's ever rendered, and `seen`
// records that this happened — independently of what `open` contains
// afterwards, since the reader may well end up closing that very block.
// Without a separate `seen` flag, inferring "already defaulted" from
// `open`'s contents would re-apply the default (reopening a block the
// reader deliberately closed) the next time nothing of that milestone's is
// in `open`. `done` is a purely cosmetic per-block mark, independent of
// progress.
const HANDSON_PREFIX = 'tr:handson:';

/** @returns {{ open: string[], done: string[], seen: string[] }} */
export function getHandsonState(slug) {
  try {
    const raw = localStorage.getItem(HANDSON_PREFIX + slug);
    if (!raw) return { open: [], done: [], seen: [] };
    const parsed = JSON.parse(raw);
    return {
      open: Array.isArray(parsed.open) ? parsed.open : [],
      done: Array.isArray(parsed.done) ? parsed.done : [],
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
    };
  } catch {
    return { open: [], done: [], seen: [] };
  }
}

export function saveHandsonState(slug, state) {
  try {
    localStorage.setItem(HANDSON_PREFIX + slug, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — open/done state just won't persist.
  }
}

// Quiz history (UX item 18): per course, per milestone — the best score ever
// reached and when it was last attempted. Independent of tr:progress: a
// milestone can be completed without ever attempting its quiz (unless
// `completion: quiz` gates it), and the reader may reattempt after already
// completing it. Answers themselves are still never persisted (quiz.js's
// own comment) — only the outcome.
const QUIZ_PREFIX = 'tr:quiz:';

/** @returns {Record<string, { bestScore: number, total: number, lastAttemptAt: string }>} */
export function getQuizHistory(slug) {
  try {
    const raw = localStorage.getItem(QUIZ_PREFIX + slug);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveQuizAttempt(slug, milestoneId, correct, total) {
  try {
    const history = getQuizHistory(slug);
    const prevBest = history[milestoneId] ? history[milestoneId].bestScore : -1;
    history[milestoneId] = {
      bestScore: Math.max(prevBest, correct),
      total,
      lastAttemptAt: new Date().toISOString(),
    };
    localStorage.setItem(QUIZ_PREFIX + slug, JSON.stringify(history));
  } catch {
    // Storage full or unavailable — the attempt still works, just won't persist.
  }
}

// Spaced review (UX platform melhoria 5): one global key, not per-course —
// a review session mixes cards from every trilha. `cards` maps a stable
// cyrb53 id (hash.js) to its Leitner box + next due date (review-scheduler.js
// computes both, never this file). `todayCount` is how many cards have been
// reviewed since `todayDate`; a new day resets the count but never touches
// `cards` — the scheduler decides what's due, this module just persists it.
// Empty/corrupt state means "recompute from scratch" by design, never a
// hard failure.
const REVIEW_KEY = 'tr:review:v1';
export const DEFAULT_DAILY_LIMIT = 10;

/** @returns {{ cards: Record<string, { box: number, dueAt: string }>, dailyLimit: number, todayDate: string, todayCount: number }} */
export function getReviewState() {
  const today = localDateISO();
  const fresh = { cards: {}, dailyLimit: DEFAULT_DAILY_LIMIT, todayDate: today, todayCount: 0 };
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fresh;

    const cards = parsed.cards && typeof parsed.cards === 'object' && !Array.isArray(parsed.cards) ? parsed.cards : {};
    const dailyLimit = typeof parsed.dailyLimit === 'number' && parsed.dailyLimit > 0 ? parsed.dailyLimit : DEFAULT_DAILY_LIMIT;
    const sameDay = parsed.todayDate === today;
    return {
      cards,
      dailyLimit,
      todayDate: today,
      todayCount: sameDay && typeof parsed.todayCount === 'number' ? parsed.todayCount : 0,
    };
  } catch {
    return fresh;
  }
}

export function saveReviewState(state) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — review progress just won't persist.
  }
}

export function setDailyLimit(limit) {
  const state = getReviewState();
  state.dailyLimit = limit;
  saveReviewState(state);
}

/** Records one card's outcome and bumps today's count. Returns the updated state. */
export function recordReview(cardId, box, dueAt) {
  const state = getReviewState();
  state.cards[cardId] = { box, dueAt };
  state.todayCount += 1;
  saveReviewState(state);
  return state;
}

// Banco de desafios (jornada de entrevistas): one global key. `rodadas`
// keeps, per desafio, the finished simulated rounds — seed, when, and the
// VERIFIED and SELF-ASSESSED percentages, always apart. `rascunhos` keeps the
// entregável drafts by "id|seed". Everything stays in this browser:
// comportamental answers are personal data (LGPD) and never leave it. Like
// every tr:* key, it goes into the local export file, nowhere else.
const DESAFIOS_KEY = 'tr:desafios:v1';

export const DEFAULT_CADENCIA = 2;

/** @returns {{ rodadas: Record<string, { seed: number, at: string, verificadoPct: number, autoPct: number }[]>, rascunhos: Record<string, string>, cadencia: number }} */
export function getDesafiosState() {
  const fresh = { rodadas: {}, rascunhos: {}, cadencia: DEFAULT_CADENCIA };
  try {
    const raw = localStorage.getItem(DESAFIOS_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fresh;
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const cadencia = Number.isInteger(parsed.cadencia) && parsed.cadencia >= 1 && parsed.cadencia <= 7 ? parsed.cadencia : DEFAULT_CADENCIA;
    return { rodadas: obj(parsed.rodadas), rascunhos: obj(parsed.rascunhos), cadencia };
  } catch {
    return fresh;
  }
}

function saveDesafiosState(state) {
  try {
    localStorage.setItem(DESAFIOS_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — the round still works, it just won't persist.
  }
}

export function getDesafioDraft(id, seed) {
  return getDesafiosState().rascunhos[`${id}|${seed}`] || '';
}

export function saveDesafioDraft(id, seed, text) {
  const state = getDesafiosState();
  state.rascunhos[`${id}|${seed}`] = text;
  saveDesafiosState(state);
}

/** Records (or updates, same seed) a finished simulated round. */
export function recordDesafioRodada(id, seed, verificadoPct, autoPct, partes) {
  const state = getDesafiosState();
  const list = Array.isArray(state.rodadas[id]) ? state.rodadas[id] : [];
  const entry = partes ? { seed, at: new Date().toISOString(), verificadoPct, autoPct, partes } : { seed, at: new Date().toISOString(), verificadoPct, autoPct };
  const i = list.findIndex((r) => r.seed === seed);
  if (i >= 0) list[i] = partes ? { ...list[i], verificadoPct, autoPct, partes } : { ...list[i], verificadoPct, autoPct };
  else list.push(entry);
  state.rodadas[id] = list;
  saveDesafiosState(state);
}

/** Weekly practice target (desafios per week), 1 to 7. */
export function setDesafiosCadencia(n) {
  const state = getDesafiosState();
  state.cadencia = Math.max(1, Math.min(7, Math.round(n) || DEFAULT_CADENCIA));
  saveDesafiosState(state);
}
