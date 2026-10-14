// @ts-check
// UX platform melhoria 5 (revisão espaçada): #/revisar, a Leitner session
// over quiz questions + glossary terms. Deck content is mocked via route
// interception (same pattern as handson/bridges/freshness specs) so each
// test controls exactly what cards exist, instead of depending on which
// real quiz/glossary items happen to sort first.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const QUIZ_ITEM = {
  slug: 'go-fintech', marcoId: 'introducao', milestoneTitle: 'Introdução',
  question: 'Pergunta de teste?', options: ['Errada', 'Certa'], answer: 1, explanation: 'Porque sim.',
};
const GLOSSARY_ENTRY = {
  term: 'Termo de teste', anchor: 'termo-de-teste', slug: 'go-fintech', track: 'Go para Fintech',
  summary: 'Resumo de uma frase do termo de teste.',
};

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
  await page.reload();
  await expect(page.locator('#review-daily-limit')).toHaveValue('10');
  await expect(page.locator('.review-status')).toHaveText('0 de 10 revisados hoje');
});

test('a quiz card: checking the right answer shows feedback, then advances and increments the count', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
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
  await page.reload();

  await page.locator('.quiz-option input').nth(1).check();
  await page.locator('.quiz-check-btn').click();
  await page.locator('.quiz-retry-btn', { hasText: 'Próximo cartão' }).click();
  await page.locator('.review-reveal-btn').click();
  await page.locator('.review-remembered-btn').click();

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((k) => k.startsWith('tr:progress:') || k.startsWith('tr:quiz:'))).toBe(false);
  expect(keys).toContain('tr:review:v1');
});

test('the review state round-trips through export/import like every other tr:* key', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [] });
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

test('an empty deck (no quiz, no glossary content) shows a plain message, not a crash', async ({ page }) => {
  await mockDeck(page, { quiz: [], glossary: [] });
  await page.reload();
  await expect(page.locator('.empty')).toContainText('Nenhum conteúdo de quiz ou glossário');
});

test('axe: the review page has no serious/critical violations, including an open quiz card', async ({ page }) => {
  await mockDeck(page, { quiz: [QUIZ_ITEM], glossary: [GLOSSARY_ENTRY] });
  await page.reload();
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
