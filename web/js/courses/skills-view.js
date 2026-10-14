// @ts-check
// UX platform melhoria 2 ("o que eu já consigo fazer?" por competência):
// #/skills renders a pure-SVG horizontal bar chart (no library — a radar/
// spider chart reads poorly for screen readers, per the plan) paired with
// an equivalent accessible table carrying the same numbers. Everything is
// computed from skills.json + localStorage, client-side only.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty, percent } from '../dom-helpers.js';
import { getProgress } from '../storage.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @typedef {import('../types.js').Skill} Skill */

export async function renderSkills() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando competências…'));

  let catalog;
  try {
    const resp = await fetch('./data/skills.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    catalog = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar competências: ${err.message}`));
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildSkillsView(catalog));
  announceRoute('Competências', true);
}

/** Minutes done for one skill: sum of its milestones' minutes that are in that course's own progress set. */
function doneMinutes(skill) {
  const cache = {};
  let done = 0;
  for (const m of skill.milestones || []) {
    if (!(m.slug in cache)) cache[m.slug] = getProgress(m.slug);
    if (cache[m.slug].has(m.marcoId)) done += m.estimatedMinutes;
  }
  return done;
}

function buildSkillsView(catalog) {
  const root = document.createElement('div');
  root.className = 'course-view skills-view';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Competências';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'O que você já consegue fazer, por competência — não por trilha. Calculado localmente, a partir do seu progresso.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  root.appendChild(heading);

  const coveragePct = percent(catalog.taggedMilestones, catalog.totalMilestones);
  const coverage = document.createElement('p');
  coverage.className = 'skills-coverage';
  coverage.textContent = `Cobertura da marcação: ${coveragePct}% dos marcos (${catalog.taggedMilestones} de ${catalog.totalMilestones}) — as demais trilhas ainda não foram marcadas.`;
  root.appendChild(coverage);

  const skills = (catalog.skills || []).map((s) => ({ ...s, done: doneMinutes(s) }));
  if (skills.length === 0) {
    root.appendChild(buildEmpty('Nenhuma competência configurada ainda.'));
    return root;
  }

  // Groups in first-appearance order — never hardcoded, so a new group in
  // competencies.yaml shows up here without a front-end change.
  const groups = [];
  for (const s of skills) if (!groups.includes(s.group)) groups.push(s.group);

  for (const group of groups) {
    const groupSkills = skills.filter((s) => s.group === group);
    const groupHeading = document.createElement('h3');
    groupHeading.className = 'skills-group-title';
    groupHeading.textContent = group;
    root.appendChild(groupHeading);
    root.appendChild(buildChart(groupSkills));
  }

  root.appendChild(buildTable(skills));

  return root;
}

/** @param {(Skill & { done: number })[]} skills */
function buildChart(skills) {
  const rowHeight = 32;
  const labelWidth = 150;
  const barWidth = 200;
  const width = labelWidth + barWidth + 46;
  const height = skills.length * rowHeight;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'skills-chart');
  // The table right below carries the identical numbers in accessible
  // markup — the chart itself is decorative, so it's hidden from AT rather
  // than duplicating a progressbar role per bar.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  skills.forEach((skill, i) => {
    const y = i * rowHeight + rowHeight / 2;
    const tagged = skill.totalMinutes > 0;
    const pct = tagged ? percent(skill.done, skill.totalMinutes) : 0;

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', '0');
    label.setAttribute('y', String(y + 4));
    label.setAttribute('class', 'skills-chart-label');
    label.textContent = skill.label;
    svg.appendChild(label);

    const track = document.createElementNS(SVG_NS, 'rect');
    track.setAttribute('x', String(labelWidth));
    track.setAttribute('y', String(y - 6));
    track.setAttribute('width', String(barWidth));
    track.setAttribute('height', '12');
    track.setAttribute('rx', '6');
    track.setAttribute('class', 'skills-chart-track');
    svg.appendChild(track);

    if (tagged) {
      const fill = document.createElementNS(SVG_NS, 'rect');
      fill.setAttribute('x', String(labelWidth));
      fill.setAttribute('y', String(y - 6));
      fill.setAttribute('width', String((barWidth * pct) / 100));
      fill.setAttribute('height', '12');
      fill.setAttribute('rx', '6');
      fill.setAttribute('class', 'skills-chart-fill');
      svg.appendChild(fill);
    }

    const valueLabel = document.createElementNS(SVG_NS, 'text');
    valueLabel.setAttribute('x', String(labelWidth + barWidth + 8));
    valueLabel.setAttribute('y', String(y + 4));
    valueLabel.setAttribute('class', 'skills-chart-pct');
    valueLabel.textContent = tagged ? `${pct}%` : '—';
    svg.appendChild(valueLabel);
  });

  return svg;
}

/** @param {(Skill & { done: number })[]} skills */
function buildTable(skills) {
  const table = document.createElement('table');
  table.className = 'skills-table';

  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Os mesmos números do gráfico acima, em tabela';
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Competência', 'Grupo', 'Concluído', 'Total', '%']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const skill of skills) {
    const tagged = skill.totalMinutes > 0;
    const row = document.createElement('tr');

    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = skill.label;
    row.appendChild(name);

    const group = document.createElement('td');
    group.textContent = skill.group;
    row.appendChild(group);

    const done = document.createElement('td');
    done.textContent = tagged ? `${skill.done} min` : '—';
    row.appendChild(done);

    const total = document.createElement('td');
    total.textContent = tagged ? `${skill.totalMinutes} min` : 'sem marcos marcados';
    row.appendChild(total);

    const pctCell = document.createElement('td');
    pctCell.textContent = tagged ? `${percent(skill.done, skill.totalMinutes)}%` : '—';
    row.appendChild(pctCell);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  return table;
}
