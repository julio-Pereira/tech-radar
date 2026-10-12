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
