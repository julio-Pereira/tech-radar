// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const CROSS_ENGINE = [
  /diagram[^/]*\.spec\.js$/,
  /walkthrough\.spec\.js$/,
  /higiene\.spec\.js$/,
  /a11y\.spec\.js$/,
  /csp\.spec\.js$/,
  /progress-bar\.spec\.js$/,
];

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Firefox and WebKit run only the suites where engines differ: the SVG
    // renderer and its <use>/clone paths, the walkthrough player, the CSP and
    // style hygiene, accessibility, and the native <progress> bar.
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_ENGINE },
    // WebKit upgrades loopback http under the CSP's upgrade-insecure-requests,
    // so it gets its own HTTPS server (tests/helpers/https-server.py).
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], baseURL: 'https://127.0.0.1:4174', ignoreHTTPSErrors: true },
      testMatch: CROSS_ENGINE,
    },
  ],
  webServer: [
    {
      // python3 is already a CI/dev-box given; avoids a second npm devDependency
      // just to serve static files.
      command: 'python3 -m http.server 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'python3 tests/helpers/https-server.py 4174',
      url: 'https://127.0.0.1:4174',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
