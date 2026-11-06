// @ts-check
// node --test web/js/desafio-logic.test.js — no framework, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalFormula } from './desafio-formula.js';
import {
  drawParams, fillText, fillHTML, parseAnswer, checkEstimativas, checkDecisoes,
  checkEntregavel, score, missingPrereqs, phases, phaseAt, speakingMinutes,
} from './desafio-logic.js';

// The same AST shape the Go compiler emits (TestFormulaASTIsPlainJSON).
const CEIL_HALF_MINUS_ONE = {
  t: 'op', o: '-', a: [
    { t: 'fn', f: 'ceil', a: [{ t: 'op', o: '/', a: [{ t: 'var', n: 'tps' }, { t: 'num', v: 2 }] }] },
    { t: 'num', v: 1 },
  ],
};

test('the interpreter evaluates the compiled AST like the Go side', () => {
  assert.equal(evalFormula(CEIL_HALF_MINUS_ONE, { tps: 7 }), 3);
  assert.equal(evalFormula({ t: 'op', o: '^', a: [{ t: 'num', v: 2 }, { t: 'num', v: 10 }] }, {}), 1024);
  assert.equal(evalFormula({ t: 'neg', a: [{ t: 'num', v: 4 }] }, {}), -4);
  assert.equal(evalFormula({ t: 'fn', f: 'max', a: [{ t: 'num', v: 1 }, { t: 'num', v: 9 }, { t: 'num', v: 3 }] }, {}), 9);
  assert.equal(evalFormula({ t: 'fn', f: 'round', a: [{ t: 'num', v: -2.5 }] }, {}), -3); // Go's math.Round
});

test('the interpreter refuses anything outside the closed node set', () => {
  for (const bad of [
    { t: 'call', f: 'eval' },
    { t: 'fn', f: 'constructor', a: [] },
    { t: 'fn', f: '__proto__', a: [] },
    { t: 'var', n: 'toString' },
    { t: 'op', o: '%', a: [{ t: 'num', v: 1 }, { t: 'num', v: 2 }] },
    null,
  ]) {
    assert.throws(() => evalFormula(/** @type {any} */ (bad), { tps: 1 }));
  }
});

test('the same seed draws the same round, values inside each range', () => {
  const params = {
    tps: { min: 2000, max: 20000, passo: 1000 },
    anos: { valores: [5, 10] },
    rto: { valores: ['15min', '1h'] },
  };
  for (let seed = 1; seed < 300; seed++) {
    const a = drawParams(params, seed);
    assert.deepEqual(drawParams(params, seed), a);
    assert.ok(a.tps >= 2000 && a.tps <= 20000 && a.tps % 1000 === 0, `tps ${a.tps}`);
    assert.ok([5, 10].includes(/** @type {number} */ (a.anos)));
    assert.ok(['15min', '1h'].includes(/** @type {string} */ (a.rto)));
  }
  const seen = new Set();
  for (let seed = 1; seed < 300; seed++) seen.add(drawParams(params, seed).tps);
  assert.ok(seen.size > 10, 'draws should vary across seeds');
});

test('placeholders are filled; HTML values are escaped', () => {
  assert.equal(fillText('Pix a {tps} TPS em {rto}', { tps: 12000, rto: '1h' }), 'Pix a 12.000 TPS em 1h');
  assert.equal(fillText('{desconhecido} fica', {}), '{desconhecido} fica');
  assert.equal(fillHTML('<p>{x}</p>', { x: '<img src=x onerror=alert(1)>' }), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
});

test('answers parse in pt-BR and plain notation', () => {
  assert.equal(parseAnswer('1.234,5'), 1234.5);
  assert.equal(parseAnswer('1234.5'), 1234.5);
  assert.equal(parseAnswer(' 2,5 TB '), 2.5);
  assert.equal(parseAnswer(''), null);
  assert.equal(parseAnswer('abc'), null);
});

test('estimativas are right within the tolerance, and only then', () => {
  const est = [{ id: 'p', ast: CEIL_HALF_MINUS_ONE, tolerancia: 0.25 }];
  const values = { tps: 41 }; // ceil(20.5) - 1 = 20
  assert.equal(checkEstimativas(est, { p: '24' }, values)[0].ok, true); // +20%
  assert.equal(checkEstimativas(est, { p: '26' }, values)[0].ok, false); // +30%
  assert.equal(checkEstimativas(est, { p: '' }, values)[0].ok, false);
  assert.equal(checkEstimativas(est, { p: '20' }, values)[0].expected, 20);
});

test('entregável: required sections present and not empty, accents and case ignored', () => {
  const draft = '## Requisitos\nfuncionais...\n\n## Estimativas\n\n## modos de falha\nSPI lento\n';
  const r = checkEntregavel(['Requisitos', 'Estimativas', 'ModosDeFalha', 'TradeOffs'], draft);
  assert.deepEqual(r.map((x) => x.ok), [true, false, true, false]);
  const star = checkEntregavel(['Situação', 'Ação'], '## Situacao\nx\n## ação\ny');
  assert.deepEqual(star.map((x) => x.ok), [true, true]);
});

test('the score keeps verified and self-assessed apart', () => {
  const s = score({
    estimativas: [{ ok: true }, { ok: false }],
    decisoes: [{ ok: true }, { ok: true }],
    entregavel: [{ ok: false }],
  }, 3, 6);
  assert.deepEqual(s.verificado, {
    acertos: 3, total: 5, pct: 60,
    partes: { estimativas: { acertos: 1, total: 2 }, decisoes: { acertos: 2, total: 2 }, entregavel: { acertos: 0, total: 1 } },
  });
  assert.deepEqual(s.autoavaliado, { marcados: 3, total: 6, pct: 50 });
  assert.deepEqual(checkDecisoes([{ correta: 2 }, { correta: 0 }], { 0: 2, 1: 1 }).map((x) => x.ok), [true, false]);
});

test('pre-requisites missing are listed from the reader progress', () => {
  const d = { prerequisitos: [{ slug: 'a', marcoId: 'x' }, { slug: 'a', marcoId: 'y' }, { slug: 'b', marcoId: 'z' }] };
  const done = { a: new Set(['x']), b: new Set() };
  assert.deepEqual(missingPrereqs(d, (s) => done[s] || new Set()).map((p) => p.marcoId), ['y', 'z']);
});

test('phases scale to the duration and cover it', () => {
  const p45 = phases(45);
  assert.deepEqual(p45.map((p) => p.nome), ['Esclarecer', 'Estimar', 'Desenho', 'Aprofundar', 'Fechamento']);
  assert.equal(p45[0].fimSeg, 300);
  assert.equal(p45[4].fimSeg, 2700);
  assert.equal(phases(90)[4].fimSeg, 5400);
  assert.equal(phaseAt(45, 0), 'Esclarecer');
  assert.equal(phaseAt(45, 650), 'Desenho');
  assert.equal(phaseAt(45, 99999), 'Fechamento');
});

test('speaking time from word count', () => {
  assert.equal(speakingMinutes(Array(260).fill('palavra').join(' ')), 2);
});
