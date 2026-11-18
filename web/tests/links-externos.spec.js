// @ts-check
// Hardening antes da divulgação (web/docs/AUDITORIA-hardening-divulgacao.md, Fase 3): todo link para
// fora do site abre em nova aba com rel="noopener noreferrer nofollow", venha ele do feed (radar), das
// referências de um marco ou do markdown de uma trilha (bluemonday, no build).
const { test, expect } = require('@playwright/test');

/** Lists the external anchors on the page that miss target=_blank or one of the three rel tokens. */
async function linksExternosSemProtecao(page) {
  return page.evaluate(() => {
    const ruins = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin === location.origin || url.protocol === 'blob:') continue;
      const rel = new Set((a.getAttribute('rel') || '').toLowerCase().split(/\s+/));
      const falta = ['noopener', 'noreferrer', 'nofollow'].filter((t) => !rel.has(t));
      if (a.getAttribute('target') !== '_blank' || falta.length) {
        ruins.push(`${a.href} target=${a.getAttribute('target')} rel="${a.getAttribute('rel') || ''}"`);
      }
    }
    return ruins;
  });
}

async function contarExternos(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')]
    .filter((a) => new URL(a.getAttribute('href'), location.href).origin !== location.origin).length);
}

test('radar: todo link do feed é https e sai com noopener, noreferrer e nofollow', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#articles .card').first()).toBeVisible();
  expect(await contarExternos(page)).toBeGreaterThan(0);
  expect(await linksExternosSemProtecao(page)).toEqual([]);
  const esquemas = await page.evaluate(() => [...new Set([...document.querySelectorAll('#articles a[href]')]
    .map((a) => new URL(a.getAttribute('href'), location.href).protocol))]);
  expect(esquemas).toEqual(['https:']);
});

test('marco: links do markdown e das referências saem com noopener, noreferrer e nofollow', async ({ page }) => {
  await page.goto('/#/learn/credito-e-risco/provisao-e-perda-esperada');
  await expect(page.locator('.ref-list a').first()).toBeAttached();
  expect(await contarExternos(page)).toBeGreaterThan(1);
  expect(await linksExternosSemProtecao(page)).toEqual([]);
});
