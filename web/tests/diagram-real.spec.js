// @ts-check
// The real diagrams, not the fixtures (PLANO-diagramas, C7): every
// data/diagramas/<slug>.json the build produced is opened in the milestones
// that use it, and each drawing is checked for what a reader would notice —
// a label cut by the viewBox, two labels on top of each other, a line over a
// box, a figure that scrolls on a desktop — plus CSP violations. Runs on the
// output of `go run .`, like the rest of the suite.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const diagramDir = path.join(dataDir, 'diagramas');
const slugs = fs.existsSync(diagramDir)
  ? fs.readdirSync(diagramDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
  : [];

/** Milestones of a track whose body has a diagram figure. */
function milestonesWithDiagrams(slug) {
  const course = JSON.parse(fs.readFileSync(path.join(dataDir, 'courses', `${slug}.json`), 'utf8'));
  return course.milestones
    .filter((/** @type {any} */ m) => JSON.stringify(m).includes('data-diagrama='))
    .map((/** @type {any} */ m) => m.id);
}

/** @param {import('@playwright/test').Page} page @param {string} slug */
async function openAll(page, slug) {
  await page.addInitScript(() => {
    // @ts-ignore
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      // @ts-ignore
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto(`/#/learn/${slug}`);
  for (const id of milestonesWithDiagrams(slug)) {
    const node = page.locator(`.timeline-node[data-id="${id}"]`);
    await node.locator('.node-toggle').click();
    const figures = node.locator('figure.diagrama');
    await expect(figures.first()).toBeVisible();
    await expect(node.locator('figure.diagrama svg')).toHaveCount(await figures.count());
  }
}

test('the build produced diagram data', () => {
  expect(slugs.length, 'run `go run .` in aggregator/ first').toBeGreaterThan(0);
});

for (const slug of slugs) {
  test(`${slug}: every diagram is drawn, legible and fits a 1280px desktop`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openAll(page, slug);
    const ids = Object.keys(JSON.parse(fs.readFileSync(path.join(diagramDir, `${slug}.json`), 'utf8')).diagramas);

    const report = await page.evaluate(() => {
      /** @type {string[]} */
      const problems = [];
      const drawn = [];
      // Does the segment p→q enter the box (Liang–Barsky)?
      const hits = (/** @type {number[]} */ [px, py, qx, qy], /** @type {DOMRect} */ b) => {
        const dx = qx - px; const dy = qy - py;
        let t0 = 0; let t1 = 1;
        for (const [p, q] of [[-dx, px - b.left], [dx, b.right - px], [-dy, py - b.top], [dy, b.bottom - py]]) {
          if (p === 0) { if (q < 0) return false; continue; }
          const r = q / p;
          if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
          if (t0 > t1) return false;
        }
        return true;
      };
      for (const figure of document.querySelectorAll('figure.diagrama-desenhado')) {
        const id = /** @type {HTMLElement} */ (figure).dataset.diagrama || '';
        drawn.push(id.split('/')[1]);
        const svg = /** @type {SVGSVGElement} */ (figure.querySelector('svg'));
        const area = /** @type {HTMLElement} */ (figure.querySelector('.diagrama-area'));
        if (area.scrollWidth > area.clientWidth + 1) problems.push(`${id}: rola na horizontal (${area.scrollWidth} > ${area.clientWidth})`);
        const box = svg.getBoundingClientRect();
        const texts = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() }));
        for (const { t, r } of texts) {
          if (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1) {
            problems.push(`${id}: rótulo "${t}" sai do viewBox`);
          }
        }
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i].r; const b = texts[j].r;
            const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            // Glyph boxes include line gap: a 2px touch is not an overlap.
            if (w > 2 && h > 3) problems.push(`${id}: "${texts[i].t}" sobrepõe "${texts[j].t}"`);
          }
        }
        // Lines never cross a box (other than at their own ends, which they
        // only touch from outside).
        const boxes = [...svg.querySelectorAll('.diagrama-no-caixa')].map((r) => {
          const b = r.getBoundingClientRect();
          return new DOMRect(b.left + 2, b.top + 2, b.width - 4, b.height - 4);
        });
        for (const line of svg.querySelectorAll('.diagrama-arestas line, .diagrama-arestas polyline')) {
          const ctm = /** @type {SVGGraphicsElement} */ (line).getScreenCTM();
          if (!ctm) continue;
          const pts = line.tagName === 'line'
            ? ['x1', 'y1', 'x2', 'y2'].map((k) => Number(line.getAttribute(k)))
            : (line.getAttribute('points') || '').split(/[ ,]/).map(Number);
          const screen = [];
          for (let k = 0; k + 1 < pts.length; k += 2) {
            const p = new DOMPoint(pts[k], pts[k + 1]).matrixTransform(ctm);
            screen.push(p.x, p.y);
          }
          // The two end boxes are the edge's own: a pair of opposite edges
          // is shifted a few pixels and may start under its box's border.
          const near = (/** @type {DOMRect} */ b, /** @type {number} */ x, /** @type {number} */ y) =>
            x > b.left - 10 && x < b.right + 10 && y > b.top - 10 && y < b.bottom + 10;
          const n = screen.length;
          const others = boxes.filter((b) => !near(b, screen[0], screen[1]) && !near(b, screen[n - 2], screen[n - 1]));
          for (let k = 0; k + 3 < n; k += 2) {
            if (others.some((b) => hits(screen.slice(k, k + 4), b))) {
              problems.push(`${id}: uma aresta atravessa uma caixa`);
            }
          }
        }
        if (!figure.querySelector('button.diagrama-ampliar')) problems.push(`${id}: sem botão Ampliar`);
      }
      // @ts-ignore
      return { problems, drawn, csp: window.__csp };
    });

    expect(report.problems).toEqual([]);
    expect(report.csp).toEqual([]);
    expect([...new Set(report.drawn)].sort(), 'every compiled diagram appears in a milestone').toEqual(ids.sort());
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test(`${slug}: at 360px nothing scrolls the page and every diagram opens in Ampliar`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openAll(page, slug);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const buttons = page.locator('figure.diagrama-desenhado button.diagrama-ampliar');
    const n = await buttons.count();
    for (let i = 0; i < n; i++) {
      const button = buttons.nth(i);
      await button.click();
      const dialog = page.locator('dialog.diagrama-dialogo');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('svg')).toHaveCount(1);
      await expect(dialog.locator('.diagrama-fechar')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused();
    }
    // @ts-ignore
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });
}
