// @ts-check
// Mini-mapa "você está aqui" (PLANO-diagramas D7): at the top of a track
// that has a capstone component, a compact view of the fin-platform map —
// the track's component highlighted between what it depends on and what
// depends on it — linking to the full map at #/fin-platform. The data is
// data/capstones.json, the same file the full map draws from.
import { el, label, rect, arrowDefs, edgeBetween } from './diagram-svg.js';

const BOX_W = 150;
const BOX_H = 30;
const ROW = 40;
const COL_GAP = 70;
const TOP = 24;

/** @type {Promise<any[]> | null} */
let catalog = null;

function loadComponents() {
  if (!catalog) {
    catalog = fetch('./data/capstones.json')
      .then((r) => (r.ok ? r.json() : { components: [] }))
      .then((d) => d.components || [])
      .catch(() => []);
  }
  return catalog;
}

/**
 * Appends the mini-map to `container` once capstones.json arrives; a track
 * without a capstone component gets nothing.
 * @param {HTMLElement} container
 * @param {string} slug
 */
export async function addMiniMap(container, slug) {
  const components = await loadComponents();
  const me = components.find((c) => c.track === slug);
  if (!me) return;
  const deps = me.dependsOn || [];
  const users = components.filter((c) => (c.dependsOn || []).includes(me.component)).map((c) => c.component);
  container.appendChild(buildMiniMap(me.component, deps, users));
}

/**
 * @param {string} component @param {string[]} deps @param {string[]} users
 * @returns {HTMLElement}
 */
function buildMiniMap(component, deps, users) {
  const nav = document.createElement('nav');
  nav.className = 'minimapa';
  nav.setAttribute('aria-label', 'Posição desta trilha no fin-platform');

  const rows = Math.max(deps.length, users.length, 1);
  const height = TOP + rows * ROW;
  const width = 3 * BOX_W + 2 * COL_GAP;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, class: 'minimapa-svg' });
  // The sentence below says the same in text; the drawing is decorative.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.appendChild(arrowDefs('minimapa', ['seta']));

  svg.appendChild(label(BOX_W / 2, 14, 'usa', 'minimapa-coluna'));
  svg.appendChild(label(width - BOX_W / 2, 14, 'é usado por', 'minimapa-coluna'));

  /** @param {number} col @param {number} i @param {number} n */
  const at = (col, i, n) => {
    const x = col * (BOX_W + COL_GAP);
    const y = TOP + (rows - n) * ROW / 2 + i * ROW;
    return { x, y, w: BOX_W, h: BOX_H, cx: x + BOX_W / 2, cy: y + BOX_H / 2 };
  };
  const center = at(1, 0, 1);

  deps.forEach((d, i) => {
    const p = at(0, i, deps.length);
    svg.appendChild(el('line', { ...edgeBetween(center, p), class: 'diagrama-aresta', 'marker-end': 'url(#minimapa-seta)' }));
    svg.appendChild(box(p, d, false));
  });
  users.forEach((u, i) => {
    const p = at(2, i, users.length);
    svg.appendChild(el('line', { ...edgeBetween(p, center), class: 'diagrama-aresta', 'marker-end': 'url(#minimapa-seta)' }));
    svg.appendChild(box(p, u, false));
  });
  svg.appendChild(box(center, component, true));

  const text = document.createElement('p');
  text.className = 'minimapa-texto';
  const usa = deps.length ? `usa ${deps.join(', ')}` : 'não depende de outro componente';
  const usado = users.length ? `é usado por ${users.join(', ')}` : 'nenhum componente depende dele ainda';
  text.textContent = `Você está construindo o ${component}: ${usa}; ${usado}. `;
  const link = document.createElement('a');
  link.href = '#/fin-platform';
  link.textContent = 'Ver o mapa completo do fin-platform';
  text.appendChild(link);

  nav.appendChild(svg);
  nav.appendChild(text);
  return nav;
}

/** @param {{x: number, y: number, w: number, h: number, cx: number, cy: number}} p */
function box(p, name, highlight) {
  const g = el('g', { class: `diagrama-no${highlight ? ' diagrama-no--destaque' : ''}` });
  g.appendChild(rect(p, 'diagrama-no-caixa', 6));
  g.appendChild(label(p.cx, p.cy + 4, name, 'diagrama-no-rotulo minimapa-rotulo'));
  return g;
}
