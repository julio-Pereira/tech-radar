// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const SLUG = 'go-fintech';

/** Expands the timeline node for `milestoneId` and returns its locator. */
async function openMilestone(page, milestoneId) {
  const node = page.locator(`.timeline-node[data-id="${milestoneId}"]`);
  await node.locator('.node-toggle').click();
  return node;
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe('Hands-on blocks: default open state', () => {
  test('Tutorial opens by default, siblings stay closed', async ({ page }) => {
    // fundamentos has tutorial, invariantes, complemento.
    const node = await openMilestone(page, 'fundamentos');
    const blocks = node.locator('.handson-block');
    await expect(blocks.filter({ has: page.locator('.handson-label:text("Tutorial")') }).locator('details')).toHaveJSProperty('open', true);
    await expect(blocks.filter({ has: page.locator('.handson-label:text("Invariantes testáveis")') }).locator('details')).toHaveJSProperty('open', false);
    await expect(blocks.filter({ has: page.locator('.handson-label:text("Complemento")') }).locator('details')).toHaveJSProperty('open', false);
  });

  test('without a Tutorial block, the first block opens instead', async ({ page }) => {
    // concorrencia has desafio, invariantes, checagem — no tutorial.
    const node = await openMilestone(page, 'concorrencia');
    const blocks = node.locator('.handson-block');
    await expect(blocks.filter({ has: page.locator('.handson-label:text("Desafio")') }).locator('details')).toHaveJSProperty('open', true);
    await expect(blocks.filter({ has: page.locator('.handson-label:text("Checagem")') }).locator('details')).toHaveJSProperty('open', false);
  });
});

test.describe('Hands-on blocks: open state persists', () => {
  test('closing the default and opening a sibling survives a reload', async ({ page }) => {
    const node = await openMilestone(page, 'fundamentos');
    const tutorialDetails = node.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Tutorial")') }).locator('details');
    const complementoDetails = node.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Complemento")') }).locator('details');

    await tutorialDetails.locator('summary').click(); // close the default-open one
    await complementoDetails.locator('summary').click(); // open a different one

    await page.reload();
    const reopened = await openMilestone(page, 'fundamentos');
    const tutorialAfter = reopened.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Tutorial")') }).locator('details');
    const complementoAfter = reopened.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Complemento")') }).locator('details');
    const invariantesAfter = reopened.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Invariantes testáveis")') }).locator('details');

    await expect(tutorialAfter).toHaveJSProperty('open', false);
    await expect(complementoAfter).toHaveJSProperty('open', true);
    // Never touched, and the milestone was already "seen" — must not snap
    // back to some other default now that Tutorial itself was closed.
    await expect(invariantesAfter).toHaveJSProperty('open', false);
  });
});

test.describe('Hands-on blocks: done mark', () => {
  test('marking a block done is cosmetic only — it never touches the milestone checkbox', async ({ page }) => {
    const node = await openMilestone(page, 'fundamentos');
    const tutorialBlock = node.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Tutorial")') });
    const doneBtn = tutorialBlock.locator('.handson-done-btn');

    await expect(doneBtn).toHaveAttribute('aria-pressed', 'false');
    await doneBtn.click();
    await expect(doneBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(doneBtn).toHaveText('Feito ✓');

    const milestoneCheckbox = node.locator('.node-check');
    await expect(milestoneCheckbox).not.toBeChecked();

    // Clicking "done" must not also toggle the <details> open/closed.
    await expect(tutorialBlock.locator('details')).toHaveJSProperty('open', true);
  });

  test('done mark persists across a reload', async ({ page }) => {
    const node = await openMilestone(page, 'fundamentos');
    await node.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Complemento")') }).locator('.handson-done-btn').click();

    await page.reload();
    const reopened = await openMilestone(page, 'fundamentos');
    const doneBtn = reopened.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Complemento")') }).locator('.handson-done-btn');
    await expect(doneBtn).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Hands-on blocks: content and fallback', () => {
  test('block title and body render, label text is not duplicated into the body', async ({ page }) => {
    const node = await openMilestone(page, 'introducao');
    const tutorialBlock = node.locator('.handson-block').filter({ has: page.locator('.handson-label:text("Tutorial")') });
    await expect(tutorialBlock.locator('.handson-block-title')).toHaveText('nascer o walletctl');
    await expect(tutorialBlock.locator('.section-prose')).not.toContainText('Tutorial');
    await expect(tutorialBlock.locator('.section-prose')).toContainText('Inicialize o módulo');
  });

  test('a milestone with no sections field falls back to the raw html blob', async ({ page }) => {
    await page.route(`**/data/courses/${SLUG}.json`, async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      for (const m of json.milestones) delete m.sections;
      await route.fulfill({ response, json });
    });
    await page.reload(); // same URL as beforeEach's — goto() would be a no-op
    const node = await openMilestone(page, 'introducao');
    await expect(node.locator('.milestone-body')).toContainText('nascer o');
    await expect(node.locator('.handson-block')).toHaveCount(0);
  });
});

test('axe: expanded hands-on blocks have no serious/critical violations', async ({ page }) => {
  await openMilestone(page, 'fundamentos');
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
