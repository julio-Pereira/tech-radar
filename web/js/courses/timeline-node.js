// @ts-check
import { toggleMilestone, setLastVisited } from '../storage.js';
import { buildQuiz } from './quiz.js';
import { buildReferences } from './content-blocks.js';
import { buildMilestoneBody } from './sections.js';
import { scrollToMilestone } from './scroll.js';

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
  content.appendChild(toggle);

  // Body (collapsed by default) ------------------------------------------------
  const body = document.createElement('div');
  body.className = 'node-body hidden';
  body.id = bodyId;

  const article = buildMilestoneBody(slug, milestone);
  body.appendChild(article);

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
    if (willExpand) setLastVisited(slug, milestone.id);
  });

  checkbox.addEventListener('change', () => {
    toggleMilestone(slug, milestone.id);
    onToggle();
  });

  return node;
}
