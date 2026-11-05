// @ts-check
// node --test web/js/desafio-agenda.test.js — no framework, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intervalDays, dueDate, fila, feitosNaSemana, desafioDaSemana, localISO } from './desafio-agenda.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString(); // local wall clock
const r = (pct, when) => ({ seed: 1, at: when, verificadoPct: pct, autoPct: 0 });

test('interval from the verified score: 2, 7, 21, and 45 after two strong rounds', () => {
  assert.equal(intervalDays([]), 0);
  assert.equal(intervalDays([r(59, at(2026, 11, 1))]), 2);
  assert.equal(intervalDays([r(60, at(2026, 11, 1))]), 7);
  assert.equal(intervalDays([r(80, at(2026, 11, 1))]), 7);
  assert.equal(intervalDays([r(81, at(2026, 11, 1))]), 21);
  assert.equal(intervalDays([r(90, at(2026, 10, 1)), r(85, at(2026, 11, 1))]), 45);
  assert.equal(intervalDays([r(50, at(2026, 10, 1)), r(85, at(2026, 11, 1))]), 21);
  // Order of the stored list does not matter: the latest round decides.
  assert.equal(intervalDays([r(85, at(2026, 11, 1)), r(90, at(2026, 10, 1))]), 45);
});

test('due date is the local day of the last round plus the interval', () => {
  assert.equal(dueDate([]), null);
  assert.equal(dueDate([r(50, at(2026, 1, 30, 23))]), '2026-02-01');
  assert.equal(dueDate([r(95, at(2026, 12, 20))]), '2027-01-10');
});

const D = (id, tipo, prereqs = []) => ({ id, tipo, prerequisitos: prereqs.map(([slug, marcoId]) => ({ slug, marcoId })) });
const DESAFIOS = [
  D('a-sd', 'system-design', [['sd', 'm1']]),
  D('b-est', 'estimativa', [['sd', 'm1']]),
  D('c-lld', 'lld', [['cr', 'm3']]),
  D('d-sd', 'system-design', [['sd', 'm1'], ['sd', 'm2']]),
];
const progress = (map) => (slug) => new Set(map[slug] || []);

test('the queue never offers a desafio with a pending pre-requisite (seeded property)', () => {
  let s = 42;
  const rand = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
  for (let run = 0; run < 300; run++) {
    const map = { sd: ['m1', 'm2'].filter(() => rand() < 0.5), cr: ['m3'].filter(() => rand() < 0.5) };
    const q = fila(DESAFIOS, {}, progress(map), '2026-11-05');
    for (const { desafio } of q) {
      for (const p of desafio.prerequisitos) assert.ok(map[p.slug].includes(p.marcoId), `${desafio.id} oferecido com ${p.slug}/${p.marcoId} pendente`);
    }
  }
  assert.deepEqual(fila(DESAFIOS, {}, progress({}), '2026-11-05'), []);
});

test('only due desafios come back; overdue first, then never-done, alternating tipos', () => {
  const all = progress({ sd: ['m1', 'm2'], cr: ['m3'] });
  const rodadas = {
    'a-sd': [r(50, at(2026, 11, 1))], // due 11-03: overdue
    'b-est': [r(95, at(2026, 11, 1, 14))], // due 11-22: not yet; the latest round, an estimativa
  };
  const q = fila(DESAFIOS, rodadas, all, '2026-11-05').map((x) => x.desafio.id);
  assert.ok(!q.includes('b-est'));
  // The latest round was an estimativa, so the overdue system-design leads.
  assert.equal(q[0], 'a-sd');
  // Never two system-design in a row while another tipo is available.
  assert.deepEqual(q, ['a-sd', 'c-lld', 'd-sd']);
});

test('weekly cadence: the desafio da semana disappears once the week target is met', () => {
  const all = progress({ sd: ['m1', 'm2'], cr: ['m3'] });
  const thursday = new Date(2026, 10, 5, 10); // 2026-11-05 is a Thursday
  assert.equal(localISO(thursday), '2026-11-05');
  const monday = at(2026, 11, 2, 9);
  const lastSunday = at(2026, 11, 1, 20);
  const rodadas = { 'a-sd': [r(50, lastSunday)], 'c-lld': [r(50, monday)] };
  assert.equal(feitosNaSemana(rodadas, thursday), 1); // Sunday belongs to last week
  const pick = desafioDaSemana(DESAFIOS, rodadas, all, thursday, 2);
  assert.ok(pick && pick.desafio.id === 'a-sd');
  rodadas['b-est'] = [r(70, at(2026, 11, 4))];
  assert.equal(desafioDaSemana(DESAFIOS, rodadas, all, thursday, 2), null);
});
