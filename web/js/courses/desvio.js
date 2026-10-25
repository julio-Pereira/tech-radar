// @ts-check
// Conceitos transversais, Fase 3: detour and return. Following a concept
// link to its owner milestone is a detour; the reader must be able to come
// back to the exact paragraph they left.
//
// - Leaving: history.replaceState rewrites the current entry to
//   #/learn/<slug>/<marco>/<conceito> (no hashchange), so the browser's Back
//   button and a refresh both land on the return point; a short stack in
//   sessionStorage (max 5) feeds the return banner and nested detours.
// - Returning: the course view expands the marco, opens any closed hands-on
//   block around the term, scrolls to it, focuses it, highlights it for 2 s
//   and announces where the reader is.
// - While a detour is open, "Continuar de onde parou" is left alone: routes
//   opened by a detour don't record themselves as the last course/marco.
import { suppressFocusPreview } from './conceitos.js';

/**
 * @typedef {{
 *   origem: string,   // #/learn/<slug>/<marco>/<conceito>
 *   slug: string, marcoId: string, conceito: string,
 *   trilha: string, nn: string, titulo: string,
 *   termo: string,
 *   destino: string   // #/learn/<slug>/<marco> the detour went to
 * }} Desvio
 */

const STACK_KEY = 'tr:desvios';
const MAX_DESVIOS = 5;
const HIGHLIGHT_MS = 2000;

/** @returns {Desvio[]} */
export function getDesvios() {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {Desvio[]} stack */
function saveDesvios(stack) {
  try {
    if (stack.length) sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    else sessionStorage.removeItem(STACK_KEY);
  } catch {
    // Storage unavailable: no banner, but Back still works through the URL.
  }
}

export function inDesvio() {
  return getDesvios().length > 0;
}

export function clearDesvios() {
  saveDesvios([]);
}

/** @param {string} n */
function pad2(n) {
  return n.padStart(2, '0');
}

/**
 * Records a detour from a concept link that is about to navigate to `destino`.
 * Does nothing (and the link navigates as a plain link) when the link isn't
 * inside a course milestone.
 * @param {HTMLAnchorElement} link
 * @param {string} destino
 */
export function startDesvio(link, destino) {
  const parts = window.location.hash.split('/').filter(Boolean); // ["#", "learn", slug, ...]
  const slug = parts[0] === '#' && parts[1] === 'learn' ? parts[2] : '';
  const node = link.closest('.timeline-node');
  const conceito = link.dataset.conceito || '';
  if (!slug || !(node instanceof HTMLElement) || !node.dataset.id || !conceito) return;

  const origem = `#/learn/${slug}/${node.dataset.id}/${conceito}`;
  /** @type {Desvio} */
  const entry = {
    origem,
    slug,
    marcoId: node.dataset.id,
    conceito,
    trilha: document.querySelector('#view-learn .course-title')?.textContent || slug,
    nn: pad2(node.dataset.order || ''),
    titulo: node.querySelector('.node-title')?.textContent || node.dataset.id,
    termo: (link.textContent || '').trim(),
    destino,
  };
  const stack = getDesvios().filter((d) => d.origem !== origem);
  stack.push(entry);
  saveDesvios(stack.slice(-MAX_DESVIOS));
  // The current history entry becomes the return point: Back lands here.
  history.replaceState(history.state, '', origem);
}

/**
 * Called when a route with a return point is rendered: drops the detour that
 * started there and every detour opened after it (the reader may have gone
 * back several steps at once with the browser).
 * @param {string} hash
 */
export function arriveAt(hash) {
  const stack = getDesvios();
  const i = stack.map((d) => d.origem).lastIndexOf(hash);
  if (i >= 0) saveDesvios(stack.slice(0, i));
}

let headerObserved = false;

/** Keeps --site-header-h equal to the sticky site header's real height. */
function trackHeaderHeight() {
  if (headerObserved) return;
  const header = document.querySelector('header');
  if (!header || typeof ResizeObserver === 'undefined') return;
  headerObserved = true;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--site-header-h', `${header.getBoundingClientRect().height}px`);
  }).observe(header);
}

/**
 * The return banner, shown on a course view while a detour is open and the
 * reader isn't already at its origin.
 * @param {string} slug current course
 * @param {string} [marcoId] current deep-linked marco, if any
 * @param {() => void} onDismiss
 * @returns {HTMLElement | null}
 */
export function buildReturnBanner(slug, marcoId, onDismiss) {
  const stack = getDesvios();
  const top = stack[stack.length - 1];
  if (!top || (top.slug === slug && top.marcoId === marcoId)) return null;
  trackHeaderHeight();

  const bar = document.createElement('div');
  bar.className = 'desvio-banner';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Retorno do desvio');

  const back = document.createElement('a');
  back.className = 'desvio-voltar';
  back.href = top.origem;
  // One inline run of text, so the link's flex centering never splits it.
  const text = document.createElement('span');
  text.append('↩ Voltar para ');
  const where = document.createElement('strong');
  where.textContent = `${top.trilha} › ${top.nn}`;
  text.appendChild(where);
  text.append(', no ponto ');
  const term = document.createElement('strong');
  term.textContent = top.termo;
  text.appendChild(term);
  back.appendChild(text);
  bar.appendChild(back);

  if (stack.length > 1) {
    const more = document.createElement('span');
    more.className = 'desvio-mais';
    const n = stack.length - 1;
    more.textContent = `(+${n} desvio${n > 1 ? 's' : ''})`;
    bar.appendChild(more);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'desvio-fechar';
  dismiss.setAttribute('aria-label', 'Descartar o retorno');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => {
    clearDesvios();
    bar.remove();
    onDismiss();
  });
  bar.appendChild(dismiss);
  return bar;
}

/**
 * "Terminou? Voltar para onde parou" at the end of the owner milestone the
 * current detour led to, when it is in this timeline.
 * @param {HTMLElement} timeline
 * @param {string} slug
 */
export function addEndOfOwnerReturn(timeline, slug) {
  const stack = getDesvios();
  const top = stack[stack.length - 1];
  if (!top) return;
  const destParts = top.destino.split('/').filter(Boolean); // ["#", "learn", slug, marco]
  if (destParts[2] !== slug || !destParts[3]) return;
  const body = timeline.querySelector(`.timeline-node[data-id="${CSS.escape(destParts[3])}"] .milestone-body`);
  if (!body) return;
  const p = document.createElement('p');
  p.className = 'desvio-fim';
  const a = document.createElement('a');
  a.href = top.origem;
  a.textContent = `Terminou? Voltar para onde parou (${top.trilha} › ${top.nn}, no ponto ${top.termo})`;
  p.appendChild(a);
  body.appendChild(p);
}

/**
 * Brings the reader back to the term they left. Falls back to just the marco
 * (already expanded by the caller) when the term no longer exists there —
 * content changes, ids don't, so a missing point is not an error.
 * @param {HTMLElement} timeline
 * @param {string} marcoId
 * @param {string} conceito
 * @returns {boolean} whether the exact point was found
 */
export function returnToPoint(timeline, marcoId, conceito) {
  const target = timeline.querySelector(`#${CSS.escape(`c-${marcoId}-${conceito}`)}`);
  if (!(target instanceof HTMLElement)) return false;

  // A term inside a closed hands-on block (<details>) must be revealed first.
  for (let el = target.parentElement; el && el !== timeline; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  if (target instanceof HTMLAnchorElement) suppressFocusPreview(target);
  target.focus({ preventScroll: true });
  target.classList.add('conceito-retorno');
  window.setTimeout(() => target.classList.remove('conceito-retorno'), HIGHLIGHT_MS);
  return true;
}

/** Polite announcement for screen readers, through the existing live region. */
export function announce(message) {
  const announcer = document.getElementById('route-announcer');
  if (announcer) announcer.textContent = message;
}
