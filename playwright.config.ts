import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AUTH_ENV, AUTH_PORT } from './tests/browser/auth-env';
const dataDir = mkdtempSync(join(tmpdir(), 'household-e2e-'));
const authDataDir = mkdtempSync(join(tmpdir(), 'household-e2e-auth-'));
// Optional: TEST_DATABASE_URL also runs the ledger flows against Postgres (a disposable database or Neon branch).
const database = process.env.TEST_DATABASE_URL;
const ledgerId = 'e2e-' + Date.now();
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:3101', channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    ...(database ? [{ name: 'desktop-postgres', testMatch: 'ledger.spec.ts', use: { baseURL: 'http://127.0.0.1:3103', viewport: { width: 1280, height: 900 } } }] : []),
  ],
  webServer: [
    // Local demo mode: no sign-in configured.
    { command: 'npm run start -- --port 3101', url: 'http://127.0.0.1:3101/api/demo', reuseExistingServer: false, env: { DEMO_DATA_DIR: dataDir } },
    // Google sign-in mode with test-only credentials; Google itself is never contacted.
    { command: `npm run start -- --port ${AUTH_PORT}`, url: `http://127.0.0.1:${AUTH_PORT}/login`, reuseExistingServer: false, env: { DEMO_DATA_DIR: authDataDir, ...AUTH_ENV } },
    ...(database ? [{ command: 'npm run start -- --port 3103', url: 'http://127.0.0.1:3103/api/demo', reuseExistingServer: false,
      env: { DATABASE_URL: database, LEDGER_ID: ledgerId, LEDGER_ALLOW_RESET: '1' } }] : []),
  ],
});
