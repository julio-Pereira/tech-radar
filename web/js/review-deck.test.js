// @ts-check
// node --test web/js/review-deck.test.js — no framework, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEligibleDeck, isNewCardDue, nextLocalDay, localISO } from './review-deck.js';
import { cyrb53 } from './hash.js';

// Two trilhas, three marcos with quiz questions, glossary entries with and
// without a resolved marco.
const QUIZ = {
  items: [
    { slug: 'a', marcoId: 'a1', milestoneTitle: 'A um', question: 'a1-q1', options: ['x', 'y'], answer: 0, explanation: 'e' },
    { slug: 'a', marcoId: 'a1', milestoneTitle: 'A um', question: 'a1-q2', options: ['x', 'y'], answer: 1, explanation: 'e' },
    { slug: 'a', marcoId: 'a2', milestoneTitle: 'A dois', question: 'a2-q1', options: ['x', 'y'], answer: 0, explanation: 'e' },
    { slug: 'b', marcoId: 'b1', milestoneTitle: 'B um', question: 'b1-q1', options: ['x', 'y'], answer: 1, explanation: 'e' },
  ],
};
const GLOSSARY = {
  entries: [
    { term: 'TA1', anchor: 'ta1', slug: 'a', track: 'Trilha A', summary: 's', marco: '01', marcoId: 'a1' },
    { term: 'TA2', anchor: 'ta2', slug: 'a', track: 'Trilha A', summary: 's', marco: '02', marcoId: 'a2' },
    { term: 'TB1', anchor: 'tb1', slug: 'b', track: 'Trilha B', summary: 's', marco: '01', marcoId: 'b1' },
    { term: 'Solto', anchor: 'solto', slug: 'b', track: 'Trilha B', summary: 's' },
  ],
};

const progress = (map) => (slug) => new Set(map[slug] || []);
const noHistory = () => ({});

test('no progress → empty deck, zero completed marcos', () => {
  const { deck, stats } = buildEligibleDeck(QUIZ, GLOSSARY, progress({}), noHistory);
  assert.equal(deck.length, 0);
  assert.equal(stats.completedMarcos, 0);
  assert.equal(stats.tracks, 0);
});

test('completing one marco brings exactly its quiz questions and its glossary entries', () => {
  const { deck, stats } = buildEligibleDeck(QUIZ, GLOSSARY, progress({ a: ['a1'] }), noHistory);
  const got = deck.map((c) => (c.kind === 'quiz' ? c.question : c.term)).sort();
  assert.deepEqual(got, ['TA1', 'a1-q1', 'a1-q2']);
  for (const c of deck) {
    assert.equal(c.slug, 'a');
    assert.equal(c.marcoId, 'a1');
    assert.equal(c.trackTitle, 'Trilha A');
    assert.equal(c.milestoneTitle, 'A um');
  }
  assert.equal(stats.completedMarcos, 1);
  assert.equal(stats.tracks, 1);
});

test('property (seeded): no card ever belongs to a marco that is not completed', () => {
  // mulberry32 — deterministic, so a failure reproduces.
  let seed = 20261102;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const all = { a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'] };
  for (let run = 0; run < 500; run++) {
    const map = {};
    for (const [slug, ids] of Object.entries(all)) map[slug] = ids.filter(() => rand() < 0.5);
    const { deck } = buildEligibleDeck(QUIZ, GLOSSARY, progress(map), noHistory);
    for (const c of deck) assert.ok(map[c.slug].includes(c.marcoId), `${c.slug}/${c.marcoId} sem conclusão`);
    // ...and every eligible item is there (nothing completed is dropped).
    const expected =
      QUIZ.items.filter((q) => map[q.slug].includes(q.marcoId)).length +
      GLOSSARY.entries.filter((g) => g.marcoId && map[g.slug].includes(g.marcoId)).length;
    assert.equal(deck.length, expected);
  }
});

test('a glossary entry without marcoId never enters and is counted as excluded', () => {
  const everything = progress({ a: ['a1', 'a2'], b: ['b1'] });
  const { deck, stats } = buildEligibleDeck(QUIZ, GLOSSARY, everything, noHistory);
  assert.ok(!deck.some((c) => c.term === 'Solto'));
  assert.equal(stats.excludedGlossaryNoMarco, 1);
});

test('notBefore is the local day after the last quiz attempt; absent without an attempt', () => {
  // Built from local wall-clock times, so this holds in any TZ the runner uses.
  const cases = [
    [new Date(2026, 0, 31, 23, 30), '2026-02-01'], // month boundary, late evening
    [new Date(2026, 11, 31, 0, 5), '2027-01-01'], // year boundary, just after midnight
    [new Date(2028, 1, 28, 12, 0), '2028-02-29'], // leap day
  ];
  for (const [when, expected] of cases) {
    assert.equal(nextLocalDay(when.toISOString()), expected);
    const history = (slug) => (slug === 'a' ? { a1: { lastAttemptAt: when.toISOString() } } : {});
    const { deck } = buildEligibleDeck(QUIZ, GLOSSARY, progress({ a: ['a1', 'a2'] }), history);
    for (const c of deck) {
      if (c.kind === 'quiz' && c.marcoId === 'a1') assert.equal(c.notBefore, expected);
      else assert.equal(c.notBefore, undefined); // a2 has no attempt; glossary never waits
    }
  }
  assert.equal(nextLocalDay('not a date'), null);
});

test('a new card is due when notBefore is absent or not in the future', () => {
  const today = localISO(new Date(2026, 10, 2));
  assert.equal(isNewCardDue({}, today), true);
  assert.equal(isNewCardDue({ notBefore: '2026-11-02' }, today), true);
  assert.equal(isNewCardDue({ notBefore: '2026-11-01' }, today), true);
  assert.equal(isNewCardDue({ notBefore: '2026-11-03' }, today), false);
});

test('card ids are identical to the previous implementation (saved review state stays valid)', () => {
  const { deck } = buildEligibleDeck(QUIZ, GLOSSARY, progress({ a: ['a1', 'a2'], b: ['b1'] }), noHistory);
  const byText = new Map(deck.map((c) => [c.kind === 'quiz' ? c.question : c.term, c.id]));
  for (const q of QUIZ.items) assert.equal(byText.get(q.question), String(cyrb53(`${q.slug}|${q.marcoId}|${q.question}`)));
  for (const g of GLOSSARY.entries.filter((e) => e.marcoId)) {
    assert.equal(byText.get(g.term), String(cyrb53(`${g.slug}|${g.anchor}|${g.term}`)));
  }
});

test('deterministic: same input → same output, same order; progress read once per trilha', () => {
  let reads = 0;
  const counted = (slug) => { reads += 1; return new Set({ a: ['a1', 'a2'], b: ['b1'] }[slug] || []); };
  const first = buildEligibleDeck(QUIZ, GLOSSARY, counted, noHistory);
  assert.equal(reads, 2);
  const second = buildEligibleDeck(QUIZ, GLOSSARY, progress({ a: ['a1', 'a2'], b: ['b1'] }), noHistory);
  assert.deepEqual(first, second);
});

test('completed marcos count for trilhas known only from the index, even with no cards', () => {
  const { deck, stats } = buildEligibleDeck({ items: [] }, { entries: [] }, progress({ c: ['c1'] }), noHistory, { c: 'Trilha C' });
  assert.equal(deck.length, 0);
  assert.equal(stats.completedMarcos, 1);
  assert.equal(stats.tracks, 1);
});

test('code field: a card without code keeps its old id; same question with different snippets gets distinct ids', () => {
  const bank = {
    items: [
      { slug: 'a', marcoId: 'a1', question: 'O que imprime?', code: 'fmt.Println(1)', options: ['1', '2'], answer: 0 },
      { slug: 'a', marcoId: 'a1', question: 'O que imprime?', code: 'fmt.Println(2)', options: ['1', '2'], answer: 1 },
      { slug: 'a', marcoId: 'a1', question: 'a1-q1', options: ['x', 'y'], answer: 0 },
    ],
  };
  const { deck } = buildEligibleDeck(bank, { entries: [] }, progress({ a: ['a1'] }), noHistory);
  const quiz = deck.filter((c) => c.kind === 'quiz');
  assert.equal(new Set(quiz.map((c) => c.id)).size, 3);
  const plain = quiz.find((c) => c.question === 'a1-q1');
  assert.equal(plain.id, String(cyrb53('a|a1|a1-q1')));
  assert.equal('code' in plain, false);
  assert.equal(quiz.find((c) => c.answer === 1).code, 'fmt.Println(2)');
});
