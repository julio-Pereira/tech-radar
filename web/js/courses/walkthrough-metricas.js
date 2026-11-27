// Accumulated metrics of a walkthrough (Fase 1.8, plan §4.3), downloaded
// only for a walkthrough with metricas. The compiler already computed every
// value after every event, as text: here there is no arithmetic, and no
// animation (a count-up would move for nothing). The card an event changed
// gets a class and a text mark, never color alone.
import { el, icon } from './diagram-svg.js';

const span = (cls, text) => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};

/** Builds the cards; set(e) shows event e and returns what changed, for aria-live. */
export function cartoes(w) {
  const box = document.createElement('div');
  box.className = 'wt-metricas';
  const cards = w.metricas.map((m) => {
    const c = document.createElement('div');
    c.className = 'wt-metrica';
    if (m.icone) {
      const s = el('svg', { class: 'wt-metrica-icone', viewBox: '0 0 16 16', 'aria-hidden': 'true' });
      s.append(icon(m.icone, 0, 0));
      c.append(s);
    }
    const v = span('wt-metrica-valor', '—');
    const marca = span('wt-metrica-marca', '▲');
    marca.setAttribute('aria-hidden', 'true');
    c.append(span('wt-metrica-rotulo', m.rotulo), v, marca);
    box.append(c);
    return { m, c, v };
  });
  return {
    el: box,
    set(e) {
      let fala = '';
      for (const { m, c, v } of cards) {
        const val = (e.metricas || {})[m.id];
        const mudou = (e.mudou || []).includes(m.id);
        v.textContent = val || '—';
        c.classList.toggle('wt-metrica-mudou', mudou);
        if (mudou) fala += ` ${m.rotulo}: ${val}.`;
      }
      return fala;
    },
  };
}
