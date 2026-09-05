import { test, expect, Page } from '@playwright/test';

/**
 * Smoke walk: every role visits every route it can reach, with the demo
 * backend active (?demo=1). Fails on any console error / uncaught page error,
 * so the "no console errors" claim is verified against the real app.
 */

const SESSIONS = {
  client: { userId: 'u-client', displayName: 'Maria Papadopoulou', roles: ['client'], expiresAtMs: Date.now() + 3_600_000 },
  nurse: { userId: 'u-nurse', displayName: 'Elena Papadaki', roles: ['nurse'], expiresAtMs: Date.now() + 3_600_000 },
  admin: { userId: 'u-admin', displayName: 'Admin', roles: ['admin'], expiresAtMs: Date.now() + 3_600_000 },
  pharmacy: { userId: 'u-pharmacy', displayName: 'Syntagma Central Pharmacy', roles: ['pharmacy'], expiresAtMs: Date.now() + 3_600_000 },
};

const ROUTES: Record<string, string[]> = {
  client: [
    '/marketplace', '/bookings', '/live-visit', '/vitals', '/health-record',
    '/screenings', '/medications', '/reminders', '/health-summary',
    '/prescriptions', '/pharmacy-orders', '/consents', '/wallet', '/payments',
    '/disputes', '/chat', '/profile',
  ],
  nurse: ['/onboarding', '/shifts', '/visits', '/clinical-log', '/care-plan', '/vitals', '/chat', '/profile'],
  admin: ['/admin', '/admin/audit', '/admin/consents', '/disputes'],
  pharmacy: ['/pharmacy', '/pharmacy-orders'],
};

test.setTimeout(240_000);

test('demo-mode smoke walk produces no console errors', async ({ page }) => {
  const all: string[] = [];
  let currentRole = 'unknown';
  // Single page for all roles; one listener, labelled by the role whose
  // session was seeded before the latest navigation.
  page.on('console', (msg) => {
    if (msg.type() === 'error') all.push(`[${currentRole}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => all.push(`[${currentRole}] pageerror: ${err.message}`));

  for (const [role, routes] of Object.entries(ROUTES)) {
    currentRole = role;
    await page.addInitScript((payload) => {
      localStorage.setItem('cm.session.v1', JSON.stringify(payload));
      localStorage.setItem('cm.demo.v1', '1');
    }, SESSIONS[role as keyof typeof SESSIONS]);

    for (const route of routes) {
      try {
        await page.goto(`${route}?demo=1`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        const url = new URL(page.url());
        if (url.pathname !== route) {
          all.push(`[${role}] route ${route} landed on ${url.pathname}`);
        }
      } catch (err) {
        all.push(`[${role}] goto ${route} failed: ${(err as Error).message}`);
      }
    }
  }
  expect(all).toEqual([]);
});