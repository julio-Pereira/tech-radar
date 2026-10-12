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
/** @typedef {{ question: string, options: string[], answer: number, explanation?: string }} QuizQuestion */
/** @typedef {{ id: string, order: number, title: string, summary: string, estimatedMinutes: number, html: string, references?: Ref[], quiz?: QuizQuestion[], completion?: string }} Milestone */
/** @typedef {{ slug: string, title: string, subtitle: string, category: string, tags: string[], level: string, lang: string, estimatedHours: number, sources?: Ref[], milestones: Milestone[] }} Course */

// ── Router ──────────────────────────────────────────────────────────────────
// Hash routing keeps the app immune to the GitHub Pages /tech-radar/ prefix and
// needs no 404.html. Routes: #/ (radar), #/learn (index), #/learn/<slug> (course).

// Whether any route has already been entered. Decided synchronously inside
// route(), never by timing of the async work a route kicks off — a course
// route's announceRoute() fires only after its fetch resolves, well after
// route() itself returned, so the flag must be captured up front and
// threaded through, not read later from a module-level variable.
let hasNavigatedOnce = false;

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

/**
 * Sets document.title and announces the change to screen readers via the
 * aria-live region. Called once a route's content has actually rendered, so
 * the announcement matches what is on screen. Moves focus to <main> too,
 * unless this is the very first navigation of the session — on a fresh
 * load, leaving focus alone keeps the skip link reachable as the first Tab
 * stop, same as it would be on any other page.
 */
function announceRoute(label, isFirstNavigation) {
  document.title = label ? `${label} · Tech Radar` : 'Tech Radar';
  const announcer = document.getElementById('route-announcer');
  // "Página carregada: X" — fixed phrasing sidesteps pt-BR gender/number
  // agreement, since "página" (feminine) never varies with the label.
  if (announcer) announcer.textContent = `Página carregada: ${label}`;
  if (isFirstNavigation) return;
  const main = document.getElementById('main-content');
  if (main) main.focus();
}

function route() {
  const isFirstNavigation = !hasNavigatedOnce;
  hasNavigatedOnce = true;

  const r = parseRoute();
  showView(r.name === 'radar' ? 'radar' : 'learn');
  setNavActive(r.name === 'radar' ? 'radar' : 'learn');

  if (r.name === 'radar') {
    announceRoute('Radar', isFirstNavigation);
    renderRadar();
  } else if (r.name === 'learn') {
    announceRoute('Trilhas', isFirstNavigation);
    renderCoursesIndex();
  } else if (r.name === 'course' && r.slug) {
    renderCourse(r.slug, isFirstNavigation); // announces its own title once loaded (or not-found)
  }
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

// "Continue where you left off": separate from progress on purpose — a
// milestone can be opened and read without ever being marked complete, and
// that still counts as "where the reader was".
const LAST_VISITED_PREFIX = 'tr:lastvisited:';
const LAST_COURSE_KEY = 'tr:lastcourse';

function getLastVisited(slug) {
  try {
    return localStorage.getItem(LAST_VISITED_PREFIX + slug) || null;
  } catch {
    return null;
  }
}

function setLastVisited(slug, milestoneId) {
  try {
    localStorage.setItem(LAST_VISITED_PREFIX + slug, milestoneId);
  } catch {
    // Storage full or unavailable — "continue" just won't be offered.
  }
}

function getLastCourse() {
  try {
    return localStorage.getItem(LAST_COURSE_KEY) || null;
  } catch {
    return null;
  }
}

function setLastCourse(slug) {
  try {
    localStorage.setItem(LAST_COURSE_KEY, slug);
  } catch {
    // ignore
  }
}

function percent(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/**
 * Builds a progress bar; returns { wrapper, bar } so callers can update
 * width. `label` names the bar for assistive tech (e.g. "Trilha X: 40%
 * concluído") — axe-core's aria-progressbar-name rule requires every
 * progressbar to have one.
 */
function buildProgressBar(pct, label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'progress';
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuemin', '0');
  wrapper.setAttribute('aria-valuemax', '100');
  wrapper.setAttribute('aria-valuenow', String(pct));
  wrapper.setAttribute('aria-label', label || `${pct}% concluído`);

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
  view.appendChild(buildLoading('Carregando trilhas…'));

  let index;
  try {
    const resp = await fetch('./data/courses/index.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    index = await resp.json();
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(buildError(`Falha ao carregar as trilhas: ${err.message}`));
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

  const lastCourse = courses.find((c) => c.slug === getLastCourse());
  if (lastCourse) {
    view.appendChild(buildContinueBanner(lastCourse));
  }

  const grid = document.createElement('div');
  grid.className = 'course-grid';
  for (const entry of courses) {
    grid.appendChild(buildCourseCard(entry));
  }
  view.appendChild(grid);
}

/**
 * "Continue where you left off", shown above the grid when the reader has
 * opened a course before. Deliberately light: just the course, from
 * `index.json` already in hand — the milestone-level "Continuar: Marco N"
 * button lives on the course page itself, where the full course JSON (with
 * milestone titles) is already loaded, so this never costs an extra fetch.
 */
function buildContinueBanner(entry) {
  const banner = document.createElement('a');
  banner.className = 'continue-banner';
  banner.href = `#/learn/${entry.slug}`;

  const eyebrow = document.createElement('span');
  eyebrow.className = 'continue-banner-eyebrow';
  eyebrow.textContent = 'Continuar de onde parou';

  const title = document.createElement('span');
  title.className = 'continue-banner-title';
  title.textContent = entry.title;

  banner.appendChild(eyebrow);
  banner.appendChild(title);
  return banner;
}

/** @param {IndexEntry} entry */
function buildCourseCard(entry) {
  const card = document.createElement('a');
  card.className = 'course-card';
  card.href = `#/learn/${entry.slug}`;

  const badges = document.createElement('div');
  badges.className = 'course-card-badges';
  badges.appendChild(buildBadge(entry.category, 'category-badge'));
  if (entry.level) badges.appendChild(buildBadge(levelLabel(entry.level), 'level-badge'));
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
  const { wrapper } = buildProgressBar(pct, `${entry.title}: ${pct}% concluído`);
  card.appendChild(wrapper);

  const label = document.createElement('span');
  label.className = 'progress-label';
  label.textContent = pct === 100 ? 'Concluído ✓' : `${pct}% concluído`;
  card.appendChild(label);

  return card;
}

// ── Learning tracks: course timeline (#/learn/<slug>) ───────────────────────────

async function renderCourse(slug, isFirstNavigation) {
  const view = document.getElementById('view-learn');
  view.innerHTML = '';
  view.appendChild(buildLoading('Carregando trilha…'));

  let course;
  try {
    const resp = await fetch(`./data/courses/${slug}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    course = await resp.json();
  } catch {
    view.innerHTML = '';
    view.appendChild(buildCourseNotFound());
    announceRoute('Trilha não encontrada', isFirstNavigation);
    return;
  }

  view.innerHTML = '';
  view.appendChild(buildCourseView(course));
  announceRoute(course.title, isFirstNavigation);
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
  setLastCourse(course.slug);

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
  if (course.level) badges.appendChild(buildBadge(levelLabel(course.level), 'level-badge'));
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
  const { wrapper, bar } = buildProgressBar(
    percent(doneCount, total),
    `Progresso em ${course.title}: ${percent(doneCount, total)}% concluído`,
  );
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

  // Timeline -------------------------------------------------------------------
  const timeline = document.createElement('ol');
  timeline.className = 'timeline';

  // "Continuar" — only once the timeline exists, since clicking it needs to
  // find the target node inside `timeline`.
  const lastVisitedMilestone = course.milestones.find((m) => m.id === getLastVisited(course.slug));
  if (lastVisitedMilestone) {
    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'continue-btn';
    continueBtn.textContent = `Continuar: Marco ${lastVisitedMilestone.order} — ${lastVisitedMilestone.title}`;
    continueBtn.addEventListener('click', () => {
      scrollToMilestone(timeline, lastVisitedMilestone.id, { expand: true });
    });
    header.appendChild(continueBtn);
  }

  root.appendChild(header);

  /** Recomputes progress bar, label, dots, and aria-current after any toggle. */
  const refresh = () => {
    const set = getProgress(course.slug);
    const done = countDone(set, course.milestones);
    const pct = percent(done, total);
    bar.style.width = `${pct}%`;
    wrapper.setAttribute('aria-valuenow', String(pct));
    wrapper.setAttribute('aria-label', `Progresso em ${course.title}: ${pct}% concluído`);
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

  course.milestones.forEach((milestone, idx) => {
    const prev = course.milestones[idx - 1] || null;
    const next = course.milestones[idx + 1] || null;
    timeline.appendChild(buildTimelineNode(course.slug, milestone, completed, refresh, prev, next, timeline));
  });
  root.appendChild(timeline);

  // Glossary appendix (not a milestone: no id, no progress) --------------------
  if (course.glossary) {
    root.appendChild(buildGlossaryBlock(course.glossary));
  }

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
  // Defer until appended to the DOM so scrollIntoView has layout. Prefers
  // where the reader last opened a milestone over the first pending one —
  // "continue reading" beats "continue completing" when the two differ.
  requestAnimationFrame(() => {
    const set = getProgress(course.slug);
    const target = lastVisitedMilestone || course.milestones.find((m) => !set.has(m.id));
    if (target) scrollToMilestone(timeline, target.id);
  });
  return root;
}

/**
 * @param {Milestone} milestone
 * @param {Milestone | null} prevMilestone
 * @param {Milestone | null} nextMilestone
 * @param {HTMLElement} timeline used by the prev/next buttons to find and
 *   jump to a sibling node — always fully populated by the time a reader
 *   can click, even though earlier nodes are built before later ones exist.
 */
function buildTimelineNode(slug, milestone, completed, onToggle, prevMilestone, nextMilestone, timeline) {
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
  addCopyButtons(article);
  body.appendChild(article);

  // Complete control — built before the quiz so `completion: quiz` can unlock it.
  const hasQuiz = milestone.quiz && milestone.quiz.length > 0;
  const gated = milestone.completion === 'quiz' && hasQuiz;

  const completeWrap = document.createElement('div');
  completeWrap.className = 'node-complete';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-check';
  checkbox.id = `check-${slug}-${milestone.id}`;
  checkbox.checked = completed.has(milestone.id);
  const label = document.createElement('label');
  label.setAttribute('for', checkbox.id);

  // A gated milestone already ticked stays unlocked — progress is the source of
  // truth, and re-locking a finished node would only punish a revisit.
  const locked = gated && !checkbox.checked;
  checkbox.disabled = locked;
  label.textContent = locked ? 'Acerte o quiz para concluir' : 'Marcar como concluído';

  function unlockCompletion() {
    if (!checkbox.disabled) return;
    checkbox.disabled = false;
    label.textContent = 'Marcar como concluído';
  }

  if (hasQuiz) {
    body.appendChild(buildQuiz(slug, milestone, gated ? unlockCompletion : null));
  }

  if (milestone.references && milestone.references.length > 0) {
    body.appendChild(buildReferences(milestone.references));
  }

  completeWrap.appendChild(checkbox);
  completeWrap.appendChild(label);
  body.appendChild(completeWrap);

  // Prev/next — in-page navigation between milestones. No new route: it
  // just expands and scrolls to a sibling <li> already in the same timeline.
  if (prevMilestone || nextMilestone) {
    const nav = document.createElement('div');
    nav.className = 'node-nav';

    if (prevMilestone) {
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'node-nav-btn node-nav-prev';
      prevBtn.textContent = `← Marco ${prevMilestone.order}: ${prevMilestone.title}`;
      prevBtn.addEventListener('click', () => {
        scrollToMilestone(timeline, prevMilestone.id, { expand: true });
      });
      nav.appendChild(prevBtn);
    }

    if (nextMilestone) {
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'node-nav-btn node-nav-next';
      nextBtn.textContent = `Marco ${nextMilestone.order}: ${nextMilestone.title} →`;
      nextBtn.addEventListener('click', () => {
        scrollToMilestone(timeline, nextMilestone.id, { expand: true });
      });
      nav.appendChild(nextBtn);
    }

    body.appendChild(nav);
  }

  content.appendChild(body);
  node.appendChild(content);

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    const willExpand = !expanded;
    toggle.setAttribute('aria-expanded', String(willExpand));
    body.classList.toggle('hidden', expanded);
    if (willExpand) setLastVisited(slug, milestone.id);
  });

  checkbox.addEventListener('change', () => {
    toggleMilestone(slug, milestone.id);
    onToggle();
  });

  return node;
}

// ── Quiz ───────────────────────────────────────────────────────────────────────
// Self-assessment only: answers are never persisted, so `tr:progress:<slug>`
// stays the single source of truth for progress. Question/option text is set via
// textContent — quiz content is plain text and never interpreted as HTML.

/**
 * @param {Milestone} milestone
 * @param {(() => void) | null} onPass called once the reader gets every question
 *   right — used by `completion: quiz` to unlock the complete checkbox.
 */
function buildQuiz(slug, milestone, onPass) {
  const section = document.createElement('section');
  section.className = 'milestone-quiz';

  const heading = document.createElement('p');
  heading.className = 'milestone-quiz-title';
  heading.textContent = `Quiz · ${milestone.quiz.length} pergunta${milestone.quiz.length === 1 ? '' : 's'}`;
  section.appendChild(heading);

  const name = `quiz-${slug}-${milestone.id}`;
  /** @type {{ inputs: HTMLInputElement[], answer: number, explanation: HTMLElement }[]} */
  const questions = [];

  milestone.quiz.forEach((q, qi) => {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'quiz-question';

    const legend = document.createElement('legend');
    legend.textContent = `${qi + 1}. ${q.question}`;
    fieldset.appendChild(legend);

    const inputs = [];
    q.options.forEach((option, oi) => {
      const row = document.createElement('div');
      row.className = 'quiz-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `${name}-${qi}`;
      input.id = `${name}-${qi}-${oi}`;
      input.value = String(oi);

      const label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = option;

      row.append(input, label);
      fieldset.appendChild(row);
      inputs.push(input);
    });

    const explanation = document.createElement('p');
    explanation.className = 'quiz-explanation hidden';
    explanation.textContent = q.explanation || '';
    fieldset.appendChild(explanation);

    section.appendChild(fieldset);
    questions.push({ inputs, answer: q.answer, explanation });
  });

  const actions = document.createElement('div');
  actions.className = 'quiz-actions';

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'quiz-check-btn';
  checkBtn.textContent = 'Verificar respostas';

  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'quiz-retry-btn hidden';
  retryBtn.textContent = 'Refazer';

  const score = document.createElement('span');
  score.className = 'quiz-score';
  score.setAttribute('role', 'status');

  actions.append(checkBtn, retryBtn, score);
  section.appendChild(actions);

  checkBtn.addEventListener('click', () => {
    let correct = 0;
    let answered = 0;
    for (const q of questions) {
      const chosen = q.inputs.findIndex((i) => i.checked);
      if (chosen >= 0) answered++;
      q.inputs.forEach((input, oi) => {
        input.disabled = true;
        const row = input.parentElement;
        // Always reveal the right answer; only flag the wrong one actually picked.
        if (oi === q.answer) row.classList.add('correct');
        else if (oi === chosen) row.classList.add('incorrect');
      });
      if (chosen === q.answer) correct++;
      if (q.explanation.textContent) q.explanation.classList.remove('hidden');
    }
    score.textContent = answered < questions.length
      ? `${correct} de ${questions.length} — ${questions.length - answered} sem resposta`
      : `${correct} de ${questions.length} corretas`;
    checkBtn.classList.add('hidden');
    retryBtn.classList.remove('hidden');
    if (onPass && correct === questions.length) onPass();
  });

  retryBtn.addEventListener('click', () => {
    for (const q of questions) {
      q.inputs.forEach((input) => {
        input.disabled = false;
        input.checked = false;
        input.parentElement.classList.remove('correct', 'incorrect');
      });
      q.explanation.classList.add('hidden');
    }
    score.textContent = '';
    retryBtn.classList.add('hidden');
    checkBtn.classList.remove('hidden');
  });

  return section;
}

/** Glossary appendix — collapsed by default via native <details>. */
function buildGlossaryBlock(html) {
  const details = document.createElement('details');
  details.className = 'course-glossary';

  const summary = document.createElement('summary');
  summary.className = 'course-glossary-summary';
  summary.textContent = 'Glossário';
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'milestone-body';
  body.innerHTML = html; // pre-sanitized at build time (bluemonday)
  addCopyButtons(body);
  details.appendChild(body);

  return details;
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

/**
 * Scrolls to a milestone by id, respecting reduced-motion. `expand: true`
 * opens it first (used by explicit jumps — the Continuar button, prev/next
 * nav); the initial on-load scroll leaves it collapsed, same as before.
 */
function scrollToMilestone(timeline, id, { expand = false } = {}) {
  const node = timeline.querySelector(`.timeline-node[data-id="${cssEscape(id)}"]`);
  if (!node) return;
  if (expand) {
    const toggle = node.querySelector('.node-toggle');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
}

// ── Shared UI helpers ──────────────────────────────────────────────────────────

// course.yaml's `level` is free text written in English by convention
// (iota-style: beginner/intermediate/advanced). Only the label shown to
// readers is translated here — the underlying value, used for filtering/
// grouping, stays untouched.
const LEVEL_LABELS = {
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

function levelLabel(level) {
  return LEVEL_LABELS[level] || level;
}

/**
 * Adds a "Copiar" button to every <pre> inside `container`. Reads from the
 * <code> element (falling back to the <pre> itself) so the button's own
 * label never ends up copied alongside the snippet.
 */
function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach((pre) => {
    // Captured before the button is appended: if a fenced block were ever
    // missing a <code> wrapper, reading pre.textContent at click time would
    // pick up the button's own label too.
    const codeText = (pre.querySelector('code') || pre).textContent || '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copiar';
    btn.setAttribute('aria-label', 'Copiar código');

    let resetTimer = null;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeText);
        btn.textContent = 'Copiado!';
        btn.classList.add('copied');
      } catch {
        btn.textContent = 'Erro ao copiar';
      }
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        btn.textContent = 'Copiar';
        btn.classList.remove('copied');
      }, 2000);
    });

    pre.appendChild(btn);
  });
}

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

const relativeFormatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/**
 * pt-BR relative time ("há 3 min", "em 2 h"). Handles future dates correctly
 * (Intl.RelativeTimeFormat takes the sign itself, so there is no "-3m ago").
 */
function formatRelative(date) {
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return relativeFormatter.format(diffSeconds, 'second');
  const minutes = Math.round(diffSeconds / 60);
  if (abs < 3_600) return relativeFormatter.format(minutes, 'minute');
  const hours = Math.round(diffSeconds / 3_600);
  if (abs < 86_400) return relativeFormatter.format(hours, 'hour');
  const days = Math.round(diffSeconds / 86_400);
  if (abs < 2_592_000) return relativeFormatter.format(days, 'day');
  return date.toLocaleDateString('pt-BR');
}

init();
