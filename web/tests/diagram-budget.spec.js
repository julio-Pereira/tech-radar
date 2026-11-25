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

test('diagram-player.js stays within 4 KB gzip', () => {
  const size = zlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses', 'diagram-player.js'))).length;
  expect(size).toBeLessThanOrEqual(4_000);
});

test('walkthrough-player.js stays within 6 KB gzip (the shared core apart)', () => {
  const size = zlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses', 'walkthrough-player.js'))).length;
  expect(size).toBeLessThanOrEqual(6_000);
});

// Ajustes pós-Fase 1.7, frente 1: Ampliar and the grafico type left the
// critical path (they load on first use), freeing about 2.9 KB of the
// renderer's 10 KB. Each lazy module has its own ceiling.
test('diagram-zoom.js (Ampliar, loaded on the first click) stays within 1.5 KB gzip', () => {
  const size = zlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses', 'diagram-zoom.js'))).length;
  expect(size).toBeLessThanOrEqual(1_500);
});

test('diagram-chart.js (the grafico type, loaded only for a chart) stays within 3.5 KB gzip', () => {
  const size = zlib.gzipSync(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses', 'diagram-chart.js'))).length;
  expect(size).toBeLessThanOrEqual(3_500);
});
