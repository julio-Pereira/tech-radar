// @ts-check
// Renders a milestone body from its structured `sections` (UX item 10) —
// prose sections as before, a "Hands-on"/"Mão na massa" section as one
// native <details> per labeled block instead of one long scroll. Falls back
// to the deprecated single `html` blob when `sections` is absent, so older
// cached JSON (or a build that hasn't shipped it yet) still renders.
import { addCopyButtons } from './content-blocks.js';
import { getHandsonState, saveHandsonState } from '../storage.js';

/** @typedef {import('../types.js').Milestone} Milestone */

const BLOCK_LABELS = {
  tutorial: 'Tutorial',
  desafio: 'Desafio',
  invariantes: 'Invariantes testáveis',
  complemento: 'Complemento',
  checagem: 'Checagem',
  // Overridden in buildHandsonBlock's summary text — kept here only as the
  // fallback used elsewhere (none today) that might read BLOCK_LABELS directly.
  gabarito: 'Gabarito',
};

/**
 * @param {string} slug
 * @param {Milestone} milestone
 * @returns {HTMLElement} a ".milestone-body" ready to drop into a node body.
 */
export function buildMilestoneBody(slug, milestone) {
  const article = document.createElement('div');
  article.className = 'milestone-body';

  if (!milestone.sections || milestone.sections.length === 0) {
    article.innerHTML = milestone.html; // pre-sanitized at build time (bluemonday)
    addCopyButtons(article);
    hydrateDiagrams(article);
    return article;
  }

  for (const section of milestone.sections) {
    if (section.title) {
      const heading = document.createElement('h2');
      heading.className = 'section-title';
      heading.textContent = section.title;
      article.appendChild(heading);
    }
    if (section.kind === 'handson') {
      article.appendChild(buildHandsonSection(slug, milestone.id, section));
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'section-prose';
      wrap.innerHTML = section.html; // pre-sanitized at build time (bluemonday)
      article.appendChild(wrap);
    }
  }

  // One pass over the whole assembled body, same as the fallback path —
  // finds every <pre> regardless of which section/block it ended up in.
  addCopyButtons(article);
  hydrateDiagrams(article);
  return article;
}

/**
 * The diagram renderer is only downloaded for a milestone that has a
 * diagram; the figure already carries its title and textual description.
 * @param {HTMLElement} article
 */
function hydrateDiagrams(article) {
  if (!article.querySelector('figure.diagrama[data-diagrama]')) return;
  // Title and description stay readable when the renderer fails to load;
  // the warning keeps the failure visible in diagnostics (C8).
  import('./diagram.js').then((m) => m.renderDiagrams(article))
    .catch((err) => console.warn('diagram.js não carregou; ficam o título e a descrição textual', err));
}

function buildHandsonSection(slug, milestoneId, section) {
  const wrap = document.createElement('div');
  wrap.className = 'handson-section';

  if (section.intro) {
    const intro = document.createElement('div');
    intro.className = 'section-prose';
    intro.innerHTML = section.intro; // pre-sanitized at build time (bluemonday)
    wrap.appendChild(intro);
  }

  const state = applyFirstVisitDefault(slug, milestoneId, section.blocks);
  for (const block of section.blocks) {
    wrap.appendChild(buildHandsonBlock(slug, milestoneId, block, state));
  }
  return wrap;
}

/**
 * The very first time a milestone's hands-on blocks are rendered, the
 * default (Tutorial open, else the first non-Gabarito block, everything
 * else closed) is written into `open` and the milestone is flagged `seen`
 * — so a later toggle of one block never makes an untouched sibling "snap
 * back" to the default, and so closing the default-open block doesn't make
 * this run again on the next visit (see storage.js for why `seen` can't
 * just be inferred from whether anything of this milestone is in `open`).
 * Gabarito is never the default-open block — it always starts closed,
 * handled separately in buildHandsonBlock.
 */
function applyFirstVisitDefault(slug, milestoneId, blocks) {
  const state = getHandsonState(slug);
  if (state.seen.includes(milestoneId) || blocks.length === 0) return state;

  state.seen.push(milestoneId);
  const defaultBlock = blocks.find((b) => b.kind === 'tutorial') || blocks.find((b) => b.kind !== 'gabarito');
  if (defaultBlock) state.open.push(`${milestoneId}:${defaultBlock.key}`);
  saveHandsonState(slug, state);
  return state;
}

function buildHandsonBlock(slug, milestoneId, block, state) {
  const id = `${milestoneId}:${block.key}`;
  const isGabarito = block.kind === 'gabarito';

  const wrap = document.createElement('div');
  wrap.className = 'handson-block';

  const details = document.createElement('details');
  details.className = 'handson-details';
  // Gabarito always starts closed and never reads persisted state — "tente
  // antes" only works if opening it is a conscious choice every single time.
  details.open = !isGabarito && state.open.includes(id);

  const summary = document.createElement('summary');
  summary.className = 'handson-summary';

  const label = document.createElement('span');
  label.className = 'handson-label';
  label.textContent = isGabarito ? 'Mostrar gabarito (tente antes)' : BLOCK_LABELS[block.kind] || block.kind;
  summary.appendChild(label);

  if (block.title) {
    const title = document.createElement('span');
    title.className = 'handson-block-title';
    title.textContent = block.title;
    summary.appendChild(title);
  }

  details.appendChild(summary);

  if (!isGabarito) {
    // Listening only after the initial `.open` is set above — assigning it
    // fires a "toggle" event too, and there is nothing useful to persist yet.
    // Gabarito skips this entirely: its open/closed state never persists.
    details.addEventListener('toggle', () => {
      const current = getHandsonState(slug);
      const idx = current.open.indexOf(id);
      if (details.open && idx === -1) current.open.push(id);
      else if (!details.open && idx !== -1) current.open.splice(idx, 1);
      saveHandsonState(slug, current);
    });
  }

  const body = document.createElement('div');
  body.className = 'section-prose';
  body.innerHTML = block.html; // pre-sanitized at build time (bluemonday)
  details.appendChild(body);

  wrap.appendChild(details);

  // Gabarito has no "done" mark — it's a rubric to read, not a task to
  // complete — so it's also exempt from the nested-interactive concern
  // below (there's simply no button to place). The class lets the CSS drop
  // the summary's reserved right-padding for the button that isn't there.
  if (isGabarito) {
    wrap.classList.add('no-done-btn');
    return wrap;
  }

  // A sibling of <details>, not a child of <summary>: a <button> nested
  // inside <summary> is invalid "nested interactive content" (axe's
  // nested-interactive rule, WCAG 4.1.2) since <summary> is itself a native
  // disclosure control. Positioned over the summary row by CSS instead.
  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'handson-done-btn';
  const isDone = state.done.includes(id);
  doneBtn.classList.toggle('done', isDone);
  doneBtn.setAttribute('aria-pressed', String(isDone));
  doneBtn.textContent = isDone ? 'Feito ✓' : 'Marcar como feito';
  doneBtn.addEventListener('click', () => {
    const current = getHandsonState(slug);
    const idx = current.done.indexOf(id);
    const nowDone = idx === -1;
    if (nowDone) current.done.push(id);
    else current.done.splice(idx, 1);
    saveHandsonState(slug, current);
    doneBtn.classList.toggle('done', nowDone);
    doneBtn.setAttribute('aria-pressed', String(nowDone));
    doneBtn.textContent = nowDone ? 'Feito ✓' : 'Marcar como feito';
  });
  wrap.appendChild(doneBtn);

  return wrap;
}
