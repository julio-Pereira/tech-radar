// @ts-check
// Melhoria 8 (TASK-plat-melhorias-lideranca.md §8): the "Gabarito" block —
// closed by default, no done mark, state never persisted. No real course
// content uses the label yet, so every test here injects a synthetic
// handson section via route interception (same pattern as the
// sections-absent fallback test in reading.spec.js).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const SLUG = 'go-fintech';
const MILESTONE_ID = 'introducao';

/** Expands the timeline node for `milestoneId` and returns its locator. */
async function openMilestone(page, milestoneId) {
  const node = page.locator(`.timeline-node[data-id="${milestoneId}"]`);
  await node.locator('.node-toggle').click();
  return node;
}

/** Overrides one milestone's `sections` with a single synthetic handson block list. */
async function mockHandsonBlocks(page, blocks) {
  await page.route(`**/data/courses/${SLUG}.json`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const milestone = json.milestones.find((m) => m.id === MILESTONE_ID);
    milestone.sections = [
      { id: 'hands-on', title: 'Hands-on', kind: 'handson', intro: '', blocks },
    ];
    await route.fulfill({ response, json });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(() => localStorage.clear());
});

test('Gabarito is closed by default and shows the "tente antes" summary', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: 'critérios da rubrica', html: '<p>Considere custo total e prazo.</p>' },
  ]);
  await page.reload();
  const node = await openMilestone(page, MILESTONE_ID);

  const block = node.locator('.handson-block').filter({ has: page.locator('.handson-block-title:text("critérios da rubrica")') });
  await expect(block.locator('details')).toHaveJSProperty('open', false);
  await expect(block.locator('.handson-label')).toHaveText('Mostrar gabarito (tente antes)');
});

test('Gabarito has no done-mark button', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: '', html: '<p>Resposta esperada.</p>' },
  ]);
  await page.reload();
  const node = await openMilestone(page, MILESTONE_ID);

  const block = node.locator('.handson-block').first();
  await expect(block.locator('.handson-done-btn')).toHaveCount(0);
});

test('opens by click and by keyboard, and does not persist across reload', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: '', html: '<p>Resposta esperada.</p>' },
  ]);
  await page.reload();
  let node = await openMilestone(page, MILESTONE_ID);
  let block = node.locator('.handson-block').first();

  await block.locator('summary').click();
  await expect(block.locator('details')).toHaveJSProperty('open', true);

  // Reload — the open state must not have been written to storage.
  await page.reload();
  node = await openMilestone(page, MILESTONE_ID);
  block = node.locator('.handson-block').first();
  await expect(block.locator('details')).toHaveJSProperty('open', false);

  // Keyboard: Tab to the summary and press Enter.
  await block.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(block.locator('details')).toHaveJSProperty('open', true);
});

test('Gabarito is never the default-open block, even when listed first with no Tutorial', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: '', html: '<p>Resposta esperada.</p>' },
    { key: 'desafio', kind: 'desafio', title: '', html: '<p>Escolha build ou buy.</p>' },
  ]);
  await page.reload();
  const node = await openMilestone(page, MILESTONE_ID);
  const blocks = node.locator('.handson-block');

  await expect(blocks.nth(0).locator('details')).toHaveJSProperty('open', false); // gabarito
  await expect(blocks.nth(1).locator('details')).toHaveJSProperty('open', true); // desafio, the fallback default
});

test('a real Tutorial block still opens by default alongside a Gabarito', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: '', html: '<p>Resposta esperada.</p>' },
    { key: 'tutorial', kind: 'tutorial', title: '', html: '<p>Construa algo.</p>' },
  ]);
  await page.reload();
  const node = await openMilestone(page, MILESTONE_ID);
  const blocks = node.locator('.handson-block');

  await expect(blocks.nth(0).locator('details')).toHaveJSProperty('open', false); // gabarito
  await expect(blocks.nth(1).locator('details')).toHaveJSProperty('open', true); // tutorial
});

test('axe: an expanded Gabarito block has no serious/critical violations', async ({ page }) => {
  await mockHandsonBlocks(page, [
    { key: 'gabarito', kind: 'gabarito', title: 'critérios da rubrica', html: '<p>Considere custo total e prazo.</p>' },
  ]);
  await page.reload();
  const node = await openMilestone(page, MILESTONE_ID);
  await node.locator('.handson-block summary').click();

  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
