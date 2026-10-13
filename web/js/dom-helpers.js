// @ts-check
// Generic DOM-building and formatting helpers shared across the radar and
// learning-track views.

export function percent(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * Builds a progress bar; returns { wrapper, bar } so callers can update
 * width. `label` names the bar for assistive tech (e.g. "Trilha X: 40%
 * concluído") — axe-core's aria-progressbar-name rule requires every
 * progressbar to have one.
 */
export function buildProgressBar(pct, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'progress';
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuemin', '0');
  wrapper.setAttribute('aria-valuemax', '100');
  wrapper.setAttribute('aria-valuenow', String(pct));
  wrapper.setAttribute('aria-label', label || `${pct}% concluído`);

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.style.width = `${pct}%`;
  wrapper.appendChild(bar);
  return { wrapper, bar };
}

// course.yaml's `level` is free text written in English by convention
// (iota-style: beginner/intermediate/advanced). Only the label shown to
// readers is translated here — the underlying value, used for filtering/
// grouping, stays untouched.
const LEVEL_LABELS = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

export function levelLabel(level) {
  return LEVEL_LABELS[level] || level;
}

export function buildBadge(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

export function buildLoading(text) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.textContent = text;
  return el;
}

export function buildError(text) {
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = text;
  return el;
}

export function buildEmpty(text) {
  const el = document.createElement('p');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

/** Minimal CSS.escape fallback for attribute selectors. */
export function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/[^\w-]/g, '\\$&');
}

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/**
 * pt-BR relative time ("há 3 min", "em 2 h"). Handles future dates correctly
 * (Intl.RelativeTimeFormat takes the sign itself, so there is no "-3m ago").
 */
export function formatRelative(date) {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return relativeFormatter.format(diffSeconds, 'second');
  const minutes = Math.round(diffSeconds / 60);
  if (abs < 3_600) return relativeFormatter.format(minutes, 'minute');
  const hours = Math.round(diffSeconds / 3_600);
  if (abs < 86_400) return relativeFormatter.format(hours, 'hour');
  const days = Math.round(diffSeconds / 86_400);
  if (abs < 2_592_000) return relativeFormatter.format(days, 'day');
  return date.toLocaleDateString('pt-BR');
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * UX platform melhoria 6 (content freshness): a milestone that opted in
 * (`reviewedAt` set) shows when it was last checked; one that's also past
 * its `reviewDue` shows a plain-text warning instead — "texto, não só cor",
 * so the signal survives even without the accompanying color. Compared
 * against the caller's own clock (`new Date()`), not a server date, which
 * is also what a mocked browser clock in tests controls.
 *
 * Dates are parsed by splitting the "YYYY-MM-DD" string, not via `new
 * Date(...)`, for the displayed month/year specifically — parsing a
 * date-only string gives UTC midnight, and reading .getMonth() back out of
 * that in a negative-UTC-offset timezone can roll the displayed month back
 * by one. String splitting sidesteps that entirely.
 */
export function freshnessLabel(milestone) {
  if (!milestone.reviewedAt) return null;
  if (milestone.reviewDue && new Date(milestone.reviewDue) < new Date()) {
    return 'Pode estar desatualizado';
  }
  const [year, month] = milestone.reviewedAt.split('-');
  return `Revisado em ${MONTH_ABBR[Number(month) - 1]}/${year}`;
}
