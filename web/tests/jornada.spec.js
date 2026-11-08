// @ts-check
// Jornada entrevista-senior (PLANO-jornada-entrevistas, Fase 8): the real
// compiled path in content/paths, its desafio-bank step and the readiness
// radar, computed only from the verified part of each latest round.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = '/#/paths/entrevista-senior';

async function setRodadas(page, rodadas) {
  await page.evaluate((rodadas) => {
    localStorage.setItem('tr:desafios:v1', JSON.stringify({ rodadas, rascunhos: {} }));
  }, rodadas);
}

const parte = (acertos, total) => ({ acertos, total });

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('the path starts at the interview milestone and ends with the desafio bank', async ({ page }) => {
  await expect(page.locator('.course-title')).toContainText('Preparação para entrevistas');
  const first = page.locator('.path-step').first().locator('.path-step-link');
  await expect(first).toHaveAttribute('href', /^#\/learn\/system-design\/[a-z0-9-]+$/);
  await expect(first).toContainText('entrevista');

  const groups = await page.locator('.path-group-title').allTextContents();
  expect(groups).toEqual([
    'Ponto de entrada', 'Revisar fundamentos de HLD', 'Framework de estudo de caso', 'Código e LLD',
    'Domínio fintech como diferencial', 'Liderança e comportamental', 'Prática contínua', 'Radar de prontidão',
  ]);

  const bank = page.locator('.path-step-desafios');
  await expect(bank.locator('.path-step-link')).toHaveAttribute('href', '#/desafios');
  await expect(bank.locator('.path-step-title')).toHaveText('Banco de desafios — 10 desafios');
  await expect(bank.locator('.path-step-meta')).toHaveText('0 de 10 praticados · 0 liberados');
});

test('the bank step counts desafios unlocked by completed pre-requisites and practiced ones', async ({ page }) => {
  await page.evaluate(async () => {
    const data = await (await fetch('./data/desafios.json')).json();
    const d = data.desafios.find((x) => x.id === 'storage-eventos-pix');
    const bySlug = {};
    for (const p of d.prerequisitos) (bySlug[p.slug] ||= []).push(p.marcoId);
    for (const [slug, ids] of Object.entries(bySlug)) localStorage.setItem(`tr:progress:${slug}`, JSON.stringify(ids));
  });
  await setRodadas(page, { 'storage-eventos-pix': [{ seed: 1, at: '2026-11-01T10:00:00Z', verificadoPct: 50, autoPct: 0 }] });
  await page.reload();
  await expect(page.locator('.path-step-desafios .path-step-meta')).toHaveText('1 de 10 praticados · 1 liberado');
  await expect(page.locator('.path-step-desafios')).not.toHaveClass(/done/);
});

test('the bank step is done once every desafio has a round', async ({ page }) => {
  await page.evaluate(async () => {
    const data = await (await fetch('./data/desafios.json')).json();
    const rodadas = Object.fromEntries(data.desafios.map((d) => [d.id, [{ seed: 1, at: '2026-11-01T10:00:00Z', verificadoPct: 10, autoPct: 0 }]]));
    localStorage.setItem('tr:desafios:v1', JSON.stringify({ rodadas, rascunhos: {} }));
  });
  await page.reload();
  await expect(page.locator('.path-step-desafios')).toHaveClass(/done/);
  await expect(page.locator('.path-step-desafios .path-step-meta')).toContainText('Concluído');
});

test('radar: no round yet says so on every axis and draws no value polygon', async ({ page }) => {
  const items = page.locator('.path-radar-list li');
  await expect(items).toHaveCount(5);
  for (const t of await items.allTextContents()) expect(t).toContain('sem rodada ainda');
  await expect(page.locator('.path-radar-value')).toHaveCount(0);
});

test('radar: only the verified parts of the latest round count, split by axis', async ({ page }) => {
  await setRodadas(page, {
    // system design in the fintech domain: estimates → estimativa; decisions + deliverable → HLD; decisions → domínio.
    'ledger-multimoeda': [
      { seed: 1, at: '2026-10-01T10:00:00Z', verificadoPct: 0, autoPct: 0, partes: { estimativas: parte(0, 2), decisoes: parte(0, 3), entregavel: parte(0, 6) } },
      { seed: 2, at: '2026-11-01T10:00:00Z', verificadoPct: 82, autoPct: 0, partes: { estimativas: parte(1, 2), decisoes: parte(3, 3), entregavel: parte(5, 6) } },
    ],
    // self-assessed 100% must not lift the behavioural axis.
    'decisao-contestada': [{ seed: 1, at: '2026-11-02T10:00:00Z', verificadoPct: 40, autoPct: 100, partes: { estimativas: parte(0, 0), decisoes: parte(0, 0), entregavel: parte(2, 5) } }],
  });
  await page.reload();
  const axis = (id) => page.locator(`.path-radar-list li[data-eixo="${id}"]`);
  await expect(axis('hld')).toHaveText('HLD: 89% (8 de 9 itens, 1 desafio)');
  await expect(axis('estimativa')).toHaveText('Estimativa: 50% (1 de 2 itens, 1 desafio)');
  await expect(axis('dominio')).toHaveText('Domínio: 100% (3 de 3 itens, 1 desafio)');
  await expect(axis('comportamental')).toHaveText('Comportamental: 40% (2 de 5 itens, 1 desafio)');
  await expect(axis('lld')).toHaveText('LLD: sem rodada ainda');
  await expect(page.locator('.path-radar-value')).toHaveCount(1);
});

test('radar: a round finished in the simulated mode feeds the radar', async ({ page }) => {
  await page.goto('/#/desafios/decisao-contestada/simulado/7');
  await page.locator('#desafio-sem-timer').check();
  await page.locator('#desafio-entregavel').fill('## Situação\ntexto\n\n## Tarefa\ntexto\n');
  await page.locator('.desafio-finish').click();
  await expect(page.locator('.desafio-score-verificado')).toBeVisible();
  await page.goto(URL);
  await expect(page.locator('.path-radar-list li[data-eixo="comportamental"]')).toHaveText('Comportamental: 40% (2 de 5 itens, 1 desafio)');
});

test('the radar svg is decorative; the list carries the numbers; axe passes', async ({ page }) => {
  await expect(page.locator('.path-radar-svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.path-radar')).toHaveAttribute('aria-labelledby', 'path-radar-title');
  const results = await new AxeBuilder({ page }).include('#view-learn').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
});

test('the paths index lists the interview path', async ({ page }) => {
  await page.goto('/#/paths');
  await expect(page.locator('a.course-card[href="#/paths/entrevista-senior"] .course-card-meta')).toContainText('32 etapas');
});

test('phone width: no horizontal page scroll on the path with the radar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.locator('.path-radar')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
