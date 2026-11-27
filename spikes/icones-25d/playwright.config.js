// @ts-check
// Spike "2.5D leve" (Fase 1.8, §3.4): fora do build de produção e fora da
// suíte do CI. Roda contra o site compilado (`go run .` em aggregator/).
//   cd web && npx playwright test -c ../spikes/icones-25d/playwright.config.js
const { defineConfig, devices } = require('../../web/node_modules/@playwright/test');
const path = require('path');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /medir\.spec\.js$/,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175', ...devices['Desktop Chrome'], deviceScaleFactor: 2 },
  webServer: {
    command: 'python3 -m http.server 4175',
    cwd: path.join(__dirname, '..', '..', 'web'),
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
