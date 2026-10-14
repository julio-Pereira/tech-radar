// @ts-check
// UX item 17: export/import every tr:* key as one JSON file, merged by
// union — an import can only ever add, never overwrite, and a corrupted
// file must never wipe the current state.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SLUG = 'go-fintech';

test.beforeEach(async ({ page }) => {
  await page.goto(`/#/learn/${SLUG}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('exporting downloads a JSON file containing the current progress', async ({ page }) => {
  await page.locator('.timeline-node').first().locator('.node-toggle').click();
  await page.locator('.timeline-node').first().locator('.node-complete input[type="checkbox"]').check();
  await page.goto('/#/learn');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.progress-io-btn').first().click(),
  ]);
  const filePath = await download.path();
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  expect(payload.version).toBe(1);
  expect(typeof payload.exportedAt).toBe('string');
  expect(Object.keys(payload.data).some((k) => k.startsWith(`tr:progress:${SLUG}`))).toBe(true);
});

test('a round-trip export → clear → import reproduces identical progress', async ({ page }) => {
  await page.locator('.timeline-node').first().locator('.node-toggle').click();
  await page.locator('.timeline-node').first().locator('.node-complete input[type="checkbox"]').check();
  await page.goto('/#/learn');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.progress-io-btn').first().click(),
  ]);
  const filePath = await download.path();
  const exported = fs.readFileSync(filePath, 'utf-8');

  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const tmpFile = path.join(os.tmpdir(), `tr-import-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, exported);
  await page.locator('.progress-io-import-label input[type="file"]').setInputFiles(tmpFile);

  await expect(page.locator('.progress-io-status')).toContainText('importado');
  const restored = await page.evaluate((slug) => localStorage.getItem(`tr:progress:${slug}`), SLUG);
  expect(JSON.parse(restored)).toEqual(JSON.parse(JSON.parse(exported).data[`tr:progress:${SLUG}`]));
});

test('importing merges by union instead of overwriting existing progress', async ({ page }) => {
  const nodes = page.locator('.timeline-node');
  await nodes.nth(0).locator('.node-toggle').click();
  await nodes.nth(0).locator('.node-complete input[type="checkbox"]').check();

  // Build an import file that completes a DIFFERENT milestone than the one
  // just checked locally — after import, both must be marked done. Read
  // both ids now, before navigating away — .timeline-node only exists on
  // the course page.
  const firstId = await nodes.nth(0).getAttribute('data-id');
  const secondId = await nodes.nth(1).getAttribute('data-id');
  const importPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { [`tr:progress:${SLUG}`]: JSON.stringify([secondId]) },
  };
  const tmpFile = path.join(os.tmpdir(), `tr-import-union-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify(importPayload));

  await page.goto('/#/learn');
  await page.locator('.progress-io-import-label input[type="file"]').setInputFiles(tmpFile);
  await expect(page.locator('.progress-io-status')).toContainText('importado');

  const stored = await page.evaluate((slug) => JSON.parse(localStorage.getItem(`tr:progress:${slug}`)), SLUG);
  expect(stored.sort()).toEqual([firstId, secondId].sort());
});

test('a corrupted import file shows an error and never touches existing progress', async ({ page }) => {
  await page.locator('.timeline-node').first().locator('.node-toggle').click();
  await page.locator('.timeline-node').first().locator('.node-complete input[type="checkbox"]').check();
  const before = await page.evaluate((slug) => localStorage.getItem(`tr:progress:${slug}`), SLUG);

  const tmpFile = path.join(os.tmpdir(), `tr-corrupt-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, '{not valid json');

  await page.goto('/#/learn');
  await page.locator('.progress-io-import-label input[type="file"]').setInputFiles(tmpFile);

  await expect(page.locator('.progress-io-status')).toContainText('não é um JSON válido');
  const after = await page.evaluate((slug) => localStorage.getItem(`tr:progress:${slug}`), SLUG);
  expect(after).toBe(before);
});

test('a well-formed JSON file missing the expected shape is rejected without touching storage', async ({ page }) => {
  const before = await page.evaluate((slug) => localStorage.getItem(`tr:progress:${slug}`), SLUG);
  const tmpFile = path.join(os.tmpdir(), `tr-wrong-shape-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ hello: 'world' }));

  await page.goto('/#/learn');
  await page.locator('.progress-io-import-label input[type="file"]').setInputFiles(tmpFile);

  await expect(page.locator('.progress-io-status')).toContainText('formato esperado');
  const after = await page.evaluate((slug) => localStorage.getItem(`tr:progress:${slug}`), SLUG);
  expect(after).toBe(before);
});
