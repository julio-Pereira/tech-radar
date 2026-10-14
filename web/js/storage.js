// @ts-check
// Learning tracks: all localStorage access, in one place. Every read/write is
// guarded so corrupt/unavailable storage degrades gracefully (0% progress,
// no "continue" offered) instead of throwing.

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
