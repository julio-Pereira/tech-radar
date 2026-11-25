// @ts-check
// Ajustes pós-Fase 1.7, frente 1: Ampliar (diagram-zoom.js) and the grafico
// type (diagram-chart.js) left the renderer's critical path. Ampliar loads
// only on its first click; the chart module only on a track that has a chart.
// The course view builds every milestone body when the track opens (hidden
// until expanded), so diagram.js itself is per track, not per milestone — as
// it was before this change. Runs on the real output of `go run .`.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

/** Milestones of every track, with the types of the diagrams they cite. */
function milestones() {
  const out = [];
  for (const f of fs.readdirSync(path.join(dataDir, 'courses')).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const course = JSON.parse(fs.readFileSync(path.join(dataDir, 'courses', f), 'utf8'));
    const dfile = path.join(dataDir, 'diagramas', f);
    const specs = fs.existsSync(dfile) ? JSON.parse(fs.readFileSync(dfile, 'utf8')).diagramas : {};
    for (const m of course.milestones || []) {
      const body = JSON.stringify(m);
      const ids = [...body.matchAll(/data-diagrama=\\"[a-z0-9-]+\/([a-z0-9-]+)\\"/g)].map((x) => x[1]);
      out.push({ slug: course.slug, id: m.id, tipos: ids.map((i) => specs[i] && specs[i].tipo), walkthrough: body.includes('data-walkthrough') });
    }
  }
  // Whether the milestone's track has a chart anywhere.
  for (const m of out) m.trilhaComGrafico = out.some((o) => o.slug === m.slug && o.tipos.includes('grafico'));
  return out;
}

const all = milestones();
const plain = all.find((m) => m.tipos.length === 0 && !m.walkthrough && !m.trilhaComGrafico);
const noChart = all.find((m) => m.tipos.length > 0 && !m.walkthrough && !m.trilhaComGrafico);
const withChart = all.find((m) => m.tipos.includes('grafico'));

/** @param {import('@playwright/test').Page} page */
function track(page) {
  const loaded = [];
  page.on('request', (r) => {
    const name = r.url().split('/').pop() || '';
    if (/^diagram(-zoom|-chart)?\.js$/.test(name)) loaded.push(name);
  });
  return loaded;
}

/** @param {import('@playwright/test').Page} page @param {{slug: string, id: string}} m */
async function openMilestone(page, m) {
  await page.goto(`/#/learn/${m.slug}`);
  const node = page.locator(`.timeline-node[data-id="${m.id}"]`);
  await node.locator('.node-toggle').click();
  await expect(node.locator('.milestone-body')).toBeVisible();
  return node;
}

test('the build has the three kinds of milestone this test needs', () => {
  expect(plain, 'a milestone with no diagram, on a track without charts').toBeTruthy();
  expect(noChart, 'a milestone with diagrams, on a track without charts').toBeTruthy();
  expect(withChart, 'a milestone with a chart').toBeTruthy();
});

test('a milestone without a diagram downloads none of the new modules', async ({ page }) => {
  const loaded = track(page);
  await openMilestone(page, /** @type {any} */ (plain));
  await page.waitForLoadState('networkidle');
  expect(loaded.filter((n) => n !== 'diagram.js')).toEqual([]);
});

test('a milestone without a chart draws its diagrams without the chart module, and Ampliar loads on the first click', async ({ page }) => {
  const loaded = track(page);
  const node = await openMilestone(page, /** @type {any} */ (noChart));
  await expect(node.locator('figure.diagrama svg').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(loaded).toEqual(['diagram.js']);
  await node.locator('button.diagrama-ampliar').first().click();
  await expect(page.locator('dialog.diagrama-dialogo svg')).toHaveCount(1);
  expect(loaded).toEqual(['diagram.js', 'diagram-zoom.js']);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.diagrama-dialogo')).toBeHidden();
});

test('a milestone with a chart downloads the chart module and draws the chart', async ({ page }) => {
  const loaded = track(page);
  const node = await openMilestone(page, /** @type {any} */ (withChart));
  await expect(node.locator('svg[data-tipo="grafico"]').first()).toBeVisible();
  expect(loaded).toContain('diagram-chart.js');
  expect(loaded).not.toContain('diagram-zoom.js');
});
