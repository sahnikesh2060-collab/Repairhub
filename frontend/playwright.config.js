import { defineConfig, devices } from '@playwright/test';

// Own ports, so the run never collides with a developer's `npm run dev` (5000 / 5173).
const API_PORT = 5100;
const WEB_PORT = 5174;

/**
 * End-to-end tests against an isolated stack: in-memory MongoDB + seed + backend (:5100) and the
 * Vite dev server (:5174). Run from the repo root with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/start-stack.mjs',
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_CLIENT_URL: `http://localhost:${WEB_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 240_000,
      // Show the stack's output in CI, where a failed start is otherwise invisible.
      stdout: process.env.CI ? 'pipe' : 'ignore',
    },
    {
      command: 'npm run dev',
      url: `http://localhost:${WEB_PORT}`,
      env: {
        VITE_PORT: String(WEB_PORT),
        API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
