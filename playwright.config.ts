import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests (PLAN.md §6) cover the Phase 1 exit criteria:
 * register -> find a caregiver -> exchange real-time messages.
 * The app is served as a static build; the backend API and chat WebSocket
 * are mocked inside the specs (no server required).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node e2e/static-server.mjs',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
