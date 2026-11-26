// @ts-check
// SVG primitives shared by the typed-diagram renderer (diagram.js) and the
// fin-platform map (capstone-view.js). Everything is built with
// createElementNS + textContent: no innerHTML, no style attribute (the CSP
// has style-src 'self'), presentation only through CSS classes.

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @returns {SVGElement}
 */
export function el(tag, attrs = {}) {
  const node = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * @param {number} x @param {number} y @param {string} content @param {string} cls
 * @returns {SVGElement}
 */
export function label(x, y, content, cls) {
  const t = el('text', { x, y, class: cls });
  t.textContent = content;
  return t;
}

/**
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {string} cls
 * @param {number} [rx]
 */
export function rect(box, cls, rx = 8) {
  return el('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx, class: cls });
}

/**
 * A node's outline in its shape (Fase 1.8), always inside the node's box, so
 * edge anchors and layout stay the same. The compiler picks the shape from
 * the icon; "caixa" (or none) is the plain rounded box.
 * @param {{x: number, y: number, w: number, h: number}} p
 * @param {string} [forma]
 * @param {number} [rx]
 */
export function shape(p, forma, rx = 6) {
  const { x, y, w, h } = p;
  const r = x + w;
  const b = y + h;
  const cy = y + h / 2;
  const cls = 'diagrama-no-caixa';
  // A cylinder: body plus the front rim of its top (an open subpath).
  const cyl = (t, e) => `M${x},${t + e}A${w / 2},${e} 0 0 1 ${r},${t + e}V${b - (t - y) - e}A${w / 2},${e} 0 0 1 ${x},${b - (t - y) - e}ZM${x},${t + e}A${w / 2},${e} 0 0 0 ${r},${t + e}`;
  const d = {
    hexagono: `M${x + 12},${y}H${r - 12}L${r},${cy}L${r - 12},${b}H${x + 12}L${x},${cy}Z`,
    cilindro: cyl(y, 6),
    'cilindro-baixo': cyl(y + 6, 5),
    tubo: `M${x + 8},${y}H${r - 8}A8,${h / 2} 0 0 1 ${r - 8},${b}H${x + 8}A8,${h / 2} 0 0 1 ${x + 8},${y}ZM${r - 8},${y}A8,${h / 2} 0 0 0 ${r - 8},${b}`,
    'canto-dobrado': `M${x},${y}H${r - 12}L${r},${y + 12}V${b}H${x}ZM${r - 12},${y}V${y + 12}H${r}`,
  }[forma || ''];
  if (d) return el('path', { d, class: cls });
  const box = rect(p, cls, forma === 'arredondada' ? h / 2 : rx);
  if (forma !== 'borda-dupla') return box;
  const g = el('g');
  g.append(box, rect({ x: x + 4, y: y + 4, w: w - 8, h: h - 8 }, 'diagrama-no-borda', Math.max(rx - 3, 2)));
  return g;
}

/** The component icon (Fase 1.8): a same-origin <use> of the sprite. */
export const icon = (name, x, y) => el('use', { href: `assets/icones.svg#i-${name}`, x, y, width: 16, height: 16, class: 'diagrama-no-icone' });

/**
 * Arrowhead markers. Ids must be unique per page (several diagrams on one
 * milestone), so the caller passes a prefix.
 * @param {string} prefix
 * @param {string[]} kinds  e.g. ['seta', 'seta-aberta']
 * @returns {SVGElement} a <defs> with one marker per kind, id `${prefix}-${kind}`
 */
export function arrowDefs(prefix, kinds) {
  const defs = el('defs');
  for (const kind of kinds) {
    const marker = el('marker', {
      id: `${prefix}-${kind}`,
      markerWidth: 10, markerHeight: 10, refX: 8, refY: 5,
      orient: 'auto', markerUnits: 'userSpaceOnUse',
    });
    const open = kind.endsWith('aberta');
    marker.appendChild(el('path', {
      d: open ? 'M1,1 L8,5 L1,9' : 'M0,0 L9,5 L0,10 Z',
      class: open ? 'diagrama-ponta-aberta' : 'diagrama-ponta',
    }));
    defs.appendChild(marker);
  }
  return defs;
}

/**
 * Clips a segment that leaves the center of a w×h box in direction (dx, dy)
 * to the box border.
 * @returns {{x: number, y: number}}
 */
export function clipToBox(cx, cy, dx, dy, w, h) {
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/**
 * A straight edge between the borders of two boxes, optionally shifted
 * sideways (two edges between the same pair in opposite directions).
 * @param {{cx: number, cy: number, w: number, h: number}} a
 * @param {{cx: number, cy: number, w: number, h: number}} b
 * @param {number} shift
 * @returns {{x1: number, y1: number, x2: number, y2: number}}
 */
export function edgeBetween(a, b, shift = 0) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * shift;
  const oy = (dx / len) * shift;
  const s = clipToBox(a.cx + ox, a.cy + oy, dx, dy, a.w, a.h);
  const e = clipToBox(b.cx + ox, b.cy + oy, -dx, -dy, b.w, b.h);
  return { x1: s.x, y1: s.y, x2: e.x, y2: e.y };
}
