// @ts-check
// Conceitos transversais, Fase 2: the preview. A concept link
// (<a class="conceito" data-conceito="jws">, emitted by the compiler) shows
// what the term means and where it is taught, without leaving the page.
//
// - Desktop: opens after 300 ms of hover, or at once on keyboard focus.
// - Touch: the first tap opens the preview instead of navigating; the
//   preview's "Ir para o marco" (or a second tap on the term) navigates.
// - conceitos.json is fetched once, on the first interaction with a concept
//   link, and kept in memory — same lazy policy as the search index.
//
// The preview is inserted right after the link in the DOM, so Tab moves from
// the term into the preview's own links; it is positioned with `fixed`, so no
// ancestor needs to become a positioning context.
import { getProgress } from '../storage.js';

/**
 * @typedef {{ slug: string, marcoId: string, titulo: string, trilha: string, nn: string, minutos?: number }} ConceitoMarco
 * @typedef {{ id: string, termo: string, resumo: string, glossario?: string, dono: ConceitoMarco, tambem?: ConceitoMarco[], citadoEm: ConceitoMarco[] }} Conceito
 */

const HOVER_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;
const PREVIEW_ID = 'conceito-preview';
const SUMMARY_ID = 'conceito-preview-resumo';

/** @type {Promise<Map<string, Conceito>> | null} */
let catalogPromise = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch('./data/conceitos.json')
      .then((resp) => (resp.ok ? resp.json() : { conceitos: [] }))
      .then((data) => new Map((data.conceitos || []).map((c) => [c.id, c])))
      .catch(() => {
        catalogPromise = null; // a later interaction may retry
        return new Map();
      });
  }
  return catalogPromise;
}

/** @type {HTMLElement | null} */
let preview = null;
/** @type {HTMLAnchorElement | null} */
let openFor = null;
let openTimer = 0;
// Bumped by every close(): an open() still awaiting the catalog when the
// reader already moved on must not pop a preview up afterwards.
let openSeq = 0;
let closeTimer = 0;
let lastPointerType = '';
let lastPointerDownAt = -Infinity; // not 0: performance.now() starts at page load
/** @type {HTMLAnchorElement | null} the term Esc just returned focus to */
let refocusedByEscape = null;

/** @param {EventTarget | null} target @returns {HTMLAnchorElement | null} */
function conceptLink(target) {
  if (!(target instanceof Element)) return null;
  const a = target.closest('a.conceito[data-conceito]');
  return a instanceof HTMLAnchorElement ? a : null;
}

/** @param {EventTarget | null} target */
function insidePreview(target) {
  return !!preview && target instanceof Node && preview.contains(target);
}

function ownerHref(/** @type {ConceitoMarco} */ m) {
  return `#/learn/${m.slug}/${m.marcoId}`;
}

function marcoLabel(/** @type {ConceitoMarco} */ m) {
  return `${m.trilha} › ${m.nn} · ${m.titulo}`;
}

/** @param {Conceito} c */
function buildPreview(c) {
  const box = document.createElement('span');
  box.className = 'conceito-preview';
  box.id = PREVIEW_ID;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', `Prévia: ${c.termo}`);

  const title = document.createElement('strong');
  title.className = 'conceito-preview-termo';
  title.textContent = c.termo;
  box.appendChild(title);

  const resumo = document.createElement('span');
  resumo.className = 'conceito-preview-resumo';
  resumo.id = SUMMARY_ID;
  resumo.textContent = c.resumo;
  box.appendChild(resumo);

  const deep = document.createElement('span');
  deep.className = 'conceito-preview-dono';
  const minutes = c.dono.minutos ? ` · ${c.dono.minutos} min` : '';
  deep.textContent = `Aprofundar em: ${marcoLabel(c.dono)}${minutes}`;
  if (getProgress(c.dono.slug).has(c.dono.marcoId)) {
    const done = document.createElement('span');
    done.className = 'conceito-preview-feito';
    done.textContent = '✓ você já concluiu';
    deep.appendChild(document.createTextNode(' '));
    deep.appendChild(done);
  }
  box.appendChild(deep);

  if (c.tambem && c.tambem.length) {
    const also = document.createElement('span');
    also.className = 'conceito-preview-tambem';
    also.appendChild(document.createTextNode('Aplicado também em: '));
    c.tambem.forEach((m, i) => {
      if (i > 0) also.appendChild(document.createTextNode(', '));
      const a = document.createElement('a');
      a.href = ownerHref(m);
      a.textContent = `${m.trilha} › ${m.nn}`;
      also.appendChild(a);
    });
    box.appendChild(also);
  }

  const actions = document.createElement('span');
  actions.className = 'conceito-preview-acoes';
  const go = document.createElement('a');
  go.className = 'conceito-preview-ir';
  go.href = ownerHref(c.dono);
  go.textContent = 'Ir para o marco →';
  actions.appendChild(go);
  if (c.glossario) {
    const gl = document.createElement('a');
    gl.className = 'conceito-preview-glossario';
    gl.href = `#/glossario/${c.glossario}`;
    gl.textContent = 'Ver no glossário';
    actions.appendChild(gl);
  }
  box.appendChild(actions);

  // Hovering the preview itself keeps it open; leaving it closes it.
  box.addEventListener('pointerenter', () => window.clearTimeout(closeTimer));
  box.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') scheduleClose();
  });
  return box;
}

/** Places the (already inserted) preview under the link, inside the viewport. */
function position(/** @type {HTMLAnchorElement} */ link) {
  if (!preview) return;
  const r = link.getBoundingClientRect();
  const gutter = 16;
  const width = Math.min(preview.offsetWidth, window.innerWidth - 2 * gutter);
  const left = Math.min(Math.max(gutter, r.left), window.innerWidth - gutter - width);
  let top = r.bottom + 6;
  if (top + preview.offsetHeight > window.innerHeight - gutter && r.top - preview.offsetHeight - 6 > gutter) {
    top = r.top - preview.offsetHeight - 6; // no room below: open above
  }
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

/** @param {HTMLAnchorElement} link */
async function open(link) {
  window.clearTimeout(closeTimer);
  if (openFor === link && preview) return;
  const seq = ++openSeq;
  const catalog = await loadCatalog();
  if (seq !== openSeq) return; // closed (or another term opened) while loading
  const c = catalog.get(link.dataset.conceito || '');
  if (!c || !link.isConnected) return; // unknown id or stale data: the link still navigates
  close();
  preview = buildPreview(c);
  link.insertAdjacentElement('afterend', preview);
  link.setAttribute('aria-describedby', SUMMARY_ID);
  link.setAttribute('aria-expanded', 'true');
  openFor = link;
  position(link);
}

function close() {
  openSeq++;
  window.clearTimeout(openTimer);
  window.clearTimeout(closeTimer);
  if (openFor) {
    openFor.removeAttribute('aria-describedby');
    openFor.removeAttribute('aria-expanded');
  }
  if (preview) preview.remove();
  preview = null;
  openFor = null;
}

function scheduleClose() {
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    // Keyboard focus inside the link or the preview keeps it open.
    const active = document.activeElement;
    if (active && (active === openFor || insidePreview(active))) return;
    close();
  }, CLOSE_DELAY_MS);
}

let initialized = false;

/**
 * Wires the preview once, by delegation on a stable container (the learn
 * view), so every course render — and every concept link inside it — is
 * covered without per-link handlers.
 * @param {HTMLElement} root
 */
export function initConceitos(root) {
  if (initialized) return;
  initialized = true;

  root.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
    lastPointerDownAt = performance.now();
  });

  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const link = conceptLink(e.target);
    if (!link) return;
    loadCatalog(); // first interaction: start the fetch now, not after the delay
    window.clearTimeout(closeTimer);
    if (openFor === link) return;
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(() => open(link), HOVER_DELAY_MS);
  });

  root.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const link = conceptLink(e.target);
    if (!link || (e.relatedTarget instanceof Node && link.contains(e.relatedTarget))) return;
    window.clearTimeout(openTimer);
    if (insidePreview(e.relatedTarget)) return;
    if (openFor === link) scheduleClose();
    else openSeq++; // an open() may still be waiting on the catalog: cancel it
  });

  root.addEventListener('focusin', (e) => {
    const link = conceptLink(e.target);
    if (link) {
      // Only keyboard focus opens the preview. A pointer press focuses the
      // link too, and opening here would make a touch's first tap look like
      // the second one (preview already open) and navigate straight away;
      // mouse users get the hover delay instead.
      if (performance.now() - lastPointerDownAt < 600) return;
      if (link === refocusedByEscape) {
        refocusedByEscape = null; // Esc closed it; giving focus back must not reopen it
        return;
      }
      window.clearTimeout(closeTimer);
      open(link);
      return;
    }
    if (!insidePreview(e.target)) close();
  });

  root.addEventListener('focusout', (e) => {
    if (!openFor) return;
    const next = e.relatedTarget;
    if (next === openFor || insidePreview(next)) return;
    scheduleClose();
  });

  root.addEventListener('click', (e) => {
    const link = conceptLink(e.target);
    if (!link) return;
    // Touch: the first tap previews; navigating needs the preview's button
    // or a second tap on the same term. A keyboard activation (detail 0)
    // always navigates, even on a device that was last touched.
    if (lastPointerType === 'touch' && e.detail !== 0 && openFor !== link) {
      e.preventDefault();
      open(link);
      return;
    }
    close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openFor) return;
    const link = openFor;
    const hadFocusInside = insidePreview(document.activeElement);
    close();
    if (hadFocusInside) {
      refocusedByEscape = link;
      link.focus();
    }
  });

  // A fixed-position preview would drift away from its term on scroll.
  window.addEventListener('scroll', () => {
    if (openFor && !insidePreview(document.activeElement) && document.activeElement !== openFor) close();
    else if (openFor) position(openFor);
  }, { passive: true });
  window.addEventListener('hashchange', close);
}
