// @ts-check
// UX item 15 (busca global de conteúdo): a header search field, lazy-loaded
// (the index is only fetched once the reader actually opens it) and
// accent-insensitive. "Simples" on purpose: substring match over
// title/summary/tags/headings/track, capped result count, no ranking model.
import { normalizeForSearch, slugifyTerm } from './dom-helpers.js';

const MAX_RESULTS = 8;

/** @type {Promise<any[]> | null} */
let indexPromise = null;

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch('./data/search-index.json')
      .then((resp) => (resp.ok ? resp.json() : { docs: [] }))
      .then(({ docs }) => (docs || []).map((doc) => ({ doc, haystack: normalizeForSearch(haystackOf(doc)) })))
      .catch(() => []);
  }
  return indexPromise;
}

function haystackOf(doc) {
  return [doc.title, doc.summary, doc.track, ...(doc.tags || []), ...(doc.headings || [])].filter(Boolean).join(' ');
}

function docHref(doc) {
  if (doc.kind === 'course') return `#/learn/${doc.slug}`;
  if (doc.kind === 'milestone') return `#/learn/${doc.slug}/${doc.marcoId}`;
  return `#/glossario/${slugifyTerm(doc.title)}`;
}

const KIND_LABEL = { course: 'Trilha', milestone: 'Marco', glossary: 'Verbete' };

export function initSearch() {
  const input = document.getElementById('search-input');
  const panel = document.getElementById('search-results');
  if (!input || !panel) return;

  const close = () => {
    panel.hidden = true;
    panel.innerHTML = '';
  };

  const runSearch = async () => {
    const query = normalizeForSearch(input.value.trim());
    if (!query) {
      close();
      return;
    }
    const entries = await loadIndex();
    const matches = entries.filter((e) => e.haystack.includes(query)).slice(0, MAX_RESULTS);
    renderResults(panel, matches.map((e) => e.doc));
    panel.hidden = false;
  };

  input.addEventListener('input', runSearch);
  input.addEventListener('focus', runSearch);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      close();
      input.blur();
    }
  });
  document.addEventListener('click', (ev) => {
    if (!panel.contains(ev.target) && ev.target !== input) close();
  });

  // "/" focuses search from anywhere, unless the reader is already typing
  // somewhere else — a global shortcut must never steal a keystroke from
  // another field.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.target === input) return;
    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (typing) return;
    ev.preventDefault();
    input.focus();
  });
}

function renderResults(panel, docs) {
  panel.innerHTML = '';
  if (docs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'Nenhum resultado.';
    panel.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'search-result-list';
  for (const doc of docs) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = docHref(doc);

    const kind = document.createElement('span');
    kind.className = 'search-result-kind';
    kind.textContent = KIND_LABEL[doc.kind] || doc.kind;
    link.appendChild(kind);

    const title = document.createElement('span');
    title.className = 'search-result-title';
    title.textContent = doc.title;
    link.appendChild(title);

    if (doc.track && doc.kind !== 'course') {
      const track = document.createElement('span');
      track.className = 'search-result-track';
      track.textContent = doc.track;
      link.appendChild(track);
    }

    li.appendChild(link);
    list.appendChild(li);
  }
  panel.appendChild(list);
}
