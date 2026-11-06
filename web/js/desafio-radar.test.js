// node --test js/desafio-radar.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radar, contributions, latest, vertex, EIXOS } from './desafio-radar.js';

const p = (acertos, total) => ({ acertos, total });
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));

test('no rounds: every axis has no data', () => {
  const r = radar([{ id: 'a', tipo: 'system-design' }], {});
  assert.deepEqual(r.map((e) => e.id), EIXOS.map((e) => e.id));
  assert.ok(r.every((e) => e.pct === null && e.total === 0 && e.desafios === 0));
});

test('system design splits estimates from decisions; domain counts decisions', () => {
  const desafios = [{ id: 'sd', tipo: 'system-design', dominio: true }];
  const rodadas = { sd: [{ seed: 1, at: '2026-11-01T10:00:00Z', verificadoPct: 50, autoPct: 100,
    partes: { estimativas: p(1, 2), decisoes: p(3, 3), entregavel: p(5, 6) } }] };
  const r = byId(radar(desafios, rodadas));
  assert.equal(r.estimativa.pct, 50);
  assert.equal(r.hld.acertos, 8); assert.equal(r.hld.total, 9);
  assert.equal(r.dominio.pct, 100);
  assert.equal(r.lld.pct, null); assert.equal(r.comportamental.pct, null);
});

test('self-assessed rubric never counts', () => {
  const rodadas = { c: [{ seed: 1, at: 'x', verificadoPct: 0, autoPct: 100, partes: { entregavel: p(0, 5) } }] };
  assert.equal(byId(radar([{ id: 'c', tipo: 'comportamental' }], rodadas)).comportamental.pct, 0);
});

test('only the latest round of each desafio counts', () => {
  const rodadas = { l: [
    { seed: 2, at: '2026-11-03T00:00:00Z', verificadoPct: 100, autoPct: 0, partes: { decisoes: p(2, 2) } },
    { seed: 1, at: '2026-11-01T00:00:00Z', verificadoPct: 0, autoPct: 0, partes: { decisoes: p(0, 2) } },
  ] };
  const r = byId(radar([{ id: 'l', tipo: 'lld' }], rodadas));
  assert.equal(r.lld.pct, 100); assert.equal(r.lld.desafios, 1);
  assert.equal(latest(rodadas.l).seed, 2);
});

test('pools several desafios by item, not by average of percentages', () => {
  const desafios = [{ id: 'e1', tipo: 'estimativa' }, { id: 'e2', tipo: 'estimativa' }];
  const rodadas = {
    e1: [{ seed: 1, at: 'a', verificadoPct: 100, autoPct: 0, partes: { estimativas: p(1, 1) } }],
    e2: [{ seed: 1, at: 'a', verificadoPct: 0, autoPct: 0, partes: { estimativas: p(0, 3) } }],
  };
  const r = byId(radar(desafios, rodadas));
  assert.equal(r.estimativa.pct, 25); assert.equal(r.estimativa.desafios, 2);
});

test('legacy round without parts counts once on the main axis', () => {
  const r = byId(radar([{ id: 'i', tipo: 'incidente', dominio: true }],
    { i: [{ seed: 1, at: 'a', verificadoPct: 80, autoPct: 0 }] }));
  assert.equal(r.hld.pct, 80);
  assert.equal(r.dominio.pct, null);
  assert.equal(r.estimativa.pct, null);
});

test('tampered storage values are ignored, never NaN', () => {
  const rodadas = { a: [{ seed: 1, at: 'a', verificadoPct: 1, autoPct: 0,
    partes: { decisoes: { acertos: 9, total: 2 }, entregavel: { acertos: 'x', total: 3 }, estimativas: p(1, 1) } }] };
  const r = byId(radar([{ id: 'a', tipo: 'system-design' }], rodadas));
  assert.equal(r.hld.pct, null);
  assert.equal(r.estimativa.pct, 100);
  assert.ok(radar([{ id: 'a', tipo: 'system-design' }], { a: 'nope' }).every((e) => e.pct === null));
});

test('unknown tipo contributes nothing; domain flag alone still counts decisions', () => {
  assert.deepEqual(contributions({ id: 'x', tipo: 'algoritmo' }), []);
  assert.deepEqual(contributions({ id: 'x', tipo: 'algoritmo', dominio: true }), [['dominio', ['decisoes']]]);
});

test('vertex: axis 0 points up', () => {
  assert.deepEqual(vertex(0, 5, 10, 50, 50), [50, 40]);
});
