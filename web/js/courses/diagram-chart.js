// The grafico type of the typed diagrams (D-G), split out of diagram.js
// (ajustes pós-Fase 1.7, frente 1): downloaded only when a figure on screen
// is a chart, so the renderer's budget stays for what every diagram uses.
// createElementNS and CSS classes only (CSP).
import { el, label, rect } from './diagram-svg.js';

const CH_W = 640;
const CH_H = 360;
const CH_L = 70;
const CH_R = 24;
const CH_T = 34;
const CH_B = 58;

function hidden(node) {
  node.setAttribute('aria-hidden', 'true');
  return node;
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : String(n));

/** A "round" step for about `span / 5`: 1, 2 or 5 × 10ⁿ. */
function niceStep(span) {
  const p = 10 ** Math.floor(Math.log10(span / 5));
  const m = span / 5 / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// [lo, hi] → [a, b] px, out to round ticks; pin: stop at a declared max.
function axisScale(lo, hi, log, a, b, pin) {
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
  const t1 = pin ? hi : Math.max(t0 + step, Math.ceil(hi / step) * step);
  const ticks = [];
  for (let t = t0; t <= t1 + step / 1e6; t += step) ticks.push(Number(t.toPrecision(12)));
  return { f: (v) => a + ((v - t0) / (t1 - t0)) * (b - a), ticks };
}

// One marker shape per series: never color alone.
const MARKS = [
  (x, y) => el('circle', { cx: x, cy: y, r: 4.5 }),
  (x, y) => el('rect', { x: x - 4, y: y - 4, width: 8, height: 8 }),
  (x, y) => el('path', { d: `M${x},${y - 5.5}l5,9.5h-10z` }),
  (x, y) => el('path', { d: `M${x},${y - 5.5}l5.5,5.5-5.5,5.5-5.5-5.5z` }),
];

export function drawChart(spec) {
  const series = spec.series || [];
  const cat = spec.eixo_x.tipo === 'categoria';
  const legend = series.length > 1;
  const [left, right, top, bottom] = [CH_L, CH_W - CH_R, CH_T + (legend ? 22 : 0), CH_H - CH_B];
  const svg = el('svg', { viewBox: `0 0 ${CH_W} ${CH_H}`, width: CH_W, height: CH_H });

  const ys = series.flatMap((s) => s.pontos.map((p) => p[1]));
  const yLog = spec.eixo_y.escala === 'log';
  const yLo = spec.eixo_y.min ?? (spec.forma !== 'linha' && !yLog ? Math.min(0, ...ys) : Math.min(...ys));
  const Y = axisScale(yLo, spec.eixo_y.max ?? Math.max(...ys), yLog, bottom, top, spec.eixo_y.max != null);

  let X;
  let xTicks;
  const cats = spec.categorias || [];
  const band = cat ? (right - left) / cats.length : 0;
  if (cat) {
    X = (v) => left + band * (cats.indexOf(String(v)) + 0.5);
    xTicks = cats.map((c) => [X(c), c]);
  } else {
    const xs = series.flatMap((s) => s.pontos.map((p) => p[0]));
    const sx = axisScale(spec.eixo_x.min ?? Math.min(...xs), spec.eixo_x.max ?? Math.max(...xs), spec.eixo_x.escala === 'log', left, right, spec.eixo_x.max != null);
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

export function wireChartKeys(svg) {
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
