// @ts-check
// UX platform melhoria 1: role-based paths. A path is a reading guide over
// milestones/trilhas that already exist standalone — it never gates
// anything, so "done" here is read straight from the same per-course
// tr:progress:<slug> every course page already writes, never a separate
// progress store.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty, percent, buildProgressBar } from '../dom-helpers.js';
import { getProgress } from '../storage.js';

/** @typedef {import('../types.js').Path} Path */
/** @typedef {import('../types.js').PathStep} PathStep */

export async function renderPathsIndex() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando caminhos…'));

  let catalog;
  try {
    const resp = await fetch('./data/paths.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    catalog = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar os caminhos: ${err.message}`));
    return;
  }

  view.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Caminhos por papel';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'Guias de leitura por objetivo de carreira — um atalho, nunca um bloqueio: todo marco continua acessível direto pela trilha.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  view.appendChild(heading);

  const paths = catalog.paths || [];
  if (paths.length === 0) {
    view.appendChild(buildEmpty('Nenhum caminho disponível ainda.'));
    return;
  }

  const milestoneCounts = await loadMilestoneCounts();
  const grid = document.createElement('div');
  grid.className = 'course-grid';
  for (const path of paths) {
    grid.appendChild(buildPathCard(path, milestoneCounts));
  }
  view.appendChild(grid);
}

/**
 * @param {string} slug
 * @param {boolean} isFirstNavigation
 */
export async function renderPath(slug, isFirstNavigation) {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando caminho…'));

  let catalog;
  try {
    const resp = await fetch('./data/paths.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    catalog = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar o caminho: ${err.message}`));
    return;
  }

  const path = (catalog.paths || []).find((p) => p.slug === slug);
  if (!path) {
    view.innerHTML = '';
    view.appendChild(buildPathNotFound());
    announceRoute('Caminho não encontrado', isFirstNavigation);
    return;
  }

  const milestoneCounts = await loadMilestoneCounts();
  view.innerHTML = '';
  view.appendChild(buildPathView(path, milestoneCounts));
  announceRoute(path.title, isFirstNavigation);
}

/**
 * A "whole trilha" step is only done once every milestone in that course is
 * — this is the one piece of path-progress math that needs data outside
 * paths.json itself, so courses/index.json (already small, already fetched
 * elsewhere) is read once per path-view render.
 * @returns {Promise<Record<string, number>>} courseSlug -> milestoneCount
 */
async function loadMilestoneCounts() {
  try {
    const resp = await fetch('./data/courses/index.json');
    if (!resp.ok) return {};
    const index = await resp.json();
    const counts = {};
    for (const c of index.courses || []) counts[c.slug] = c.milestoneCount;
    return counts;
  } catch {
    return {};
  }
}

/** @param {PathStep} step */
function stepDone(step, milestoneCounts) {
  const set = getProgress(step.courseSlug);
  if (step.whole) {
    const total = milestoneCounts[step.courseSlug] || 0;
    return total > 0 && Math.min(set.size, total) >= total;
  }
  return set.has(step.milestoneId);
}

function countDoneSteps(path, milestoneCounts) {
  return path.steps.filter((s) => stepDone(s, milestoneCounts)).length;
}

/** Hours left across every step not yet done, milestone minutes rounded up. */
function hoursRemaining(path, milestoneCounts) {
  let minutes = 0;
  let hours = 0;
  for (const step of path.steps) {
    if (stepDone(step, milestoneCounts)) continue;
    if (step.whole) hours += step.estimatedHours || 0;
    else minutes += step.estimatedMinutes || 0;
  }
  return hours + Math.ceil(minutes / 60);
}

function buildPathNotFound() {
  const wrap = document.createElement('div');
  wrap.className = 'course-notfound';
  const msg = document.createElement('p');
  msg.className = 'empty';
  msg.textContent = 'Caminho não encontrado.';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/paths';
  back.textContent = '← Voltar para Caminhos';
  wrap.appendChild(msg);
  wrap.appendChild(back);
  return wrap;
}

/** @param {Path} path */
function buildPathCard(path, milestoneCounts) {
  const card = document.createElement('a');
  card.className = 'course-card';
  card.href = `#/paths/${path.slug}`;

  const title = document.createElement('h3');
  title.className = 'course-card-title';
  title.textContent = path.title;
  card.appendChild(title);

  if (path.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-card-subtitle';
    subtitle.textContent = path.subtitle;
    card.appendChild(subtitle);
  }

  const stepCount = path.steps.length;
  const meta = document.createElement('p');
  meta.className = 'course-card-meta';
  meta.textContent = `${path.estimatedHours}h · ${stepCount} etapa${stepCount === 1 ? '' : 's'}`;
  card.appendChild(meta);

  const done = countDoneSteps(path, milestoneCounts);
  const pct = percent(done, stepCount);
  const { wrapper } = buildProgressBar(pct, `${path.title}: ${pct}% concluído`);
  card.appendChild(wrapper);

  const label = document.createElement('span');
  label.className = 'progress-label';
  label.textContent = pct === 100 ? 'Concluído ✓' : `${pct}% concluído`;
  card.appendChild(label);

  return card;
}

/** @param {Path} path */
function buildPathView(path, milestoneCounts) {
  const root = document.createElement('div');
  root.className = 'course-view path-view';

  const header = document.createElement('div');
  header.className = 'course-header';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/paths';
  back.textContent = '← Caminhos';
  header.appendChild(back);

  const title = document.createElement('h2');
  title.className = 'course-title';
  title.textContent = path.title;
  header.appendChild(title);

  if (path.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-subtitle';
    subtitle.textContent = path.subtitle;
    header.appendChild(subtitle);
  }

  const total = path.steps.length;
  const done = countDoneSteps(path, milestoneCounts);
  const pct = percent(done, total);
  const progressBlock = document.createElement('div');
  progressBlock.className = 'course-progress';
  const { wrapper } = buildProgressBar(pct, `Progresso em ${path.title}: ${pct}% concluído`);
  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';
  progressLabel.textContent = `${pct}% • ${done} de ${total} etapas`;
  progressBlock.appendChild(wrapper);
  progressBlock.appendChild(progressLabel);
  header.appendChild(progressBlock);

  const remaining = hoursRemaining(path, milestoneCounts);
  const remainingLabel = document.createElement('p');
  remainingLabel.className = 'path-remaining';
  remainingLabel.textContent = remaining > 0 ? `≈ ${remaining}h restantes` : 'Caminho concluído ✓';
  header.appendChild(remainingLabel);

  root.appendChild(header);

  const note = document.createElement('p');
  note.className = 'path-note';
  note.textContent = 'Guia de leitura: nenhuma etapa bloqueia a próxima — qualquer marco continua acessível direto pela trilha.';
  root.appendChild(note);

  let currentGroup = null;
  let list = null;
  for (const step of path.steps) {
    if (!list || (step.group && step.group !== currentGroup)) {
      currentGroup = step.group || currentGroup;
      if (step.group) {
        const groupTitle = document.createElement('h3');
        groupTitle.className = 'path-group-title';
        groupTitle.textContent = step.group;
        root.appendChild(groupTitle);
      }
      list = document.createElement('ol');
      list.className = 'path-step-list';
      root.appendChild(list);
    }
    list.appendChild(buildPathStep(step, milestoneCounts));
  }

  return root;
}

/** @param {PathStep} step */
function buildPathStep(step, milestoneCounts) {
  const li = document.createElement('li');
  li.className = 'path-step';

  const done = stepDone(step, milestoneCounts);
  li.classList.toggle('done', done);

  const link = document.createElement('a');
  link.className = 'path-step-link';
  link.href = step.whole ? `#/learn/${step.courseSlug}` : `#/learn/${step.courseSlug}/${step.milestoneId}`;

  const titleLine = document.createElement('span');
  titleLine.className = 'path-step-title';
  titleLine.textContent = step.whole ? step.courseTitle : `${step.courseTitle} — ${step.milestoneTitle}`;
  link.appendChild(titleLine);

  const metaParts = [done ? 'Concluído ✓' : step.whole ? `${step.estimatedHours}h` : `${step.estimatedMinutes} min`];
  if (step.optional) metaParts.push('Opcional');
  const meta = document.createElement('span');
  meta.className = 'path-step-meta';
  meta.textContent = metaParts.join(' · ');
  link.appendChild(meta);

  li.appendChild(link);

  const why = document.createElement('p');
  why.className = 'path-step-why';
  why.textContent = step.why;
  li.appendChild(why);

  return li;
}
