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
    for (const tipo of ['topologia', 'sequencia', 'estados', 'fluxo']) {
      await expect(node.locator(`svg.diagrama-${tipo}`)).toHaveCount(1);
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

test.describe('Carga sob demanda', () => {
  // Its own page, without the injected fixture: nothing on screen has a
  // diagram, so neither the renderer nor any diagram data is fetched.
  test('diagram.js is not downloaded for a track without diagrams', async ({ browser }) => {
    const page = await browser.newPage();
    const requested = [];
    page.on('request', (r) => { if (r.url().includes('diagram.js') || r.url().includes('/data/diagramas/')) requested.push(r.url()); });
    await page.goto('/#/learn/go-fintech');
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
