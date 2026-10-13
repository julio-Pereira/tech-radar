// @ts-check
// Melhoria 3 (UX item 14, "pontes viram links") front end: clicking a real
// bridge link lands on and expands the right marco on the target course's
// page — a URL anchor into the existing single-fetch course view, not a
// second route or a second request (trilha-as-page stays trilha-as-page).
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/#/learn/concorrencia-e-recursos');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('clicking a bridge navigates to the target course and expands the right marco', async ({ page }) => {
  const source = page.locator('.timeline-node[data-id="concorrencia-no-ledger"]');
  await source.locator('.node-toggle').click();

  const bridge = source.locator('a[href="#/learn/spring-boot/runtime-web-e-virtual-threads"]').first();
  await expect(bridge).toBeVisible();
  // The bridge text stays styled as code, same as an unresolved one would.
  await expect(bridge.locator('code')).toHaveText('spring-boot/07');

  await bridge.click();

  await expect(page).toHaveURL(/#\/learn\/spring-boot\/runtime-web-e-virtual-threads$/);
  const target = page.locator('.timeline-node[data-id="runtime-web-e-virtual-threads"]');
  await expect(target).toBeVisible();
  await expect(target.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('a same-trilha shorthand bridge resolves to its own marco, not the one before it', async ({ page }) => {
  const source = page.locator('.timeline-node[data-id="concorrencia-no-ledger"]');
  await source.locator('.node-toggle').click();

  // The source text is "`spring-boot/07`, `/08` e `go-fintech/03`" — the
  // shorthand "/08" must resolve to spring-boot's own marco 08, not repeat 07.
  const bridge = source.locator('a[href="#/learn/spring-boot/resiliencia"]').first();
  await expect(bridge.locator('code')).toHaveText('/08');
  await bridge.click();

  await expect(page).toHaveURL(/#\/learn\/spring-boot\/resiliencia$/);
  const target = page.locator('.timeline-node[data-id="resiliencia"]');
  await expect(target.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('visiting a deep link directly (not via click) also lands on the right marco', async ({ page }) => {
  await page.goto('/#/learn/spring-boot/runtime-web-e-virtual-threads');
  const target = page.locator('.timeline-node[data-id="runtime-web-e-virtual-threads"]');
  await expect(target.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
});

test('a stale or invalid marco id in the URL falls back to the normal default, not a blank page', async ({ page }) => {
  await page.goto('/#/learn/spring-boot/isso-nao-existe');
  // The course still renders — no crash, no "not found" page — exactly as a
  // plain #/learn/spring-boot visit would: nothing force-expanded (a fresh
  // visit's default only scrolls, same as before this feature existed), and
  // the unmatched marco id never becomes a phantom "last visited" entry.
  await expect(page.locator('.course-title')).toBeVisible();
  await expect(page.locator('.timeline-node .node-toggle[aria-expanded="true"]')).toHaveCount(0);
  await expect(page.locator('.continue-btn')).toHaveCount(0);
});

test('expanding a marco via a deep link also marks it as last-visited', async ({ page }) => {
  await page.goto('/#/learn/spring-boot/runtime-web-e-virtual-threads');
  const node = page.locator('.timeline-node[data-id="runtime-web-e-virtual-threads"]');
  await expect(node.locator('.node-toggle')).toHaveAttribute('aria-expanded', 'true');
  const title = (await node.locator('.node-title').textContent()).trim();

  // Revisiting the plain course page (no deep link this time) should now
  // offer to continue at the exact marco the deep link opened — the same
  // click-through path (scrollToMilestone's expand) that a manual click
  // already uses to set tr:lastvisited, so this comes for free.
  await page.goto('/#/learn/spring-boot');
  const continueBtn = page.locator('.continue-btn');
  await expect(continueBtn).toBeVisible();
  await expect(continueBtn).toContainText(title);
});
