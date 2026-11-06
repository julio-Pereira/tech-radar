// @ts-check
// UX platform melhoria 1: role-based paths. A path is a reading guide over
// milestones/trilhas that already exist standalone — it never gates
// anything, so "done" here is read straight from the same per-course
// tr:progress:<slug> every course page already writes, never a separate
// progress store.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty, percent, buildProgressBar } from '../dom-helpers.js';
import { getProgress, getDesafiosState } from '../storage.js';
import { missingPrereqs } from '../desafio-logic.js';
import { radar, vertex, EIXOS } from '../desafio-radar.js';
import { el as svgEl, label as svgLabel } from './diagram-svg.js';
import { loadDesafiosSafe } from './desafios-agenda-view.js';

/** @typedef {import('../types.js').Path} Path */
/** @typedef {import('../types.js').PathStep} PathStep */
/**
 * What step progress is computed from: milestone counts (whole-trilha
 * steps) and, only for a path with a desafios step, the bank and the
 * reader's rounds.
 * @typedef {{ milestoneCounts: Record<string, number>, desafios: any[], rodadas: Record<string, any[]> }} Ctx
 */

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

  const ctx = await loadCtx(paths);
  const grid = document.createElement('div');
  grid.className = 'course-grid';
  for (const path of paths) {
    grid.appendChild(buildPathCard(path, ctx));
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

  const ctx = await loadCtx([path]);
  view.innerHTML = '';
  view.appendChild(buildPathView(path, ctx));
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

/**
 * The desafio bank is fetched only when some path has a desafios step.
 * @param {Path[]} paths
 * @returns {Promise<Ctx>}
 */
async function loadCtx(paths) {
  const needsDesafios = paths.some((p) => p.steps.some((s) => s.desafios));
  const [milestoneCounts, desafios] = await Promise.all([
    loadMilestoneCounts(),
    needsDesafios ? loadDesafiosSafe() : Promise.resolve([]),
  ]);
  return { milestoneCounts, desafios, rodadas: needsDesafios ? getDesafiosState().rodadas : {} };
}

/** @param {Ctx} ctx @param {string} id */
function desafioFeito(ctx, id) {
  return Array.isArray(ctx.rodadas[id]) && ctx.rodadas[id].length > 0;
}

/** @param {PathStep} step @param {Ctx} ctx */
function stepDone(step, ctx) {
  if (step.desafios) {
    // Done once every desafio in the bank has at least one finished round;
    // the practice itself keeps going through the review schedule.
    return ctx.desafios.length > 0 && ctx.desafios.every((d) => desafioFeito(ctx, d.id));
  }
  const milestoneCounts = ctx.milestoneCounts;
  const set = getProgress(step.courseSlug);
  if (step.whole) {
    const total = milestoneCounts[step.courseSlug] || 0;
    return total > 0 && Math.min(set.size, total) >= total;
  }
  return set.has(step.milestoneId);
}

/** @param {Path} path @param {Ctx} ctx */
function countDoneSteps(path, ctx) {
  return path.steps.filter((s) => stepDone(s, ctx)).length;
}

/** Hours left across every step not yet done, milestone minutes rounded up. */
/** @param {Path} path @param {Ctx} ctx */
function hoursRemaining(path, ctx) {
  let minutes = 0;
  let hours = 0;
  for (const step of path.steps) {
    if (stepDone(step, ctx)) continue;
    if (step.desafios && ctx.desafios.length > 0) {
      for (const d of ctx.desafios) if (!desafioFeito(ctx, d.id)) minutes += d.duracaoMin || 0;
    } else if (step.whole) hours += step.estimatedHours || 0;
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

/** @param {Path} path @param {Ctx} ctx */
function buildPathCard(path, ctx) {
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

  const done = countDoneSteps(path, ctx);
  const pct = percent(done, stepCount);
  const { wrapper } = buildProgressBar(pct, `${path.title}: ${pct}% concluído`);
  card.appendChild(wrapper);

  const label = document.createElement('span');
  label.className = 'progress-label';
  label.textContent = pct === 100 ? 'Concluído ✓' : `${pct}% concluído`;
  card.appendChild(label);

  return card;
}

/** @param {Path} path @param {Ctx} ctx */
function buildPathView(path, ctx) {
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
  const done = countDoneSteps(path, ctx);
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

  const remaining = hoursRemaining(path, ctx);
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
    list.appendChild(step.desafios ? buildDesafiosStep(step, ctx) : buildPathStep(step, ctx));
  }

  if (path.steps.some((s) => s.desafios)) root.appendChild(buildRadar(ctx));

  return root;
}

/** @param {PathStep} step @param {Ctx} ctx */
function buildPathStep(step, ctx) {
  const li = document.createElement('li');
  li.className = 'path-step';

  const done = stepDone(step, ctx);
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

/**
 * The continuous-practice step: links to the catalog and says how much of
 * the bank is open (prerequisites done) and how much was practiced.
 * @param {PathStep} step @param {Ctx} ctx
 */
function buildDesafiosStep(step, ctx) {
  const li = document.createElement('li');
  li.className = 'path-step path-step-desafios';
  const done = stepDone(step, ctx);
  li.classList.toggle('done', done);

  const total = ctx.desafios.length || step.desafioCount || 0;
  const feitos = ctx.desafios.filter((d) => desafioFeito(ctx, d.id)).length;
  const abertos = ctx.desafios.filter((d) => missingPrereqs(d, getProgress).length === 0).length;

  const link = document.createElement('a');
  link.className = 'path-step-link';
  link.href = '#/desafios';
  const titleLine = document.createElement('span');
  titleLine.className = 'path-step-title';
  titleLine.textContent = `Banco de desafios — ${total} desafio${total === 1 ? '' : 's'}`;
  link.appendChild(titleLine);
  const meta = document.createElement('span');
  meta.className = 'path-step-meta';
  const parts = [done ? 'Concluído ✓' : `${feitos} de ${total} praticados`, `${abertos} liberado${abertos === 1 ? '' : 's'}`];
  if (step.optional) parts.push('Opcional');
  meta.textContent = parts.join(' · ');
  link.appendChild(meta);
  li.appendChild(link);

  const why = document.createElement('p');
  why.className = 'path-step-why';
  why.textContent = step.why;
  li.appendChild(why);
  return li;
}

const RADAR = { size: 400, r: 95 };

/**
 * Readiness radar: five axes from the verified part of each desafio's
 * latest round only. The SVG is decorative for screen readers — the list
 * under it carries the same numbers as text.
 * @param {Ctx} ctx
 */
function buildRadar(ctx) {
  const scores = radar(ctx.desafios, ctx.rodadas);
  const section = document.createElement('section');
  section.className = 'path-radar';
  section.setAttribute('aria-labelledby', 'path-radar-title');
  const h = document.createElement('h3');
  h.className = 'path-group-title';
  h.id = 'path-radar-title';
  h.textContent = 'Radar de prontidão';
  section.appendChild(h);
  const note = document.createElement('p');
  note.className = 'path-note';
  note.textContent = 'Só a parte verificada pela máquina conta: estimativas, decisões e a estrutura do entregável da última rodada de cada desafio. A rubrica autoavaliada fica de fora.';
  section.appendChild(note);

  const { size, r } = RADAR;
  const c = size / 2;
  const n = EIXOS.length;
  // Crop the viewBox to the pentagon plus its labels: the top label sits
  // above the apex, the bottom ones at cos(36°) of the radius below center.
  const top = c - r - 30;
  const height = r + 30 + Math.ceil((r + 18) * Math.cos(Math.PI / 5)) + 16;
  const svg = svgEl('svg', { viewBox: `0 ${top} ${size} ${height}`, class: 'path-radar-svg', 'aria-hidden': 'true', focusable: 'false' });
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const pts = EIXOS.map((_, i) => vertex(i, n, r * f, c, c).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: pts, class: 'path-radar-grid' }));
  }
  EIXOS.forEach((e, i) => {
    const [x, y] = vertex(i, n, r, c, c);
    svg.appendChild(svgEl('line', { x1: c, y1: c, x2: x, y2: y, class: 'path-radar-axis' }));
    const [lx, ly] = vertex(i, n, r + 18, c, c);
    const t = svgLabel(lx, ly, e.label, 'path-radar-label');
    t.setAttribute('text-anchor', Math.abs(lx - c) < 2 ? 'middle' : lx > c ? 'start' : 'end');
    t.setAttribute('dominant-baseline', 'middle');
    svg.appendChild(t);
  });
  if (scores.some((s) => s.pct !== null)) {
    const pts = scores.map((s, i) => vertex(i, n, (r * (s.pct ?? 0)) / 100, c, c).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: pts, class: 'path-radar-value' }));
  }
  section.appendChild(svg);

  const list = document.createElement('ul');
  list.className = 'path-radar-list';
  for (const s of scores) {
    const li = document.createElement('li');
    li.dataset.eixo = s.id;
    const name = document.createElement('strong');
    name.textContent = `${s.label}: `;
    li.appendChild(name);
    li.appendChild(document.createTextNode(s.pct === null
      ? 'sem rodada ainda'
      : `${s.pct}% (${fmt(s.acertos)} de ${fmt(s.total)} itens, ${s.desafios} desafio${s.desafios === 1 ? '' : 's'})`));
    list.appendChild(li);
  }
  section.appendChild(list);
  return section;
}

/** Item counts are whole except for legacy rounds, which count as a fraction. */
function fmt(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ',');
}
