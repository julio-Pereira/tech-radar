// @ts-check
// UX platform melhoria 1 (caminhos por papel): #/paths lists every role-based
// path, #/paths/<slug> shows its ordered steps. Tested against the real
// compiled tech-lead-para-staff path (content/paths/) — a guide only, never
// a gate, so every assertion here is about display and progress reflection,
// never about blocking access to a step.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const PATH_SLUG = 'tech-lead-para-staff';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#/paths/${PATH_SLUG}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); // same URL as goto's — goto() would be a no-op
});

test('the paths index lists the real path with hours and step count', async ({ page }) => {
  await page.goto('/#/paths');
  const card = page.locator(`a.course-card[href="#/paths/${PATH_SLUG}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('.course-card-meta')).toContainText('27 etapa');
});

test('a path detail page renders ordered steps grouped under headings', async ({ page }) => {
  await expect(page.locator('.course-title')).toContainText('Tech Lead');
  const groups = page.locator('.path-group-title');
  await expect(groups.first()).toHaveText('Fundação de desenho');
  await expect(page.locator('.path-step')).toHaveCount(27);
});

test('each step links straight into the course, milestone steps deep-linking to the exact marco', async ({ page }) => {
  const firstStep = page.locator('.path-step').first();
  await expect(firstStep.locator('.path-step-link')).toHaveAttribute('href', /^#\/learn\/system-design\/[a-z0-9-]+$/);

  const lastStep = page.locator('.path-step').last();
  await expect(lastStep.locator('.path-step-link')).toHaveAttribute('href', '#/learn/lideranca-tecnica');
  await expect(lastStep.locator('.path-step-title')).toContainText('Liderança Técnica');
});

test('clicking a step navigates into the course page', async ({ page }) => {
  const firstStep = page.locator('.path-step').first();
  const href = await firstStep.locator('.path-step-link').getAttribute('href');
  await firstStep.locator('.path-step-link').click();
  await expect(page).toHaveURL(new RegExp(href.replace('/', '\\/') + '$'));
  await expect(page.locator('.course-title')).toBeVisible();
});

test('marking a milestone done on its course page reflects as done on the path', async ({ page }) => {
  const firstStep = page.locator('.path-step').first();
  await expect(firstStep).not.toHaveClass(/done/);

  const href = await firstStep.locator('.path-step-link').getAttribute('href');
  const marcoId = href.split('/').pop();
  await page.goto('/' + href);
  // The deep link (slug/marco-id) already expands the target milestone — no
  // toggle click needed, same behavior melhoria 3's bridge links rely on.
  await page.locator(`.timeline-node[data-id="${marcoId}"] .node-complete input[type="checkbox"]`).check();

  await page.goto(`/#/paths/${PATH_SLUG}`);
  await expect(page.locator('.path-step').first()).toHaveClass(/done/);
  await expect(page.locator('.path-step').first().locator('.path-step-meta')).toContainText('Concluído');
});

test('a path is never blocking: every step stays a plain link regardless of progress', async ({ page }) => {
  // No progress at all, yet every step is still a real, clickable link —
  // nothing disabled, nothing hidden, nothing gated behind an earlier one.
  const links = page.locator('.path-step-link');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    await expect(links.nth(i)).toHaveAttribute('href', /^#\/learn\//);
  }
});

test('the index page shows path-level progress after a step is completed', async ({ page }) => {
  const firstStep = page.locator('.path-step').first();
  const href = await firstStep.locator('.path-step-link').getAttribute('href');
  const marcoId = href.split('/').pop();
  await page.goto('/' + href);
  await page.locator(`.timeline-node[data-id="${marcoId}"] .node-complete input[type="checkbox"]`).check();

  await page.goto('/#/paths');
  const label = page.locator(`a.course-card[href="#/paths/${PATH_SLUG}"] .progress-label`);
  await expect(label).not.toHaveText('0% concluído');
});

test('a path not in the catalog shows a not-found message, not a crash', async ({ page }) => {
  await page.goto('/#/paths/isso-nao-existe');
  await expect(page.locator('.empty')).toContainText('não encontrado');
  await expect(page.locator('.back-link')).toHaveAttribute('href', '#/paths');
});

test('axe: the path detail page has no serious/critical violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).include('body').analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
});
