// Shared core of the step players (Fase 1.6 diagram-player and Fase 1.7
// walkthrough-player): the packet that runs along an edge, the cumulative
// node states with their text marks, and the rule that nothing moves out of
// sight. Web Animations only: no style attribute (CSP style-src 'self').
import { el } from './diagram-svg.js';

// Every state has a text mark too, never color alone.
export const MARK = { ativo: '●', novo: '+', saindo: '↓', removido: '∅', falha: '✕', inativo: '○', destaque: '★' };

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The nodes of a drawn diagram, with their base labels. The base is read
 * once and kept on the label (data-base): read again from the text, it would
 * carry the state mark of the last call, and every call would add another.
 */
export const nodesOf = (svg) => [...svg.querySelectorAll('[data-id]')].map((g) => {
  const t = g.querySelector('.diagrama-no-rotulo');
  if (!t.dataset.base) t.dataset.base = t.textContent;
  return { g, t, base: t.dataset.base };
});

/** Sets one node's state class and its text mark (st '' clears it). */
export function setState({ g, t }, st, text) {
  g.className.baseVal = g.className.baseVal.replace(/ diagrama-est-\S+/g, '') + (st ? ` diagrama-est-${st}` : '');
  t.textContent = st === 'atual' ? `▶ ${text}` : MARK[st] ? `${MARK[st]} ${text}` : text;
}

/** Cancels every running animation and packet of a drawing. */
export function still(svg) {
  svg.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  svg.querySelectorAll('.diagrama-pacote').forEach((d) => d.remove());
}

/** Runs a packet along an edge path; nothing with reduced motion. */
export function packet(svg, geo, speed) {
  if (reduceMotion()) return;
  const len = geo.getTotalLength();
  const dot = el('circle', { r: 5, class: 'diagrama-pacote' });
  svg.appendChild(dot);
  const frames = [];
  for (let k = 0; k <= 12; k++) {
    const p = geo.getPointAtLength((len * k) / 12);
    frames.push({ transform: `translate(${p.x}px, ${p.y}px)` });
  }
  dot.animate(frames, { duration: 1400 / speed, easing: 'ease-in-out', fill: 'forwards' })
    .finished.then(() => dot.remove(), () => dot.remove());
}

/** Out of sight, out of motion (WCAG 2.2.2): off screen, hidden tab, closed dialog. */
export function pauseWhenHidden(host, pause) {
  new IntersectionObserver((es) => { if (!es[0].isIntersecting) pause(); }).observe(host);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  if (host.tagName === 'DIALOG') host.addEventListener('close', pause, { once: true });
}

export const button = (cls, text, label) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = text;
  b.setAttribute('aria-label', label);
  return b;
};
