// @ts-check
const { test, expect } = require('@playwright/test');

const SLUG = 'go-fintech';

test.describe('Learn index (#/learn)', () => {
  test('lists course cards with progress', async ({ page }) => {
    await page.goto('/#/learn');
    const grid = page.locator('.course-grid');
    await expect(grid).toBeVisible();
    await expect(grid.locator('.course-card').first()).toBeVisible();
  });

  test('clicking a card opens the course', async ({ page }) => {
    await page.goto('/#/learn');
    const card = page.locator(`.course-card[href="#/learn/${SLUG}"]`);
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`#/learn/${SLUG}$`));
    await expect(page.locator('.course-title')).toBeVisible();
  });

  test('nonexistent course shows a not-found message with a way back', async ({ page }) => {
    await page.goto('/#/learn/this-slug-does-not-exist');
    await expect(page.locator('.course-notfound .empty')).toContainText('não encontrada');
    const back = page.locator('.course-notfound .back-link');
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/#\/learn$/);
  });
});

test.describe('Course view (#/learn/<slug>)', () => {
  test.beforeEach(async ({ page }) => {
    // Progress is per-browser-storage; start every test from a clean slate.
    await page.goto(`/#/learn/${SLUG}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('expanding a milestone reveals its body and toggles aria-expanded', async ({ page }) => {
    const firstToggle = page.locator('.timeline-node').first().locator('.node-toggle');
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');

    const firstBody = page.locator('.timeline-node').first().locator('.node-body');
    await expect(firstBody).toBeHidden();

    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstBody).toBeVisible();
  });

  test('marking a milestone complete updates the progress bar and persists', async ({ page }) => {
    const firstNode = page.locator('.timeline-node').first();
    await firstNode.locator('.node-toggle').click();
    await firstNode.locator('.node-check').check();

    await expect(page.locator('.course-progress .progress-label')).toContainText('1 de');

    await page.reload();
    await expect(page.locator('.timeline-node').first()).toHaveClass(/done/);
  });

  test('reset clears all progress after confirming the native dialog', async ({ page }) => {
    const firstNode = page.locator('.timeline-node').first();
    await firstNode.locator('.node-toggle').click();
    await firstNode.locator('.node-check').check();
    await expect(page.locator('.course-progress .progress-label')).toContainText('1 de');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.reset-btn').click();

    await expect(page.locator('.course-progress .progress-label')).toContainText('0 de');
    await expect(firstNode).not.toHaveClass(/done/);
  });
});
