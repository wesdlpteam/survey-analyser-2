// E2E config (Task 14). Points at the Vite DEV server (not the base-path
// build) - vite dev still applies vite.config.ts's `base`, so it serves at
// /survey-analyser-2/, not /. A fixed --strictPort avoids the ambient
// "port already in use, trying another one" auto-increment vite does when
// stray dev servers from other sessions are already running - Playwright's
// webServer.url must be a single known address to poll.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5233;
const BASE_URL = `http://localhost:${PORT}/survey-analyser-2/`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // NOTE: this context-level option proved to be a silent no-op in
    // Playwright 1.61.1 + Chromium 149 (matchMedia in the page still
    // reported no-preference and entrance animations ran at scan time).
    // Kept as belt-and-braces for future versions, but the guard that
    // actually works is page.emulateMedia({ reducedMotion: 'reduce' })
    // in the specs - see e2e/a11y.spec.ts's beforeEach for the evidence.
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
