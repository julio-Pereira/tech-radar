// @ts-check
// UX platform melhoria 7, phase 1 (mapa, sem verificador): #/fin-platform
// renders the capstone component map — pure SVG, no library — plus an
// equivalent accessible table and the artifact list per component.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty } from '../dom-helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BOX_W = 148;
const BOX_H = 54;
const COL_GAP = 28;
const ROW_H = 110;

export async function renderCapstoneMap() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando mapa do fin-platform…'));

  let catalog;
  try {
    const resp = await fetch('./data/capstones.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    catalog = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar o mapa: ${err.message}`));
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildCapstoneView(catalog.components || []));
  announceRoute('fin-platform', true);
}

function buildCapstoneView(components) {
  const root = document.createElement('div');
  root.className = 'course-view capstone-view';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Mapa do fin-platform';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'O componente que o capstone de cada trilha entrega ao seu próprio fin-platform, e de que outros componentes ele depende. Mapa apenas — a verificação automática (fin-check) é uma fase futura.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  root.appendChild(heading);

  if (components.length === 0) {
    root.appendChild(buildEmpty('Nenhum componente de capstone mapeado ainda.'));
    return root;
  }

  root.appendChild(buildMap(components));
  root.appendChild(buildTable(components));
  root.appendChild(buildArtifactsList(components));

  return root;
}

/** Topological depth: 0 for a component with no dependencies, else 1 + the deepest dependency. */
function computeDepths(components) {
  const byId = new Map(components.map((c) => [c.component, c]));
  const depths = new Map();
  const visiting = new Set();

  function depthOf(id) {
    if (depths.has(id)) return depths.get(id);
    const comp = byId.get(id);
    if (!comp || comp.dependsOn.length === 0 || visiting.has(id)) {
      depths.set(id, 0);
      return 0;
    }
    visiting.add(id);
    const d = 1 + Math.max(0, ...comp.dependsOn.map((dep) => depthOf(dep)));
    visiting.delete(id);
    depths.set(id, d);
    return d;
  }

  for (const c of components) depthOf(c.component);
  return depths;
}

function buildMap(components) {
  const depths = computeDepths(components);
  const rows = [];
  for (const c of components) {
    const d = depths.get(c.component);
    if (!rows[d]) rows[d] = [];
    rows[d].push(c.component);
  }

  const maxRowWidth = Math.max(...rows.map((r) => (r ? r.length * (BOX_W + COL_GAP) - COL_GAP : 0)));
  const positions = new Map();
  rows.forEach((row, depth) => {
    if (!row) return;
    const rowWidth = row.length * (BOX_W + COL_GAP) - COL_GAP;
    const offsetX = (maxRowWidth - rowWidth) / 2;
    row.forEach((id, i) => {
      positions.set(id, {
        x: offsetX + i * (BOX_W + COL_GAP),
        y: depth * ROW_H,
        cx: offsetX + i * (BOX_W + COL_GAP) + BOX_W / 2,
        cy: depth * ROW_H + BOX_H / 2,
      });
    });
  });

  const height = rows.length * ROW_H;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${maxRowWidth} ${height}`);
  svg.setAttribute('class', 'capstone-map');
  // Decorative — the table right below carries the identical component/
  // dependency data in accessible markup.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'capstone-arrow');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(SVG_NS, 'path');
  arrowPath.setAttribute('d', 'M0,0 L8,4 L0,8 Z');
  arrowPath.setAttribute('class', 'capstone-arrowhead');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Edges drawn before boxes, so each line's clipped endpoint disappears
  // cleanly under the box it touches instead of needing pixel-perfect math.
  for (const c of components) {
    const from = positions.get(c.component);
    if (!from) continue;
    for (const dep of c.dependsOn) {
      const to = positions.get(dep);
      if (!to) continue;
      const start = clipToBoxEdge(from.cx, from.cy, to.cx - from.cx, to.cy - from.cy);
      const end = clipToBoxEdge(to.cx, to.cy, from.cx - to.cx, from.cy - to.cy);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(start.x));
      line.setAttribute('y1', String(start.y));
      line.setAttribute('x2', String(end.x));
      line.setAttribute('y2', String(end.y));
      line.setAttribute('class', 'capstone-edge');
      line.setAttribute('marker-end', 'url(#capstone-arrow)');
      svg.appendChild(line);
    }
  }

  for (const c of components) {
    const pos = positions.get(c.component);
    if (!pos) continue;
    const g = document.createElementNS(SVG_NS, 'g');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    rect.setAttribute('width', String(BOX_W));
    rect.setAttribute('height', String(BOX_H));
    rect.setAttribute('rx', '8');
    rect.setAttribute('class', 'capstone-box');
    g.appendChild(rect);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(pos.cx));
    label.setAttribute('y', String(pos.cy - 4));
    label.setAttribute('class', 'capstone-box-label');
    label.textContent = c.component;
    g.appendChild(label);

    const track = document.createElementNS(SVG_NS, 'text');
    track.setAttribute('x', String(pos.cx));
    track.setAttribute('y', String(pos.cy + 14));
    track.setAttribute('class', 'capstone-box-track');
    track.textContent = c.track;
    g.appendChild(track);

    svg.appendChild(g);
  }

  return svg;
}

/** Clips a line from (cx,cy) in direction (dx,dy) to the edge of a BOX_W×BOX_H box centered at (cx,cy). */
function clipToBoxEdge(cx, cy, dx, dy) {
  const halfW = BOX_W / 2;
  const halfH = BOX_H / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function buildTable(components) {
  const table = document.createElement('table');
  table.className = 'capstone-table';

  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Os mesmos componentes e dependências do mapa acima, em tabela';
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Componente', 'Trilha', 'Depende de']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const c of components) {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = c.component;
    row.appendChild(name);

    const track = document.createElement('td');
    track.textContent = c.track;
    row.appendChild(track);

    const deps = document.createElement('td');
    deps.textContent = c.dependsOn.length > 0 ? c.dependsOn.join(', ') : '—';
    row.appendChild(deps);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  return table;
}

function buildArtifactsList(components) {
  const section = document.createElement('div');
  section.className = 'capstone-artifacts';

  const heading = document.createElement('h3');
  heading.className = 'skills-group-title';
  heading.textContent = 'Artefatos por trilha';
  section.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'review-card-track';
  note.textContent = 'Lista apenas — nada aqui é executado automaticamente ainda.';
  section.appendChild(note);

  const list = document.createElement('dl');
  list.className = 'capstone-artifacts-list';
  for (const c of components) {
    const dt = document.createElement('dt');
    dt.textContent = `${c.component} (${c.track})`;
    list.appendChild(dt);
    const dd = document.createElement('dd');
    dd.textContent = (c.artifacts || []).map((a) => `${a.path} — ${a.check}`).join('; ') || 'Nenhum artefato declarado.';
    list.appendChild(dd);
  }
  section.appendChild(list);

  return section;
}
