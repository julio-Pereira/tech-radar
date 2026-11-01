// @ts-check
// The renderer and its primitives ship as written (no build step, no
// minifier): the plan's budget is 10 KB gzip for both, all five types
// included. No browser needed.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

test('diagram.js + diagram-svg.js stay within 10 KB gzip', () => {
  const size = ['diagram.js', 'diagram-svg.js']
    .map((f) => zlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses', f))).length)
    .reduce((a, b) => a + b, 0);
  expect(size).toBeLessThanOrEqual(10_000);
});
