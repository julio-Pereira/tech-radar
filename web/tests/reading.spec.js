// @ts-check
const { test, expect } = require('@playwright/test');

const SLUG = 'go-fintech';

test.describe('Continue where you left off', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/#/learn/${SLUG}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('opening a milestone offers a Continuar button back to it on revisit', async ({ page }) => {
    const second = page.locator('.timeline-node').nth(1);
    await second.locator('.node-toggle').click();
    const title = (await second.locator('.node-title').textContent()).trim();

    // Leave the course and come back — the continue button only shows up
    // once buildCourseView re-reads localStorage, i.e. on a fresh render.
    await page.locator('.back-link').click();
    await page.goto(`/#/learn/${SLUG}`);

    const continueBtn = page.locator('.continue-btn');
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toContainText('Marco 2');
    await expect(continueBtn).toContainText(title);
  });

  test('clicking Continuar expands and scrolls to that milestone', async ({ page }) => {
    const third = page.locator('.timeline-node').nth(2);
    await third.locator('.node-toggle').click();
    await page.reload(); // re-render the course view from the storage write, like a fresh visit

    await page.locator('.continue-btn').click();
    await expect(third.locator('.node-body')).toBeVisible();
    await expect(third.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('the tracks index shows a continue banner just from visiting a course, no milestone needed', async ({ page }) => {
    // buildCourseView() marks the course as "last" on render, not on expand —
    // the banner's bar is lower than the course page's own continue-btn.
    await page.goto('/#/learn');

    const banner = page.locator('.continue-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('href', `#/learn/${SLUG}`);
  });

  test('no continue banner before any course has ever been visited', async ({ page }) => {
    await page.goto('/#/learn');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator('.continue-banner')).toHaveCount(0);
  });
});

test.describe('Previous/next milestone navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/#/learn/${SLUG}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('the first milestone has no "previous" button', async ({ page }) => {
    const first = page.locator('.timeline-node').first();
    await first.locator('.node-toggle').click();
    await expect(first.locator('.node-nav-prev')).toHaveCount(0);
    await expect(first.locator('.node-nav-next')).toBeVisible();
  });

  test('clicking "next" expands and scrolls to the following milestone', async ({ page }) => {
    const first = page.locator('.timeline-node').first();
    const second = page.locator('.timeline-node').nth(1);
    await first.locator('.node-toggle').click();

    await first.locator('.node-nav-next').click();
    await expect(second.locator('.node-body')).toBeVisible();
    await expect(second.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  test('clicking "previous" from the second milestone returns to the first', async ({ page }) => {
    const first = page.locator('.timeline-node').first();
    const second = page.locator('.timeline-node').nth(1);
    await second.locator('.node-toggle').click();

    await second.locator('.node-nav-prev').click();
    await expect(first.locator('.node-body')).toBeVisible();
  });
});

test.describe('Copy code button', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/#/learn/${SLUG}`);
  });

  test('copies the snippet text, not the button label, to the clipboard', async ({ page }) => {
    // Expand milestones until one with a code block shows up.
    const nodes = page.locator('.timeline-node');
    const count = await nodes.count();
    let copyBtn = null;
    for (let i = 0; i < count; i++) {
      const node = nodes.nth(i);
      await node.locator('.node-toggle').click();
      const btn = node.locator('.code-copy-btn').first();
      if (await btn.count()) {
        copyBtn = btn;
        break;
      }
    }
    expect(copyBtn, 'expected at least one milestone with a code block in go-fintech').not.toBeNull();

    const pre = copyBtn.locator('xpath=..');
    const expected = await pre.evaluate((el) => (el.querySelector('code') || el).textContent.trim());

    await copyBtn.click();
    await expect(copyBtn).toHaveText('Copiado!');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.trim()).toBe(expected);
    expect(clipboardText).not.toContain('Copiar');
  });
});
