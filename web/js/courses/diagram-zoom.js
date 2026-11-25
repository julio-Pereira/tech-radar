// Ampliar (Fase 1.5), split out of diagram.js (ajustes pós-Fase 1.7, frente
// 1): the full-screen dialog is downloaded on the first click, never with
// the milestone. The figure's player and the walkthrough mirror their
// controls into it (diagram-player.js, walkthrough-player.js).
import { draw, fitViewBox, widthClass, html, region, animate, chartKeys } from './diagram.js';

let dialog = null;
let seq = 0;
// The open zoom's cleanup. It runs before the dialog closes, never in its
// "close" event: close() gives the focus back at once and fires "close" a
// task later, so a cleanup there would leave the drawing in the dialog
// while the focus is already back on the page.
let done = null;
const shut = () => {
  if (done) done();
  done = null;
  dialog.close();
};

function zoomDialog() {
  if (dialog) return dialog;
  const d = html('dialog', 'diagrama-dialogo');
  d.setAttribute('aria-labelledby', 'diagrama-dialogo-titulo');
  const head = html('div', 'diagrama-dialogo-topo');
  const h = html('h2', '');
  h.id = 'diagrama-dialogo-titulo';
  const fit = html('button', 'diagrama-ajustar', 'Ajustar à tela');
  fit.setAttribute('aria-pressed', 'false');
  fit.addEventListener('click', () => fit.setAttribute('aria-pressed', String(d.classList.toggle('diagrama-ajustado'))));
  const close = html('button', 'diagrama-fechar', 'Fechar');
  close.addEventListener('click', shut);
  head.append(h, fit, close);
  const area = html('div', 'diagrama-dialogo-area');
  region(area, 'Diagrama ampliado, role em qualquer direção');
  d.append(head, area);
  // Backdrop click closes, like Esc; Tab wraps inside the dialog.
  d.addEventListener('click', (e) => { if (e.target === d) shut(); });
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    shut();
  });
  d.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...d.querySelectorAll('button, [tabindex="0"]')];
    const edge = e.shiftKey ? f[0] : f[f.length - 1];
    if (document.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? f[f.length - 1] : f[0]).focus();
  });
  document.body.appendChild(d);
  dialog = d;
  return d;
}

export function openZoom(spec, title, opener) {
  const d = zoomDialog();
  const h = (d.querySelector('h2'));
  const area = (d.querySelector('.diagrama-dialogo-area'));
  h.textContent = title;
  // Fresh drawing (own marker ids); concept links only in the figure.
  const svg = draw(spec, `dz${++seq}`, false);
  svg.setAttribute('aria-labelledby', h.id);
  area.replaceChildren(svg);
  done = () => {
    area.replaceChildren();
    d.querySelector('.diagrama-player')?.remove();
    opener.focus();
  };
  d.showModal();
  fitViewBox(svg);
  widthClass(svg);
  chartKeys(svg, spec);
  animate(svg, spec, area, opener.closest('figure'));
  (d.querySelector('.diagrama-fechar')).focus();
  return svg;
}
