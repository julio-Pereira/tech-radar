// @ts-check
import { formatRelative } from './dom-helpers.js';

/** @typedef {import('./types.js').Source} Source */
/** @typedef {import('./types.js').Item} Item */
/** @typedef {import('./types.js').Theme} Theme */

/** @type {{ generatedAt: string, sources: Source[], items: Item[] } | null} */
let feedData = null;
/** Whether the radar view has been built once (filters/listeners attached). */
let radarBuilt = false;

/** @type {{ categories: Set<string>, sources: Set<string>, search: string }} */
const activeFilters = { categories: new Set(), sources: new Set(), search: '' };

let debounceTimer = null;

/** Loads the feed once, then renders the radar. Re-visits just re-show the DOM. */
export async function renderRadar() {
  if (radarBuilt) return;
  try {
    const [feedResp, themesResp] = await Promise.all([
      fetch('./data/feed.json'),
      fetch('./themes.json').catch(() => null),
    ]);

    if (!feedResp.ok) throw new Error(`HTTP ${feedResp.status}`);
    feedData = await feedResp.json();

    document.getElementById('loading').classList.add('hidden');
    renderMeta();
    renderFilters();
    renderArticles();

    if (themesResp && themesResp.ok) {
      const { themes } = await themesResp.json();
      renderDaily(themes);
    }
    radarBuilt = true;
  } catch (err) {
    document.getElementById('loading').classList.add('hidden');
    const errEl = document.getElementById('error');
    errEl.textContent = `Falha ao carregar o feed: ${err.message}`;
    errEl.classList.remove('hidden');
  }
}

// ── Daily reading ─────────────────────────────────────────────────────────────

function renderDaily(themes) {
  const container = document.getElementById('daily-cards');
  const section = document.getElementById('daily');
  container.innerHTML = '';

  const today = localDateISO();
  let hasAny = false;

  for (const theme of themes) {
    const item = pickDaily(feedData.items, theme, today);
    const card = buildDailyCard(item, theme);
    container.appendChild(card);
    if (item) hasAny = true;
  }

  if (hasAny) section.classList.remove('hidden');
}

/** Deterministic daily pick: same day + theme → same article. Changes next day. */
function pickDaily(items, theme, today) {
  // A theme without an explicit kind targets normal articles only, so series
  // surface exclusively through the dedicated "Baeldung Series" card.
  const wantKind = theme.kind || 'article';
  const pool = items.filter(i => {
    if ((i.kind || 'article') !== wantKind) return false;
    if (theme.sourceId && i.sourceId !== theme.sourceId) return false;
    if (theme.category && i.category !== theme.category) return false;
    return true;
  });
  if (pool.length === 0) return null;
  const idx = cyrb53(`${today}:${theme.id}`) % pool.length;
  return pool[idx];
}

function buildDailyCard(item, theme) {
  const wrapper = document.createElement('div');
  wrapper.className = 'daily-card';

  const themeLabel = document.createElement('span');
  themeLabel.className = 'daily-theme-label';
  themeLabel.textContent = theme.label;
  wrapper.appendChild(themeLabel);

  if (!item) {
    const empty = document.createElement('p');
    empty.className = 'daily-empty';
    empty.textContent = 'Ainda não há artigos disponíveis para este tema.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const title = document.createElement('a');
  title.href = item.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.className = 'daily-card-title';
  title.textContent = item.title; // textContent — safe

  const meta = document.createElement('p');
  meta.className = 'daily-card-meta';
  meta.textContent = item.kind === 'series'
    ? `${item.sourceName} · Guia da série`
    : `${item.sourceName} · ${formatRelative(new Date(item.publishedAt))}`;

  const summary = document.createElement('p');
  summary.className = 'daily-card-summary';
  summary.textContent = item.summary; // textContent — safe

  wrapper.appendChild(title);
  wrapper.appendChild(meta);
  if (item.summary) wrapper.appendChild(summary);

  return wrapper;
}

/** cyrb53 non-cryptographic hash — stable across JS engines. */
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Returns "YYYY-MM-DD" in the user's local timezone. */
function localDateISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── Filters ───────────────────────────────────────────────────────────────────

function renderMeta() {
  const el = document.getElementById('generated-at');
  const date = new Date(feedData.generatedAt);
  el.textContent = `Atualizado ${formatRelative(date)}`;
  el.title = date.toLocaleString('pt-BR');
}

function renderFilters() {
  const categories = [...new Set(feedData.sources.map(s => s.category))].sort();
  const sources = feedData.sources.slice().sort((a, b) => a.name.localeCompare(b.name));

  renderChips('category-filters', categories, activeFilters.categories, (val) => {
    toggleFilter(activeFilters.categories, val);
    renderArticles();
  });

  renderChips('source-filters', sources.map(s => s.name), activeFilters.sources, (val) => {
    toggleFilter(activeFilters.sources, val);
    renderArticles();
  });

  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      activeFilters.search = e.target.value.trim().toLowerCase();
      renderArticles();
    }, 250);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    activeFilters.categories.clear();
    activeFilters.sources.clear();
    activeFilters.search = '';
    document.getElementById('search').value = '';
    document.querySelectorAll('.chip.active').forEach((c) => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    renderArticles();
  });
}

function renderChips(containerId, labels, activeSet, onClick) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const label of labels) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = label;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      onClick(label);
      const isActive = activeSet.has(label);
      chip.classList.toggle('active', isActive);
      chip.setAttribute('aria-pressed', String(isActive));
    });
    container.appendChild(chip);
  }
}

function toggleFilter(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

// ── Article list ──────────────────────────────────────────────────────────────

function renderArticles() {
  const filtered = applyFilters(feedData.items);

  const summary = document.getElementById('summary');
  summary.textContent = `Exibindo ${filtered.length} de ${feedData.items.length} artigos`;

  const container = document.getElementById('articles');
  container.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nenhum artigo corresponde aos filtros.';
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of filtered) {
    fragment.appendChild(buildCard(item));
  }
  container.appendChild(fragment);
}

function applyFilters(items) {
  return items.filter(item => {
    if (activeFilters.categories.size > 0 && !activeFilters.categories.has(item.category)) return false;
    if (activeFilters.sources.size > 0 && !activeFilters.sources.has(item.sourceName)) return false;
    if (activeFilters.search) {
      const haystack = `${item.title} ${item.summary} ${item.sourceName}`.toLowerCase();
      if (!haystack.includes(activeFilters.search)) return false;
    }
    return true;
  });
}

function buildCard(item) {
  const article = document.createElement('article');
  article.className = 'card';

  const header = document.createElement('div');
  header.className = 'card-header';

  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const sourceSpan = document.createElement('span');
  sourceSpan.className = 'source-badge';
  sourceSpan.textContent = item.sourceName;

  const categorySpan = document.createElement('span');
  categorySpan.className = 'category-badge';
  categorySpan.textContent = item.category;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'date';
  if (item.kind === 'series') {
    dateSpan.textContent = 'Guia da série';
    dateSpan.classList.add('series-tag');
  } else {
    const published = new Date(item.publishedAt);
    dateSpan.textContent = formatRelative(published);
    dateSpan.title = published.toLocaleString();
  }

  meta.appendChild(sourceSpan);
  meta.appendChild(categorySpan);
  meta.appendChild(dateSpan);

  const titleLink = document.createElement('a');
  titleLink.href = item.url;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = item.title;

  const h2 = document.createElement('h2');
  h2.className = 'card-title';
  h2.appendChild(titleLink);

  header.appendChild(meta);
  header.appendChild(h2);

  if (item.author) {
    const authorEl = document.createElement('p');
    authorEl.className = 'card-author';
    authorEl.textContent = `Por ${item.author}`;
    header.appendChild(authorEl);
  }

  article.appendChild(header);

  if (item.summary) {
    const summary = document.createElement('p');
    summary.className = 'card-summary';
    summary.textContent = item.summary;
    article.appendChild(summary);
  }

  return article;
}
