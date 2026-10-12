// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Routing', () => {
  test('unknown top-level hash falls back to the radar view', async ({ page }) => {
    await page.goto('/#/this-is-not-a-real-route');
    await expect(page.locator('#view-radar')).toBeVisible();
    await expect(page.locator('#view-learn')).toBeHidden();
    await expect(page.locator('.nav-link[data-route="radar"]')).toHaveClass(/active/);
  });

  test('#/ shows radar, #/learn shows tracks — nav reflects the active route', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.nav-link[data-route="radar"]')).toHaveClass(/active/);

    await page.locator('.nav-link[data-route="learn"]').click();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.locator('#view-learn')).toBeVisible();
    await expect(page.locator('.nav-link[data-route="learn"]')).toHaveClass(/active/);
  });

  test('browser back returns from a course to the tracks index', async ({ page }) => {
    await page.goto('/#/learn');
    await page.locator('.course-card').first().click();
    await expect(page.locator('.course-title')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#\/learn$/);
    await expect(page.locator('.course-grid')).toBeVisible();
  });
});

test.describe('Route title, focus and announcements', () => {
  test('document.title and the live region update per route', async ({ page }) => {
    await page.goto('/#/');
    await expect(page).toHaveTitle('Radar · Tech Radar');

    await page.locator('.nav-link[data-route="learn"]').click();
    await expect(page).toHaveTitle('Trilhas · Tech Radar');
    await expect(page.locator('#route-announcer')).toHaveText('Página carregada: Trilhas');

    await page.locator('.course-card').first().click();
    await expect(page.locator('.course-title')).toBeVisible();
    const title = await page.locator('.course-title').textContent();
    await expect(page).toHaveTitle(`${title} · Tech Radar`);
  });

  test('a fresh page load leaves focus alone, so the skip link stays the first Tab stop', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#main-content')).not.toBeFocused();
  });

  test('in-app navigation moves focus to <main>, so a screen reader cursor follows', async ({ page }) => {
    await page.goto('/#/');
    await page.locator('.nav-link[data-route="learn"]').click();
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('an unknown course slug announces "not found" instead of the title', async ({ page }) => {
    await page.goto('/#/learn/nope-does-not-exist');
    await expect(page.locator('#route-announcer')).toHaveText('Página carregada: Trilha não encontrada');
    await expect(page).toHaveTitle('Trilha não encontrada · Tech Radar');
  });

  test('skip link moves focus to main content', async ({ page }) => {
    await page.goto('/#/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
