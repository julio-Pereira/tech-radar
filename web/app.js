// @ts-check

/** @type {{ generatedAt: string, sources: Source[], items: Item[] } | null} */
let feedData = null;
/** Whether the radar view has been built once (filters/listeners attached). */
let radarBuilt = false;

/** @type {{ categories: Set<string>, sources: Set<string>, search: string }} */
const activeFilters = { categories: new Set(), sources: new Set(), search: '' };

let debounceTimer = null;

/** @typedef {{ id: string, name: string, category: string }} Source */
/** @typedef {{ id: string, title: string, url: string, sourceId: string, sourceName: string, category: string, publishedAt: string, summary: string, author?: string, kind?: string }} Item */
/** @typedef {{ id: string, label: string, sourceId?: string, category?: string, kind?: string }} Theme */
/** @typedef {{ title: string, url: string }} Ref */
/** @typedef {{ slug: string, title: string, subtitle: string, category: string, level: string, tags: string[], estimatedHours: number, milestoneCount: number }} IndexEntry */
/** @typedef {{ id: string, order: number, title: string, summary: string, estimatedMinutes: number, html: string, references?: Ref[] }} Milestone */
/** @typedef {{ slug: string, title: string, subtitle: string, category: string, tags: string[], level: string, lang: string, estimatedHours: number, sources?: Ref[], milestones: Milestone[] }} Course */

// ── Router ──────────────────────────────────────────────────────────────────
// Hash routing keeps the app immune to the GitHub Pages /tech-radar/ prefix and
// needs no 404.html. Routes: #/ (radar), #/learn (index), #/learn/<slug> (course).

function init() {
  window.addEventListener('hashchange', route);
  route();
}

/** @returns {{ name: 'radar' | 'learn' | 'course', slug?: string }} */
function parseRoute() {
  const hash = location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean); // "#/learn/x" → ["learn","x"]
  if (parts[0] === 'learn') {
    return parts[1] ? { name: 'course', slug: parts[1] } : { name: 'learn' };
  }
  return { name: 'radar' };
}

function route() {
  const r = parseRoute();
  showView(r.name === 'radar' ? 'radar' : 'learn');
  setNavActive(r.name === 'radar' ? 'radar' : 'learn');

  if (r.name === 'radar') renderRadar();
  else if (r.name === 'learn') renderCoursesIndex();
  else if (r.name === 'course' && r.slug) renderCourse(r.slug);
}

function showView(which) {
  document.getElementById('view-radar').classList.toggle('hidden', which !== 'radar');
  document.getElementById('view-learn').classList.toggle('hidden', which !== 'learn');
}

function setNavActive(route) {
  document.querySelectorAll('.nav-link').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-route') === route);
  });
}

// ── Radar view ────────────────────────────────────────────────────────────────

/** Loads the feed once, then renders the radar. Re-visits just re-show the DOM. */
async function renderRadar() {
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
    errEl.textContent = `Failed to load feed: ${err.message}`;
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
    empty.textContent = 'No articles available for this topic yet.';
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
    ? `${item.sourceName} · Series guide`
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

// ── Article list ──────────────────────────────────────────────────────────────

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
  sourceSpan.textContent = item.sourceName;

  const categorySpan = document.createElement('span');
  categorySpan.className = 'category-badge';
  categorySpan.textContent = item.category;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'date';
  if (item.kind === 'series') {
    dateSpan.textContent = 'Series guide';
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
    authorEl.textContent = `By ${item.author}`;
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

// ── Learning tracks: progress (localStorage) ───────────────────────────────────
// Storage is per-course: tr:progress:<slug> → JSON array of completed milestone
// ids. Every access is guarded so corrupt/unavailable storage degrades to 0%.

const PROGRESS_PREFIX = 'tr:progress:';

/** @returns {Set<string>} completed milestone ids for a course. */
function getProgress(slug) {
  try {
    const raw = localStorage.getItem(PROGRESS_PREFIX + slug);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveProgress(slug, set) {
  try {
    localStorage.setItem(PROGRESS_PREFIX + slug, JSON.stringify([...set]));
  } catch {
    // Storage full or unavailable — progress simply won't persist.
  }
}

function toggleMilestone(slug, id) {
  const set = getProgress(slug);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  saveProgress(slug, set);
  return set;
}

function clearProgress(slug) {
  try {
    localStorage.removeItem(PROGRESS_PREFIX + slug);
  } catch {
    // ignore
  }
}

function percent(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Builds a progress bar; returns { wrapper, bar } so callers can update width. */
function buildProgressBar(pct) {
  const wrapper = document.createElement('div');
  wrapper.className = 'progress';
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuemin', '0');
  wrapper.setAttribute('aria-valuemax', '100');
  wrapper.setAttribute('aria-valuenow', String(pct));

  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  bar.style.width = `${pct}%`;
  wrapper.appendChild(bar);
  return { wrapper, bar };
}

// ── Learning tracks: index view (#/learn) ──────────────────────────────────────

async function renderCoursesIndex() {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Loading tracks…'));

  let index;
  try {
    const resp = await fetch('./data/courses/index.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    index = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Failed to load tracks: ${err.message}`));
    return;
  }

  view.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'learn-heading';
  const h2 = document.createElement('h2');
  h2.className = 'learn-title';
  h2.textContent = 'Trilhas de Aprendizado';
  const sub = document.createElement('p');
  sub.className = 'learn-subtitle';
  sub.textContent = 'Cursos lineares e progressivos, com exemplos aplicados ao contexto de uma fintech.';
  heading.appendChild(h2);
  heading.appendChild(sub);
  view.appendChild(heading);

  const courses = (index.courses || []);
  if (courses.length === 0) {
    view.appendChild(buildEmpty('Nenhuma trilha disponível ainda.'));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'course-grid';
  for (const entry of courses) {
    grid.appendChild(buildCourseCard(entry));
  }
  view.appendChild(grid);
}

/** @param {IndexEntry} entry */
function buildCourseCard(entry) {
  const card = document.createElement('a');
  card.className = 'course-card';
  card.href = `#/learn/${entry.slug}`;

  const badges = document.createElement('div');
  badges.className = 'course-card-badges';
  badges.appendChild(buildBadge(entry.category, 'category-badge'));
  if (entry.level) badges.appendChild(buildBadge(entry.level, 'level-badge'));
  card.appendChild(badges);

  const title = document.createElement('h3');
  title.className = 'course-card-title';
  title.textContent = entry.title;
  card.appendChild(title);

  if (entry.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-card-subtitle';
    subtitle.textContent = entry.subtitle;
    card.appendChild(subtitle);
  }

  const meta = document.createElement('p');
  meta.className = 'course-card-meta';
  const parts = [];
  if (entry.estimatedHours) parts.push(`${entry.estimatedHours}h`);
  parts.push(`${entry.milestoneCount} marco${entry.milestoneCount === 1 ? '' : 's'}`);
  meta.textContent = parts.join(' · ');
  card.appendChild(meta);

  const done = Math.min(getProgress(entry.slug).size, entry.milestoneCount);
  const pct = percent(done, entry.milestoneCount);
  const { wrapper } = buildProgressBar(pct);
  card.appendChild(wrapper);

  const label = document.createElement('span');
  label.className = 'progress-label';
  label.textContent = pct === 100 ? 'Concluído ✓' : `${pct}% concluído`;
  card.appendChild(label);

  return card;
}

// ── Learning tracks: course timeline (#/learn/<slug>) ───────────────────────────

async function renderCourse(slug) {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Loading track…'));

  let course;
  try {
    const resp = await fetch(`./data/courses/${slug}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    course = await resp.json();
  } catch {
    view.innerHTML = '';
    view.appendChild(buildCourseNotFound());
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildCourseView(course));
}

function buildCourseNotFound() {
  const wrap = document.createElement('div');
  wrap.className = 'course-notfound';
  const msg = document.createElement('p');
  msg.className = 'empty';
  msg.textContent = 'Trilha não encontrada.';
  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/learn';
  back.textContent = '← Voltar para Trilhas';
  wrap.appendChild(msg);
  wrap.appendChild(back);
  return wrap;
}

/** @param {Course} course */
function buildCourseView(course) {
  const root = document.createElement('div');
  root.className = 'course-view';

  const completed = getProgress(course.slug);
  const total = course.milestones.length;

  // Header ---------------------------------------------------------------------
  const header = document.createElement('div');
  header.className = 'course-header';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/learn';
  back.textContent = '← Trilhas';
  header.appendChild(back);

  const badges = document.createElement('div');
  badges.className = 'course-card-badges';
  badges.appendChild(buildBadge(course.category, 'category-badge'));
  if (course.level) badges.appendChild(buildBadge(course.level, 'level-badge'));
  header.appendChild(badges);

  const title = document.createElement('h2');
  title.className = 'course-title';
  title.textContent = course.title;
  header.appendChild(title);

  if (course.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'course-subtitle';
    subtitle.textContent = course.subtitle;
    header.appendChild(subtitle);
  }

  // Progress block (live-updated as milestones toggle) -------------------------
  const doneCount = countDone(completed, course.milestones);
  const progressBlock = document.createElement('div');
  progressBlock.className = 'course-progress';
  const { wrapper, bar } = buildProgressBar(percent(doneCount, total));
  const progressLabel = document.createElement('span');
  progressLabel.className = 'progress-label';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'reset-btn';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Resetar progresso';

  progressBlock.appendChild(wrapper);
  progressBlock.appendChild(progressLabel);
  progressBlock.appendChild(resetBtn);
  header.appendChild(progressBlock);
  root.appendChild(header);

  // Timeline -------------------------------------------------------------------
  const timeline = document.createElement('ol');
  timeline.className = 'timeline';

  /** Recomputes progress bar, label, dots, and aria-current after any toggle. */
  const refresh = () => {
    const set = getProgress(course.slug);
    const done = countDone(set, course.milestones);
    const pct = percent(done, total);
    bar.style.width = `${pct}%`;
    wrapper.setAttribute('aria-valuenow', String(pct));
    progressLabel.textContent = `${pct}% • ${done} de ${total} marcos`;

    const firstPending = course.milestones.find(m => !set.has(m.id));
    timeline.querySelectorAll('.timeline-node').forEach((node) => {
      const id = node.getAttribute('data-id');
      const isDone = set.has(id);
      node.classList.toggle('done', isDone);
      const dot = node.querySelector('.node-dot');
      if (dot) dot.textContent = isDone ? '✓' : node.getAttribute('data-order');
      if (firstPending && id === firstPending.id) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    });
  };

  for (const milestone of course.milestones) {
    timeline.appendChild(buildTimelineNode(course.slug, milestone, completed, refresh));
  }
  root.appendChild(timeline);

  // Sources (attribution) ------------------------------------------------------
  if (course.sources && course.sources.length > 0) {
    root.appendChild(buildSourcesBlock(course.sources));
  }

  resetBtn.addEventListener('click', () => {
    if (!confirm('Resetar todo o progresso desta trilha?')) return;
    clearProgress(course.slug);
    timeline.querySelectorAll('.node-check').forEach((cb) => { cb.checked = false; });
    refresh();
  });

  refresh();
  // Defer until appended to the DOM so scrollIntoView has layout.
  requestAnimationFrame(() => scrollToFirstPending(timeline, getProgress(course.slug), course.milestones));
  return root;
}

/** @param {Milestone} milestone */
function buildTimelineNode(slug, milestone, completed, onToggle) {
  const node = document.createElement('li');
  node.className = 'timeline-node';
  node.setAttribute('data-id', milestone.id);
  node.setAttribute('data-order', String(milestone.order));
  if (completed.has(milestone.id)) node.classList.add('done');

  // Marker (dot) ---------------------------------------------------------------
  const marker = document.createElement('div');
  marker.className = 'node-marker';
  const dot = document.createElement('span');
  dot.className = 'node-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.textContent = completed.has(milestone.id) ? '✓' : String(milestone.order);
  marker.appendChild(dot);
  node.appendChild(marker);

  // Content --------------------------------------------------------------------
  const content = document.createElement('div');
  content.className = 'node-content';

  const bodyId = `milestone-body-${slug}-${milestone.id}`;
  const toggle = document.createElement('button');
  toggle.className = 'node-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', bodyId);

  const orderLabel = document.createElement('span');
  orderLabel.className = 'node-order-label';
  orderLabel.textContent = `Marco ${milestone.order}`;

  const nodeTitle = document.createElement('span');
  nodeTitle.className = 'node-title';
  nodeTitle.textContent = milestone.title;

  const nodeSummary = document.createElement('span');
  nodeSummary.className = 'node-summary';
  nodeSummary.textContent = milestone.summary;

  const nodeTime = document.createElement('span');
  nodeTime.className = 'node-time';
  if (milestone.estimatedMinutes) nodeTime.textContent = `${milestone.estimatedMinutes} min`;

  toggle.append(orderLabel, nodeTitle, nodeSummary, nodeTime);
  content.appendChild(toggle);

  // Body (collapsed by default) ------------------------------------------------
  const body = document.createElement('div');
  body.className = 'node-body hidden';
  body.id = bodyId;

  const article = document.createElement('div');
  article.className = 'milestone-body';
  article.innerHTML = milestone.html; // pre-sanitized at build time (bluemonday)
  body.appendChild(article);

  if (milestone.references && milestone.references.length > 0) {
    body.appendChild(buildReferences(milestone.references));
  }

  // Complete control -----------------------------------------------------------
  const completeWrap = document.createElement('div');
  completeWrap.className = 'node-complete';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-check';
  checkbox.id = `check-${slug}-${milestone.id}`;
  checkbox.checked = completed.has(milestone.id);
  const label = document.createElement('label');
  label.setAttribute('for', checkbox.id);
  label.textContent = 'Marcar como concluído';
  completeWrap.appendChild(checkbox);
  completeWrap.appendChild(label);
  body.appendChild(completeWrap);

  content.appendChild(body);
  node.appendChild(content);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.classList.toggle('hidden', expanded);
  });

  checkbox.addEventListener('change', () => {
    toggleMilestone(slug, milestone.id);
    onToggle();
  });

  return node;
}

function buildReferences(refs) {
  const wrap = document.createElement('div');
  wrap.className = 'milestone-refs';
  const heading = document.createElement('p');
  heading.className = 'milestone-refs-title';
  heading.textContent = 'Referências';
  wrap.appendChild(heading);
  wrap.appendChild(buildRefList(refs));
  return wrap;
}

function buildSourcesBlock(sources) {
  const section = document.createElement('section');
  section.className = 'course-sources';
  const heading = document.createElement('h3');
  heading.className = 'course-sources-title';
  heading.textContent = 'Fontes';
  const note = document.createElement('p');
  note.className = 'course-sources-note';
  note.textContent = 'Conteúdo autoral. As fontes abaixo são referências por link — nenhum texto é copiado.';
  section.appendChild(heading);
  section.appendChild(note);
  section.appendChild(buildRefList(sources));
  return section;
}

/** @param {Ref[]} refs */
function buildRefList(refs) {
  const list = document.createElement('ul');
  list.className = 'ref-list';
  for (const ref of refs) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = ref.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = ref.title;
    li.appendChild(a);
    list.appendChild(li);
  }
  return list;
}

/** Counts only completed ids that still exist in the course (ignores stale ids). */
function countDone(set, milestones) {
  let n = 0;
  for (const m of milestones) if (set.has(m.id)) n++;
  return n;
}

/** Scrolls to the first uncompleted milestone, respecting reduced-motion. */
function scrollToFirstPending(timeline, set, milestones) {
  const pending = milestones.find(m => !set.has(m.id));
  if (!pending) return;
  const node = timeline.querySelector(`.timeline-node[data-id="${cssEscape(pending.id)}"]`);
  if (!node) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// ── Shared UI helpers ──────────────────────────────────────────────────────────

function buildBadge(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildLoading(text) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.textContent = text;
  return el;
}

function buildError(text) {
  const el = document.createElement('div');
  el.className = 'error';
  el.textContent = text;
  return el;
}

function buildEmpty(text) {
  const el = document.createElement('p');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

/** Minimal CSS.escape fallback for attribute selectors. */
function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/[^\w-]/g, '\\$&');
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
