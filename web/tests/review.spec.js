// @ts-check
// UX platform melhoria 5 (revisão espaçada): #/revisar, a Leitner session
// over quiz questions + glossary terms — only from milestones the reader has
// completed (review-deck.js). Deck content is mocked via route interception
// (same pattern as handson/bridges/freshness specs) so each test controls
// exactly what cards exist; progress is seeded in tr:progress: because a
// card from a milestone that is not completed never enters the deck.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const QUIZ_ITEM = {
  slug: 'go-fintech', marcoId: 'introducao', milestoneTitle: 'Introdução',
  question: 'Pergunta de teste?', options: ['Errada', 'Certa'], answer: 1, explanation: 'Porque sim.',
};
const GLOSSARY_ENTRY = {
  term: 'Termo de teste', anchor: 'termo-de-teste', slug: 'go-fintech', track: 'Go para Fintech',
  summary: 'Resumo de uma frase do termo de teste.', marco: '01', marcoId: 'introducao',
};
const DONE = { 'go-fintech': ['introducao'] };

/** Seeds tr:progress:<slug> (and optionally tr:quiz:<slug>) before the next reload. */
async function seedProgress(page, progress = DONE, quiz = {}) {
  await page.evaluate(({ progress, quiz }) => {
    for (const [slug, ids] of Object.entries(progress)) localStorage.setItem(`tr:progress:${slug}`, JSON.stringify(ids));
    for (const [slug, hist] of Object.entries(quiz)) localStorage.setItem(`tr:quiz:${slug}`, JSON.stringify(hist));
  }, { progress, quiz });
}

async function mockDeck(page, { quiz = [QUIZ_ITEM], glossary = [GLOSSARY_ENTRY] } = {}) {
  await page.route('**/data/quiz-bank.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: quiz }),
  }));
  await page.route('**/data/glossary.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ entries: glossary }),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/revisar');
  await page.evaluate(() => localStorage.clear());
});

test('shows the daily limit control and initial status', async ({ page }) => {
  await mockDeck(page);
  await seedProgress(page);
  await page.reload();
  await expect(page.locator('#review-daily-limit')).toHaveValue('10');
  await expect(page.locator('.review-status')).toHaveText('0 de 10 revisados hoje');
});

test('a quiz card: checking the right answer shows feedback, then advances and increments the count', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page);
  await page.reload();

  await page.locator('.quiz-option input').nth(1).check(); // the correct one
  await page.locator('.quiz-check-btn').click();
  await expect(page.locator('.quiz-option.correct')).toBeVisible();
  await expect(page.locator('.quiz-explanation')).toBeVisible();

  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();
  await expect(page.locator('.review-status')).toHaveText('1 de 10 revisados hoje');
  // Only one quiz card and no glossary cards — deck exhausted.
  await expect(page.locator('.empty')).toContainText('Nenhum cartão para revisar agora');
});

test('a glossary card: reveal shows the summary, then self-assessment advances', async ({ page }) => {
  await mockDeck(page, { quiz: [], glossary: [GLOSSARY_ENTRY] });
  await seedProgress(page);
  await page.reload();

  await expect(page.locator('.review-glossary-term')).toHaveText(GLOSSARY_ENTRY.term);
  await expect(page.locator('.review-glossary-summary')).toBeHidden();

  await page.locator('.review-reveal-btn').click();
  await expect(page.locator('.review-glossary-summary')).toBeVisible();
  await expect(page.locator('.review-glossary-summary')).toHaveText(GLOSSARY_ENTRY.summary);

  await page.locator('.review-remembered-btn').click();
  await expect(page.locator('.review-status')).toHaveText('1 de 10 revisados hoje');
});

test('the daily limit stops the session and a higher limit lets it continue', async ({ page }) => {
  await mockDeck(page, {
    quiz: [QUIZ_ITEM, { ...QUIZ_ITEM, question: 'Segunda pergunta?' }],
    glossary: [],
  });
  await seedProgress(page);
  await page.reload();

  await page.locator('#review-daily-limit').fill('1');
  await page.locator('#review-daily-limit').dispatchEvent('change');

  await page.locator('.quiz-option input').nth(1).check();
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();

  await expect(page.locator('.empty')).toContainText('Limite diário atingido');

  await page.locator('#review-daily-limit').fill('5');
  await page.locator('#review-daily-limit').dispatchEvent('change');
  await expect(page.locator('.quiz-question legend')).toBeVisible();
});

test('a wrong answer schedules the card back to box 0 (due again tomorrow), not further out', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page);
  await page.reload();

  await page.locator('.quiz-option input').nth(0).check(); // the wrong one
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('tr:review:v1')));
  const card = Object.values(state.cards)[0];
  expect(card.box).toBe(0);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expectedDue = tomorrow.toISOString().slice(0, 10);
  expect(card.dueAt).toBe(expectedDue);
});

test('reviewing never writes to tr:progress: or tr:quiz: — the completion gate is untouched', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [GLOSSARY_ENTRY] });
  await seedProgress(page);
  await page.reload();

  await page.locator('.quiz-option input').nth(1).check();
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();
  await page.locator('.review-reveal-btn').click();
  await page.locator('.review-remembered-btn').click();

  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(after['tr:progress:go-fintech']).toBe(JSON.stringify(['introducao'])); // untouched
  expect(Object.keys(after).some((k) => k.startsWith('tr:quiz:'))).toBe(false);
  expect(Object.keys(after)).toContain('tr:review:v1');
});

test('the review state round-trips through export/import like every other tr:* key', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await page.locator('.quiz-option input').nth(1).check();
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();

  await page.goto('/#/learn');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.progress-io-btn').first().click(),
  ]);
  const fs = require('fs');
  const payload = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
  expect(Object.keys(payload.data)).toContain('tr:review:v1');
});

test('completed marcos with no quiz or glossary content: says so, not "come back tomorrow"', async ({ page }) => {
  await mockDeck(page, { quiz: [], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await expect(page.locator('.empty')).toContainText('ainda não têm perguntas de quiz nem verbetes');
  await expect(page.locator('.empty')).not.toContainText('Volte');
});

test('axe: the review page has no serious/critical violations, including an open quiz card', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [GLOSSARY_ENTRY] });
  await seedProgress(page);
  await page.reload();
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});

test('no completed marco: the first empty state points to #/learn, even with content available', async ({ page }) => {
  await mockDeck(page);
  await page.reload(); // no progress seeded
  await expect(page.locator('.review-scope')).toHaveText('Você ainda não concluiu nenhum marco.');
  const empty = page.locator('.empty');
  await expect(empty).toContainText('Conclua um marco para começar a revisar.');
  await expect(empty.locator('a')).toHaveAttribute('href', '#/learn');
  await expect(page.locator('.review-card')).toHaveCount(0);
});

test('a card from a marco that is not completed never shows up', async ({ page }) => {
  const other = { ...QUIZ_ITEM, marcoId: 'outro', milestoneTitle: 'Outro marco', question: 'De outro marco?' };
  const otherTrack = { ...QUIZ_ITEM, slug: 'kafka', question: 'De outra trilha?' };
  await mockDeck(page, { quiz: [QUIZ_ITEM, other, otherTrack], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await expect(page.locator('.review-scope')).toHaveText('1 cartão de 1 marco concluído em 1 trilha');
  await expect(page.locator('.quiz-question legend')).toHaveText(QUIZ_ITEM.question);
});

test('completing a real marco in the UI brings exactly its cards, each naming trilha and marco', async ({ page }) => {
  const { quiz, terms, title } = await page.evaluate(async () => {
    const q = await (await fetch('./data/quiz-bank.json')).json();
    const g = await (await fetch('./data/glossary.json')).json();
    const items = q.items.filter((i) => i.slug === 'go-fintech' && i.marcoId === 'fundamentos');
    const entries = g.entries.filter((e) => e.slug === 'go-fintech' && e.marcoId === 'fundamentos');
    return { quiz: items.map((i) => i.question), terms: entries.map((e) => e.term), title: items[0].milestoneTitle };
  });
  expect(quiz.length).toBeGreaterThan(0);

  await page.goto('/#/learn/go-fintech/fundamentos');
  await page.locator('#check-go-fintech-fundamentos').check();
  await page.goto('/#/revisar');
  await page.locator('#review-daily-limit').fill('200');
  await page.locator('#review-daily-limit').dispatchEvent('change');

  const total = quiz.length + terms.length;
  await expect(page.locator('.review-scope')).toContainText(`de 1 marco concluído em 1 trilha`);
  const seen = [];
  for (let i = 0; i < total; i++) {
    const card = page.locator('.review-card');
    await expect(card.locator('.review-card-track')).toContainText(title);
    await expect(card.locator('.review-card-marco-link')).toHaveAttribute('href', '#/learn/go-fintech/fundamentos');
    if (await card.locator('.quiz-question').count()) {
      seen.push(await card.locator('legend').innerText());
      await card.locator('.quiz-option input').first().check();
      await card.locator('.quiz-check-btn').click();
      await card.locator('.quiz-retry-btn').click();
    } else {
      seen.push(await card.locator('.review-glossary-term').innerText());
      await card.locator('.review-reveal-btn').click();
      await card.locator('.review-remembered-btn').click();
    }
  }
  expect(seen.sort()).toEqual([...quiz, ...terms].sort());
  await expect(page.locator('.empty')).toContainText('Nenhum cartão para revisar agora');
});

test('a quiz passed today waits until tomorrow; with the clock a day ahead its questions show up', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page, DONE, {
    'go-fintech': { introducao: { bestScore: 1, total: 1, lastAttemptAt: new Date().toISOString() } },
  });
  await page.reload();
  await expect(page.locator('.quiz-question')).toHaveCount(0);
  await expect(page.locator('.empty')).toContainText('O próximo vence em');

  await page.clock.install({ time: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  await page.reload();
  await expect(page.locator('.quiz-question legend')).toHaveText(QUIZ_ITEM.question);
});

test('un-completing a marco hides its cards but keeps their review state; re-completing restores the box', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await page.locator('.quiz-option input').nth(1).check();
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tr:review:v1')).cards);
  expect(Object.values(saved)[0].box).toBe(1);

  await seedProgress(page, { 'go-fintech': [] });
  await page.reload();
  await expect(page.locator('.review-scope')).toHaveText('Você ainda não concluiu nenhum marco.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tr:review:v1')).cards)).toEqual(saved);

  await seedProgress(page);
  await page.reload();
  await expect(page.locator('.review-scope')).toHaveText('1 cartão de 1 marco concluído em 1 trilha');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tr:review:v1')).cards)).toEqual(saved);
  // Box 1 waits two days: the card is in the deck but not due today.
  await expect(page.locator('.empty')).toContainText('O próximo vence em');
});

test('"rever o marco" opens the marco and records no answer', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await page.locator('.review-card-marco-link').click();
  await expect(page).toHaveURL(/#\/learn\/go-fintech\/introducao$/);
  const state = await page.evaluate(() => localStorage.getItem('tr:review:v1'));
  expect(state === null || Object.keys(JSON.parse(state).cards).length === 0).toBe(true);
});

test('axe: no serious/critical violations in the three empty states', async ({ page }) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page }).include('body').analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
  };
  // 1. nothing completed
  await mockDeck(page);
  await page.reload();
  await expect(page.locator('.empty')).toContainText('Conclua um marco');
  await scan();
  // 2. completed, no linked content
  await page.unrouteAll();
  await mockDeck(page, { quiz: [], glossary: [] });
  await seedProgress(page);
  await page.reload();
  await expect(page.locator('.empty')).toContainText('ainda não têm perguntas');
  await scan();
  // 3. cards exist, none due
  await page.unrouteAll();
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
  await seedProgress(page, DONE, {
    'go-fintech': { introducao: { bestScore: 1, total: 1, lastAttemptAt: new Date().toISOString() } },
  });
  await page.reload();
  await expect(page.locator('.empty')).toContainText('O próximo vence em');
  await scan();
});
