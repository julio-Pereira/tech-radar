// @ts-check
// Agenda dos desafios (jornada de entrevistas, Fase 4): the "Desafios"
// section of #/revisar and the "Desafio da semana" banner on #/learn,
// against the real pilot (pix-10k-tps, storage-eventos-pix,
// rate-limiter-concorrente).
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const DAY = 24 * 60 * 60 * 1000;

/** Completes every pre-requisite of the given desafios (from the compiled bank). */
async function completePrereqsOf(page, ids) {
  await page.evaluate(async (ids) => {
    const data = await (await fetch('./data/desafios.json')).json();
    const bySlug = {};
    for (const d of data.desafios.filter((x) => ids.includes(x.id))) {
      for (const p of d.prerequisitos) (bySlug[p.slug] ||= new Set()).add(p.marcoId);
    }
    for (const [slug, set] of Object.entries(bySlug)) localStorage.setItem(`tr:progress:${slug}`, JSON.stringify([...set]));
  }, ids);
}

async function setRodadas(page, rodadas, cadencia) {
  await page.evaluate(({ rodadas, cadencia }) => {
    localStorage.setItem('tr:desafios:v1', JSON.stringify({ rodadas, rascunhos: {}, ...(cadencia ? { cadencia } : {}) }));
  }, { rodadas, cadencia });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/revisar');
  await page.evaluate(() => localStorage.clear());
});

test('no pre-requisite completed: the queue offers nothing and says why', async ({ page }) => {
  await page.reload();
  const agenda = page.locator('.desafios-agenda');
  await expect(agenda).toContainText('Um desafio entra na fila quando todos os marcos de pré-requisito estão concluídos');
  await expect(agenda.locator('.desafios-agenda-item')).toHaveCount(0);
});

test('only desafios with every pre-requisite completed enter the queue', async ({ page }) => {
  await completePrereqsOf(page, ['storage-eventos-pix']);
  await page.reload();
  const items = page.locator('.desafios-agenda-item');
  // storage-eventos-pix shares system-design/02 with nothing else that is complete — pix and the LLD stay out.
  // Wait for the agenda to render (desafios.json loads async): evaluateAll does not retry.
  await expect(items).toHaveCount(1);
  const ids = await items.evaluateAll((els) => els.map((e) => /** @type {HTMLElement} */ (e).dataset.id));
  expect(ids).toEqual(['storage-eventos-pix']);
  await expect(items.first()).toContainText('nunca feito');
});

test('a round comes back after its interval: weak score 2 days, strong score 21', async ({ page }) => {
  await completePrereqsOf(page, ['storage-eventos-pix']);
  const now = Date.now();
  await setRodadas(page, { 'storage-eventos-pix': [{ seed: 1, at: new Date(now - DAY).toISOString(), verificadoPct: 40, autoPct: 0 }] });
  await page.reload();
  await expect(page.locator('.desafios-agenda-item')).toHaveCount(0); // due tomorrow

  await setRodadas(page, { 'storage-eventos-pix': [{ seed: 1, at: new Date(now - 3 * DAY).toISOString(), verificadoPct: 40, autoPct: 0 }] });
  await page.reload();
  await expect(page.locator('.desafios-agenda-item')).toContainText('voltou em');

  await setRodadas(page, { 'storage-eventos-pix': [{ seed: 1, at: new Date(now - 10 * DAY).toISOString(), verificadoPct: 95, autoPct: 0 }] });
  await page.reload();
  await expect(page.locator('.desafios-agenda-item')).toHaveCount(0); // 21 days
});

test('the queue link starts a new round with new parameters', async ({ page }) => {
  await completePrereqsOf(page, ['storage-eventos-pix']);
  await page.reload();
  await page.locator('.desafios-agenda-item a').click();
  await expect(page).toHaveURL(/#\/desafios\/storage-eventos-pix\/simulado\/\d+$/);
});

test('weekly target: the banner on #/learn shows until the target is met; the target is editable', async ({ page }) => {
  await completePrereqsOf(page, ['storage-eventos-pix', 'rate-limiter-concorrente']);
  await page.goto('/#/learn');
  const banner = page.locator('.desafio-semana-banner');
  await expect(banner).toContainText('Desafio da semana');
  await expect(banner).toHaveAttribute('href', /#\/desafios\/(storage-eventos-pix|rate-limiter-concorrente)\/simulado$/);

  // One round this week with the target at 1: met, no banner.
  await setRodadas(page, { 'rate-limiter-concorrente': [{ seed: 1, at: new Date().toISOString(), verificadoPct: 50, autoPct: 0 }] }, 1);
  await page.reload();
  await expect(page.locator('.course-grid')).toBeVisible();
  await expect(banner).toHaveCount(0);

  await page.goto('/#/revisar');
  await expect(page.locator('.desafios-agenda-ok')).toContainText('Meta da semana cumprida');
  await page.locator('#desafios-cadencia').fill('3');
  await page.locator('#desafios-cadencia').dispatchEvent('change');
  await expect(page.locator('.desafios-agenda-feitos')).toContainText('1 de 3');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tr:desafios:v1')).cadencia)).toBe(3);
  await page.goto('/#/learn');
  await expect(banner).toBeVisible();
});

test('axe: #/revisar with the desafios queue has no serious/critical violations', async ({ page }) => {
  await completePrereqsOf(page, ['storage-eventos-pix']);
  await page.reload();
  await expect(page.locator('.desafios-agenda-item')).toHaveCount(1);
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
