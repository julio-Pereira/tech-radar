// @ts-check
// Typed diagrams (PLANO-diagramas). Loaded with import() only when a
// milestone on screen has a <figure data-diagrama="slug/id">: the compiler
// already wrote the title and the full textual description into the figure,
// so without JavaScript the reader still has both. This module fetches
// data/diagramas/<slug>.json once per track and draws the SVG with
// createElementNS — four types (topologia, fluxo, estados, sequencia), the
// layout declared by the author on a grid, presentation only through CSS
// classes (style-src 'self').
import { el, label, rect, arrowDefs, edgeBetween } from './diagram-svg.js';
import { startDesvio, returnToPoint } from './desvio.js';

const CELL_W_MIN = 140;
const CELL_W_MAX = 200;
const CELL_H = 48;
const NODE_CHAR_W = 7.4; // average width of a 13px node-label character
const GAP_X_MIN = 56;
const GAP_X_MAX = 210;
const CHAR_W = 6.8; // average width of a 12px label character
const GAP_Y = 60;
const MARGIN = 40;
const GROUP_PAD = 12;
const GROUP_LABEL = 20;

const SEQ_COL = 200;
const SEQ_HEAD = 40;
const SEQ_STEP = 46;
const SEQ_NOTE = 18;

/** @type {Map<string, Promise<Record<string, any>>>} */
const catalogs = new Map();
let seq = 0;

/** @param {string} slug */
function loadCatalog(slug) {
  if (!catalogs.has(slug)) {
    catalogs.set(slug, fetch(`./data/diagramas/${encodeURIComponent(slug)}.json`)
      .then((r) => (r.ok ? r.json() : { diagramas: {} }))
      .then((d) => d.diagramas || {})
      .catch(() => ({})));
  }
  return /** @type {Promise<Record<string, any>>} */ (catalogs.get(slug));
}

/**
 * Draws every not-yet-drawn diagram figure inside `root`.
 * @param {HTMLElement} root
 */
export async function renderDiagrams(root) {
  const figures = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('figure.diagrama[data-diagrama]')])
    .filter((f) => !f.querySelector('svg'));
  for (const figure of figures) {
    const [slug, id] = (figure.dataset.diagrama || '').split('/');
    const spec = (await loadCatalog(slug))[id];
    if (!spec || figure.querySelector('svg')) continue;
    drawInto(figure, spec);
  }
}

/** @param {HTMLElement} figure @param {any} spec */
function drawInto(figure, spec) {
  const n = ++seq;
  const caption = figure.querySelector('figcaption');
  const desc = figure.querySelector('.diagrama-descricao p');
  if (caption) caption.id = `diagrama-${n}-titulo`;
  if (desc) desc.id = `diagrama-${n}-descricao`;

  const svg = spec.tipo === 'sequencia' ? drawSequence(spec, `dg${n}`) : drawGraph(spec, `dg${n}`);
  // role="group", not "img": the concept nodes are real links, and the
  // children of an img are presentational to assistive technology. The
  // drawing itself is aria-hidden piece by piece; the group is announced by
  // its caption and the full textual description.
  svg.setAttribute('role', 'group');
  if (caption) svg.setAttribute('aria-labelledby', caption.id);
  if (desc) svg.setAttribute('aria-describedby', desc.id);
  // The drawing shrinks with the figure down to 80% of its natural width
  // and then scrolls inside it (never the page): text never gets smaller
  // than ~10px. The bounds come from a width class (course.css), not from a
  // style attribute.
  const bucket = Math.min(16, Math.max(3, Math.ceil(Number(svg.getAttribute('width')) / 100)));
  svg.setAttribute('class', `diagrama-svg diagrama-${spec.tipo} diagrama-l${bucket}`);

  const scroller = document.createElement('div');
  scroller.className = 'diagrama-area';
  scroller.appendChild(svg);
  figure.insertBefore(scroller, figure.firstChild);
  figure.classList.add('diagrama-desenhado');

  wireConceptLinks(svg);
  resumeReturnPoint(figure);
}

/** Text and shapes are read through the description, not one by one. */
function hidden(/** @type {SVGElement} */ node) {
  node.setAttribute('aria-hidden', 'true');
  return node;
}

// ── topologia, fluxo, estados: boxes on the author's grid ──────────────────

/** @param {number} col @param {number} gapX @param {number} cellW */
const colX = (col, gapX, cellW) => MARGIN + col * (cellW + gapX);

/** Boxes as wide as the longest node label of the diagram needs. */
function cellWidthFor(/** @type {any} */ spec) {
  const longest = Math.max(0, ...(spec.nos || []).map((/** @type {any} */ n) => n.rotulo.length));
  return Math.max(CELL_W_MIN, Math.min(CELL_W_MAX, Math.ceil(longest * NODE_CHAR_W + 28)));
}

/**
 * The horizontal gap is sized to the longest label of an edge between two
 * nodes of the same row, so that label fits between the boxes.
 * @param {any} spec
 */
function gapFor(spec) {
  /** @type {Map<string, number>} */
  const rowOf = new Map((spec.nos || []).map((/** @type {any} */ n) => [n.id, n.row]));
  let longest = 0;
  for (const a of spec.arestas || []) {
    if (a.de !== a.para && rowOf.get(a.de) === rowOf.get(a.para) && a.rotulo) {
      longest = Math.max(longest, edgeText(a).length);
    }
  }
  return Math.max(GAP_X_MIN, Math.min(GAP_X_MAX, Math.ceil(longest * CHAR_W + 28)));
}
/** @param {number} row */
const rowY = (row) => MARGIN + GROUP_LABEL + row * (CELL_H + GAP_Y);

/** @param {any} spec @param {string} prefix */
function drawGraph(spec, prefix) {
  const nos = spec.nos || [];
  const grupos = spec.grupos || [];
  let maxCol = 0;
  let maxRow = 0;
  for (const c of [...nos, ...grupos]) {
    maxCol = Math.max(maxCol, c.col + (c.cols || 1) - 1);
    maxRow = Math.max(maxRow, c.row + (c.rows || 1) - 1);
  }
  const gapX = gapFor(spec);
  const cellW = cellWidthFor(spec);
  const width = colX(maxCol, gapX, cellW) + cellW + MARGIN;
  const height = rowY(maxRow) + CELL_H + MARGIN;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
  svg.appendChild(arrowDefs(prefix, ['seta']));

  for (const g of grupos) {
    const x = colX(g.col, gapX, cellW) - GROUP_PAD;
    const y = rowY(g.row) - GROUP_PAD - GROUP_LABEL;
    const w = g.cols * cellW + (g.cols - 1) * gapX + 2 * GROUP_PAD;
    const h = g.rows * CELL_H + (g.rows - 1) * GAP_Y + 2 * GROUP_PAD + GROUP_LABEL;
    svg.appendChild(hidden(rect({ x, y, w, h }, 'diagrama-grupo', 10)));
    svg.appendChild(hidden(label(x + 10, y + 16, g.rotulo, 'diagrama-grupo-rotulo')));
  }

  /** @type {Map<string, {cx: number, cy: number, w: number, h: number, x: number, y: number}>} */
  const pos = new Map();
  for (const no of nos) {
    const x = colX(no.col, gapX, cellW);
    const y = rowY(no.row);
    pos.set(no.id, { x, y, w: cellW, h: CELL_H, cx: x + cellW / 2, cy: y + CELL_H / 2 });
  }

  const pairs = new Set((spec.arestas || []).map((/** @type {any} */ a) => `${a.de}>${a.para}`));
  const edges = el('g', { class: 'diagrama-arestas' });
  for (const a of spec.arestas || []) {
    const from = pos.get(a.de);
    const to = pos.get(a.para);
    if (!from || !to) continue;
    edges.appendChild(hidden(drawEdge(from, to, a, prefix, pairs.has(`${a.para}>${a.de}`))));
  }
  svg.appendChild(edges);

  if (spec.tipo === 'estados' && spec.inicial && pos.has(spec.inicial)) {
    const p = /** @type {{x: number, cy: number}} */ (pos.get(spec.inicial));
    svg.appendChild(hidden(el('circle', { cx: p.x - 26, cy: p.cy, r: 6, class: 'diagrama-inicial' })));
    svg.appendChild(hidden(el('line', {
      x1: p.x - 20, y1: p.cy, x2: p.x - 2, y2: p.cy,
      class: 'diagrama-aresta', 'marker-end': `url(#${prefix}-seta)`,
    })));
  }

  const finais = new Set(spec.finais || []);
  for (const no of nos) {
    svg.appendChild(drawNode(no, /** @type {any} */ (pos.get(no.id)), spec.tipo, finais.has(no.id)));
  }
  return svg;
}

/**
 * @param {any} from @param {any} to @param {any} a @param {string} prefix
 * @param {boolean} hasReverse  an edge in the opposite direction exists
 */
function drawEdge(from, to, a, prefix, hasReverse) {
  const g = el('g', { class: `diagrama-aresta-grupo${a.estilo ? ` diagrama-aresta--${a.estilo}` : ''}` });
  if (from === to) {
    // Self-transition: a loop over the top of the box.
    const x = from.cx;
    const y = from.y;
    g.appendChild(el('path', {
      d: `M${x - 24},${y} C${x - 24},${y - 34} ${x + 24},${y - 34} ${x + 24},${y}`,
      class: 'diagrama-aresta', fill: 'none', 'marker-end': `url(#${prefix}-seta)`,
    }));
    if (a.rotulo) g.appendChild(label(x, y - 30, edgeText(a), 'diagrama-aresta-rotulo'));
    return g;
  }
  const s = edgeBetween(from, to, hasReverse ? 7 : 0);
  g.appendChild(el('line', {
    x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
    class: 'diagrama-aresta', 'marker-end': `url(#${prefix}-seta)`,
  }));
  if (a.rotulo) {
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const vertical = Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1);
    // Beside a vertical edge, above a horizontal one. In a pair of opposite
    // edges each line is shifted to one side (edgeBetween), and its label
    // goes on that same side, away from the other line.
    const side = vertical ? Math.sign(-(to.cy - from.cy)) : Math.sign(to.cx - from.cx);
    const t = vertical
      ? (hasReverse && side < 0
        ? label(mx - 10, my + 4, edgeText(a), 'diagrama-aresta-rotulo diagrama-rotulo-fim')
        : label(mx + 10, my + 4, edgeText(a), 'diagrama-aresta-rotulo diagrama-rotulo-inicio'))
      : label(mx, my + (hasReverse && side > 0 ? 20 : -9), edgeText(a), 'diagrama-aresta-rotulo');
    g.appendChild(t);
  }
  return g;
}

/** Failure and compensation are marked in the text too, never by color alone. */
function edgeText(/** @type {any} */ a) {
  if (a.estilo === 'falha') return `✕ ${a.rotulo}`;
  if (a.estilo === 'compensacao') return `↩ ${a.rotulo}`;
  return a.rotulo;
}

/**
 * @param {any} no
 * @param {{x: number, y: number, w: number, h: number, cx: number, cy: number}} p
 * @param {string} tipo
 * @param {boolean} final
 */
function drawNode(no, p, tipo, final) {
  const radius = tipo === 'estados' ? 22 : tipo === 'fluxo' ? 14 : 6;
  const cls = `diagrama-no${no.papel ? ` diagrama-no--${no.papel}` : ''}`;
  const g = el('g', { class: cls });
  g.appendChild(hidden(rect(p, 'diagrama-no-caixa', radius)));
  if (final) g.appendChild(hidden(rect({ x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 8 }, 'diagrama-no-final', radius - 4)));
  g.appendChild(hidden(label(p.cx, p.cy + 5, no.rotulo, 'diagrama-no-rotulo')));
  return no.href ? conceptLink(no, g) : g;
}

/** A node bound to a transversal concept is a real, focusable link. */
function conceptLink(/** @type {any} */ item, /** @type {SVGElement} */ g) {
  const a = el('a', {
    href: item.href,
    class: 'diagrama-conceito',
    'data-conceito': item.conceito,
    'aria-label': `${item.rotulo} — conceito, abre o marco que o ensina`,
  });
  a.appendChild(g);
  return a;
}

// ── sequencia: participants as columns, messages as rows ───────────────────

/** @param {any} spec @param {string} prefix */
function drawSequence(spec, prefix) {
  const parts = spec.participantes || [];
  const msgs = spec.mensagens || [];
  /** @type {Map<string, number>} */
  const colOf = new Map(parts.map((/** @type {any} */ p, /** @type {number} */ i) => [p.id, MARGIN + i * SEQ_COL + SEQ_COL / 2]));

  let y = MARGIN + SEQ_HEAD + 34;
  const rows = msgs.map((/** @type {any} */ m) => {
    const row = { m, y };
    y += SEQ_STEP + (m.nota ? SEQ_NOTE : 0) + (m.de === m.para ? 16 : 0);
    return row;
  });
  const height = y + MARGIN / 2;
  const width = MARGIN * 2 + parts.length * SEQ_COL;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
  svg.appendChild(arrowDefs(prefix, ['seta', 'seta-aberta']));

  for (const p of parts) {
    const cx = /** @type {number} */ (colOf.get(p.id));
    svg.appendChild(hidden(el('line', { x1: cx, y1: MARGIN + SEQ_HEAD, x2: cx, y2: height - MARGIN / 2, class: 'diagrama-linha-vida' })));
    const box = { x: cx - (SEQ_COL - 24) / 2, y: MARGIN, w: SEQ_COL - 24, h: SEQ_HEAD, cx, cy: MARGIN + SEQ_HEAD / 2 };
    const g = el('g', { class: `diagrama-no${p.papel ? ` diagrama-no--${p.papel}` : ''}` });
    g.appendChild(hidden(rect(box, 'diagrama-no-caixa', 6)));
    g.appendChild(hidden(label(cx, box.cy + 5, p.rotulo, 'diagrama-no-rotulo')));
    svg.appendChild(p.href ? conceptLink(p, g) : g);
  }

  for (const { m, y: my } of rows) {
    const x1 = /** @type {number} */ (colOf.get(m.de));
    const x2 = /** @type {number} */ (colOf.get(m.para));
    const g = hidden(el('g', { class: `diagrama-mensagem diagrama-mensagem--${m.tipo}` }));
    const marker = m.tipo === 'sync' ? 'seta' : 'seta-aberta';
    if (x1 === x2) {
      g.appendChild(el('path', {
        d: `M${x1},${my} h44 v18 h-42`,
        class: 'diagrama-aresta', fill: 'none', 'marker-end': `url(#${prefix}-${marker})`,
      }));
      g.appendChild(label(x1 + 50, my + 4, m.rotulo, 'diagrama-aresta-rotulo diagrama-rotulo-inicio'));
      if (m.nota) g.appendChild(label(x1 + 50, my + 34, m.nota, 'diagrama-nota diagrama-rotulo-inicio'));
    } else {
      const dir = x2 > x1 ? 1 : -1;
      g.appendChild(el('line', {
        x1, y1: my, x2: x2 - dir * 2, y2: my,
        class: 'diagrama-aresta', 'marker-end': `url(#${prefix}-${marker})`,
      }));
      g.appendChild(label((x1 + x2) / 2, my - 8, m.rotulo, 'diagrama-aresta-rotulo'));
      if (m.nota) g.appendChild(label((x1 + x2) / 2, my + 16, m.nota, 'diagrama-nota'));
    }
    svg.appendChild(g);
  }
  return svg;
}

// ── concept links: detour and return, like the links in the prose ─────────

/** @param {SVGElement} svg */
function wireConceptLinks(svg) {
  svg.querySelectorAll('a.diagrama-conceito').forEach((a) => {
    a.addEventListener('click', (e) => {
      const ev = /** @type {MouseEvent} */ (e);
      if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      startDesvio(/** @type {any} */ (a), a.getAttribute('href') || '');
    });
  });
}

/**
 * The detour's return point (#/learn/<slug>/<marco>/<conceito>) may name a
 * node of a diagram that was drawn after the course view tried to return
 * there. When this figure holds that node, return to it now.
 * @param {HTMLElement} figure
 */
function resumeReturnPoint(figure) {
  const parts = window.location.hash.split('/');
  if (parts.length < 5 || parts[1] !== 'learn') return;
  const [, , , marcoId, conceito] = parts;
  const node = figure.closest('.timeline-node');
  const timeline = node && node.parentElement;
  if (!(node instanceof HTMLElement) || node.dataset.id !== marcoId || !timeline) return;
  const link = figure.querySelector(`a.diagrama-conceito[data-conceito="${CSS.escape(conceito)}"]`);
  if (!link || document.getElementById(`c-${marcoId}-${conceito}`)) return;
  link.id = `c-${marcoId}-${conceito}`;
  returnToPoint(/** @type {HTMLElement} */ (timeline), marcoId, conceito);
}
