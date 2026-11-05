// @ts-check
// Agenda dos desafios na UI (PLANO jornada de entrevistas §9): the section
// of #/revisar with the practice queue and the weekly target, and the
// "Desafio da semana" banner on #/learn. The queue logic is pure
// (desafio-agenda.js); this file only builds DOM. Each link starts a NEW
// simulated round (no seed in the URL), so a desafio comes back with new
// parameters every time.
import { fila, feitosNaSemana, desafioDaSemana, localISO } from '../desafio-agenda.js';
import { fillText, rangeValues } from '../desafio-logic.js';
import { getProgress, getDesafiosState, setDesafiosCadencia } from '../storage.js';

const TIPO_LABEL = {
  'system-design': 'System design', lld: 'LLD', estimativa: 'Estimativa',
  incidente: 'Incidente', comportamental: 'Comportamental',
};

/** Fetches desafios.json; an absent or broken bank is just an empty one here. */
export async function loadDesafiosSafe() {
  try {
    const resp = await fetch('./data/desafios.json');
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data.desafios) ? data.desafios : [];
  } catch {
    return [];
  }
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The "Desafios" section of #/revisar. */
export function buildDesafiosAgenda(desafios) {
  const section = el('section', 'desafios-agenda');
  section.setAttribute('aria-labelledby', 'desafios-agenda-title');
  const title = el('h3', 'desafios-agenda-title', 'Desafios');
  title.id = 'desafios-agenda-title';
  section.appendChild(title);

  const body = el('div', 'desafios-agenda-body');
  section.appendChild(body);

  function render() {
    body.innerHTML = '';
    const state = getDesafiosState();
    const today = new Date();
    const feitos = feitosNaSemana(state.rodadas, today);

    const meta = el('div', 'desafios-agenda-meta');
    const label = el('label', '', 'Meta semanal:');
    label.setAttribute('for', 'desafios-cadencia');
    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'desafios-cadencia';
    input.min = '1';
    input.max = '7';
    input.value = String(state.cadencia);
    input.addEventListener('change', () => {
      setDesafiosCadencia(Number(input.value));
      render();
    });
    meta.append(label, input, el('span', 'desafios-agenda-feitos', ` ${feitos} de ${state.cadencia} feitos nesta semana`));
    body.appendChild(meta);

    const q = fila(desafios, state.rodadas, getProgress, localISO(today));
    if (q.length === 0) {
      body.appendChild(el('p', 'desafios-agenda-vazio', desafios.length
        ? 'Nenhum desafio liberado e vencido agora. Um desafio entra na fila quando todos os marcos de pré-requisito estão concluídos.'
        : 'Nenhum desafio publicado ainda.'));
      return;
    }
    if (feitos >= state.cadencia) {
      body.appendChild(el('p', 'desafios-agenda-ok', 'Meta da semana cumprida. Os desafios abaixo continuam disponíveis.'));
    }
    const ul = el('ul', 'desafios-agenda-lista');
    for (const { desafio: d, venceEm } of q) {
      const li = el('li', 'desafios-agenda-item');
      li.dataset.id = d.id;
      const a = el('a', '', fillText(d.titulo, rangeValues(d.parametros)));
      a.href = `#/desafios/${d.id}/simulado`;
      li.append(a, el('span', 'desafios-agenda-info', ` · ${TIPO_LABEL[d.tipo] || d.tipo} · ${venceEm ? `voltou em ${venceEm.split('-').reverse().join('/')}` : 'nunca feito'}`));
      ul.appendChild(li);
    }
    body.appendChild(ul);
  }
  render();
  return section;
}

/** The "Desafio da semana" banner for #/learn, or null when there is none. */
export function buildDesafioDaSemanaBanner(desafios) {
  const state = getDesafiosState();
  const pick = desafioDaSemana(desafios, state.rodadas, getProgress, new Date(), state.cadencia);
  if (!pick) return null;
  const d = pick.desafio;
  const a = el('a', 'continue-banner desafio-semana-banner');
  a.href = `#/desafios/${d.id}/simulado`;
  a.append(
    el('span', 'continue-banner-eyebrow', 'Desafio da semana'),
    el('span', 'continue-banner-title', fillText(d.titulo, rangeValues(d.parametros))),
    el('span', 'continue-banner-meta', `${TIPO_LABEL[d.tipo] || d.tipo} · ${d.duracaoMin} min · modo simulado`),
  );
  return a;
}
