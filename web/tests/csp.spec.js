// @ts-check
// Hardening antes da divulgação (web/docs/AUDITORIA-hardening-divulgacao.md, Fase 4): nenhuma rota do
// site viola a CSP de index.html, inclusive Trusted Types. Uma violação aparece como evento
// securitypolicyviolation e como erro no console; o teste junta os dois.
const { test, expect } = require('@playwright/test');

const ROTAS = [
  '/#/',
  '/#/learn',
  '/#/learn/kubernetes',
  '/#/learn/kubernetes/gitops-e-dr',
  '/#/learn/entrega-continua-e-devops/release-e-rollback-por-slo',
  '/#/learn/credito-e-risco/provisao-e-perda-esperada',
  '/#/paths',
  '/#/paths/entrevista-senior',
  '/#/glossario',
  '/#/skills',
  '/#/revisar',
  '/#/fin-platform',
  '/#/desafios',
  '/#/desafios/pix-10k-tps/estudo/11',
  '/#/desafios/escolher-estrategia-de-release/simulado/7',
];

test('nenhuma rota viola a CSP nem os Trusted Types', async ({ page }) => {
  await page.addInitScript(() => {
    /** @type {any} */ (window).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      /** @type {any} */ (window).__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  const erros = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Trusted ?Type|TrustedHTML/i.test(m.text())) erros.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (/Trusted ?Type|TrustedHTML/i.test(e.message)) erros.push(e.message);
  });

  for (const rota of ROTAS) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main, #main-content').first()).toBeVisible();
    const violacoes = await page.evaluate(() => /** @type {any} */ (window).__csp);
    expect(violacoes, `violações em ${rota}`).toEqual([]);
  }
  // A busca do cabeçalho monta resultados dinamicamente.
  await page.goto('/#/learn');
  await page.locator('#search-input').fill('idempotência');
  await expect(page.locator('#search-results')).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (window).__csp)).toEqual([]);
  expect(erros).toEqual([]);
});

test('Trusted Types está em vigor: HTML de string fora da política é recusado', async ({ page }) => {
  await page.goto('/#/');
  const resultado = await page.evaluate(() => {
    try {
      document.body.insertAdjacentHTML('beforeend', '<b>injetado</b>');
      return 'aceito';
    } catch (e) {
      return String(e);
    }
  });
  // Each engine words the refusal its own way: Chromium and WebKit name
  // TrustedHTML, Firefox says "Sink type mismatch violation blocked by CSP".
  expect(resultado).toMatch(/TrustedHTML|Trusted Type|Sink type mismatch/i);
});
