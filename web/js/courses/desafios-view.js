// @ts-check
// Banco de desafios (PLANO jornada de entrevistas §8): #/desafios (catalog),
// #/desafios/<id>[/estudo/<seed>] (study mode: no timer, hints, everything
// visible) and #/desafios/<id>/simulado[/<seed>] (simulated interview:
// vague statement, ask-to-reveal clarifications, timer with phases, twist,
// then correction). The seed lives in the URL, so a reload — or a link —
// replays the same round. Pure logic is in desafio-logic.js; this file only
// builds DOM. Nothing a reader types leaves the browser: drafts go to
// localStorage (tr:desafios:v1), and the export is a local file download.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty } from '../dom-helpers.js';
import {
  drawParams, newSeed, fillText, fillHTML, formatNumber, checkEstimativas, checkDecisoes,
  checkEntregavel, score, missingPrereqs, phases, phaseAt, speakingMinutes, rangeValues,
} from '../desafio-logic.js';
import {
  getProgress, getDesafioDraft, saveDesafioDraft, recordDesafioRodada,
} from '../storage.js';

const TIPO_LABEL = {
  'system-design': 'System design', lld: 'LLD', estimativa: 'Estimativa',
  incidente: 'Incidente', comportamental: 'Comportamental',
};

/** The interval of a running simulated round; cleared whenever a desafio route renders. */
let activeTimer = null;
export function stopTimer() {
  if (activeTimer) clearInterval(activeTimer);
  activeTimer = null;
}

async function loadCatalog() {
  const resp = await fetch('./data/desafios.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return Array.isArray(data.desafios) ? data.desafios : [];
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Catalog ────────────────────────────────────────────────────────────────

export async function renderDesafios() {
  stopTimer();
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando desafios…'));
  let desafios;
  try {
    desafios = await loadCatalog();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar os desafios: ${err.message}`));
    return;
  }
  view.innerHTML = '';

  const root = el('div', 'course-view desafios-view');
  const heading = el('div', 'learn-heading');
  heading.append(
    el('h2', 'learn-title', 'Desafios'),
    el('p', 'learn-subtitle', 'Prática para entrevistas de sênior e tech lead: parâmetros sorteados a cada rodada, modo estudo e modo simulado. Não contam como progresso de trilha.'),
  );
  root.appendChild(heading);

  const filters = el('div', 'desafios-filters');
  const tipoSel = selectFilter('desafios-tipo', 'Tipo', [['', 'Todos'], ...Object.entries(TIPO_LABEL)]);
  const nivelSel = selectFilter('desafios-nivel', 'Nível', [['', 'Todos'], ['senior', 'Sênior'], ['staff', 'Staff']]);
  const liberadosWrap = el('label', 'desafios-liberados');
  const liberados = document.createElement('input');
  liberados.type = 'checkbox';
  liberados.id = 'desafios-liberados';
  liberadosWrap.append(liberados, document.createTextNode(' Só os liberados para mim'));
  filters.append(tipoSel.wrap, nivelSel.wrap, liberadosWrap);
  root.appendChild(filters);

  const grid = el('div', 'course-grid desafios-grid');
  root.appendChild(grid);

  function renderGrid() {
    grid.innerHTML = '';
    const shown = desafios.filter((d) =>
      (!tipoSel.select.value || d.tipo === tipoSel.select.value) &&
      (!nivelSel.select.value || d.nivel === nivelSel.select.value) &&
      (!liberados.checked || missingPrereqs(d, getProgress).length === 0));
    if (shown.length === 0) {
      grid.appendChild(buildEmpty(desafios.length ? 'Nenhum desafio com esses filtros.' : 'Nenhum desafio publicado ainda.'));
      return;
    }
    for (const d of shown) grid.appendChild(buildCard(d));
  }
  for (const c of [tipoSel.select, nivelSel.select, liberados]) c.addEventListener('change', renderGrid);
  renderGrid();

  view.appendChild(root);
  announceRoute('Desafios', true);
}

function selectFilter(id, label, options) {
  const wrap = el('label', 'desafios-filter');
  wrap.setAttribute('for', id);
  wrap.append(document.createTextNode(`${label}: `));
  const select = document.createElement('select');
  select.id = id;
  for (const [value, text] of options) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    select.appendChild(o);
  }
  wrap.appendChild(select);
  return { wrap, select };
}

function buildCard(d) {
  const card = el('article', 'course-card desafio-card');
  card.dataset.id = d.id;
  const badges = el('div', 'course-card-badges');
  badges.append(el('span', 'level-badge', TIPO_LABEL[d.tipo] || d.tipo), el('span', 'level-badge', d.nivel === 'staff' ? 'Staff' : 'Sênior'));
  const missing = missingPrereqs(d, getProgress);
  badges.appendChild(el('span', missing.length ? 'desafio-lock' : 'desafio-unlocked',
    missing.length ? `Faltam ${missing.length} ${missing.length === 1 ? 'marco' : 'marcos'}` : 'Liberado'));
  const title = el('h3', 'course-card-title', fillText(d.titulo, rangeValues(d.parametros)));
  const meta = el('p', 'course-card-meta', `${d.duracaoMin} min`);
  const actions = el('div', 'desafio-card-actions');
  const estudo = el('a', 'desafio-link', 'Estudar');
  estudo.href = `#/desafios/${d.id}`;
  const sim = el('a', 'desafio-link', 'Simulado');
  sim.href = `#/desafios/${d.id}/simulado`;
  actions.append(estudo, sim);
  card.append(badges, title, meta, actions);
  return card;
}

// ── One desafio ────────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @param {'estudo' | 'simulado'} mode
 * @param {number | undefined} seed from the URL; absent → a new one, written back to the URL
 */
export async function renderDesafio(id, mode, seed) {
  stopTimer();
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando desafio…'));
  let desafios;
  try {
    desafios = await loadCatalog();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar o desafio: ${err.message}`));
    return;
  }
  const d = desafios.find((x) => x.id === id);
  view.innerHTML = '';
  if (!d) {
    view.appendChild(buildError('Desafio não encontrado.'));
    announceRoute('Desafio não encontrado', true);
    return;
  }
  if (!seed) {
    seed = newSeed();
    history.replaceState(null, '', `#/desafios/${id}/${mode}/${seed}`);
  }
  const values = drawParams(d.parametros, seed);
  view.appendChild(mode === 'simulado' ? buildSimulado(d, seed, values) : buildEstudo(d, seed, values));
  announceRoute(`${fillText(d.titulo, values)} — ${mode === 'simulado' ? 'simulado' : 'estudo'}`, true);
}

function buildHeader(d, values, mode, seed) {
  const head = el('div', 'learn-heading');
  const back = el('a', 'back-link', '← Desafios');
  back.href = '#/desafios';
  head.append(back, el('h2', 'learn-title', fillText(d.titulo, values)));
  const sub = el('p', 'learn-subtitle');
  sub.textContent = `${TIPO_LABEL[d.tipo] || d.tipo} · ${d.duracaoMin} min · modo ${mode} · rodada ${seed}`;
  head.appendChild(sub);

  const nav = el('p', 'desafio-modes');
  const other = el('a', 'desafio-link', mode === 'simulado' ? 'Ir para o modo estudo' : 'Fazer o simulado');
  other.href = mode === 'simulado' ? `#/desafios/${d.id}/estudo/${seed}` : `#/desafios/${d.id}/simulado`;
  const redraw = el('a', 'desafio-link', 'Sortear outros números');
  redraw.href = `#/desafios/${d.id}/${mode}`;
  nav.append(other, document.createTextNode(' · '), redraw);
  head.appendChild(nav);

  const missing = missingPrereqs(d, getProgress);
  if (missing.length) {
    const warn = el('p', 'desafio-prereq-warn', 'Este desafio supõe marcos que você ainda não concluiu: ');
    missing.forEach((p, i) => {
      const a = el('a', '', `${p.courseTitle} · ${p.milestoneTitle}`);
      a.href = `#/learn/${p.slug}/${p.marcoId}`;
      warn.append(a, document.createTextNode(i < missing.length - 1 ? '; ' : '.'));
    });
    head.appendChild(warn);
  }
  return head;
}

function section(title, className) {
  const s = el('section', `desafio-section ${className || ''}`.trim());
  s.appendChild(el('h3', 'desafio-section-title', title));
  return s;
}

function htmlBlock(html, values) {
  const div = el('div', 'desafio-prose');
  div.innerHTML = fillHTML(html, values); // pre-sanitized at build time (bluemonday); values escaped
  return div;
}

function buildConceitos(d) {
  if (!d.conceitos.length && !d.prerequisitos.length) return null;
  const s = section('Para revisar antes', 'desafio-links');
  const ul = el('ul');
  for (const p of d.prerequisitos) {
    const li = el('li');
    const a = el('a', '', `${p.courseTitle} · ${p.milestoneTitle}`);
    a.href = `#/learn/${p.slug}/${p.marcoId}`;
    li.appendChild(a);
    if (getProgress(p.slug).has(p.marcoId)) li.appendChild(el('span', 'desafio-done', ' ✓ concluído'));
    ul.appendChild(li);
  }
  for (const c of d.conceitos) {
    const li = el('li');
    const a = el('a', '', `Conceito: ${c.termo}`);
    a.href = c.href;
    li.appendChild(a);
    ul.appendChild(li);
  }
  s.appendChild(ul);
  return s;
}

function buildCodigo(d) {
  if (!d.codigo || !d.codigo.length) return null;
  const s = section('Código e testes', 'desafio-codigo');
  const ul = el('ul');
  for (const c of d.codigo) {
    const li = el('li');
    li.append(document.createTextNode(`${c.linguagem === 'go' ? 'Go' : 'Java'}: `), el('code', '', c.pasta), document.createTextNode(' — rode '), el('code', '', c.comando));
    ul.appendChild(li);
  }
  s.appendChild(ul);
  return s;
}

// ── Estudo ─────────────────────────────────────────────────────────────────

function buildEstudo(d, seed, values) {
  const root = el('div', 'course-view desafio-view desafio-estudo');
  root.appendChild(buildHeader(d, values, 'estudo', seed));

  const enun = section('Enunciado');
  enun.appendChild(htmlBlock(d.enunciadoHtml, values));
  root.appendChild(enun);
  if (d.dicasHtml) {
    const dicas = section('Dicas');
    dicas.appendChild(htmlBlock(d.dicasHtml, values));
    root.appendChild(dicas);
  }
  const links = buildConceitos(d);
  if (links) root.appendChild(links);
  const codigo = buildCodigo(d);
  if (codigo) root.appendChild(codigo);

  if (d.esclarecimentos.length) {
    const s = section('Esclarecimentos');
    const dl = el('dl', 'desafio-esclarecimentos');
    for (const e of d.esclarecimentos) {
      const dt = el('dt', '', fillText(e.pergunta, values));
      if (e.chave) dt.appendChild(el('span', 'desafio-chave', ' pergunta-chave'));
      dl.append(dt, el('dd', '', fillText(e.revela, values)));
    }
    s.appendChild(dl);
    root.appendChild(s);
  }

  const answers = buildAnswerSections(d, values, 'estudo');
  for (const node of answers.nodes) root.appendChild(node);
  const check = el('button', 'quiz-check-btn desafio-check', 'Conferir');
  check.type = 'button';
  const result = el('div', 'desafio-result');
  result.setAttribute('aria-live', 'polite');
  check.addEventListener('click', () => {
    result.innerHTML = '';
    result.appendChild(buildCorrection(d, values, answers, null, null));
  });
  root.append(check, result);

  const gab = el('details', 'desafio-gabarito');
  gab.appendChild(el('summary', '', 'Gabarito comentado'));
  gab.appendChild(htmlBlock(d.gabaritoHtml, values));
  root.appendChild(gab);
  return root;
}

/** Estimativas, decisões and the entregável textarea — shared by both modes. */
function buildAnswerSections(d, values, mode) {
  const nodes = [];
  const estInputs = {};
  if (d.estimativas.length) {
    const s = section('Estimativas');
    s.appendChild(el('p', 'desafio-hint', 'Conta de cabeça, com as premissas que você levantou. Vale ±' +
      Math.round(d.estimativas[0].tolerancia * 100) + '% (ou a tolerância de cada item).'));
    for (const e of d.estimativas) {
      const row = el('div', 'desafio-estimativa');
      const id = `est-${e.id}`;
      const label = el('label', '', fillText(e.enunciado, values) + (e.unidade ? ` (${e.unidade})` : ''));
      label.setAttribute('for', id);
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.id = id;
      input.autocomplete = 'off';
      row.append(label, input);
      s.appendChild(row);
      estInputs[e.id] = input;
    }
    nodes.push(s);
  }

  const decInputs = [];
  if (d.decisoes.length) {
    const s = section('Decisões');
    d.decisoes.forEach((q, qi) => {
      const fs = el('fieldset', 'quiz-question desafio-decisao');
      fs.appendChild(el('legend', '', fillText(q.pergunta, values)));
      const radios = [];
      q.opcoes.forEach((o, oi) => {
        const row = el('div', 'quiz-option');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `dec-${qi}`;
        input.id = `dec-${qi}-${oi}`;
        input.value = String(oi);
        const label = el('label', '', fillText(o, values));
        label.setAttribute('for', input.id);
        row.append(input, label);
        fs.appendChild(row);
        radios.push(input);
      });
      decInputs.push(radios);
      s.appendChild(fs);
    });
    nodes.push(s);
  }

  const secoes = d.entregavel.secoesObrigatorias || [];
  let draft = null;
  if (secoes.length) {
    const s = section(d.tipo === 'comportamental' ? 'Sua resposta (STAR)' : 'Entregável');
    s.appendChild(el('p', 'desafio-hint',
      `Escreva em markdown, com uma seção "## Nome" para cada parte: ${secoes.join(', ')}. ` +
      'Fica só neste navegador.'));
    draft = document.createElement('textarea');
    draft.id = 'desafio-entregavel';
    draft.className = 'desafio-entregavel';
    draft.rows = 14;
    draft.setAttribute('aria-label', 'Entregável');
    draft.value = secoes.map((x) => `## ${x}\n\n`).join('');
    s.appendChild(draft);
    if (d.tipo === 'comportamental') {
      const tempo = el('p', 'desafio-hint desafio-tempo-fala');
      const upd = () => {
        const m = speakingMinutes(draft.value);
        tempo.textContent = `Tempo de fala estimado: ${formatNumber(Math.round(m * 10) / 10)} min (o ideal é entre 2 e 4).`;
      };
      draft.addEventListener('input', upd);
      upd();
      s.appendChild(tempo);
    }
    nodes.push(s);
  }
  return { nodes, estInputs, decInputs, draft, mode };
}

function readAnswers(answers) {
  const est = {};
  for (const [id, input] of Object.entries(answers.estInputs)) est[id] = input.value;
  const dec = {};
  answers.decInputs.forEach((radios, qi) => {
    const r = radios.find((x) => x.checked);
    if (r) dec[qi] = Number(r.value);
  });
  return { est, dec, draft: answers.draft ? answers.draft.value : '' };
}

/**
 * Correction: verified parts (estimativas, decisões, entregável structure),
 * key questions not asked (simulado), self-assessed rubrica, and the score
 * kept in two separate numbers. onScore receives the score on every change.
 */
function buildCorrection(d, values, answers, asked, onScore) {
  const { est, dec, draft } = readAnswers(answers);
  const res = {
    estimativas: checkEstimativas(d.estimativas, est, values),
    decisoes: checkDecisoes(d.decisoes, dec),
    entregavel: checkEntregavel(d.entregavel.secoesObrigatorias, draft),
  };
  const root = el('div', 'desafio-correction');
  const summary = el('div', 'desafio-score');
  summary.setAttribute('role', 'status');
  root.appendChild(summary);

  if (res.estimativas.length) {
    const s = section('Estimativas — verificado');
    const ul = el('ul', 'desafio-check-list');
    d.estimativas.forEach((e, i) => {
      const r = res.estimativas[i];
      const li = el('li', r.ok ? 'ok' : 'nok');
      li.textContent = `${r.ok ? '✓' : '✗'} ${fillText(e.enunciado, values)}: você ${r.given === null ? 'não respondeu' : formatNumber(r.given)}; ` +
        `esperado ≈ ${formatNumber(r.expected)}${e.unidade ? ' ' + e.unidade : ''} (±${Math.round(e.tolerancia * 100)}%, fórmula ${e.formula}).`;
      ul.appendChild(li);
    });
    s.appendChild(ul);
    root.appendChild(s);
  }
  if (res.decisoes.length) {
    const s = section('Decisões — verificado');
    const ul = el('ul', 'desafio-check-list');
    d.decisoes.forEach((q, i) => {
      const r = res.decisoes[i];
      const li = el('li', r.ok ? 'ok' : 'nok');
      li.append(
        el('strong', '', `${r.ok ? '✓' : '✗'} ${fillText(q.pergunta, values)} `),
        document.createTextNode(`Resposta: ${fillText(q.opcoes[q.correta], values)}. ${fillText(q.explicacao, values)}`),
      );
      ul.appendChild(li);
    });
    s.appendChild(ul);
    root.appendChild(s);
  }
  if (res.entregavel.length) {
    const s = section('Entregável — verificado (estrutura)');
    const ul = el('ul', 'desafio-check-list');
    for (const r of res.entregavel) {
      ul.appendChild(el('li', r.ok ? 'ok' : 'nok', `${r.ok ? '✓' : '✗'} ${r.secao}${r.ok ? '' : ': ausente ou vazia'}`));
    }
    s.appendChild(ul);
    if (d.tipo === 'comportamental') {
      const m = speakingMinutes(draft);
      s.appendChild(el('p', 'desafio-hint', `Tempo de fala estimado: ${formatNumber(Math.round(m * 10) / 10)} min ${m >= 2 && m <= 4 ? '(dentro de 2 a 4)' : '(fora de 2 a 4)'}.`));
    }
    root.appendChild(s);
  }
  if (asked) {
    const missed = d.esclarecimentos.filter((e, i) => e.chave && !asked.has(i));
    const s = section('Perguntas-chave');
    s.appendChild(el('p', '', missed.length
      ? `Você não perguntou: ${missed.map((e) => fillText(e.pergunta, values)).join(' · ')}`
      : 'Você fez todas as perguntas-chave.'));
    root.appendChild(s);
  }

  const rubricaItens = [...d.rubrica, ...(asked && d.reviravolta ? d.reviravolta.rubrica.map((r) => `Reviravolta: ${r}`) : [])];
  const rs = section('Rubrica — autoavaliação');
  const boxes = rubricaItens.map((item, i) => {
    const row = el('div', 'desafio-rubrica-item');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `rub-${i}`;
    const label = el('label', '', fillText(item, values));
    label.setAttribute('for', cb.id);
    row.append(cb, label);
    rs.appendChild(row);
    return cb;
  });
  root.appendChild(rs);

  const update = () => {
    const sc = score(res, boxes.filter((b) => b.checked).length, boxes.length);
    summary.innerHTML = '';
    summary.append(
      el('p', 'desafio-score-verificado', `Verificado: ${sc.verificado.acertos} de ${sc.verificado.total} (${sc.verificado.pct}%)`),
      el('p', 'desafio-score-auto', `Autoavaliado: ${sc.autoavaliado.marcados} de ${sc.autoavaliado.total} (${sc.autoavaliado.pct}%)`),
      el('p', 'desafio-hint', 'Os dois números ficam separados: só o verificado foi conferido pela máquina.'),
    );
    if (onScore) onScore(sc);
  };
  boxes.forEach((b) => b.addEventListener('change', update));
  update();
  return root;
}

// ── Simulado ───────────────────────────────────────────────────────────────

function buildSimulado(d, seed, values) {
  const root = el('div', 'course-view desafio-view desafio-simulado');
  root.appendChild(buildHeader(d, values, 'simulado', seed));

  // Timer: phases, pause, or no timer at all.
  const totalSeg = d.duracaoMin * 60;
  let elapsed = 0;
  let paused = false;
  const timerBar = el('div', 'desafio-timer');
  const clock = el('p', 'desafio-clock');
  clock.setAttribute('role', 'timer');
  clock.setAttribute('aria-live', 'off');
  const pause = el('button', 'quiz-retry-btn desafio-pause', 'Pausar');
  pause.type = 'button';
  const noTimerWrap = el('label', 'desafio-no-timer');
  const noTimer = document.createElement('input');
  noTimer.type = 'checkbox';
  noTimer.id = 'desafio-sem-timer';
  noTimerWrap.append(noTimer, document.createTextNode(' Sem timer'));
  timerBar.append(clock, pause, noTimerWrap);
  root.appendChild(timerBar);
  root.appendChild(el('p', 'desafio-hint', 'Fases sugeridas: ' +
    phases(d.duracaoMin).map((p) => `${p.nome} ${Math.round((p.fimSeg - p.inicioSeg) / 60)} min`).join(' · ')));

  const enun = section('Enunciado');
  enun.appendChild(htmlBlock(d.enunciadoHtml, values));
  root.appendChild(enun);
  const codigo = buildCodigo(d);
  if (codigo) root.appendChild(codigo);

  // Clarifications: only the questions asked get answered.
  const asked = new Set();
  if (d.esclarecimentos.length) {
    const s = section('Esclarecimentos');
    s.appendChild(el('p', 'desafio-hint', 'Escolha o que perguntar. Só as perguntas feitas serão respondidas.'));
    d.esclarecimentos.forEach((e, i) => {
      const row = el('div', 'desafio-pergunta');
      const btn = el('button', 'quiz-retry-btn', `Perguntar: ${fillText(e.pergunta, values)}`);
      btn.type = 'button';
      const ans = el('p', 'desafio-resposta hidden', fillText(e.revela, values));
      btn.addEventListener('click', () => {
        asked.add(i);
        ans.classList.remove('hidden');
        btn.disabled = true;
      });
      row.append(btn, ans);
      s.appendChild(row);
    });
    root.appendChild(s);
  }

  const answers = buildAnswerSections(d, values, 'simulado');
  for (const node of answers.nodes) root.appendChild(node);
  if (answers.draft) {
    const saved = getDesafioDraft(d.id, seed);
    if (saved) answers.draft.value = saved;
    answers.draft.addEventListener('input', () => saveDesafioDraft(d.id, seed, answers.draft.value));
  }

  // The twist, announced politely when it appears.
  const twist = el('div', 'desafio-reviravolta');
  twist.setAttribute('aria-live', 'polite');
  let twistShown = false;
  const showTwist = () => {
    if (twistShown || !d.reviravolta) return;
    twistShown = true;
    twist.appendChild(el('h3', 'desafio-section-title', 'Reviravolta'));
    twist.appendChild(el('p', '', fillText(d.reviravolta.texto, values)));
  };
  let twistBtn = null;
  if (d.reviravolta) {
    twistBtn = el('button', 'quiz-retry-btn desafio-twist-btn hidden', 'Mostrar a reviravolta');
    twistBtn.type = 'button';
    twistBtn.addEventListener('click', () => {
      showTwist();
      twistBtn.classList.add('hidden');
    });
    root.append(twistBtn, twist);
  }

  const tick = () => {
    const mm = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    clock.textContent = `${phaseAt(d.duracaoMin, elapsed)} · ${mm(Math.min(elapsed, totalSeg))} de ${mm(totalSeg)}`;
    if (d.reviravolta && elapsed >= (d.reviravolta.momentoPct / 100) * totalSeg) showTwist();
  };
  tick();
  activeTimer = setInterval(() => {
    if (paused || noTimer.checked) return;
    elapsed += 1;
    tick();
  }, 1000);
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Continuar' : 'Pausar';
  });
  noTimer.addEventListener('change', () => {
    clock.classList.toggle('hidden', noTimer.checked);
    pause.classList.toggle('hidden', noTimer.checked);
    if (twistBtn && !twistShown) twistBtn.classList.toggle('hidden', !noTimer.checked);
  });

  // Finish: correction, score recorded, then the commented answer key last.
  const finish = el('button', 'quiz-check-btn desafio-finish', 'Encerrar e corrigir');
  finish.type = 'button';
  const result = el('div', 'desafio-result');
  result.setAttribute('aria-live', 'polite');
  const exportBtn = el('button', 'quiz-retry-btn desafio-export', 'Exportar .md');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => downloadMarkdown(d, seed, values, answers, asked));
  finish.addEventListener('click', () => {
    stopTimer();
    showTwist();
    if (twistBtn) twistBtn.classList.add('hidden');
    finish.disabled = true;
    result.innerHTML = '';
    result.appendChild(buildCorrection(d, values, answers, asked,
      (sc) => recordDesafioRodada(d.id, seed, sc.verificado.pct, sc.autoavaliado.pct, sc.verificado.partes)));
    const gab = section('Gabarito comentado', 'desafio-gabarito');
    gab.appendChild(htmlBlock(d.gabaritoHtml, values));
    result.appendChild(gab);
    result.querySelector('.desafio-score')?.setAttribute('tabindex', '-1');
    /** @type {HTMLElement|null} */ (result.querySelector('.desafio-score'))?.focus();
  });
  root.append(finish, exportBtn, result);
  return root;
}

/** Local file download of the round — never sent anywhere. */
function downloadMarkdown(d, seed, values, answers, asked) {
  const { est, dec } = readAnswers(answers);
  const lines = [`# ${fillText(d.titulo, values)}`, '', `Rodada ${seed} · ${new Date().toISOString().slice(0, 10)}`, ''];
  lines.push('## Parâmetros', '');
  for (const [k, v] of Object.entries(values)) lines.push(`- ${k}: ${typeof v === 'number' ? formatNumber(v) : v}`);
  if (asked && asked.size) {
    lines.push('', '## Perguntas feitas', '');
    for (const i of asked) lines.push(`- ${fillText(d.esclarecimentos[i].pergunta, values)} — ${fillText(d.esclarecimentos[i].revela, values)}`);
  }
  if (d.estimativas.length) {
    lines.push('', '## Estimativas', '');
    for (const e of d.estimativas) lines.push(`- ${fillText(e.enunciado, values)}: ${est[e.id] || '—'}`);
  }
  if (d.decisoes.length) {
    lines.push('', '## Decisões', '');
    d.decisoes.forEach((q, i) => lines.push(`- ${fillText(q.pergunta, values)} ${dec[i] !== undefined ? fillText(q.opcoes[dec[i]], values) : '—'}`));
  }
  if (answers.draft) lines.push('', '---', '', answers.draft.value);
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${d.id}-${seed}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
