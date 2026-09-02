import { test, expect, Page } from '@playwright/test';

/**
 * Phase 3 (PLAN.md §5): PHR vitals — log a reading, see threshold alerts and
 * trends. Backend mocked at the network layer; the store and page logic run
 * for real.
 */

const CLIENT_SESSION = {
  userId: 'u-client-1',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

async function seedSession(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Phase 3 — Vitals', () => {
  test('a client logs a reading and sees the threshold alert + trend', async ({ page }) => {
    await seedSession(page, CLIENT_SESSION);

    // Seeded history: all in range, so no alert before logging.
    const seeded = [
      {
        id: 'vt-1',
        type: 'bloodPressure',
        value: 132,
        value2: 86,
        measuredAtMs: Date.now() - 26 * 60 * 60 * 1000,
        source: 'manual',
      },
      {
        id: 'vt-2',
        type: 'spo2',
        value: 98,
        value2: null,
        measuredAtMs: Date.now() - 25 * 60 * 60 * 1000,
        source: 'manual',
      },
    ];

    await page.route('**/api/vitals/me', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: seeded });
      } else {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: 'vt-9',
            type: body.type,
            value: body.value,
            value2: body.value2,
            measuredAtMs: body.measuredAtMs,
            source: 'manual',
          },
        });
      }
    });

    await page.goto('/vitals');
    await expect(page.getByRole('heading', { name: 'Vitals' })).toBeVisible();

    // Seeded history renders in the trend views.
    await expect(page.getByRole('heading', { name: 'Blood pressure' })).toBeVisible();
    await expect(page.getByText('Latest: 132/86 mmHg')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Threshold alerts' })).not.toBeVisible();

    // Log an out-of-range reading: systolic 165.
    await page.getByLabel('Value in mmHg').fill('165');
    await page.getByLabel('Diastolic (mmHg)').fill('100');
    await page.getByRole('button', { name: 'Save reading' }).click();

    // Threshold alert appears for the new reading (scoped to the alert
    // region — the trend view also contains the same string).
    await expect(page.getByRole('heading', { name: 'Threshold alerts' })).toBeVisible();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('165/100 mmHg');
    await expect(alert).toContainText('outside the normal range');

    // The trend view updates with the new reading as latest.
    await expect(page.getByText('Latest: 165/100 mmHg')).toBeVisible();
  });
});