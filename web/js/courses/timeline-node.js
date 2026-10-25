// @ts-check
import { toggleMilestone, setLastVisited } from '../storage.js';
import { buildQuiz } from './quiz.js';
import { buildReferences } from './content-blocks.js';
import { buildMilestoneBody } from './sections.js';
import { scrollToMilestone } from './scroll.js';
import { freshnessLabel } from '../dom-helpers.js';
import { inDesvio } from './desvio.js';

/** @typedef {import('../types.js').Milestone} Milestone */

/**
 * @param {Milestone} milestone
 * @param {Milestone | null} prevMilestone
 * @param {Milestone | null} nextMilestone
 * @param {HTMLElement} timeline used by the prev/next buttons to find and
 *   jump to a sibling node — always fully populated by the time a reader
 *   can click, even though earlier nodes are built before later ones exist.
 */
export function buildTimelineNode(slug, milestone, completed, onToggle, prevMilestone, nextMilestone, timeline) {
  const node = document.createElement('li');
  node.className = 'timeline-node';
  node.setAttribute('data-id', milestone.id);
  node.setAttribute('data-order', String(milestone.order));
  if (completed.has(milestone.id)) node.classList.add('done');

  // Marker (dot) ---------------------------------------------------------------
  const marker = document.createElement('div');
  marker.className = 'node-marker';
  const dot = document.createElement('span');
  dot.className = 'node-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = completed.has(milestone.id) ? '✓' : String(milestone.order);
  marker.appendChild(dot);
  node.appendChild(marker);

  // Content --------------------------------------------------------------------
  const content = document.createElement('div');
  content.className = 'node-content';

  const bodyId = `milestone-body-${slug}-${milestone.id}`;
  const toggle = document.createElement('button');
  toggle.className = 'node-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', bodyId);

  const orderLabel = document.createElement('span');
  orderLabel.className = 'node-order-label';
  orderLabel.textContent = `Marco ${milestone.order}`;

  const nodeTitle = document.createElement('span');
  nodeTitle.className = 'node-title';
  nodeTitle.textContent = milestone.title;

  const nodeSummary = document.createElement('span');
  nodeSummary.className = 'node-summary';
  nodeSummary.textContent = milestone.summary;

  const nodeTime = document.createElement('span');
  nodeTime.className = 'node-time';
  if (milestone.estimatedMinutes) nodeTime.textContent = `${milestone.estimatedMinutes} min`;

  toggle.append(orderLabel, nodeTitle, nodeSummary, nodeTime);

  // Content freshness (UX platform melhoria 6) — opt-in per marco, absent
  // for the vast majority of milestones that haven't declared reviewedAt.
  const freshness = freshnessLabel(milestone);
  if (freshness) {
    const nodeFreshness = document.createElement('span');
    nodeFreshness.className = 'node-freshness';
    if (freshness === 'Pode estar desatualizado') nodeFreshness.classList.add('stale');
    nodeFreshness.textContent = freshness;
    toggle.appendChild(nodeFreshness);
  }

  content.appendChild(toggle);

  // Body (collapsed by default) ------------------------------------------------
  const body = document.createElement('div');
  body.className = 'node-body hidden';
  body.id = bodyId;

  const article = buildMilestoneBody(slug, milestone);
  body.appendChild(article);
  if (milestone.usadoEm && milestone.usadoEm.length > 0) {
    body.appendChild(buildUsadoEm(milestone.usadoEm));
  }

  // Complete control — built before the quiz so `completion: quiz` can unlock it.
  const hasQuiz = milestone.quiz && milestone.quiz.length > 0;
  const gated = milestone.completion === 'quiz' && hasQuiz;

  const completeWrap = document.createElement('div');
  completeWrap.className = 'node-complete';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-check';
  checkbox.id = `check-${slug}-${milestone.id}`;
  checkbox.checked = completed.has(milestone.id);
  const label = document.createElement('label');
  label.setAttribute('for', checkbox.id);

  // A gated milestone already ticked stays unlocked — progress is the source of
  // truth, and re-locking a finished node would only punish a revisit.
  const locked = gated && !checkbox.checked;
  checkbox.disabled = locked;
  label.textContent = locked ? 'Acerte o quiz para concluir' : 'Marcar como concluído';

  function unlockCompletion() {
    if (!checkbox.disabled) return;
    checkbox.disabled = false;
    label.textContent = 'Marcar como concluído';
  }

  if (hasQuiz) {
    body.appendChild(buildQuiz(slug, milestone, gated ? unlockCompletion : null));
  }

  if (milestone.references && milestone.references.length > 0) {
    body.appendChild(buildReferences(milestone.references));
  }

  completeWrap.appendChild(checkbox);
  completeWrap.appendChild(label);
  body.appendChild(completeWrap);

  // Prev/next — in-page navigation between milestones. No new route: it
  // just expands and scrolls to a sibling <li> already in the same timeline.
  if (prevMilestone || nextMilestone) {
    const nav = document.createElement('div');
    nav.className = 'node-nav';

    if (prevMilestone) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'node-nav-btn node-nav-prev';
      prevBtn.textContent = `← Marco ${prevMilestone.order}: ${prevMilestone.title}`;
      prevBtn.addEventListener('click', () => {
        scrollToMilestone(timeline, prevMilestone.id, { expand: true });
      });
      nav.appendChild(prevBtn);
    }

    if (nextMilestone) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'node-nav-btn node-nav-next';
      nextBtn.textContent = `Marco ${nextMilestone.order}: ${nextMilestone.title} →`;
      nextBtn.addEventListener('click', () => {
        scrollToMilestone(timeline, nextMilestone.id, { expand: true });
      });
      nav.appendChild(nextBtn);
    }

    body.appendChild(nav);
  }

  content.appendChild(body);
  node.appendChild(content);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    const willExpand = !expanded;
    toggle.setAttribute('aria-expanded', String(willExpand));
    body.classList.toggle('hidden', expanded);
    // A milestone opened during a concept detour is not "where the reader
    // left off": the origin trilha stays the one to continue.
    if (willExpand && !inDesvio()) setLastVisited(slug, milestone.id);
  });

  checkbox.addEventListener('change', () => {
    toggleMilestone(slug, milestone.id);
    onToggle();
  });

  return node;
}

/**
 * Short trilha name for dense lists: the title up to its subtitle colon,
 * without the "para Fintech" every title carries. Full titles run up to 90+
 * characters, which is what made a long "Usado em" heavy to read.
 * @param {string} title
 */
export function shortTrilha(title) {
  return title.split(':')[0].replace(/ para Fintech$/, '').trim();
}

/**
 * "Usado em": the reverse of a concept link, on the milestone that owns the
 * concept — where else in the catalog this marco's concepts are cited.
 * Collapsed by default to a one-line count; open, one line per trilha with
 * its milestone numbers. Each number's accessible name stays complete.
 * @param {import('../types.js').ConceitoMarco[]} usos
 */
function buildUsadoEm(usos) {
  /** @type {Map<string, import('../types.js').ConceitoMarco[]>} */
  const byTrilha = new Map();
  for (const u of usos) {
    if (!byTrilha.has(u.trilha)) byTrilha.set(u.trilha, []);
    byTrilha.get(u.trilha).push(u);
  }

  const details = document.createElement('details');
  details.className = 'conceito-usado-em';
  const summary = document.createElement('summary');
  const nm = usos.length;
  const nt = byTrilha.size;
  summary.textContent = `Usado em ${nm} ${nm === 1 ? 'marco' : 'marcos'} de ${nt} ${nt === 1 ? 'trilha' : 'trilhas'}`;
  details.appendChild(summary);

  const list = document.createElement('ul');
  for (const [trilha, marcos] of byTrilha) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'conceito-usado-em-trilha';
    name.textContent = shortTrilha(trilha);
    name.title = trilha;
    li.appendChild(name);
    li.appendChild(document.createTextNode(' › '));
    marcos.forEach((u, i) => {
      if (i > 0) li.appendChild(document.createTextNode(', '));
      const a = document.createElement('a');
      a.href = `#/learn/${u.slug}/${u.marcoId}`;
      a.textContent = u.nn;
      a.setAttribute('aria-label', `${trilha} › ${u.nn} · ${u.titulo}`);
      a.title = u.titulo;
      li.appendChild(a);
    });
    list.appendChild(li);
  }
  details.appendChild(list);
  return details;
}
