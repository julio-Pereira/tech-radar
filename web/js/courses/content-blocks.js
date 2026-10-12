// @ts-check
// Milestone body add-ons that aren't the quiz: glossary, references/sources,
// and the copy-code button overlay.

/** @typedef {import('../types.js').Ref} Ref */

/** Glossary appendix — collapsed by default via native <details>. */
export function buildGlossaryBlock(html) {
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

export function buildReferences(refs) {
  const wrap = document.createElement('div');
  wrap.className = 'milestone-refs';
  const heading = document.createElement('p');
  heading.className = 'milestone-refs-title';
  heading.textContent = 'Referências';
  wrap.appendChild(heading);
  wrap.appendChild(buildRefList(refs));
  return wrap;
}

export function buildSourcesBlock(sources) {
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

/**
 * Adds a "Copiar" button to every <pre> inside `container`. Reads from the
 * <code> element (falling back to the <pre> itself) so the button's own
 * label never ends up copied alongside the snippet.
 */
export function addCopyButtons(container) {
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
