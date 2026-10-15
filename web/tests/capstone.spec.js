// @ts-check
// UX platform melhoria 7, phase 1: #/fin-platform renders the capstone
// component map (SVG boxes + arrows) plus an equivalent accessible table
// and an artifacts list. Tested against the real compiled capstones.json —
// 18 real components with a real dependency graph.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('renders a box per real component and an equivalent accessible table', async ({ page }) => {
  await page.goto('/#/fin-platform');
  await expect(page.locator('.capstone-map')).toBeVisible();
  await expect(page.locator('.capstone-box')).toHaveCount(18);
  await expect(page.locator('.capstone-table tbody tr')).toHaveCount(18);

  // A real leaf (no dependencies) and a real multi-dependency component.
  const leafRow = page.locator('.capstone-table tr', { has: page.locator('th', { hasText: 'pix-gateway' }) });
  await expect(leafRow.locator('td').nth(1)).toHaveText('—');

  const depRow = page.locator('.capstone-table tr', { has: page.locator('th', { hasText: 'fin-blueprint' }) });
  await expect(depRow.locator('td').nth(1)).toContainText('pix-gateway');
});

test('the map SVG is decorative (aria-hidden) since the table already carries the data accessibly', async ({ page }) => {
  await page.goto('/#/fin-platform');
  await expect(page.locator('.capstone-map')).toHaveAttribute('aria-hidden', 'true');
});

test('lists artifacts per component without claiming they were checked', async ({ page }) => {
  await page.goto('/#/fin-platform');
  await expect(page.locator('.capstone-artifacts')).toContainText('nada aqui é executado automaticamente');
  const entry = page.locator('.capstone-artifacts-list dt', { hasText: 'fin-store' });
  await expect(entry).toBeVisible();
});

test('axe: the capstone map page has no serious/critical violations', async ({ page }) => {
  await page.goto('/#/fin-platform');
  await expect(page.locator('.capstone-box').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
