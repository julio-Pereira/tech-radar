// @ts-check
// Higiene (ajustes pós-Fase 1.7, frente 2): no style attribute anywhere on
// the main routes, and with reduced motion no animation of any kind right
// after a route change — no waiting for the page to settle.
const { test, expect } = require('@playwright/test');

const styled = (/** @type {import('@playwright/test').Page} */ page) =>
  page.evaluate(() => [...document.querySelectorAll('[style]')].map((e) => e.outerHTML.slice(0, 120)));

test.describe('Zero atributo style', () => {
  test('início (radar)', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#view-radar')).toBeVisible();
    expect(await styled(page)).toEqual([]);
  });

  test('índice de trilhas, com as barras de progresso', async ({ page }) => {
    await page.goto('/#/learn');
    await expect(page.locator('.course-card progress.progress').first()).toBeVisible();
    expect(await styled(page)).toEqual([]);
  });

  test('trilha com marco aberto e diagrama desenhado', async ({ page }) => {
    await page.goto('/#/learn/kafka');
    const node = page.locator('.timeline-node').first();
    await node.locator('.node-toggle').click();
    await expect(node.locator('figure.diagrama svg').first()).toBeVisible();
    await expect(page.locator('.course-progress progress.progress')).toBeVisible();
    expect(await styled(page)).toEqual([]);
  });

  test('marco com walkthrough', async ({ page }) => {
    await page.goto('/#/learn/kubernetes/arquitetura/wt/k8s-do-apply-ao-pod-ready/1');
    await expect(page.locator('figure.walkthrough .wt-area svg')).toBeVisible();
    expect(await styled(page)).toEqual([]);
  });
});

test('com movimento reduzido, nada anima logo depois de trocar de rota', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/');
  await expect(page.locator('#view-radar')).toBeVisible();
  for (const [link, ready] of [['#/learn', '.course-grid'], ['#/paths', '#view-learn'], ['#/', '#view-radar']]) {
    await page.locator(`.nav-link[href="${link}"]`).click();
    await expect(page.locator(ready)).toBeVisible();
    // Immediately: the active link changed class, and nothing fades.
    expect(await page.evaluate(() => document.getAnimations().map((a) => a.constructor.name))).toEqual([]);
  }
});
