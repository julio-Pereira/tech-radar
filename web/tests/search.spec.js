// @ts-check
// UX item 15 (busca global de conteúdo): a header search box, lazy-loaded,
// accent-insensitive, with a "/" shortcut. Tested against the real compiled
// search-index.json.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('the search index is not fetched until the search box is used', async ({ page }) => {
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('search-index.json')) requests.push(req.url());
  });
  await page.goto('/#/');
  await expect(page.locator('h1')).toBeVisible();
  expect(requests).toHaveLength(0);

  await page.locator('#search-input').fill('reconc');
  await expect.poll(() => requests.length).toBeGreaterThan(0);
});

test('typing a query, accent-insensitively, finds a real glossary term', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('reconciliacao'); // no accent on purpose
  // Course docs sort first by design (stable diffs) and may also legitimately
  // match (a course subtitle can mention the word) — assert the glossary
  // term shows up among the results, not that it's first.
  const term = page.locator('.search-result', { has: page.locator('.search-result-kind:text-is("Verbete")') })
    .filter({ hasText: 'Reconciliação' })
    .first();
  await expect(term).toBeVisible();
});

test('clicking a milestone result navigates straight to that marco', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('system design');
  const milestoneResult = page.locator('.search-result', { has: page.locator('.search-result-kind:text-is("Marco")') }).first();
  await expect(milestoneResult).toBeVisible();
  const href = await milestoneResult.getAttribute('href');
  expect(href).toMatch(/^#\/learn\/[a-z0-9-]+\/[a-z0-9-]+$/);
  await milestoneResult.click();
  await expect(page).toHaveURL(new RegExp(href.replace(/[/]/g, '\\/') + '$'));
});

test('an empty query closes the results panel', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('reconciliacao');
  await expect(page.locator('#search-results')).toBeVisible();
  await page.locator('#search-input').fill('');
  await expect(page.locator('#search-results')).toBeHidden();
});

test('a query with no matches shows a plain "no results" message, not an empty panel', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('zzzznonexistentquery');
  await expect(page.locator('.search-empty')).toHaveText('Nenhum resultado.');
});

test('Escape closes the results panel and blurs the input', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('reconciliacao');
  await expect(page.locator('#search-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-results')).toBeHidden();
  await expect(page.locator('#search-input')).not.toBeFocused();
});

test('"/" focuses the search box from anywhere, but not while typing elsewhere', async ({ page }) => {
  await page.goto('/#/');
  await page.keyboard.press('/');
  await expect(page.locator('#search-input')).toBeFocused();

  // Typing "/" inside another field must not steal focus or insert nothing.
  await page.locator('#search-input').fill('');
  await page.locator('#search-input').blur();
  await page.locator('#search').fill('go/');
  await expect(page.locator('#search')).toHaveValue('go/');
});

test('axe: an open search results panel has no serious/critical violations', async ({ page }) => {
  await page.goto('/#/');
  await page.locator('#search-input').fill('reconciliacao');
  await expect(page.locator('.search-result').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
