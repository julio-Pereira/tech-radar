// @ts-check
// Conceitos transversais, Fase 3 (detour and return). Real compiled data:
//   A: seguranca-aplicacao/06 cites JWS   → owner seguranca-aplicacao/04
//   K: kafka/08 cites outbox              → owner arquitetura-eventos/08
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const A = '/#/learn/seguranca-aplicacao/federacao-e-sso';
const A_POINT = '#/learn/seguranca-aplicacao/federacao-e-sso/jws';
const A_LINK = '#c-federacao-e-sso-jws';
const A_OWNER = /#\/learn\/seguranca-aplicacao\/jose-por-dentro$/;

const K = '/#/learn/kafka/padroes-de-integracao';
const K_POINT = '#/learn/kafka/padroes-de-integracao/outbox';
const K_LINK = '#c-padroes-de-integracao-outbox';
const K_OWNER = /#\/learn\/arquitetura-eventos\/outbox-inbox-idempotencia$/;

const banner = (page) => page.locator('.desvio-banner');
const announcer = (page) => page.locator('#route-announcer');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/learn');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

async function detourFromA(page) {
  await page.goto(A);
  await page.locator(A_LINK).click();
  await expect(page).toHaveURL(A_OWNER);
}

test('following a concept shows the return banner on the owner, expanded', async ({ page }) => {
  await detourFromA(page);
  await expect(page.locator('.timeline-node[data-id="jose-por-dentro"] .node-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(banner(page)).toBeVisible();
  await expect(banner(page).locator('.desvio-voltar')).toHaveText('↩ Voltar para Segurança de Aplicação para Fintech › 06, no ponto JWS');
  await expect(banner(page).locator('.desvio-mais')).toHaveCount(0);
});

test('the banner returns to the exact term, with focus, highlight and announcement', async ({ page }) => {
  await detourFromA(page);
  await banner(page).locator('.desvio-voltar').click();
  await expect(page).toHaveURL(new RegExp(`${A_POINT}$`));
  const term = page.locator(A_LINK);
  await expect(term).toBeFocused();
  await expect(term).toHaveClass(/conceito-retorno/);
  await expect(term).toBeInViewport();
  await expect(announcer(page)).toHaveText('De volta a Segurança de Aplicação para Fintech, marco 06');
  // Back at the origin: no banner, and the returned focus doesn't pop the preview.
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator('.conceito-preview')).toHaveCount(0);
  // The highlight is temporary.
  await expect(term).not.toHaveClass(/conceito-retorno/, { timeout: 4000 });
});

test("the browser's Back button lands on the same point", async ({ page }) => {
  await detourFromA(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${A_POINT}$`));
  await expect(page.locator(A_LINK)).toBeFocused();
  await expect(banner(page)).toHaveCount(0);
});

test('the end of the owner milestone offers the way back', async ({ page }) => {
  await detourFromA(page);
  const end = page.locator('.timeline-node[data-id="jose-por-dentro"] .desvio-fim a');
  await expect(end).toContainText('Terminou? Voltar para onde parou');
  await end.click();
  await expect(page.locator(A_LINK)).toBeFocused();
});

test('a nested detour (2 levels) unwinds one level at a time', async ({ page }) => {
  await detourFromA(page);
  // From inside the first detour, a second one from another trilha.
  await page.goto(K);
  await page.locator(K_LINK).click();
  await expect(page).toHaveURL(K_OWNER);
  await expect(banner(page).locator('.desvio-voltar')).toContainText('Kafka para Fintech › 08');
  await expect(banner(page).locator('.desvio-mais')).toHaveText('(+1 desvio)');

  await banner(page).locator('.desvio-voltar').click();
  await expect(page).toHaveURL(new RegExp(`${K_POINT}$`));
  await expect(page.locator(K_LINK)).toBeFocused();
  // One detour still open: the banner now points at the first origin.
  await expect(banner(page).locator('.desvio-voltar')).toContainText('Segurança de Aplicação para Fintech › 06');
  await expect(banner(page).locator('.desvio-mais')).toHaveCount(0);

  await banner(page).locator('.desvio-voltar').click();
  await expect(page.locator(A_LINK)).toBeFocused();
  await expect(banner(page)).toHaveCount(0);
});

test('× discards the detour', async ({ page }) => {
  await detourFromA(page);
  await banner(page).locator('.desvio-fechar').click();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.locator('.desvio-fim')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.timeline-node').first()).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
});

test('a refresh in the middle of a detour keeps the banner', async ({ page }) => {
  await detourFromA(page);
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await banner(page).locator('.desvio-voltar').click();
  await expect(page.locator(A_LINK)).toBeFocused();
});

test('"Continuar" of the origin trilha does not move during a detour', async ({ page }) => {
  await page.goto(K); // deep link: kafka becomes the last course, marco 08 the last visited
  await expect(page.locator(K_LINK)).toBeVisible();
  await page.locator(K_LINK).click();
  await expect(page).toHaveURL(K_OWNER);
  await expect(banner(page)).toBeVisible();

  const stored = await page.evaluate(() => ({
    lastCourse: localStorage.getItem('tr:lastcourse'),
    kafka: localStorage.getItem('tr:lastvisited:kafka'),
    owner: localStorage.getItem('tr:lastvisited:arquitetura-eventos'),
  }));
  expect(stored).toEqual({ lastCourse: 'kafka', kafka: 'padroes-de-integracao', owner: null });

  await page.goto('/#/learn');
  await expect(page.locator('.continue-banner-title')).toContainText('Kafka');
});

test('a return point that no longer exists falls back to the marco', async ({ page }) => {
  await page.goto('/#/learn/seguranca-aplicacao/federacao-e-sso/conceito-que-nao-existe');
  await expect(page.locator('.timeline-node[data-id="federacao-e-sso"] .node-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('axe: the return banner has no serious/critical violations', async ({ page }) => {
  await detourFromA(page);
  await expect(banner(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).include('.desvio-banner').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the return highlight has no transition', async ({ page }) => {
    await detourFromA(page);
    await banner(page).locator('.desvio-voltar').click();
    const term = page.locator(A_LINK);
    await expect(term).toHaveClass(/conceito-retorno/);
    expect(await term.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  });
});
