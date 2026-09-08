import { test, expect } from '@playwright/test';

/**
 * Fullstack E2E (playwright.fullstack.config.ts): the compiled app runs
 * against the REAL API server (Postgres-backed + seeded, not the demo
 * backend) and a Web Push is actually delivered:
 *
 *   1. UI login as the seeded client (maria@example.com / demo1234).
 *   2. Register a push subscription whose endpoint is the local HTTPS
 *      stand-in push service (e2e-fullstack/push-receiver.mjs).
 *   3. Trigger a real event — an out-of-range heart rate → vitals.alert.
 *   4. Assert the stand-in received and decrypted the push (web-push's
 *      aes128gcm payload → ngsw click-routing shape).
 *   5. Assert the app shows the reading (real DB round-trip).
 */

const APP = 'http://localhost:3000';
const RECEIVER = 'https://localhost:9443';

test('delivers a Web Push end-to-end against the real server', async ({ page }) => {
  // 1. UI login against the real server (non-demo mode).
  await page.goto(`${APP}/login`);
  await page.getByLabel('Email').fill('maria@example.com');
  await page.getByLabel('Mot de passe').fill('demo1234');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/marketplace/);

  // 2. Register the subscription: keys come from the stand-in push service
  //    (the "browser's" ECDH keypair), stored via the real API endpoint.
  const keys = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return (await res.json()) as { p256dh: string; auth: string };
  }, `${RECEIVER}/public-key`);
  expect(keys.p256dh).toBeTruthy();
  expect(keys.auth).toBeTruthy();

  const saved = await page.evaluate(async (keyPair) => {
    const res = await fetch('/api/me/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://localhost:9443/push',
        keys: { p256dh: keyPair.p256dh, auth: keyPair.auth },
      }),
    });
    return (await res.json()) as { ok?: boolean };
  }, keys);
  expect(saved.ok).toBe(true);

  // 3. Trigger a real event: heart rate 150 → vitals.alert push (awaited
  //    server-side, so the delivery completes before this resolves).
  const vital = await page.evaluate(async () => {
    const res = await fetch('/api/vitals/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'heartRate', value: 150, measuredAtMs: Date.now() }),
    });
    return (await res.json()) as { id?: string };
  });
  expect(vital.id).toBeTruthy();

  // 4. The stand-in push service received + decrypted the notification.
  await expect
    .poll(
      async () =>
        page.evaluate(async (url) => {
          const res = await fetch(url);
          return (await res.json()) as { kind?: string }[];
        }, `${RECEIVER}/received`),
      { timeout: 15_000 }
    )
    .toContainEqual(expect.objectContaining({ kind: 'vitals.alert' }));

  const received = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return (await res.json()) as { kind: string; title: string; body: string; link: string }[];
  }, `${RECEIVER}/received`);
  const alert = received.find((p) => p.kind === 'vitals.alert');
  expect(alert).toBeTruthy();
  expect(alert!.title).toBe('Heart rate outside reference range');
  expect(alert!.body).toContain('expected range');
  // Click-routing link (what ngsw navigates to on tap).
  expect(alert!.link).toBe('/vitals');

  // 5. The app — against the real server — surfaces the reading.
  await page.goto(`${APP}/vitals`);
  await expect(page.locator('.alerts')).toContainText('150');
});