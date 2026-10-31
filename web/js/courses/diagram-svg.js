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
