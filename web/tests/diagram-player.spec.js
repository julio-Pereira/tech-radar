// @ts-check
// Step player (PLANO Fase 1.6) on the animated fixture, injected into the
// first kafka milestone like the other diagram fixtures.
const { test, expect } = require('@playwright/test');
const { injectDiagramas, SLUG } = require('./helpers/diagramas');

const FIRST = 'log-distribuido';
const ID = 'kafka/exemplo-animado';

async function open(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await injectDiagramas(page);
  await page.goto(`/#/learn/${SLUG}`);
  await page.locator(`.timeline-node[data-id="${FIRST}"] .node-toggle`).click();
  const figure = page.locator(`figure[data-diagrama="${ID}"]`);
  await expect(figure.locator('.diagrama-player')).toBeVisible();
  return figure;
}

test.describe('Player de diagrama animado', () => {
  test('starts paused on step 1 and steps by mouse, announcing each legend', async ({ page }) => {
    const figure = await open(page);
    const legend = figure.locator('.diagrama-legenda');
    await expect(figure.locator('.diagrama-player-posicao')).toHaveText('passo 1 de 4');
    await expect(legend).toHaveText('Só o pod v1 atende');
    await expect(legend).toHaveAttribute('aria-live', 'polite');
    await expect(figure.locator('.diagrama-player-play')).toHaveAttribute('aria-label', 'Reproduzir');
    await expect(figure.locator('.diagrama-player-anterior')).toHaveAttribute('aria-disabled', 'true');
    // Nothing advances on its own.
    await page.waitForTimeout(3000);
    await expect(figure.locator('.diagrama-player-posicao')).toHaveText('passo 1 de 4');

    await figure.locator('.diagrama-player-proximo').click();
    await expect(legend).toHaveText('O pod v2 sobe, ainda fora do Service');
    const v2 = figure.locator('[data-id="v2"]');
    await expect(v2).toHaveClass(/diagrama-est-novo/);
    // The state has a text mark, not only a color.
    await expect(v2.locator('.diagrama-no-rotulo')).toHaveText('+ v2 · iniciando');

    await figure.locator('.diagrama-player-proximo').click();
    // A flow's label replaces the edge label only in its step.
    await expect(figure.locator('[data-aresta="svc>v2"] .diagrama-aresta-rotulo')).toHaveText('50%');
    await expect(figure.locator('[data-aresta="svc>v2"]')).toHaveClass(/diagrama-percorrida/);

    await figure.locator('.diagrama-player-proximo').click();
    await expect(legend).toHaveText('O v1 sai drenando; o v2 fica com tudo — capacidade nunca abaixo de 1');
    await expect(figure.locator('[data-aresta="svc>v1"] .diagrama-aresta-rotulo')).toHaveText('100%');
    await expect(figure.locator('.diagrama-player-proximo')).toHaveAttribute('aria-disabled', 'true');
    // States are cumulative: v2 is still "ativo" from step 3.
    await expect(v2).toHaveClass(/diagrama-est-ativo/);

    await figure.locator('.diagrama-player-inicio').click();
    await expect(v2).not.toHaveClass(/diagrama-est-/);
    await expect(v2.locator('.diagrama-no-rotulo')).toHaveText('vaga do pod novo');
  });

  test('the keyboard drives the player: arrows, Home, End and Space', async ({ page }) => {
    const figure = await open(page);
    const pos = figure.locator('.diagrama-player-posicao');
    await figure.locator('.diagrama-player-proximo').focus();
    await page.keyboard.press('ArrowRight');
    await expect(pos).toHaveText('passo 2 de 4');
    await page.keyboard.press('End');
    await expect(pos).toHaveText('passo 4 de 4');
    await page.keyboard.press('ArrowLeft');
    await expect(pos).toHaveText('passo 3 de 4');
    await page.keyboard.press('Home');
    await expect(pos).toHaveText('passo 1 de 4');
    await figure.locator('.diagrama-player-velocidade').click();
    await figure.locator('.diagrama-player-velocidade').click();
    await expect(figure.locator('.diagrama-player-velocidade')).toHaveAttribute('aria-label', 'Velocidade: 0,5×');
    await figure.locator('.diagrama-player-velocidade').click();
    await page.keyboard.press(' ');
    await expect(figure.locator('.diagrama-player-play')).toHaveAttribute('aria-label', 'Pausar');
    // At 1× a step lasts 2,5 s; it plays to the end and stops there.
    await expect(pos).toHaveText('passo 2 de 4', { timeout: 4000 });
    await expect(pos).toHaveText('passo 4 de 4', { timeout: 8000 });
    await expect(figure.locator('.diagrama-player-play')).toHaveAttribute('aria-label', 'Reproduzir', { timeout: 4000 });
  });

  test('pauses when the figure leaves the screen', async ({ page }) => {
    const figure = await open(page);
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('.diagrama-player-play').click();
    await expect(figure.locator('.diagrama-player-play')).toHaveAttribute('aria-label', 'Pausar');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(figure.locator('.diagrama-player-play')).toHaveAttribute('aria-label', 'Reproduzir');
  });

  test('Ampliar keeps the current step, both ways', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.diagrama-player-proximo').click();
    await figure.locator('.diagrama-player-proximo').click();
    await figure.locator('button.diagrama-ampliar').click();
    const dialog = page.locator('dialog.diagrama-dialogo');
    await expect(dialog.locator('.diagrama-player-posicao')).toHaveText('passo 3 de 4');
    await dialog.locator('.diagrama-player-proximo').click();
    await page.keyboard.press('Escape');
    await expect(figure.locator('.diagrama-player-posicao')).toHaveText('passo 4 de 4');
    await expect(dialog.locator('.diagrama-player')).toHaveCount(0);
  });

  test('moves packets with the Web Animations API, without style attributes or CSP violations', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.diagrama-player-proximo').click();
    await figure.locator('.diagrama-player-proximo').click();
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
    expect(await page.locator('figure.diagrama [style], .diagrama-player [style]').count()).toBe(0);
    // @ts-ignore
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('with reduced motion the steps change but nothing moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page);
    await figure.locator('.diagrama-player-proximo').click();
    await figure.locator('.diagrama-player-proximo').click();
    await expect(figure.locator('.diagrama-player-posicao')).toHaveText('passo 3 de 4');
    await expect(figure.locator('[data-aresta="svc>v2"]')).toHaveClass(/diagrama-percorrida/);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('the textual description lists the steps, numbered', async ({ page }) => {
    const figure = await open(page);
    await figure.locator('.diagrama-descricao summary').click();
    await expect(figure.locator('.diagrama-descricao ol li')).toHaveCount(4);
    await expect(figure.locator('.diagrama-descricao ol li').last()).toHaveText('O v1 sai drenando; o v2 fica com tudo (capacidade nunca abaixo de 1)');
  });
});

// Milestone bodies render with the track, so the player loads per track:
// only a track with an animated diagram downloads it.
test('diagram-player.js is not downloaded for a track without animation', async ({ browser }) => {
  const page = await browser.newPage();
  const requested = [];
  page.on('request', (r) => { if (r.url().includes('diagram-player.js')) requested.push(r.url()); });
  // A track with diagrams but no animated one, picked from the data.
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'data', 'diagramas');
  const slug = fs.readdirSync(dir).map((f) => f.slice(0, -5))
    .find((s) => !fs.readFileSync(path.join(dir, `${s}.json`), 'utf8').includes('"animacao"'));
  test.skip(!slug, 'every track with diagrams has an animated one');
  await page.goto(`/#/learn/${slug}`);
  const node = page.locator('.timeline-node').filter({ has: page.locator('figure.diagrama') }).first();
  await node.locator('.node-toggle').click();
  await expect(node.locator('figure.diagrama svg').first()).toBeVisible();
  expect(requested).toEqual([]);
  await page.close();
});
