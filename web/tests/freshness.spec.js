// @ts-check
// UX platform melhoria 6: a milestone that opted into content-freshness
// tracking (reviewedAt set) shows when it was last checked, or a plain-text
// warning once past reviewDue. No real content has opted in yet, so every
// test here injects reviewedAt/reviewDue via route interception (same
// pattern as the sections-absent fallback test in reading.spec.js) and
// controls the browser's own clock so the comparison is deterministic.
const { test, expect } = require('@playwright/test');

const SLUG = 'go-fintech';
const MILESTONE_ID = 'introducao';

async function mockReviewFields(page, { reviewedAt, reviewDue }) {
  await page.route(`**/data/courses/${SLUG}.json`, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const milestone = json.milestones.find((m) => m.id === MILESTONE_ID);
    if (reviewedAt !== undefined) milestone.reviewedAt = reviewedAt;
    if (reviewDue !== undefined) milestone.reviewDue = reviewDue;
    await route.fulfill({ response, json });
  });
}

test('a milestone with no reviewedAt shows nothing', async ({ page }) => {
  await page.goto(`/#/learn/${SLUG}`);
  const node = page.locator(`.timeline-node[data-id="${MILESTONE_ID}"]`);
  await expect(node.locator('.node-freshness')).toHaveCount(0);
});

test('reviewedAt within the review window shows the reviewed month/year, not the warning', async ({ page }) => {
  await mockReviewFields(page, { reviewedAt: '2026-10-12', reviewDue: '2027-10-12' });
  await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
  await page.goto(`/#/learn/${SLUG}`);

  const node = page.locator(`.timeline-node[data-id="${MILESTONE_ID}"]`);
  const freshness = node.locator('.node-freshness');
  await expect(freshness).toHaveText('Revisado em out/2026');
  await expect(freshness).not.toHaveClass(/stale/);
});

test('a milestone past its reviewDue shows the warning text instead', async ({ page }) => {
  await mockReviewFields(page, { reviewedAt: '2024-01-01', reviewDue: '2025-01-01' });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto(`/#/learn/${SLUG}`);

  const node = page.locator(`.timeline-node[data-id="${MILESTONE_ID}"]`);
  const freshness = node.locator('.node-freshness');
  await expect(freshness).toHaveText('Pode estar desatualizado');
  await expect(freshness).toHaveClass(/stale/);
});

test('reviewedAt without reviewDue shows the reviewed date and never warns', async ({ page }) => {
  // Valid per the contract: reviewedAt alone (no cadence) is allowed —
  // there is simply no due date to compare against, so it can never warn.
  await mockReviewFields(page, { reviewedAt: '2020-01-01', reviewDue: '' });
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') });
  await page.goto(`/#/learn/${SLUG}`);

  const node = page.locator(`.timeline-node[data-id="${MILESTONE_ID}"]`);
  await expect(node.locator('.node-freshness')).toHaveText('Revisado em jan/2020');
});

test('crossing the browser clock past reviewDue flips the label on a fresh render', async ({ page }) => {
  await mockReviewFields(page, { reviewedAt: '2026-01-01', reviewDue: '2026-10-01' });

  await page.clock.install({ time: new Date('2026-09-01T12:00:00Z') });
  await page.goto(`/#/learn/${SLUG}`);
  const node = page.locator(`.timeline-node[data-id="${MILESTONE_ID}"]`);
  await expect(node.locator('.node-freshness')).toHaveText('Revisado em jan/2026');

  // Move the clock past reviewDue and reload — a fresh render re-evaluates
  // against the (now later) current time, same as a real visit weeks later.
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  await page.reload();
  await expect(node.locator('.node-freshness')).toHaveText('Pode estar desatualizado');
});
