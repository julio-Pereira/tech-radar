// @ts-check
// Fase 1.8: icons by component type, on the real kubernetes walkthrough
// (layer k8s-wt-cluster). Runs in Chromium, Firefox and WebKit
// (playwright.config.js): an external <use> and the Ampliar clone are where
// engines have differed. Reading attributes is not enough there, so the
// icon is screenshotted and its pixels read, like progress-bar.spec.js.
const { test, expect } = require('@playwright/test');

const HASH = '#/learn/kubernetes/arquitetura/wt/k8s-do-apply-ao-pod-ready/1';

/** How many pixels of a PNG differ from its top-left pixel, decoded off-CSP. */
async function inked(context, png) {
  const page = await context.newPage();
  await page.goto('about:blank');
  const n = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 60) count++;
    }
    return count;
  }, png.toString('base64'));
  await page.close();
  return n;
}

/** @param {import('@playwright/test').Page} page */
async function open(page) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/${HASH}`);
  const figure = page.locator('figure.walkthrough[data-walkthrough="kubernetes/k8s-do-apply-ao-pod-ready"]');
  await expect(figure.locator('.wt-area svg [data-id="etcd"]')).toBeVisible();
  return figure;
}

/** The icon is drawn: some of its 16×16 px carry ink. */
async function expectDrawn(context, use) {
  await expect(use).toBeVisible();
  const png = await use.screenshot();
  expect(await inked(context, png), 'the icon has no ink: the sprite did not load').toBeGreaterThan(8);
}

test('a node takes the shape and the icon of its type, decorative and in the CSP', async ({ page, context }) => {
  const figure = await open(page);
  const etcd = figure.locator('.wt-area svg [data-id="etcd"]');
  // banco → cilindro: a path, still the node box for styles and tests.
  await expect(etcd.locator('path.diagrama-no-caixa')).toHaveCount(1);
  const use = etcd.locator('use.diagrama-no-icone');
  await expect(use).toHaveAttribute('href', 'assets/icones.svg#i-banco');
  await expect(use).toHaveAttribute('aria-hidden', 'true');
  // The accessible text is the label, without the icon.
  await expect(etcd.locator('.diagrama-no-rotulo')).toHaveText('etcd');
  // kubectl (cliente) is a pill; kube-proxy (rede) a hexagon.
  await expect(figure.locator('.wt-area svg [data-id="kubectl"] rect.diagrama-no-caixa')).toHaveAttribute('rx', '24');
  await expect(figure.locator('.wt-area svg [data-id="proxy"] path.diagrama-no-caixa')).toHaveCount(1);
  // No style attribute, no CSP violation. Checked before any screenshot:
  // Playwright's WebKit screenshot injects a style the CSP refuses.
  expect(await figure.locator('svg [style]').count()).toBe(0);
  expect(await page.evaluate(() => /** @type {any} */ (window).__csp)).toEqual([]);
  await expectDrawn(context, use);
});

test('the derived sequence carries the icons in its header', async ({ page, context }) => {
  const figure = await open(page);
  await figure.locator('.wt-aba', { hasText: 'Sequência' }).click();
  const use = figure.locator('.wt-area svg use[href="assets/icones.svg#i-cliente"]');
  await expect(use).toHaveCount(1);
  await expectDrawn(context, use);
});

test('Ampliar draws the icons too', async ({ page, context }) => {
  const figure = await open(page);
  await figure.locator('.diagrama-ampliar').click();
  const dialog = page.locator('dialog.diagrama-dialogo');
  await expect(dialog).toBeVisible();
  const use = dialog.locator('svg [data-id="etcd"] use.diagrama-no-icone');
  await expect(use).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (window).__csp)).toEqual([]);
  await expectDrawn(context, use);
});
