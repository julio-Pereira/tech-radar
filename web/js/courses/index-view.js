// @ts-check
import { buildBadge, buildLoading, buildError, buildEmpty, levelLabel, percent, buildProgressBar } from '../dom-helpers.js';
import { getProgress, getLastCourse } from '../storage.js';

/** @typedef {import('../types.js').IndexEntry} IndexEntry */

export async function renderCoursesIndex() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando trilhas…'));

  let index;
  try {
    const resp = await fetch('./data/courses/index.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    index = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar as trilhas: ${err.message}`));
    return;
  }

  view.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Trilhas de Aprendizado';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'Cursos lineares e progressivos, com exemplos aplicados ao contexto de uma fintech.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  view.appendChild(heading);

  const courses = (index.courses || []);
  if (courses.length === 0) {
    view.appendChild(buildEmpty('Nenhuma trilha disponível ainda.'));
    return;
  }

  const lastCourse = courses.find((c) => c.slug === getLastCourse());
  if (lastCourse) {
    view.appendChild(buildContinueBanner(lastCourse));
  }

  const grid = document.createElement('div');
  grid.className = 'course-grid';
  for (const entry of courses) {
    grid.appendChild(buildCourseCard(entry));
  }
  view.appendChild(grid);
}

/**
 * "Continue where you left off", shown above the grid when the reader has
 * opened a course before. Deliberately light: just the course, from
 * `index.json` already in hand — the milestone-level "Continuar: Marco N"
 * button lives on the course page itself, where the full course JSON (with
 * milestone titles) is already loaded, so this never costs an extra fetch.
 */
function buildContinueBanner(entry) {
  const banner = document.createElement('a');
  banner.className = 'continue-banner';
  banner.href = `#/learn/${entry.slug}`;

  const eyebrow = document.createElement('span');
  eyebrow.className = 'continue-banner-eyebrow';
  eyebrow.textContent = 'Continuar de onde parou';

  const title = document.createElement('span');
  title.className = 'continue-banner-title';
  title.textContent = entry.title;

  banner.appendChild(eyebrow);
  banner.appendChild(title);
  return banner;
}

/** @param {IndexEntry} entry */
function buildCourseCard(entry) {
  const card = document.createElement('a');
  card.className = 'course-card';
  card.href = `#/learn/${entry.slug}`;

  const badges = document.createElement('div');
  badges.className = 'course-card-badges';
  badges.appendChild(buildBadge(entry.category, 'category-badge'));
  if (entry.level) badges.appendChild(buildBadge(levelLabel(entry.level), 'level-badge'));
  card.appendChild(badges);

  const title = document.createElement('h3');
  title.className = 'course-card-title';
  title.textContent = entry.title;
  card.appendChild(title);

  if (entry.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-card-subtitle';
    subtitle.textContent = entry.subtitle;
    card.appendChild(subtitle);
  }

  const meta = document.createElement('p');
  meta.className = 'course-card-meta';
  const parts = [];
  if (entry.estimatedHours) parts.push(`${entry.estimatedHours}h`);
  parts.push(`${entry.milestoneCount} marco${entry.milestoneCount === 1 ? '' : 's'}`);
  meta.textContent = parts.join(' · ');
  card.appendChild(meta);

  const done = Math.min(getProgress(entry.slug).size, entry.milestoneCount);
  const pct = percent(done, entry.milestoneCount);
  const { wrapper } = buildProgressBar(pct, `${entry.title}: ${pct}% concluído`);
  card.appendChild(wrapper);

  const label = document.createElement('span');
  label.className = 'progress-label';
  label.textContent = pct === 100 ? 'Concluído ✓' : `${pct}% concluído`;
  card.appendChild(label);

  return card;
}
