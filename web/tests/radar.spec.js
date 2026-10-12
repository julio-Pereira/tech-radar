// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Radar view (#/)', () => {
  test('loads the feed and lists articles', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#articles .card').first()).toBeVisible();
    await expect(page.locator('#summary')).toContainText('Exibindo');
  });

  test('category chip filters the article list', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#articles .card').first()).toBeVisible();

    const totalText = await page.locator('#summary').textContent();
    const total = Number(totalText.match(/de (\d+)/)[1]);

    const firstChip = page.locator('#category-filters .chip').first();
    await firstChip.click();
    await expect(firstChip).toHaveClass(/active/);
    await expect(firstChip).toHaveAttribute('aria-pressed', 'true');

    const filteredText = await page.locator('#summary').textContent();
    const filtered = Number(filteredText.match(/Exibindo (\d+)/)[1]);
    expect(filtered).toBeLessThanOrEqual(total);
  });

  test('search box filters by title/summary/source', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#articles .card').first()).toBeVisible();

    await page.locator('#search').fill('zzzznomatchforsure');
    await page.waitForTimeout(350); // debounce
    await expect(page.locator('#articles .empty')).toBeVisible();

    await page.locator('#clear-btn').click();
    await expect(page.locator('#articles .card').first()).toBeVisible();
  });

  test('clear filters resets chips and search', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#articles .card').first()).toBeVisible();

    const firstChip = page.locator('#category-filters .chip').first();
    await firstChip.click();
    await page.locator('#search').fill('go');
    await page.waitForTimeout(350);

    await page.locator('#clear-btn').click();
    await expect(firstChip).not.toHaveClass(/active/);
    await expect(page.locator('#search')).toHaveValue('');
  });
});
