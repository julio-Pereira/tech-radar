// @ts-check
const { test, expect } = require('@playwright/test');
const { injectDiagramas, SLUG, IDS } = require('./helpers/diagramas');

const FIRST = 'log-distribuido';

/** Collects CSP violations reported by the browser. */
async function watchCsp(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}

async function openFirst(page) {
  const node = page.locator(`.timeline-node[data-id="${FIRST}"]`);
  await node.locator('.node-toggle').click();
  await expect(node.locator('figure.diagrama svg')).toHaveCount(IDS.length);
  return node;
}

test.beforeEach(async ({ page }) => {
  await watchCsp(page);
  await injectDiagramas(page);
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.describe('Diagramas tipados', () => {
  test('draws the four types with caption, description and no inline style', async ({ page }) => {
    const node = await openFirst(page);
    for (const tipo of ['topologia', 'sequencia', 'estados', 'fluxo', 'grafico']) {
      // exemplo-animado is a second topologia (diagram-player.spec.js).
      await expect(node.locator(`svg.diagrama-${tipo}`)).toHaveCount(tipo === 'topologia' ? 2 : 1);
    }
    const figure = node.locator('figure[data-diagrama="kafka/exemplo-topologia"]');
    const svg = figure.locator('svg');
    await expect(svg).toHaveAttribute('role', 'group');
    const labelledBy = await svg.getAttribute('aria-labelledby');
    const describedBy = await svg.getAttribute('aria-describedby');
    await expect(figure.locator(`figcaption#${labelledBy}`)).toHaveText('O evento sai do outbox, nunca direto do pix-gateway');
    await expect(figure.locator(`#${describedBy}`)).toContainText('mesma transação');
    await expect(figure.locator('.diagrama-no')).toHaveCount(5);
    // Failure and compensation carry a text marker, not just a color.
    await expect(node.locator('svg.diagrama-fluxo')).toContainText('✕ recusa');
    await expect(node.locator('svg.diagrama-fluxo')).toContainText('↩ compensar');
    // Presentation is CSS-only: no style attribute anywhere in the drawings.
    expect(await node.locator('figure.diagrama [style]').count()).toBe(0);
    // @ts-ignore
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('the textual description is there without the drawing', async ({ page }) => {
    const node = page.locator(`.timeline-node[data-id="${FIRST}"]`);
    await page.route('**/js/courses/diagram.js', (route) => route.abort());
    await node.locator('.node-toggle').click();
    const figure = node.locator('figure[data-diagrama="kafka/exemplo-estados"]');
    await expect(figure.locator('figcaption')).toHaveText('Um alerta só dispara depois de ficar pendente pelo tempo do for');
    await figure.locator('summary').click();
    await expect(figure.locator('.diagrama-descricao p')).toContainText('tempo do for');
    await expect(figure.locator('svg')).toHaveCount(0);
  });

  test('a concept node is reachable by keyboard and opens the owner milestone', async ({ page }) => {
    const node = await openFirst(page);
    const link = node.locator('a.diagrama-conceito[data-conceito="outbox"]');
    await expect(link).toHaveAttribute('href', /#\/learn\/arquitetura-eventos\//);
    let reached = false;
    for (let i = 0; i < 300 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await link.evaluate((el) => document.activeElement === el);
    }
    expect(reached, 'Tab never reached the concept node').toBe(true);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/learn\/arquitetura-eventos\//);
    // The detour recorded the node as the return point.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/learn/${SLUG}/${FIRST}/outbox$`));
    await expect(page.locator(`#c-${FIRST}-outbox`)).toBeFocused();
  });

  test('at 360px the page never scrolls sideways; the figure does', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openFirst(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const area = page.locator('figure[data-diagrama="kafka/exemplo-topologia"] .diagrama-area');
    const scrolls = await area.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrolls).toBe(true);
  });
});

test.describe('Ampliar e sinal de rolagem', () => {
  test('Ampliar opens a modal dialog that keeps focus and gives it back on Esc', async ({ page }) => {
    const node = await openFirst(page);
    const button = node.locator('figure[data-diagrama="kafka/exemplo-topologia"] button.diagrama-ampliar');
    await button.click();
    const dialog = page.locator('dialog.diagrama-dialogo');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2')).toHaveText('O evento sai do outbox, nunca direto do pix-gateway');
    await expect(dialog.locator('svg')).toHaveAttribute('aria-labelledby', 'diagrama-dialogo-titulo');
    await expect(dialog.locator('.diagrama-fechar')).toBeFocused();
    // Modal: Tab cycles inside the dialog, never into the page behind it.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('dialog'))).toBe(true);
    }
    await dialog.locator('.diagrama-ajustar').click();
    await expect(dialog.locator('.diagrama-ajustar')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    expect(await page.locator('dialog.diagrama-dialogo svg').count()).toBe(0);
  });

  test('a figure that scrolls says so in text, and is reachable by keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const node = await openFirst(page);
    const figure = node.locator('figure[data-diagrama="kafka/exemplo-topologia"]');
    await expect(figure).toHaveClass(/diagrama-rola/);
    await expect(figure.locator('.diagrama-dica')).toBeVisible();
    await expect(figure.locator('.diagrama-area')).toHaveAttribute('tabindex', '0');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(figure).not.toHaveClass(/diagrama-rola/);
    await expect(figure.locator('.diagrama-dica')).toBeHidden();
  });
});

test.describe('Tipo grafico', () => {
  test('the numbers are a table in the figure, and the source is named', async ({ page }) => {
    const node = page.locator(`.timeline-node[data-id="${FIRST}"]`);
    await page.route('**/js/courses/diagram.js', (route) => route.abort());
    await node.locator('.node-toggle').click();
    const figure = node.locator('figure[data-diagrama="kafka/exemplo-grafico"]');
    await figure.locator('.diagrama-dados summary').click();
    await expect(figure.locator('.diagrama-dados tbody tr')).toHaveCount(6);
    await expect(figure.locator('.diagrama-dados thead')).toContainText('sem cache (p99 (ms))');
    await expect(figure.locator('.diagrama-fonte')).toHaveText('Fonte: dados ilustrativos');
  });

  test('one Tab stop per chart; arrows move between points and announce values', async ({ page }) => {
    const node = await openFirst(page);
    const svg = node.locator('figure[data-diagrama="kafka/exemplo-grafico"] svg');
    const points = svg.locator('.diagrama-ponto');
    await expect(points).toHaveCount(12);
    await expect(svg.locator('.diagrama-ponto[tabindex="0"]')).toHaveCount(1);
    // Two series: different marker shapes, a legend, annotations drawn.
    await expect(svg.locator('.diagrama-serie-0 circle.diagrama-ponto')).toHaveCount(6);
    await expect(svg.locator('.diagrama-serie-1 rect.diagrama-ponto')).toHaveCount(6);
    await expect(svg.locator('.diagrama-legenda')).toContainText('com cache');
    await expect(svg).toContainText('SLO 300 ms');
    await points.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(points.nth(1)).toBeFocused();
    await expect(points.nth(1)).toHaveAttribute('aria-label', 'sem cache — hora do dia 9: 160 p99 (ms)');
    await page.keyboard.press('ArrowDown');
    await expect(points.nth(7)).toBeFocused();
    await expect(points.nth(7)).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('End');
    await expect(points.nth(11)).toBeFocused();
  });
});

test.describe('Carga sob demanda', () => {

  // Its own page, without the injected fixture: nothing on screen has a
  // diagram, so neither the renderer nor any diagram data is fetched.
  test('diagram.js is not downloaded for a track without diagrams', async ({ browser }) => {
    const page = await browser.newPage();
    const requested = [];
    page.on('request', (r) => { if (r.url().includes('diagram.js') || r.url().includes('/data/diagramas/')) requested.push(r.url()); });
    // Any track the build left without diagrams (picked from the data, so
    // the test survives each phase of the retrofit).
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '..', 'data', 'courses');
    const slug = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => f.slice(0, -5))
      .find((s) => !fs.readFileSync(path.join(dir, `${s}.json`), 'utf8').includes('data-diagrama='));
    test.skip(!slug, 'every track has diagrams now');
    await page.goto(`/#/learn/${slug}`);
    await page.locator('.timeline-node').first().locator('.node-toggle').click();
    await expect(page.locator('.timeline-node').first().locator('.milestone-body')).toBeVisible();
    expect(requested).toEqual([]);
    await page.close();
  });
});

test.describe('Mini-mapa "você está aqui"', () => {
  test('shows the track component between its neighbours and links to the full map', async ({ page }) => {
    const nav = page.locator('nav.minimapa');
    await expect(nav).toBeVisible();
    await expect(nav.locator('.diagrama-no--destaque')).toContainText('pix-stream');
    await expect(nav.locator('.minimapa-texto')).toContainText('Você está construindo o pix-stream');
    await nav.locator('a[href="#/fin-platform"]').click();
    await expect(page.locator('svg.capstone-map')).toBeVisible();
  });
});
