import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';

/**
 * Fullstack E2E (npm run e2e:fullstack): runs the compiled app against the
 * real API server (Postgres-backed, seeded — NOT the demo mode), and
 * verifies a real Web Push is delivered through web-push to a local HTTPS
 * push-service stand-in. Playwright spawns webServer commands BEFORE
 * globalSetup, so each command chain prepares the receiver's self-signed
 * cert first; the API server — which also serves the SPA from dist/ on port
 * 3000 (single origin → cookies work without CORS) — trusts it via
 * NODE_EXTRA_CA_CERTS.
 */

// The root package.json is CJS, so Playwright compiles this config to CJS
// and __dirname points at the project root.
const here = __dirname;

export default defineConfig({
  testDir: './e2e-fullstack',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    // Process-wide switch: also lets the service worker (which intercepts
    // every fetch, cross-origin included) reach the self-signed receiver.
    launchOptions: { args: ['--ignore-certificate-errors'] },
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Stand-in push service: captures + decrypts what web-push delivers.
      command: 'node e2e-fullstack/push-receiver.mjs',
      url: 'https://localhost:9443/health',
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Real API server (Postgres) that also serves the built SPA. Requires
      // `npm run build` + `docker compose up -d db` first (see e2e:fullstack).
      command: 'node e2e-fullstack/prepare-certs.mjs && npm --prefix server run start',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        // web-push (https-only) trusts the stand-in's self-signed cert.
        NODE_EXTRA_CA_CERTS: join(here, 'e2e-fullstack', '.certs', 'cert.pem'),
      },
    },
  ],
});