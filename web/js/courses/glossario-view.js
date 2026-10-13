// @ts-check
// UX item 16 (glossário navegável): #/glossario lists every distinct term
// across every trilha (grouped alphabetically, with a local filter —
// "busca dentro do glossário"); #/glossario/<anchor> shows every trilha's
// own definition of one term side by side — never merged.
import { announceRoute } from '../announce.js';
import { buildLoading, buildError, buildEmpty, normalizeForSearch } from '../dom-helpers.js';

/** @typedef {import('../types.js').GlossaryEntry} GlossaryEntry */

async function fetchGlossary() {
  const resp = await fetch('./data/glossary.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const { entries } = await resp.json();
  return entries || [];
}

export async function renderGlossarioIndex() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando glossário…'));

  let entries;
  try {
    entries = await fetchGlossary();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar o glossário: ${err.message}`));
    return;
  }

  view.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Glossário';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'Termos de todas as trilhas, em um só lugar. O mesmo termo pode ter mais de uma definição — uma por trilha.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  view.appendChild(heading);

  if (entries.length === 0) {
    view.appendChild(buildEmpty('Nenhum verbete disponível ainda.'));
    return;
  }

  const filterWrap = document.createElement('div');
  filterWrap.className = 'glossario-filter';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.placeholder = 'Filtrar o glossário…';
  filterInput.setAttribute('aria-label', 'Filtrar o glossário');
  filterWrap.appendChild(filterInput);
  view.appendChild(filterWrap);

  const terms = dedupeByAnchor(entries);
  const list = document.createElement('div');
  list.className = 'glossario-list';
  view.appendChild(list);

  let currentLetter = '';
  for (const term of terms) {
    const letter = (term.term[0] || '').toLocaleUpperCase('pt-BR');
    if (letter !== currentLetter) {
      currentLetter = letter;
      const letterHeading = document.createElement('h3');
      letterHeading.className = 'glossario-letter';
      letterHeading.textContent = letter;
      list.appendChild(letterHeading);
    }
    list.appendChild(buildTermRow(term));
  }

  filterInput.addEventListener('input', () => {
    const query = normalizeForSearch(filterInput.value.trim());
    list.querySelectorAll('.glossario-term-row').forEach((row) => {
      row.classList.toggle('hidden', query !== '' && !row.dataset.search.includes(query));
    });
    list.querySelectorAll('.glossario-letter').forEach((heading) => {
      let node = heading.nextElementSibling;
      let anyVisible = false;
      while (node && !node.classList.contains('glossario-letter')) {
        if (!node.classList.contains('hidden')) anyVisible = true;
        node = node.nextElementSibling;
      }
      heading.classList.toggle('hidden', !anyVisible);
    });
  });
}

/**
 * @param {string} anchor
 * @param {boolean} isFirstNavigation
 */
export async function renderGlossarioTerm(anchor, isFirstNavigation) {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando verbete…'));

  let entries;
  try {
    entries = await fetchGlossary();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar o verbete: ${err.message}`));
    return;
  }

  const definitions = entries.filter((e) => e.anchor === anchor);
  if (definitions.length === 0) {
    view.innerHTML = '';
    view.appendChild(buildTermNotFound());
    announceRoute('Verbete não encontrado', isFirstNavigation);
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildTermView(definitions));
  announceRoute(definitions[0].term, isFirstNavigation);
}

function buildTermNotFound() {
  const wrap = document.createElement('div');
  wrap.className = 'course-notfound';
  const msg = document.createElement('p');
  msg.className = 'empty';
  msg.textContent = 'Verbete não encontrado.';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/glossario';
  back.textContent = '← Voltar para o Glossário';
  wrap.appendChild(msg);
  wrap.appendChild(back);
  return wrap;
}

/** @param {GlossaryEntry[]} definitions same anchor, one entry per trilha */
function buildTermView(definitions) {
  const root = document.createElement('div');
  root.className = 'course-view glossario-term-view';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/glossario';
  back.textContent = '← Glossário';
  root.appendChild(back);

  const title = document.createElement('h2');
  title.className = 'course-title';
  title.textContent = definitions[0].term;
  root.appendChild(title);

  const count = document.createElement('p');
  count.className = 'course-subtitle';
  count.textContent = definitions.length === 1
    ? 'Uma definição.'
    : `${definitions.length} definições — uma por trilha, sem fusão automática.`;
  root.appendChild(count);

  const list = document.createElement('div');
  list.className = 'glossario-definitions';
  for (const def of definitions) {
    list.appendChild(buildDefinitionCard(def));
  }
  root.appendChild(list);

  return root;
}

/** @param {GlossaryEntry} def */
function buildDefinitionCard(def) {
  const card = document.createElement('div');
  card.className = 'glossario-definition';

  const track = document.createElement('p');
  track.className = 'glossario-definition-track';
  track.textContent = def.track;
  card.appendChild(track);

  const summary = document.createElement('p');
  summary.className = 'glossario-definition-summary';
  summary.textContent = def.summary;
  card.appendChild(summary);

  const link = document.createElement('a');
  link.className = 'glossario-definition-link';
  link.href = def.marcoId ? `#/learn/${def.slug}/${def.marcoId}` : `#/learn/${def.slug}`;
  link.textContent = def.marco ? `Ver na trilha (marco ${def.marco}) →` : 'Ver na trilha →';
  card.appendChild(link);

  return card;
}

/** @param {GlossaryEntry[]} entries @returns {GlossaryEntry[]} one row per anchor, sorted */
function dedupeByAnchor(entries) {
  const byAnchor = new Map();
  for (const e of entries) {
    if (!byAnchor.has(e.anchor)) byAnchor.set(e.anchor, { ...e, count: 1 });
    else byAnchor.get(e.anchor).count++;
  }
  return [...byAnchor.values()].sort((a, b) => a.term.localeCompare(b.term, 'pt-BR'));
}

/** @param {GlossaryEntry & { count: number }} term */
function buildTermRow(term) {
  const row = document.createElement('a');
  row.className = 'glossario-term-row';
  row.href = `#/glossario/${term.anchor}`;
  row.dataset.search = normalizeForSearch(term.term);

  const label = document.createElement('span');
  label.className = 'glossario-term-label';
  label.textContent = term.term;
  row.appendChild(label);

  if (term.count > 1) {
    const badge = document.createElement('span');
    badge.className = 'glossario-term-count';
    badge.textContent = `${term.count} trilhas`;
    row.appendChild(badge);
  }

  return row;
}
