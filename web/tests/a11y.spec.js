// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Baseline per the UX plan: zero violations of serious/critical impact.
// Moderate/minor findings are allowed for now and tracked in web/docs/ux-baseline.md
// rather than silently ignored.
const SERIOUS_OR_WORSE = ['serious', 'critical'];

function seriousViolations(results) {
  return results.violations.filter((v) => SERIOUS_OR_WORSE.includes(v.impact));
}

function describe(violations) {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join('\n');
}

test.describe('Accessibility (axe-core)', () => {
  test('radar view (#/) has no serious/critical violations', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('#articles .card').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).include('body').analyze();
    const serious = seriousViolations(results);
    expect(serious, describe(serious)).toHaveLength(0);
  });

  test('learn index (#/learn) has no serious/critical violations', async ({ page }) => {
    await page.goto('/#/learn');
    await expect(page.locator('.course-grid')).toBeVisible();
    const results = await new AxeBuilder({ page }).include('body').analyze();
    const serious = seriousViolations(results);
    expect(serious, describe(serious)).toHaveLength(0);
  });

  test('course view (#/learn/<slug>) has no serious/critical violations', async ({ page }) => {
    await page.goto('/#/learn/go-fintech');
    await expect(page.locator('.course-title')).toBeVisible();
    // Expand one milestone so its content (quiz included) is also scanned.
    await page.locator('.timeline-node').first().locator('.node-toggle').click();
    const results = await new AxeBuilder({ page }).include('body').analyze();
    const serious = seriousViolations(results);
    expect(serious, describe(serious)).toHaveLength(0);
  });
});
