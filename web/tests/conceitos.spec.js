// @ts-check
// Conceitos transversais, Fase 2 (the preview): a concept link previews its
// definition and owner on hover (300 ms), keyboard focus, or a first tap.
// Tested against the real compiled data: seguranca-aplicacao/06 cites "JWS",
// whose owner is seguranca-aplicacao/04 (JOSE por dentro).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const CITING = '/#/learn/seguranca-aplicacao/federacao-e-sso';
const LINK = '#c-federacao-e-sso-jws';
const OWNER_NODE = '.timeline-node[data-id="jose-por-dentro"]';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/learn');
  await page.evaluate(() => localStorage.clear());
});

test('conceitos.json is not fetched until a concept link is used', async ({ page }) => {
  const requests = [];
  page.on('request', (req) => {
    if (req.url().includes('conceitos.json')) requests.push(req.url());
  });
  await page.goto(CITING);
  const link = page.locator(LINK);
  await expect(link).toBeVisible();
  expect(requests).toHaveLength(0);

  await link.hover();
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.locator('.conceito-preview')).toBeVisible();
  // A second interaction reuses the in-memory catalog.
  await page.mouse.move(0, 0);
  await expect(page.locator('.conceito-preview')).toHaveCount(0);
  await link.hover();
  await expect(page.locator('.conceito-preview')).toBeVisible();
  expect(requests).toHaveLength(1);
});

test('hover shows the definition, the owner and its real duration', async ({ page }) => {
  await page.goto(CITING);
  await page.locator(LINK).hover();
  const preview = page.locator('.conceito-preview');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.conceito-preview-termo')).toHaveText('JWS (JSON Web Signature)');
  await expect(preview.locator('.conceito-preview-resumo')).not.toBeEmpty();
  await expect(preview.locator('.conceito-preview-dono')).toContainText('Aprofundar em: Segurança de Aplicação para Fintech › 04 · JOSE por dentro');
  await expect(preview.locator('.conceito-preview-dono')).toContainText('60 min');
  await expect(preview.locator('.conceito-preview-ir')).toHaveAttribute('href', '#/learn/seguranca-aplicacao/jose-por-dentro');
  await expect(preview.locator('.conceito-preview-glossario')).toHaveAttribute('href', /^#\/glossario\/.+/);

  // Leaving the term closes it.
  await page.mouse.move(0, 0);
  await expect(preview).toHaveCount(0);
});

test('a quick pass over the term does not open the preview (300 ms delay)', async ({ page }) => {
  await page.goto(CITING);
  const box = await page.locator(LINK).boundingBox();
  if (!box) throw new Error('no link box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await expect(page.locator('.conceito-preview')).toHaveCount(0);
});

test('leaving the term while the catalog is still loading opens nothing afterwards', async ({ page }) => {
  await page.route('**/data/conceitos.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto(CITING);
  await page.locator(LINK).hover();
  await page.waitForTimeout(450); // past the 300 ms hover delay: open() is waiting on the fetch
  await page.mouse.move(0, 0);
  await page.waitForTimeout(1500); // the fetch has resolved by now
  await expect(page.locator('.conceito-preview')).toHaveCount(0);
});

test('the preview says when the owner milestone is already done', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('tr:progress:seguranca-aplicacao', JSON.stringify(['jose-por-dentro'])));
  await page.goto(CITING);
  await page.locator(LINK).hover();
  await expect(page.locator('.conceito-preview-feito')).toHaveText('✓ você já concluiu');
});

test('keyboard focus opens it, describes the link, Tab reaches its links, Esc closes', async ({ page }) => {
  await page.goto(CITING);
  const link = page.locator(LINK);
  await link.focus();
  const preview = page.locator('.conceito-preview');
  await expect(preview).toBeVisible();
  await expect(link).toHaveAttribute('aria-describedby', 'conceito-preview-resumo');

  // The preview sits right after the term, so Tab walks into its links and
  // the preview stays open while focus is inside it.
  await page.keyboard.press('Tab');
  await expect(page.locator('.conceito-preview a:focus')).toHaveCount(1);
  await expect(preview).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(link).toBeFocused();
  await expect(link).not.toHaveAttribute('aria-describedby', /.+/);
});

test('clicking the term navigates to the owner milestone, expanded', async ({ page }) => {
  await page.goto(CITING);
  await page.locator(LINK).click();
  await expect(page).toHaveURL(/#\/learn\/seguranca-aplicacao\/jose-por-dentro$/);
  await expect(page.locator(`${OWNER_NODE} .node-toggle`)).toHaveAttribute('aria-expanded', 'true');
});

test('axe: an open preview has no serious/critical violations', async ({ page }) => {
  await page.goto(CITING);
  await page.locator(LINK).focus();
  await expect(page.locator('.conceito-preview')).toBeVisible();
  const results = await new AxeBuilder({ page }).include('.conceito-preview').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('the first tap previews without navigating; "Ir para o marco" navigates', async ({ page }) => {
    await page.goto(CITING);
    await page.locator(LINK).tap();
    const preview = page.locator('.conceito-preview');
    await expect(preview).toBeVisible();
    await expect(page).toHaveURL(/federacao-e-sso$/);

    const go = preview.locator('.conceito-preview-ir');
    const box = await go.boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(44);
    await go.tap();
    await expect(page).toHaveURL(/#\/learn\/seguranca-aplicacao\/jose-por-dentro$/);
  });

  test('a second tap on the same term navigates', async ({ page }) => {
    await page.goto(CITING);
    const link = page.locator(LINK);
    await link.tap();
    await expect(page.locator('.conceito-preview')).toBeVisible();
    await link.tap();
    await expect(page).toHaveURL(/#\/learn\/seguranca-aplicacao\/jose-por-dentro$/);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the preview opens without animation', async ({ page }) => {
    await page.goto(CITING);
    await page.locator(LINK).focus();
    const preview = page.locator('.conceito-preview');
    await expect(preview).toBeVisible();
    expect(await preview.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});
