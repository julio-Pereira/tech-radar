// @ts-check
// Agenda dos desafios (PLANO jornada de entrevistas §9): which desafios are
// due for practice, from the VERIFIED part of past rounds only. Separate
// from the Leitner boxes of #/revisar on purpose — a desafio has a score,
// not right/wrong, and comes back with new parameters each time. Pure: the
// rounds, the progress reader and "today" are all injected.
import { missingPrereqs } from './desafio-logic.js';

/** @typedef {{ seed: number, at: string, verificadoPct: number, autoPct: number }} Rodada */

/**
 * Days until a desafio comes back, from its rounds (oldest first):
 * verified < 60% → 2; 60–80% → 7; > 80% → 21; two rounds in a row > 80% → 45.
 * @param {Rodada[]} rodadas
 */
export function intervalDays(rodadas) {
  const sorted = sortByAt(rodadas);
  const last = sorted[sorted.length - 1];
  if (!last) return 0;
  const prev = sorted[sorted.length - 2];
  if (last.verificadoPct > 80 && prev && prev.verificadoPct > 80) return 45;
  if (last.verificadoPct > 80) return 21;
  if (last.verificadoPct >= 60) return 7;
  return 2;
}

/** Local "YYYY-MM-DD" when the desafio is due again; null if never done. */
export function dueDate(rodadas) {
  const sorted = sortByAt(rodadas);
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const d = new Date(last.at);
  return localISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + intervalDays(sorted)));
}

/**
 * The practice queue: only desafios whose pre-requisites are ALL completed;
 * among them, the ones due (overdue first, oldest due date first), then the
 * ones never done. The order alternates tipos so a week covers more than
 * one axis, starting with a tipo different from the last round done.
 * @param {any[]} desafios compiled desafios (desafios.json)
 * @param {Record<string, Rodada[]>} rodadas by desafio id
 * @param {(slug: string) => Set<string>} completed
 * @param {string} todayISO local "YYYY-MM-DD"
 */
export function fila(desafios, rodadas, completed, todayISO) {
  const due = [];
  const fresh = [];
  for (const d of desafios || []) {
    if (missingPrereqs(d, completed).length > 0) continue;
    const r = rodadas[d.id] || [];
    const when = dueDate(r);
    if (when === null) fresh.push({ d, when: '' });
    else if (when <= todayISO) due.push({ d, when });
  }
  due.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a.d.id < b.d.id ? -1 : 1));
  fresh.sort((a, b) => (a.d.id < b.d.id ? -1 : 1));
  const ordered = [...due, ...fresh];

  // Alternate tipos, greedily, starting away from the last tipo practised.
  const tipoById = new Map((desafios || []).map((d) => [d.id, d.tipo]));
  let prevTipo = lastTipo(rodadas, tipoById);
  const out = [];
  const pool = [...ordered];
  while (pool.length) {
    let i = pool.findIndex((x) => x.d.tipo !== prevTipo);
    if (i < 0) i = 0;
    const [pick] = pool.splice(i, 1);
    out.push({ desafio: pick.d, venceEm: pick.when || null });
    prevTipo = pick.d.tipo;
  }
  return out;
}

function lastTipo(rodadas, tipoById) {
  let best = null;
  for (const [id, list] of Object.entries(rodadas || {})) {
    for (const r of list || []) {
      if (!best || r.at > best.at) best = { at: r.at, tipo: tipoById.get(id) };
    }
  }
  return best ? best.tipo : null;
}

/** Rounds finished in the local week (Monday to Sunday) of `today`. */
export function feitosNaSemana(rodadas, today) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  let n = 0;
  for (const list of Object.values(rodadas || {})) {
    for (const r of list || []) {
      const at = new Date(r.at);
      if (at >= start && at < end) n++;
    }
  }
  return n;
}

/**
 * The "desafio da semana": the head of the queue while the weekly cadence
 * (default 2) is not met; null when the week is done or nothing is due.
 */
export function desafioDaSemana(desafios, rodadas, completed, today, cadencia) {
  if (feitosNaSemana(rodadas, today) >= cadencia) return null;
  const q = fila(desafios, rodadas, completed, localISO(today));
  return q.length ? q[0] : null;
}

function sortByAt(rodadas) {
  return [...(rodadas || [])].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export function localISO(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
