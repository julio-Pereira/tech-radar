// @ts-check
// Its own module so both course-view.js (initial-load scroll) and
// timeline-node.js (Continuar/prev/next buttons) can import it without
// either one importing the other.
import { cssEscape } from '../dom-helpers.js';

/**
 * Scrolls to a milestone by id, respecting reduced-motion. `expand: true`
 * opens it first (used by explicit jumps — the Continuar button, prev/next
 * nav); the initial on-load scroll leaves it collapsed, same as before.
 */
export function scrollToMilestone(timeline, id, { expand = false } = {}) {
  const node = timeline.querySelector(`.timeline-node[data-id="${cssEscape(id)}"]`);
  if (!node) return;
  if (expand) {
    const toggle = node.querySelector('.node-toggle');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}
