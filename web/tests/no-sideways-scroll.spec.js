// @ts-check
// Every track, every milestone open, on a phone and on a desktop: nothing
// widens the page. The milestone card does not clip its content (diagram
// figures break out of it on purpose), so a long URL, a wide table or a quiz
// option with a long identifier must wrap or scroll inside itself instead.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const coursesDir = path.join(__dirname, '..', 'data', 'courses');
const slugs = fs.existsSync(coursesDir)
  ? fs.readdirSync(coursesDir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5)).sort()
  : [];

for (const width of [360, 1280]) {
  for (const slug of slugs) {
    test(`${slug} at ${width}px: no element sticks out of the page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/#/learn/${slug}`);
      const toggles = page.locator('.timeline-node .node-toggle');
      await toggles.first().waitFor();
      const n = await toggles.count();
      for (let i = 0; i < n; i++) await toggles.nth(i).click();
      await expect(page.locator('.timeline-node .milestone-body').last()).toBeVisible();
      const sticking = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => {
        if (e.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5) return false;
        // Content of a scroll container (a code block, a figure) is fine.
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible') return false;
        }
        return true;
      }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${e.className}: ${(e.textContent || '').trim().slice(0, 60)}`));
      expect(sticking).toEqual([]);
    });
  }
}
