// @ts-check
// UX item 16 (glossário navegável): #/glossario lists every term across
// every trilha; #/glossario/<anchor> shows every trilha's own definition of
// one term, never merged. Tested against the real compiled glossary.json —
// "Reconciliação" is a genuine 3-trilha term in real content.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('the glossário index lists terms and a known multi-trilha term shows its count badge', async ({ page }) => {
  await page.goto('/#/glossario');
  // "Reconciliação (de faturamento)" is a real, separate term — match the
  // exact label, not a substring, to avoid colliding with it.
  const row = page.getByRole('link', { name: /^Reconciliação 3 trilhas$/ });
  await expect(row).toBeVisible();
  await expect(row.locator('.glossario-term-count')).toHaveText('3 trilhas');
});

test('filtering the glossário hides non-matching terms, accent-insensitively', async ({ page }) => {
  await page.goto('/#/glossario');
  const totalBefore = await page.locator('a.glossario-term-row').count();
  await page.locator('.glossario-filter input').fill('reconciliacao'); // no accent on purpose
  await expect(page.getByRole('link', { name: /^Reconciliação 3 trilhas$/ })).toBeVisible();
  const visibleAfter = await page.locator('a.glossario-term-row:visible').count();
  expect(visibleAfter).toBeLessThan(totalBefore);
});

test('a term page lists every trilha definition separately, with a link into each trilha', async ({ page }) => {
  await page.goto('/#/glossario/reconciliacao');
  await expect(page.locator('.course-title')).toHaveText('Reconciliação');
  await expect(page.locator('.glossario-definition')).toHaveCount(3);
  await expect(page.locator('.course-subtitle')).toContainText('3 definições');

  const first = page.locator('.glossario-definition').first();
  const href = await first.locator('.glossario-definition-link').getAttribute('href');
  expect(href).toMatch(/^#\/learn\//);
  await first.locator('.glossario-definition-link').click();
  await expect(page).toHaveURL(new RegExp(href.replace(/[/]/g, '\\/') + '$'));
  await expect(page.locator('.course-title')).toBeVisible();
});

test('a term not in the catalog shows a not-found message, not a crash', async ({ page }) => {
  await page.goto('/#/glossario/isso-nao-existe');
  await expect(page.locator('.empty')).toContainText('não encontrado');
  await expect(page.locator('.back-link')).toHaveAttribute('href', '#/glossario');
});

test('axe: the glossário index and a term page have no serious/critical violations', async ({ page }) => {
  await page.goto('/#/glossario');
  let results = await new AxeBuilder({ page }).include('body').analyze();
  let serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);

  await page.goto('/#/glossario/reconciliacao');
  results = await new AxeBuilder({ page }).include('body').analyze();
  serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
