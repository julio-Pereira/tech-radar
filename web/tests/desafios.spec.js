// @ts-check
// Banco de desafios (jornada de entrevistas, Fases 2-3): #/desafios catalog,
// study mode and simulated mode, against the real compiled desafios.json
// (the 10 desafios of the bank),
// plus one mocked comportamental desafio for the privacy test.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

async function axeClean(page) {
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
}

/** The compiled desafio, and the expected value of each estimativa for a seed — computed by the app's own modules. */
async function expectedRound(page, id, seed) {
  return page.evaluate(async ({ id, seed }) => {
    const { drawParams, numericParams } = await import('./js/desafio-logic.js');
    const { evalFormula } = await import('./js/desafio-formula.js');
    const data = await (await fetch('./data/desafios.json')).json();
    const d = data.desafios.find((x) => x.id === id);
    const values = drawParams(d.parametros, seed);
    const vars = numericParams(values);
    return { d, values, expected: d.estimativas.map((e) => evalFormula(e.ast, vars)) };
  }, { id, seed });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/desafios');
  await page.evaluate(() => localStorage.clear());
});

test('the catalog lists the pilot, with filters and the lock from pre-requisites', async ({ page }) => {
  await page.reload();
  const cards = page.locator('.desafio-card');
  await expect(cards).toHaveCount(10);
  await expect(page.locator('.desafio-card[data-id="pix-10k-tps"] .desafio-lock')).toHaveText('Faltam 4 marcos');
  // Title placeholders show the range, never a drawn number.
  await expect(page.locator('.desafio-card[data-id="pix-10k-tps"] .course-card-title')).toContainText('2.000–20.000');

  await page.locator('#desafios-tipo').selectOption('lld');
  await expect(cards).toHaveCount(1);
  await page.locator('#desafios-tipo').selectOption('');
  await page.locator('#desafios-liberados').check();
  await expect(page.locator('.empty')).toContainText('Nenhum desafio com esses filtros');

  // Completing the four pre-requisites unlocks pix-10k-tps.
  const { d } = await expectedRound(page, 'pix-10k-tps', 1);
  await page.evaluate((prereqs) => {
    const bySlug = {};
    for (const p of prereqs) (bySlug[p.slug] ||= []).push(p.marcoId);
    for (const [slug, ids] of Object.entries(bySlug)) localStorage.setItem(`tr:progress:${slug}`, JSON.stringify(ids));
  }, d.prerequisitos);
  await page.reload();
  await expect(page.locator('.desafio-card[data-id="pix-10k-tps"] .desafio-unlocked')).toHaveText('Liberado');
  await page.locator('#desafios-liberados').check();
  await expect(cards).toHaveCount(1);
});

test('a simulated round without a seed gets one in the URL, and the same seed replays the same round', async ({ page }) => {
  await page.goto('/#/desafios/pix-10k-tps/simulado');
  await expect(page).toHaveURL(/#\/desafios\/pix-10k-tps\/simulado\/\d+$/);
  const title = await page.locator('.learn-title').innerText();
  await page.reload();
  await expect(page.locator('.learn-title')).toHaveText(title);

  await page.goto('/#/desafios/pix-10k-tps/simulado/42');
  const t42 = await page.locator('.learn-title').innerText();
  await page.goto('/#/desafios');
  await page.goto('/#/desafios/pix-10k-tps/simulado/42');
  await expect(page.locator('.learn-title')).toHaveText(t42);
  const { values } = await expectedRound(page, 'pix-10k-tps', 42);
  expect(t42).toContain(new Intl.NumberFormat('pt-BR').format(values.tpsPico));
});

test('only the questions asked are answered; missed key questions show at the end', async ({ page }) => {
  await page.goto('/#/desafios/pix-10k-tps/simulado/7');
  await page.locator('#desafio-sem-timer').check();
  const answers = page.locator('.desafio-resposta');
  await expect(answers.first()).toBeHidden();
  await page.locator('.desafio-pergunta button', { hasText: 'pico ou a média' }).click();
  await expect(answers.first()).toBeVisible();
  await expect(answers.nth(1)).toBeHidden();

  await page.locator('.desafio-finish').click();
  const missed = page.locator('.desafio-section', { hasText: 'Perguntas-chave' });
  await expect(missed).toContainText('Existe exigência de retenção');
  await expect(missed).not.toContainText('pico ou a média');
});

test('correction: verified and self-assessed are separate numbers, and the round is recorded', async ({ page }) => {
  const seed = 123;
  const { d, expected } = await expectedRound(page, 'pix-10k-tps', seed);
  await page.goto(`/#/desafios/pix-10k-tps/simulado/${seed}`);
  await page.locator('#desafio-sem-timer').check();

  for (let i = 0; i < d.estimativas.length; i++) {
    await page.locator(`#est-${d.estimativas[i].id}`).fill(String(expected[i]).replace('.', ','));
  }
  for (let i = 0; i < d.decisoes.length; i++) {
    await page.locator(`#dec-${i}-${d.decisoes[i].correta}`).check();
  }
  await page.locator('#desafio-entregavel').fill(d.entregavel.secoesObrigatorias.map((s) => `## ${s}\ntexto\n`).join('\n'));
  await page.locator('.desafio-finish').click();

  const total = d.estimativas.length + d.decisoes.length + d.entregavel.secoesObrigatorias.length;
  const rubricas = d.rubrica.length + d.reviravolta.rubrica.length;
  await expect(page.locator('.desafio-score-verificado')).toHaveText(`Verificado: ${total} de ${total} (100%)`);
  await expect(page.locator('.desafio-score-auto')).toHaveText(`Autoavaliado: 0 de ${rubricas} (0%)`);
  await page.locator('#rub-0').check();
  await expect(page.locator('.desafio-score-verificado')).toHaveText(`Verificado: ${total} de ${total} (100%)`);
  await expect(page.locator('.desafio-score-auto')).toContainText(`1 de ${rubricas}`);
  // The commented answer key comes last, after the rubrica.
  await expect(page.locator('.desafio-result > .desafio-gabarito')).toBeVisible();

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('tr:desafios:v1')));
  expect(state.rodadas['pix-10k-tps']).toEqual([expect.objectContaining({ seed, verificadoPct: 100, autoPct: Math.round(100 / rubricas) })]);
  // Per-part breakdown for the readiness radar: verified items only.
  expect(state.rodadas['pix-10k-tps'][0].partes).toEqual({
    estimativas: { acertos: d.estimativas.length, total: d.estimativas.length },
    decisoes: { acertos: d.decisoes.length, total: d.decisoes.length },
    entregavel: { acertos: d.entregavel.secoesObrigatorias.length, total: d.entregavel.secoesObrigatorias.length },
  });
});

test('a wrong estimate outside the tolerance is marked wrong', async ({ page }) => {
  const { d, expected } = await expectedRound(page, 'storage-eventos-pix', 5);
  await page.goto('/#/desafios/storage-eventos-pix/simulado/5');
  await page.locator('#desafio-sem-timer').check();
  await page.locator(`#est-${d.estimativas[0].id}`).fill(String(expected[0] * 2));
  await page.locator('.desafio-finish').click();
  await expect(page.locator('.desafio-check-list li').first()).toHaveClass(/nok/);
});

test('the twist appears at its moment on the clock; pause stops the clock; no-timer offers a button', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#/desafios/pix-10k-tps/simulado/9');
  const twist = page.locator('.desafio-reviravolta');
  await expect(twist).toHaveAttribute('aria-live', 'polite');
  await page.clock.runFor(26 * 60 * 1000); // 45 min × 60% = 27 min
  await expect(twist).toBeEmpty();
  await page.locator('.desafio-pause').click();
  await page.clock.runFor(5 * 60 * 1000);
  await expect(twist).toBeEmpty(); // paused: the round clock did not move
  await page.locator('.desafio-pause').click();
  await page.clock.runFor(2 * 60 * 1000);
  await expect(twist).toContainText('RPO zero');
  await expect(page.locator('.desafio-clock')).toContainText('Aprofundar');

  await page.goto('/#/desafios/pix-10k-tps/simulado/10');
  await page.locator('#desafio-sem-timer').check();
  await expect(page.locator('.desafio-clock')).toBeHidden();
  await page.locator('.desafio-twist-btn').click();
  await expect(page.locator('.desafio-reviravolta')).toContainText('RPO zero');
});

test('the draft survives a reload of the same round', async ({ page }) => {
  await page.goto('/#/desafios/pix-10k-tps/simulado/77');
  await page.locator('#desafio-entregavel').fill('## Requisitos\nmeu rascunho\n');
  await page.reload();
  await expect(page.locator('#desafio-entregavel')).toHaveValue('## Requisitos\nmeu rascunho\n');
});

test('study mode shows clarifications, hints, the LLD code and the answer key on demand', async ({ page }) => {
  await page.goto('/#/desafios/rate-limiter-concorrente');
  await expect(page).toHaveURL(/estudo\/\d+$/);
  await expect(page.locator('.desafio-codigo')).toContainText('go test -race ./...');
  await expect(page.locator('.desafio-codigo')).toContainText('mvn -q test');
  await expect(page.locator('.desafio-gabarito')).not.toHaveAttribute('open', '');
  await page.locator('.desafio-gabarito summary').click();
  await expect(page.locator('.desafio-gabarito .desafio-prose')).toBeVisible();

  await page.goto('/#/desafios/pix-10k-tps/estudo/3');
  await expect(page.locator('.desafio-esclarecimentos dd').first()).toBeVisible();
  await expect(page.locator('.desafio-esclarecimentos .desafio-chave').first()).toBeVisible();
});

test('behavioural answers never leave the browser', async ({ page }) => {
  const SECRET = 'segredo-pessoal-de-terceiro-xyz';
  const fixture = {
    id: 'decisao-contestada', titulo: 'Decisão contestada', tipo: 'comportamental', nivel: 'senior', duracaoMin: 20,
    prerequisitos: [], conceitos: [], parametros: {}, enunciadoHtml: '<p>Conte uma decisão contestada.</p>',
    gabaritoHtml: '<p>STAR.</p>', esclarecimentos: [], estimativas: [], decisoes: [],
    entregavel: { secoesObrigatorias: ['Situação', 'Tarefa', 'Ação', 'Resultado', 'Aprendizado'] },
    rubrica: ['a', 'b', 'c', 'd', 'e'],
  };
  await page.route('**/data/desafios.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ desafios: [fixture] }),
  }));
  const leaks = [];
  page.on('request', (req) => {
    if (req.url().includes(SECRET) || (req.postData() || '').includes(SECRET)) leaks.push(req.url());
  });

  await page.goto('/#/desafios/decisao-contestada/simulado/1');
  await page.locator('#desafio-entregavel').fill(`## Situação\n${SECRET}\n## Tarefa\nx\n## Ação\ny\n## Resultado\nz\n## Aprendizado\nw`);
  await expect(page.locator('.desafio-tempo-fala')).toContainText('Tempo de fala estimado');
  await page.locator('.desafio-finish').click();
  await expect(page.locator('.desafio-score-verificado')).toHaveText('Verificado: 5 de 5 (100%)');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.desafio-export').click()]);
  expect(download.suggestedFilename()).toBe('decisao-contestada-1.md');
  await page.goto('/#/desafios');
  expect(leaks).toEqual([]);
  // It is kept, but only locally.
  expect(await page.evaluate(() => localStorage.getItem('tr:desafios:v1'))).toContain(SECRET);
});

test('an unknown desafio says so', async ({ page }) => {
  await page.goto('/#/desafios/nao-existe');
  await expect(page.locator('#view-learn .error')).toHaveText('Desafio não encontrado.');
});

test('axe: catalog, study, simulated and correction have no serious/critical violations', async ({ page }) => {
  await page.reload();
  await expect(page.locator('.desafio-card').first()).toBeVisible();
  await axeClean(page);
  await page.goto('/#/desafios/pix-10k-tps/estudo/4');
  await expect(page.locator('.desafio-estudo')).toBeVisible();
  await axeClean(page);
  await page.goto('/#/desafios/pix-10k-tps/simulado/4');
  await page.locator('.desafio-pergunta button').first().click();
  await axeClean(page);
  await page.locator('.desafio-finish').click();
  await expect(page.locator('.desafio-score')).toBeVisible();
  await axeClean(page);
});

test('phone width: no horizontal page scroll in catalog and simulated round', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const hash of ['#/desafios', '#/desafios/pix-10k-tps/simulado/4', '#/desafios/rate-limiter-concorrente/estudo/4']) {
    await page.goto('/' + hash);
    await expect(page.locator('.course-view')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});

test('every desafio of the bank renders in both modes, without console errors, and passes axe', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ids = await page.evaluate(async () => (await (await fetch('./data/desafios.json')).json()).desafios.map((d) => d.id));
  expect(ids.length).toBe(10);
  for (const id of ids) {
    await page.goto(`/#/desafios/${id}/estudo/11`);
    await expect(page.locator('.desafio-estudo .learn-title')).not.toContainText('{');
    await page.goto(`/#/desafios/${id}/simulado/11`);
    await expect(page.locator('.desafio-simulado .learn-title')).not.toContainText('{');
    await page.locator('#desafio-sem-timer').check();
    await page.locator('.desafio-finish').click();
    await expect(page.locator('.desafio-score-verificado')).toBeVisible();
    await expect(page.locator('.desafio-result')).not.toContainText(/\{[A-Za-z]+\}/); // every placeholder filled
    await axeClean(page);
  }
  expect(errors).toEqual([]);
});
