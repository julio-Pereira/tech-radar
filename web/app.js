// @ts-check

/** @type {{ generatedAt: string, sources: Source[], items: Item[] } | null} */
let feedData = null;

/** @type {{ categories: Set<string>, sources: Set<string>, search: string }} */
const activeFilters = { categories: new Set(), sources: new Set(), search: '' };

let debounceTimer = null;

/** @typedef {{ id: string, name: string, category: string }} Source */
/** @typedef {{ id: string, title: string, url: string, sourceId: string, sourceName: string, category: string, publishedAt: string, summary: string, author?: string }} Item */

async function init() {
  try {
    const resp = await fetch('./data/feed.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    feedData = await resp.json();

    document.getElementById('loading').classList.add('hidden');
    renderMeta();
    renderFilters();
    renderArticles();
  } catch (err) {
    document.getElementById('loading').classList.add('hidden');
    const errEl = document.getElementById('error');
    errEl.textContent = `Failed to load feed: ${err.message}`;
    errEl.classList.remove('hidden');
  }
}

function renderMeta() {
  const el = document.getElementById('generated-at');
  const date = new Date(feedData.generatedAt);
  el.textContent = `Updated ${formatRelative(date)}`;
  el.title = date.toLocaleString();
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
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    renderArticles();
  });
}

function renderChips(containerId, labels, activeSet, onClick) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  for (const label of labels) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = label;
    chip.addEventListener('click', () => {
      onClick(label);
      chip.classList.toggle('active', activeSet.has(label));
    });
    container.appendChild(chip);
  }
}

function toggleFilter(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function renderArticles() {
  const filtered = applyFilters(feedData.items);

  const summary = document.getElementById('summary');
  summary.textContent = `Showing ${filtered.length} of ${feedData.items.length} articles`;

  const container = document.getElementById('articles');
  container.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No articles match your filters.';
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
  sourceSpan.textContent = item.sourceName; // textContent — safe

  const categorySpan = document.createElement('span');
  categorySpan.className = 'category-badge';
  categorySpan.textContent = item.category; // textContent — safe

  const dateSpan = document.createElement('span');
  dateSpan.className = 'date';
  const published = new Date(item.publishedAt);
  dateSpan.textContent = formatRelative(published);
  dateSpan.title = published.toLocaleString();

  meta.appendChild(sourceSpan);
  meta.appendChild(categorySpan);
  meta.appendChild(dateSpan);

  const titleLink = document.createElement('a');
  titleLink.href = item.url;
  titleLink.target = '_blank';
  titleLink.rel = 'noopener noreferrer';
  titleLink.textContent = item.title; // textContent — safe

  const h2 = document.createElement('h2');
  h2.className = 'card-title';
  h2.appendChild(titleLink);

  header.appendChild(meta);
  header.appendChild(h2);

  if (item.author) {
    const authorEl = document.createElement('p');
    authorEl.className = 'card-author';
    authorEl.textContent = `By ${item.author}`; // textContent — safe
    header.appendChild(authorEl);
  }

  article.appendChild(header);

  if (item.summary) {
    const summary = document.createElement('p');
    summary.className = 'card-summary';
    summary.textContent = item.summary; // textContent — safe
    article.appendChild(summary);
  }

  return article;
}

function formatRelative(date) {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

init();
