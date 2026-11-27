// Browser smoke tests (docs/PLAN.md section 11.4): two laptop sizes and one
// touch-only tablet run, so nothing can quietly depend on hovering; plus two
// phone runs (phase 21, portrait and landscape, taps only) for the phone tests.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './test/smoke',
  outputDir: './test-results/artifacts',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}/`, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'laptop-1366', testIgnore: /phone\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'desktop-1920', testIgnore: /phone\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'touch-820', testIgnore: /phone\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
    { name: 'phone-390x844', testMatch: /phone\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'phone-844x390', testMatch: /phone\.spec\.js/, use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: `node tools/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
