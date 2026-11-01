// Typed diagrams, imported only for a figure.diagrama (which already holds
// title, description, data). createElementNS, CSS classes only (style-src
// 'self'). 10 KB gzip budget with diagram-svg.js: no type annotations.
import { el, label, rect, arrowDefs, edgeBetween, clipToBox } from './diagram-svg.js';
import { startDesvio, returnToPoint } from './desvio.js';

// Keep in sync with aggregator/internal/course/diagrams_layout.go.
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
const FIT_PAD = 8; // room kept around labels that stick out of the boxes

const SEQ_HEAD = 40;
const SEQ_STEP = 46;
const SEQ_NOTE = 18;

const CH_W = 640;
const CH_H = 360;
const CH_L = 70;
const CH_R = 24;
const CH_T = 34;
const CH_B = 58;

const catalogs = new Map();
let seq = 0;

function loadCatalog(slug) {
  if (!catalogs.has(slug)) {
    catalogs.set(slug, fetch(`./data/diagramas/${encodeURIComponent(slug)}.json`)
      .then((r) => (r.ok ? r.json() : { diagramas: {} }))
      .then((d) => d.diagramas || {})
      .catch(() => ({})));
  }
  return (catalogs.get(slug));
}

export async function renderDiagrams(root) {
  const figures = ([...root.querySelectorAll('figure.diagrama[data-diagrama]')])
    .filter((f) => !f.querySelector('svg'));
  for (const figure of figures) {
    const [slug, id] = (figure.dataset.diagrama || '').split('/');
    const spec = (await loadCatalog(slug))[id];
    if (!spec || figure.querySelector('svg')) continue;
    drawInto(figure, spec);
  }
}

function draw(spec, prefix, links) {
  const svg = spec.tipo === 'sequencia' ? drawSequence(spec, prefix, links)
    : spec.tipo === 'grafico' ? drawChart(spec)
      : drawGraph(spec, prefix, links);
  // "group", not "img": it has focusable children (links, chart points).
  svg.setAttribute('role', 'group');
  svg.dataset.tipo = spec.tipo;
  widthClass(svg);
  return svg;
}

function drawInto(figure, spec) {
  const n = ++seq;
  const caption = figure.querySelector('figcaption');
  const title = caption ? caption.textContent || '' : '';
  const desc = figure.querySelector('.diagrama-descricao p');
  if (caption) caption.id = `diagrama-${n}-titulo`;
  if (desc) desc.id = `diagrama-${n}-descricao`;

  const svg = draw(spec, `dg${n}`, true);
  if (caption) svg.setAttribute('aria-labelledby', caption.id);
  if (desc) svg.setAttribute('aria-describedby', desc.id);

  // Shrinks to 80%, then scrolls in the figure with a hint; Ampliar on phones.
  const area = html('div', 'diagrama-area');
  area.appendChild(svg);
  const zoom = html('button', 'diagrama-ampliar', 'Ampliar');
  zoom.setAttribute('aria-label', `Ampliar o diagrama: ${title}`);
  zoom.addEventListener('click', () => openZoom(spec, title, zoom));
  const actions = html('div', 'diagrama-acoes');
  actions.append(html('p', 'diagrama-dica', 'Role para o lado para ver o diagrama inteiro, ou use Ampliar.'), zoom);
  const frame = html('div', 'diagrama-moldura');
  frame.appendChild(area);
  figure.prepend(frame, actions);
  figure.classList.add('diagrama-desenhado');

  const update = () => {
    if (fitViewBox(svg)) widthClass(svg);
    const scrolls = area.scrollWidth > area.clientWidth + 1;
    figure.classList.toggle('diagrama-rola', scrolls);
    figure.classList.toggle('diagrama-rola-fim', scrolls && area.scrollLeft + area.clientWidth >= area.scrollWidth - 2);
    // A scrolling region must be reachable by keyboard (WCAG 2.1.1).
    region(area, scrolls && 'Área do diagrama, role para os lados');
  };
  new ResizeObserver(update).observe(area);
  area.addEventListener('scroll', update, { passive: true });
  update();

  wireConceptLinks(svg);
  wireChartKeys(svg);
  animate(svg, spec, frame);
  resumeReturnPoint(figure);
}

// Width class (course.css): between 80% and 100% of the natural width.
function widthClass(svg) {
  const w = Number((svg.getAttribute('viewBox') || '').split(' ')[2]);
  const bucket = Math.min(16, Math.max(3, Math.ceil((w - 5) / 100)));
  svg.setAttribute('class', `diagrama-svg diagrama-${svg.dataset.tipo} diagrama-l${bucket}`);
}

// Grows the viewBox where a label sticks out (C2); needs layout.
function fitViewBox(svg) {
  if (svg.dataset.ajustado) return false;
  const b = svg.getBBox();
  if (!b.width || !b.height) return false;
  svg.dataset.ajustado = '1';
  const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') || '0 0 0 0').split(' ').map(Number);
  const x0 = b.x < vx ? Math.floor(b.x - FIT_PAD) : vx;
  const y0 = b.y < vy ? Math.floor(b.y - FIT_PAD) : vy;
  const x1 = b.x + b.width > vx + vw ? Math.ceil(b.x + b.width + FIT_PAD) : vx + vw;
  const y1 = b.y + b.height > vy + vh ? Math.ceil(b.y + b.height + FIT_PAD) : vy + vh;
  svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  svg.setAttribute('width', String(x1 - x0));
  svg.setAttribute('height', String(y1 - y0));
  return true;
}

let dialog = null;

function html(tag, cls, text = '') {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  if (tag === 'button') e.setAttribute('type', 'button');
  return e;
}

function region(e, label) {
  for (const [k, v] of [['tabindex', '0'], ['role', 'region'], ['aria-label', label]]) {
    if (label) e.setAttribute(k, v); else e.removeAttribute(k);
  }
}

function zoomDialog() {
  if (dialog) return dialog;
  const d = html('dialog', 'diagrama-dialogo');
  d.setAttribute('aria-labelledby', 'diagrama-dialogo-titulo');
  const head = html('div', 'diagrama-dialogo-topo');
  const h = html('h2', '');
  h.id = 'diagrama-dialogo-titulo';
  const fit = html('button', 'diagrama-ajustar', 'Ajustar à tela');
  fit.setAttribute('aria-pressed', 'false');
  fit.addEventListener('click', () => fit.setAttribute('aria-pressed', String(d.classList.toggle('diagrama-ajustado'))));
  const close = html('button', 'diagrama-fechar', 'Fechar');
  close.addEventListener('click', () => d.close());
  head.append(h, fit, close);
  const area = html('div', 'diagrama-dialogo-area');
  region(area, 'Diagrama ampliado, role em qualquer direção');
  d.append(head, area);
  // Backdrop click closes, like Esc; Tab wraps inside the dialog.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...d.querySelectorAll('button, [tabindex="0"]')];
    const edge = e.shiftKey ? f[0] : f[f.length - 1];
    if (document.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? f[f.length - 1] : f[0]).focus();
  });
  document.body.appendChild(d);
  dialog = d;
  return d;
}

// Fase 1.6: the step player loads only for an animated spec.
function animate(svg, spec, mount, twin) {
  if (spec.animacao) import('./diagram-player.js').then((m) => m.attach(svg, spec, mount, twin));
}

function openZoom(spec, title, opener) {
  const d = zoomDialog();
  const h = (d.querySelector('h2'));
  const area = (d.querySelector('.diagrama-dialogo-area'));
  h.textContent = title;
  // Fresh drawing (own marker ids); concept links only in the figure.
  const svg = draw(spec, `dz${++seq}`, false);
  svg.setAttribute('aria-labelledby', h.id);
  area.replaceChildren(svg);
  d.addEventListener('close', () => {
    area.replaceChildren();
    d.querySelector('.diagrama-player')?.remove();
    opener.focus();
  }, { once: true });
  d.showModal();
  fitViewBox(svg);
  widthClass(svg);
  wireChartKeys(svg);
  animate(svg, spec, area, opener.closest('figure'));
  (d.querySelector('.diagrama-fechar')).focus();
}

function hidden(node) {
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function cellWidthFor(spec) {
  const steps = spec.animacao || [];
  const labels = [...(spec.nos || []).map((n) => n.rotulo), ...steps.flatMap((p) => Object.values(p.rotulos || {}))];
  const longest = Math.max(0, ...labels.map((l) => l.length)) + (steps.length ? 2 : 0);
  return Math.max(CELL_W_MIN, Math.min(CELL_W_MAX, Math.ceil(longest * NODE_CHAR_W + 28)));
}

function gapFor(spec) {
  const rowOf = new Map((spec.nos || []).map((n) => [n.id, n.row]));
  let longest = 0;
  for (const a of spec.arestas || []) {
    if (a.de !== a.para && rowOf.get(a.de) === rowOf.get(a.para) && a.rotulo) {
      longest = Math.max(longest, edgeText(a).length);
    }
  }
  return Math.max(GAP_X_MIN, Math.min(GAP_X_MAX, Math.ceil(longest * CHAR_W + 28)));
}

function drawGraph(spec, prefix, links) {
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
  /** Left/top of a grid cell; fractional col/row are the lanes between. */
  const colX = (col) => MARGIN + col * (cellW + gapX);
  const rowY = (row) => MARGIN + GROUP_LABEL + row * (CELL_H + GAP_Y);
  const width = colX(maxCol) + cellW + MARGIN;
  const height = rowY(maxRow) + CELL_H + MARGIN;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
  svg.appendChild(arrowDefs(prefix, ['seta']));

  for (const g of grupos) {
    const x = colX(g.col) - GROUP_PAD;
    const y = rowY(g.row) - GROUP_PAD - GROUP_LABEL;
    const w = g.cols * cellW + (g.cols - 1) * gapX + 2 * GROUP_PAD;
    const h = g.rows * CELL_H + (g.rows - 1) * GAP_Y + 2 * GROUP_PAD + GROUP_LABEL;
    svg.appendChild(hidden(rect({ x, y, w, h }, 'diagrama-grupo', 10)));
    svg.appendChild(hidden(label(x + 10, y + 16, g.rotulo, 'diagrama-grupo-rotulo')));
  }

  const at = (col, row) => ({ x: colX(col), y: rowY(row), w: cellW, h: CELL_H, cx: colX(col) + cellW / 2, cy: rowY(row) + CELL_H / 2 });
  const pos = new Map(nos.map((no) => [no.id, at(no.col, no.row)]));

  const pairs = new Set((spec.arestas || []).map((a) => `${a.de}>${a.para}`));
  const edges = el('g', { class: 'diagrama-arestas' });
  for (const a of spec.arestas || []) {
    const from = pos.get(a.de);
    const to = pos.get(a.para);
    if (!from || !to) continue;
    const via = (a.via || []).map((p) => at(p.col, p.row));
    edges.appendChild(hidden(drawEdge(from, to, a, prefix, pairs.has(`${a.para}>${a.de}`), via)));
  }
  svg.appendChild(edges);

  if (spec.tipo === 'estados' && spec.inicial && pos.has(spec.inicial)) {
    const p = (pos.get(spec.inicial));
    svg.appendChild(hidden(el('circle', { cx: p.x - 26, cy: p.cy, r: 6, class: 'diagrama-inicial' })));
    svg.appendChild(hidden(el('line', {
      x1: p.x - 20, y1: p.cy, x2: p.x - 2, y2: p.cy,
      class: 'diagrama-aresta', 'marker-end': `url(#${prefix}-seta)`,
    })));
  }

  const finais = new Set(spec.finais || []);
  for (const no of nos) {
    svg.appendChild(drawNode(no, (pos.get(no.id)), spec.tipo, finais.has(no.id), links));
  }
  return svg;
}

function drawEdge(from, to, a, prefix, hasReverse, via) {
  const g = el('g', { class: `diagrama-aresta-grupo${a.estilo ? ` diagrama-aresta--${a.estilo}` : ''}`, 'data-aresta': `${a.de}>${a.para}` });
  const arrow = { class: 'diagrama-aresta', fill: 'none', 'marker-end': `url(#${prefix}-seta)` };
  if (from === to) {
    const x = from.cx;
    const y = from.y;
    g.appendChild(el('path', { d: `M${x - 24},${y} C${x - 24},${y - 34} ${x + 24},${y - 34} ${x + 24},${y}`, ...arrow }));
    if (a.rotulo) g.appendChild(label(x, y - 30, edgeText(a), 'diagrama-aresta-rotulo'));
    return g;
  }
  let s;
  if (via.length) {
    const first = via[0];
    const last = via[via.length - 1];
    const p0 = clipToBox(from.cx, from.cy, first.cx - from.cx, first.cy - from.cy, from.w, from.h);
    const pn = clipToBox(to.cx, to.cy, last.cx - to.cx, last.cy - to.cy, to.w, to.h);
    const pts = [p0, ...via.map((v) => ({ x: v.cx, y: v.cy })), pn];
    g.appendChild(el('polyline', { points: pts.map((p) => `${p.x},${p.y}`).join(' '), ...arrow }));
    const k = Math.floor((pts.length - 1) / 2);
    s = { x1: pts[k].x, y1: pts[k].y, x2: pts[k + 1].x, y2: pts[k + 1].y };
    hasReverse = false;
  } else {
    s = edgeBetween(from, to, hasReverse ? 7 : 0);
    g.appendChild(el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, ...arrow }));
  }
  if (a.rotulo) {
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const vertical = Math.abs(s.x2 - s.x1) < Math.abs(s.y2 - s.y1);
    // Beside a vertical edge, above a horizontal one, on its own side.
    const side = vertical ? Math.sign(-(s.y2 - s.y1)) : Math.sign(s.x2 - s.x1);
    const t = vertical
      ? (hasReverse && side < 0
        ? label(mx - 10, my + 4, edgeText(a), 'diagrama-aresta-rotulo diagrama-rotulo-fim')
        : label(mx + 10, my + 4, edgeText(a), 'diagrama-aresta-rotulo diagrama-rotulo-inicio'))
      : label(mx, my + (hasReverse && side > 0 ? 20 : -9), edgeText(a), 'diagrama-aresta-rotulo');
    g.appendChild(t);
  }
  return g;
}

// Failure and compensation: marked in text too, not by color alone.
function edgeText(a) {
  if (a.estilo === 'falha') return `✕ ${a.rotulo}`;
  if (a.estilo === 'compensacao') return `↩ ${a.rotulo}`;
  return a.rotulo;
}

function drawNode(no, p, tipo, final, links) {
  const radius = tipo === 'estados' ? 22 : tipo === 'fluxo' ? 14 : 6;
  const cls = `diagrama-no${no.papel ? ` diagrama-no--${no.papel}` : ''}`;
  const g = el('g', { class: cls, 'data-id': no.id });
  g.appendChild(hidden(rect(p, 'diagrama-no-caixa', radius)));
  if (final) g.appendChild(hidden(rect({ x: p.x + 4, y: p.y + 4, w: p.w - 8, h: p.h - 8 }, 'diagrama-no-final', radius - 4)));
  g.appendChild(hidden(label(p.cx, p.cy + 5, no.rotulo, 'diagrama-no-rotulo')));
  return no.href && links ? conceptLink(no, g) : g;
}

function conceptLink(item, g) {
  const a = el('a', {
    href: item.href,
    class: 'diagrama-conceito',
    'data-conceito': item.conceito,
    'aria-label': `${item.rotulo} — conceito, abre o marco que o ensina`,
  });
  a.appendChild(g);
  return a;
}

function drawSequence(spec, prefix, links) {
  const parts = spec.participantes || [];
  const msgs = spec.mensagens || [];
  const len = (xs, k) => Math.max(0, ...xs.map((x) => x[k].length));
  const SEQ_COL = Math.max(150, Math.min(200, Math.ceil(Math.max(len(parts, 'rotulo') * NODE_CHAR_W + 40, len(msgs, 'rotulo') * CHAR_W + 24))));
  const colOf = new Map(parts.map((p, i) => [p.id, MARGIN + i * SEQ_COL + SEQ_COL / 2]));

  let y = MARGIN + SEQ_HEAD + 34;
  const rows = msgs.map((m) => {
    const row = { m, y };
    y += SEQ_STEP + (m.nota ? SEQ_NOTE : 0) + (m.de === m.para ? 16 : 0);
    return row;
  });
  const height = y + MARGIN / 2;
  const width = MARGIN * 2 + parts.length * SEQ_COL;
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height });
  svg.appendChild(arrowDefs(prefix, ['seta', 'seta-aberta']));

  for (const p of parts) {
    const cx = (colOf.get(p.id));
    svg.appendChild(hidden(el('line', { x1: cx, y1: MARGIN + SEQ_HEAD, x2: cx, y2: height - MARGIN / 2, class: 'diagrama-linha-vida' })));
    const box = { x: cx - (SEQ_COL - 24) / 2, y: MARGIN, w: SEQ_COL - 24, h: SEQ_HEAD, cx, cy: MARGIN + SEQ_HEAD / 2 };
    const g = el('g', { class: `diagrama-no${p.papel ? ` diagrama-no--${p.papel}` : ''}` });
    g.appendChild(hidden(rect(box, 'diagrama-no-caixa', 6)));
    g.appendChild(hidden(label(cx, box.cy + 5, p.rotulo, 'diagrama-no-rotulo')));
    svg.appendChild(p.href && links ? conceptLink(p, g) : g);
  }

  rows.forEach(({ m, y: my }, i) => {
    const x1 = (colOf.get(m.de));
    const x2 = (colOf.get(m.para));
    const g = hidden(el('g', { class: `diagrama-mensagem diagrama-mensagem--${m.tipo}`, 'data-msg': i }));
    const marker = m.tipo === 'sync' ? 'seta' : 'seta-aberta';
    if (x1 === x2) {
      const d = m.de === parts[parts.length - 1].id && parts.length > 1 ? -1 : 1;
      const side = d > 0 ? 'diagrama-rotulo-inicio' : 'diagrama-rotulo-fim';
      g.appendChild(el('path', {
        d: `M${x1},${my} h${44 * d} v18 h${-42 * d}`,
        class: 'diagrama-aresta', fill: 'none', 'marker-end': `url(#${prefix}-${marker})`,
      }));
      g.appendChild(label(x1 + 50 * d, my + 4, m.rotulo, `diagrama-aresta-rotulo ${side}`));
      if (m.nota) g.appendChild(label(x1 + 50 * d, my + 34, m.nota, `diagrama-nota ${side}`));
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
  });
  return svg;
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n));

/** A "round" step for about `span / 5`: 1, 2 or 5 × 10ⁿ. */
function niceStep(span) {
  const p = 10 ** Math.floor(Math.log10(span / 5));
  const m = span / 5 / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// Maps [lo, hi] onto [a, b] in pixels, extended to round ticks.
function axisScale(lo, hi, log, a, b) {
  if (log) {
    const l0 = Math.floor(Math.log10(lo));
    const l1 = Math.max(l0 + 1, Math.ceil(Math.log10(hi)));
    const ticks = [];
    for (let e = l0; e <= l1; e++) {
      for (const m of l1 - l0 < 2 ? [1, 2, 5] : [1]) if (m * 10 ** e <= 10 ** l1) ticks.push(m * 10 ** e);
    }
    return { f: (v) => a + ((Math.log10(v) - l0) / (l1 - l0)) * (b - a), ticks };
  }
  const step = niceStep(hi - lo || Math.abs(hi) || 1);
  const t0 = Math.floor(lo / step) * step;
  const t1 = Math.max(t0 + step, Math.ceil(hi / step) * step);
  const ticks = [];
  for (let t = t0; t <= t1 + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return { f: (v) => a + ((v - t0) / (t1 - t0)) * (b - a), ticks };
}

// One marker shape per series: never color alone.
const MARKS = [
  (x, y) => el('circle', { cx: x, cy: y, r: 4.5 }),
  (x, y) => el('rect', { x: x - 4, y: y - 4, width: 8, height: 8 }),
  (x, y) => el('path', { d: `M${x},${y - 5.5}l5,9.5h-10z` }),
  (x, y) => el('path', { d: `M${x},${y - 5.5}l5.5,5.5-5.5,5.5-5.5-5.5z` }),
];

function drawChart(spec) {
  const series = spec.series || [];
  const cat = spec.eixo_x.tipo === 'categoria';
  const legend = series.length > 1;
  const [left, right, top, bottom] = [CH_L, CH_W - CH_R, CH_T + (legend ? 22 : 0), CH_H - CH_B];
  const svg = el('svg', { viewBox: `0 0 ${CH_W} ${CH_H}`, width: CH_W, height: CH_H });

  const ys = series.flatMap((s) => s.pontos.map((p) => p[1]));
  const yLog = spec.eixo_y.escala === 'log';
  const yLo = spec.eixo_y.min ?? (spec.forma !== 'linha' && !yLog ? Math.min(0, ...ys) : Math.min(...ys));
  const Y = axisScale(yLo, spec.eixo_y.max ?? Math.max(...ys), yLog, bottom, top);

  let X;
  let xTicks;
  const cats = spec.categorias || [];
  const band = cat ? (right - left) / cats.length : 0;
  if (cat) {
    X = (v) => left + band * (cats.indexOf(String(v)) + 0.5);
    xTicks = cats.map((c) => [X(c), c]);
  } else {
    const xs = series.flatMap((s) => s.pontos.map((p) => p[0]));
    const sx = axisScale(spec.eixo_x.min ?? Math.min(...xs), spec.eixo_x.max ?? Math.max(...xs), spec.eixo_x.escala === 'log', left, right);
    X = sx.f;
    xTicks = sx.ticks.map((t) => [X(t), fmt(t)]);
  }
  const base = yLog ? bottom : Y.f(Math.max(Y.ticks[0], Math.min(0, Y.ticks[Y.ticks.length - 1])));

  const axes = hidden(el('g', { class: 'diagrama-eixos' }));
  for (const t of Y.ticks) {
    const y = Y.f(t);
    axes.appendChild(el('line', { x1: left, y1: y, x2: right, y2: y, class: 'diagrama-grade' }));
    axes.appendChild(label(left - 8, y + 4, fmt(t), 'diagrama-marca diagrama-rotulo-fim'));
  }
  for (const [x, text] of xTicks) axes.appendChild(label(x, bottom + 18, text, 'diagrama-marca'));
  axes.appendChild(el('line', { x1: left, y1: bottom, x2: right, y2: bottom, class: 'diagrama-eixo' }));
  axes.appendChild(el('line', { x1: left, y1: top, x2: left, y2: bottom, class: 'diagrama-eixo' }));
  axes.appendChild(label((left + right) / 2, bottom + 42, spec.eixo_x.rotulo, 'diagrama-eixo-rotulo'));
  const yTitle = label(18, (top + bottom) / 2, spec.eixo_y.rotulo, 'diagrama-eixo-rotulo');
  yTitle.setAttribute('transform', `rotate(-90 18 ${(top + bottom) / 2})`);
  axes.appendChild(yTitle);
  svg.appendChild(axes);

  const anots = spec.anotacoes || [];
  const xEdge = (v, side) => X(v) + (cat ? side * band / 2 : 0);
  for (const a of anots.filter((a) => a.tipo.startsWith('faixa'))) {
    const g = hidden(el('g', { class: `diagrama-anotacao diagrama-faixa${a.papel ? ' diagrama-anotacao--destaque' : ''}` }));
    const box = a.tipo === 'faixa-x'
      ? { x: xEdge(a.de, -1), y: top, w: xEdge(a.ate, 1) - xEdge(a.de, -1), h: bottom - top }
      : { x: left, y: Y.f(a.ate), w: right - left, h: Y.f(a.de) - Y.f(a.ate) };
    g.appendChild(rect(box, 'diagrama-faixa-area', 0));
    g.appendChild(label(box.x + 6, box.y + 14, a.rotulo, 'diagrama-anotacao-rotulo diagrama-rotulo-inicio'));
    svg.appendChild(g);
  }

  series.forEach((s, i) => {
    const g = el('g', { class: `diagrama-serie diagrama-serie-${i}` });
    const pts = s.pontos.map((p) => ({ x: X(p[0]), y: Y.f(p[1]), p }));
    if (spec.forma === 'barra') {
      const bw = (band * 0.76) / series.length;
      for (const q of pts) {
        const x = q.x - band * 0.38 + i * bw;
        g.appendChild(point(rect({ x, y: Math.min(q.y, base), w: bw - 2, h: Math.abs(base - q.y) }, 'diagrama-barra', 0), spec, s, q.p));
      }
    } else {
      const line = pts.map((q) => `${q.x},${q.y}`).join(' ');
      if (spec.forma === 'area') {
        g.appendChild(hidden(el('polygon', { points: `${pts[0].x},${base} ${line} ${pts[pts.length - 1].x},${base}`, class: 'diagrama-serie-area' })));
      }
      g.appendChild(hidden(el('polyline', { points: line, class: 'diagrama-serie-linha' })));
      for (const q of pts) g.appendChild(point(MARKS[i](q.x, q.y), spec, s, q.p));
    }
    svg.appendChild(g);
  });

  for (const a of anots.filter((a) => a.tipo.startsWith('linha'))) {
    const g = hidden(el('g', { class: `diagrama-anotacao${a.papel ? ' diagrama-anotacao--destaque' : ''}` }));
    if (a.tipo === 'linha-x') {
      const x = X(a.valor);
      g.appendChild(el('line', { x1: x, y1: top - 4, x2: x, y2: bottom, class: 'diagrama-anotacao-linha' }));
      g.appendChild(label(x, top - 9, a.rotulo, 'diagrama-anotacao-rotulo'));
    } else {
      const y = Y.f(a.valor);
      g.appendChild(el('line', { x1: left, y1: y, x2: right, y2: y, class: 'diagrama-anotacao-linha' }));
      g.appendChild(label(right - 4, y - 6, a.rotulo, 'diagrama-anotacao-rotulo diagrama-rotulo-fim'));
    }
    svg.appendChild(g);
  }

  if (legend) {
    const g = hidden(el('g', { class: 'diagrama-legenda' }));
    series.forEach((s, i) => {
      const x = left + i * 150;
      const item = el('g', { class: `diagrama-serie diagrama-serie-${i}` });
      item.appendChild(el('line', { x1: x, y1: 14, x2: x + 26, y2: 14, class: 'diagrama-serie-linha' }));
      const m = MARKS[i](x + 13, 14);
      m.setAttribute('class', 'diagrama-marcador');
      item.appendChild(m);
      item.appendChild(label(x + 32, 18, s.rotulo, 'diagrama-marca diagrama-rotulo-inicio'));
      g.appendChild(item);
    });
    svg.appendChild(g);
  }
  return svg;
}

// Roving tabindex: one Tab stop per chart.
function point(node, spec, s, p) {
  node.setAttribute('class', `${node.getAttribute('class') || ''} diagrama-ponto`.trim());
  node.setAttribute('tabindex', '-1');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${s.rotulo} — ${spec.eixo_x.rotulo} ${fmt(p[0])}: ${fmt(p[1])} ${spec.eixo_y.rotulo}`);
  return node;
}

function wireChartKeys(svg) {
  const series = [...svg.querySelectorAll('.diagrama-serie')].map((g) => [...g.querySelectorAll('.diagrama-ponto')]).filter((p) => p.length);
  if (!series.length) return;
  series[0][0].setAttribute('tabindex', '0');
  svg.addEventListener('keydown', (e) => {
    const ev = (e);
    const target = (ev.target);
    const si = series.findIndex((pts) => pts.includes(target));
    if (si < 0) return;
    let s = si;
    let i = series[si].indexOf(target);
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const mv = (moves)[ev.key];
    if (mv) { s += mv[0]; i += mv[1]; } else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = series[si].length - 1;
    else return;
    ev.preventDefault();
    s = Math.max(0, Math.min(series.length - 1, s));
    i = Math.max(0, Math.min(series[s].length - 1, i));
    const next = (series[s][i]);
    target.setAttribute('tabindex', '-1');
    next.setAttribute('tabindex', '0');
    next.focus();
  });
}

function wireConceptLinks(svg) {
  svg.querySelectorAll('a.diagrama-conceito').forEach((a) => {
    a.addEventListener('click', (e) => {
      const ev = (e);
      if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
      startDesvio((a), a.getAttribute('href') || '');
    });
  });
}

// Return to a detour point drawn late.
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
  returnToPoint((timeline), marcoId, conceito);
}
