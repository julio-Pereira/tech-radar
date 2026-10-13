// @ts-check
import { announceRoute } from '../announce.js';
import { buildBadge, buildLoading, levelLabel, percent, buildProgressBar } from '../dom-helpers.js';
import { getProgress, setLastCourse, getLastVisited, clearProgress } from '../storage.js';
import { buildTimelineNode } from './timeline-node.js';
import { buildGlossaryBlock, buildSourcesBlock } from './content-blocks.js';
import { scrollToMilestone } from './scroll.js';

/** @typedef {import('../types.js').Course} Course */
/** @typedef {import('../types.js').Milestone} Milestone */

/**
 * @param {string} slug
 * @param {boolean} isFirstNavigation
 * @param {string} [marcoId] from a bridge-style deep link
 *   (#/learn/<slug>/<marco-id>, UX item 14) — scrolls to and expands that
 *   milestone instead of the usual "continue reading" target. Trilha-as-page
 *   stays trilha-as-page: this is an anchor into the one course fetch, not a
 *   second route or a second request.
 */
export async function renderCourse(slug, isFirstNavigation, marcoId) {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando trilha…'));

  let course;
  try {
    const resp = await fetch(`./data/courses/${slug}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    course = await resp.json();
  } catch {
    view.innerHTML = '';
    view.appendChild(buildCourseNotFound());
    announceRoute('Trilha não encontrada', isFirstNavigation);
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildCourseView(course, marcoId));
  announceRoute(course.title, isFirstNavigation);
}

function buildCourseNotFound() {
  const wrap = document.createElement('div');
  wrap.className = 'course-notfound';
  const msg = document.createElement('p');
  msg.className = 'empty';
  msg.textContent = 'Trilha não encontrada.';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/learn';
  back.textContent = '← Voltar para Trilhas';
  wrap.appendChild(msg);
  wrap.appendChild(back);
  return wrap;
}

/**
 * @param {Course} course
 * @param {string} [marcoId] see renderCourse
 */
function buildCourseView(course, marcoId) {
  setLastCourse(course.slug);

  const root = document.createElement('div');
  root.className = 'course-view';

  const completed = getProgress(course.slug);
  const total = course.milestones.length;

  // Header ---------------------------------------------------------------------
  const header = document.createElement('div');
  header.className = 'course-header';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/learn';
  back.textContent = '← Trilhas';
  header.appendChild(back);

  const badges = document.createElement('div');
  badges.className = 'course-card-badges';
  badges.appendChild(buildBadge(course.category, 'category-badge'));
  if (course.level) badges.appendChild(buildBadge(levelLabel(course.level), 'level-badge'));
  header.appendChild(badges);

  const title = document.createElement('h2');
  title.className = 'course-title';
  title.textContent = course.title;
  header.appendChild(title);

  if (course.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-subtitle';
    subtitle.textContent = course.subtitle;
    header.appendChild(subtitle);
  }

  // Progress block (live-updated as milestones toggle) -------------------------
  const doneCount = countDone(completed, course.milestones);
  const progressBlock = document.createElement('div');
  progressBlock.className = 'course-progress';
  const { wrapper, bar } = buildProgressBar(
    percent(doneCount, total),
    `Progresso em ${course.title}: ${percent(doneCount, total)}% concluído`,
  );
  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'reset-btn';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Resetar progresso';

  progressBlock.appendChild(wrapper);
  progressBlock.appendChild(progressLabel);
  progressBlock.appendChild(resetBtn);
  header.appendChild(progressBlock);

  // Timeline -------------------------------------------------------------------
  const timeline = document.createElement('ol');
  timeline.className = 'timeline';

  // "Continuar" — only once the timeline exists, since clicking it needs to
  // find the target node inside `timeline`.
  const lastVisitedMilestone = course.milestones.find((m) => m.id === getLastVisited(course.slug));
  if (lastVisitedMilestone) {
    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'continue-btn';
    continueBtn.textContent = `Continuar: Marco ${lastVisitedMilestone.order} — ${lastVisitedMilestone.title}`;
    continueBtn.addEventListener('click', () => {
      scrollToMilestone(timeline, lastVisitedMilestone.id, { expand: true });
    });
    header.appendChild(continueBtn);
  }

  root.appendChild(header);

  /** Recomputes progress bar, label, dots, and aria-current after any toggle. */
  const refresh = () => {
    const set = getProgress(course.slug);
    const done = countDone(set, course.milestones);
    const pct = percent(done, total);
    bar.style.width = `${pct}%`;
    wrapper.setAttribute('aria-valuenow', String(pct));
    wrapper.setAttribute('aria-label', `Progresso em ${course.title}: ${pct}% concluído`);
    progressLabel.textContent = `${pct}% • ${done} de ${total} marcos`;

    const firstPending = course.milestones.find(m => !set.has(m.id));
    timeline.querySelectorAll('.timeline-node').forEach((node) => {
      const id = node.getAttribute('data-id');
      const isDone = set.has(id);
      node.classList.toggle('done', isDone);
      const dot = node.querySelector('.node-dot');
      if (dot) dot.textContent = isDone ? '✓' : node.getAttribute('data-order');
      if (firstPending && id === firstPending.id) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    });
  };

  course.milestones.forEach((milestone, idx) => {
    const prev = course.milestones[idx - 1] || null;
    const next = course.milestones[idx + 1] || null;
    timeline.appendChild(buildTimelineNode(course.slug, milestone, completed, refresh, prev, next, timeline));
  });
  root.appendChild(timeline);

  // Glossary appendix (not a milestone: no id, no progress) --------------------
  if (course.glossary) {
    root.appendChild(buildGlossaryBlock(course.glossary));
  }

  // Sources (attribution) ------------------------------------------------------
  if (course.sources && course.sources.length > 0) {
    root.appendChild(buildSourcesBlock(course.sources));
  }

  resetBtn.addEventListener('click', () => {
    if (!confirm('Resetar todo o progresso desta trilha?')) return;
    clearProgress(course.slug);
    timeline.querySelectorAll('.node-check').forEach((cb) => { cb.checked = false; });
    refresh();
  });

  refresh();
  // Defer until appended to the DOM so scrollIntoView has layout. A bridge
  // deep link wins over "continue reading" — someone followed a link to a
  // specific marco, not back to wherever they left off — but only when it
  // actually names a real milestone; a stale/bad link just falls through to
  // the usual default instead of landing on an empty page.
  const deepLinkMilestone = marcoId && course.milestones.find((m) => m.id === marcoId);
  requestAnimationFrame(() => {
    if (deepLinkMilestone) {
      scrollToMilestone(timeline, deepLinkMilestone.id, { expand: true });
      return;
    }
    const set = getProgress(course.slug);
    const target = lastVisitedMilestone || course.milestones.find((m) => !set.has(m.id));
    if (target) scrollToMilestone(timeline, target.id);
  });
  return root;
}

/** Counts only completed ids that still exist in the course (ignores stale ids). */
function countDone(set, milestones) {
  let n = 0;
  for (const m of milestones) if (set.has(m.id)) n++;
  return n;
}
