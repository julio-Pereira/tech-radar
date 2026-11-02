// @ts-check
// Revisão só com o que já foi estudado (TASK revisão espaçada): builds the
// #/revisar deck from quiz-bank.json + glossary.json, keeping only cards whose
// source milestone the reader has completed. Pure — no DOM, no localStorage:
// progress and quiz history are injected — so it runs under `node --test`
// (review-deck.test.js).
//
// Card ids are exactly the ones the old review-view.js buildDeck produced
// (cyrb53(slug|marcoId|question) for quiz, cyrb53(slug|anchor|term) for
// glossary), so every box already saved in tr:review:v1 stays valid. Leaving
// a card out of the deck never touches its saved state: un-completing a
// milestone hides its cards, re-completing it brings them back in their box.
import { cyrb53 } from './hash.js';

/**
 * @typedef {{ slug: string, marcoId: string, milestoneTitle?: string, question: string, options: string[], answer: number, explanation?: string }} QuizBankItem
 * @typedef {{ term: string, anchor: string, slug: string, track?: string, summary: string, marco?: string, marcoId?: string }} GlossaryEntry
 * @typedef {{
 *   id: string, kind: 'quiz' | 'glossary', slug: string, marcoId: string,
 *   trackTitle: string, milestoneTitle?: string, notBefore?: string,
 *   question?: string, options?: string[], answer?: number, explanation?: string,
 *   term?: string, summary?: string,
 * }} Card
 */

/**
 * @param {{ items?: QuizBankItem[] }} quizBank
 * @param {{ entries?: GlossaryEntry[] }} glossary
 * @param {(slug: string) => Set<string>} completed ids of the completed milestones of a trilha (getProgress)
 * @param {(slug: string) => Record<string, { lastAttemptAt?: string }>} quizHistory per-milestone quiz history (getQuizHistory)
 * @param {Record<string, string>} [trackTitles] slug → trilha title, when the caller has it
 * @returns {{ deck: Card[], stats: { completedMarcos: number, tracks: number, excludedGlossaryNoMarco: number } }}
 */
export function buildEligibleDeck(quizBank, glossary, completed, quizHistory, trackTitles = {}) {
  const items = (quizBank && quizBank.items) || [];
  const entries = (glossary && glossary.entries) || [];

  // One read per trilha, however many cards it has.
  const completedCache = new Map();
  const historyCache = new Map();
  const completedOf = (slug) => {
    if (!completedCache.has(slug)) completedCache.set(slug, completed(slug) || new Set());
    return completedCache.get(slug);
  };
  const historyOf = (slug) => {
    if (!historyCache.has(slug)) historyCache.set(slug, quizHistory(slug) || {});
    return historyCache.get(slug);
  };

  // Titles: the caller's map first, then whatever the data itself carries.
  const titles = new Map(Object.entries(trackTitles));
  for (const g of entries) if (g.track && !titles.has(g.slug)) titles.set(g.slug, g.track);
  const milestoneTitles = new Map();
  for (const q of items) {
    if (q.milestoneTitle) milestoneTitles.set(`${q.slug}|${q.marcoId}`, q.milestoneTitle);
  }

  /** @type {Card[]} */
  const deck = [];
  for (const q of items) {
    if (!q.slug || !q.marcoId || !completedOf(q.slug).has(q.marcoId)) continue;
    /** @type {Card} */
    const card = {
      id: String(cyrb53(`${q.slug}|${q.marcoId}|${q.question}`)),
      kind: 'quiz',
      slug: q.slug,
      marcoId: q.marcoId,
      trackTitle: titles.get(q.slug) || q.slug,
      milestoneTitle: q.milestoneTitle,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    };
    const attempt = historyOf(q.slug)[q.marcoId];
    const notBefore = attempt && attempt.lastAttemptAt ? nextLocalDay(attempt.lastAttemptAt) : null;
    if (notBefore) card.notBefore = notBefore;
    deck.push(card);
  }

  let excludedGlossaryNoMarco = 0;
  for (const g of entries) {
    if (!g.marcoId) {
      excludedGlossaryNoMarco += 1;
      continue;
    }
    if (!completedOf(g.slug).has(g.marcoId)) continue;
    /** @type {Card} */
    const card = {
      id: String(cyrb53(`${g.slug}|${g.anchor}|${g.term}`)),
      kind: 'glossary',
      slug: g.slug,
      marcoId: g.marcoId,
      trackTitle: titles.get(g.slug) || g.track || g.slug,
      term: g.term,
      summary: g.summary,
    };
    const mt = milestoneTitles.get(`${g.slug}|${g.marcoId}`);
    if (mt) card.milestoneTitle = mt;
    deck.push(card);
  }

  // Scope of what the reader has studied: every trilha known from the data or
  // the caller's index, so completed marcos count even when they have no card.
  let completedMarcos = 0;
  let tracks = 0;
  const slugs = new Set([...items.map((q) => q.slug), ...entries.map((g) => g.slug), ...Object.keys(trackTitles)]);
  for (const slug of [...slugs].sort()) {
    const n = completedOf(slug).size;
    completedMarcos += n;
    if (n > 0) tracks += 1;
  }

  return { deck, stats: { completedMarcos, tracks, excludedGlossaryNoMarco } };
}

/**
 * A card with no review state yet is due when it has no notBefore, or its
 * notBefore (a local "YYYY-MM-DD") is today or earlier. A card that already
 * has state follows the Leitner schedule alone (isDue).
 * @param {{ notBefore?: string }} card
 * @param {string} todayLocalISO
 */
export function isNewCardDue(card, todayLocalISO) {
  return !card.notBefore || card.notBefore <= todayLocalISO;
}

/** Local calendar day after the instant `iso` (same convention as localDateISO). */
export function nextLocalDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return localISO(next);
}

/** "YYYY-MM-DD" in local time — same output as dom-helpers.localDateISO, kept here so this module stays DOM-free. */
export function localISO(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
