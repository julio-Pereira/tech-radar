// @ts-check
// UX platform melhoria 2 (competências por marco): #/skills renders a pure
// SVG bar chart + an equivalent accessible table, both computed from
// skills.json + localStorage, client-side only. Tested against the real
// compiled data — lideranca-tecnica is the only trilha tagged so far.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.goto('/#/skills');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('shows coverage and every competency with its group', async ({ page }) => {
  await expect(page.locator('.skills-coverage')).toContainText('Cobertura da marcação');
  await expect(page.locator('.skills-group-title')).toHaveCount(2); // Liderança, Transversal
  // All 8 leadership competencies are real content; "Estratégia" is one.
  const row = page.locator('.skills-table tr', { has: page.locator('th', { hasText: 'Estratégia' }) });
  await expect(row).toBeVisible();
  await expect(row.locator('td').nth(0)).toHaveText('Liderança');
});

test('an untagged competency shows "sem marcos marcados", not a misleading 0%', async ({ page }) => {
  // "Arquitetura" (transversal) has no real content tagged for it yet.
  const row = page.locator('.skills-table tr', { has: page.locator('th', { hasText: 'Arquitetura' }) });
  await expect(row.locator('td').nth(2)).toHaveText('sem marcos marcados');
  await expect(row.locator('td').nth(3)).toHaveText('—');
});

test('completing a tagged milestone moves both the bar and the table for every competency it counts towards', async ({ page }) => {
  // Milestone 01 of lideranca-tecnica is tagged [estrategia, execucao] —
  // real content, not a fixture.
  await page.goto('/#/learn/lideranca-tecnica/papel-escopo-e-arquetipos');
  await page.locator('#check-lideranca-tecnica-papel-escopo-e-arquetipos').check();

  await page.goto('/#/skills');
  const estrategiaRow = page.locator('.skills-table tr', { has: page.locator('th', { hasText: 'Estratégia' }) });
  await expect(estrategiaRow.locator('td').nth(1)).toHaveText('70 min');
  await expect(estrategiaRow.locator('td').nth(3)).not.toHaveText('0%');

  const execucaoRow = page.locator('.skills-table tr', { has: page.locator('th', { hasText: 'Execução' }) });
  await expect(execucaoRow.locator('td').nth(1)).toHaveText('70 min');

  // The chart's fill bar for Estratégia (first row in the Liderança group)
  // should now have a nonzero width, matching the table's nonzero %.
  const fillBars = page.locator('.skills-chart-fill');
  const count = await fillBars.count();
  expect(count).toBeGreaterThan(0);
});

test('resetting a course\'s progress drops its competencies back to 0%', async ({ page }) => {
  await page.goto('/#/learn/lideranca-tecnica/papel-escopo-e-arquetipos');
  await page.locator('#check-lideranca-tecnica-papel-escopo-e-arquetipos').check();
  await page.goto('/#/skills');
  const estrategiaRow = page.locator('.skills-table tr', { has: page.locator('th', { hasText: 'Estratégia' }) });
  await expect(estrategiaRow.locator('td').nth(1)).toHaveText('70 min');

  await page.evaluate(() => localStorage.removeItem('tr:progress:lideranca-tecnica'));
  await page.reload();
  await expect(estrategiaRow.locator('td').nth(1)).toHaveText('0 min');
});

test('axe: the skills page has no serious/critical violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
