import { test, expect, Page } from '@playwright/test';

/**
 * Feature 7 (FEATURE_PLAN.md §7) exit criteria: log a dose → adherence
 * updates; a missed critical dose raises the family alert (in-page strip +
 * notification-center entry). Backend mocked at the network layer; the store,
 * schedule expansion, grace-window and alert-once logic run for real.
 *
 * The browser clock is pinned to Wed 2026-09-02 12:00 local so the 08:00
 * critical dose is past its 60-minute grace window (missed) while the 20:00
 * dose is still pending.
 */

const NOON = new Date(2026, 8, 2, 12, 0);

const MEDICATIONS = [
  {
    id: 'med-e2e-1',
    name: 'Insulin glargine',
    dose: '10 units',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    critical: true,
    prescriber: 'Dr. Stavrou',
    refillDueDate: '2026-09-20',
    supplyDays: 30,
    archived: false,
    createdAtMs: new Date(2026, 7, 3).getTime(),
  },
  {
    id: 'med-e2e-2',
    name: 'Atorvastatin',
    dose: '20 mg',
    schedule: { kind: 'daily', timesMinutes: [21 * 60] },
    critical: false,
    prescriber: 'Dr. Stavrou',
    // Due in 3 days → inside the 5-day warning window (subtask 14).
    refillDueDate: '2026-09-05',
    supplyDays: 30,
    archived: false,
    createdAtMs: new Date(2026, 6, 3).getTime(),
  },
];

let logs: Array<Record<string, unknown>> = [];

async function seed(page: Page): Promise<void> {
  logs = [];
  await page.addInitScript(() => {
    localStorage.setItem(
      'cm.session.v1',
      JSON.stringify({
        userId: 'u-client-1',
        displayName: 'Maria Papadopoulou',
        roles: ['client'],
        expiresAtMs: Date.now() + 60 * 60 * 1000,
      })
    );
  });
  await page.clock.install({ time: NOON });
  await page.route('**/api/me/medications', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { medications: MEDICATIONS, logs } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route('**/api/medications/*/log', (route) => {
    const url = new URL(route.request().url());
    const medicationId = url.pathname.split('/')[3];
    const body = route.request().postDataJSON() as {
      date: string;
      timeMinutes: number;
      action: 'taken' | 'skipped';
      loggedBy?: string;
    };
    const entry = {
      id: `ml-${Date.now().toString(36)}`,
      medicationId,
      date: body.date,
      timeMinutes: body.timeMinutes,
      action: body.action,
      atMs: Date.now(),
      loggedBy: body.loggedBy ?? 'me',
    };
    logs = [
      ...logs.filter(
        (l) =>
          !(
            l['medicationId'] === medicationId &&
            l['date'] === entry.date &&
            l['timeMinutes'] === entry.timeMinutes
          )
      ),
      entry,
    ];
    return route.fulfill({ json: entry });
  });
  await page.route('**/api/medications/*/interactions', (route) =>
    route.fulfill({
      json: {
        medicationId: 'med-e2e-1',
        severity: 'none',
        message: 'No known interactions (demo).',
      },
    })
  );
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
}

test.describe('Feature 7 — Medications', () => {
  test('log dose → slot shows taken and adherence updates', async ({ page }) => {
    await seed(page);
    await page.goto('/medications');
    await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();

    // Missed critical dose (08:00 + grace < 12:00) raises the alert strip.
    await expect(page.getByRole('alert').first()).toContainText('Insulin glargine');

    // Low-refill reminder names the drug with days remaining.
    await expect(page.getByRole('status').first()).toContainText('Atorvastatin');

    // Per-med adherence starts at 0% (14 scheduled in 7 days, none taken).
    await expect(page.getByText('0%', { exact: true }).first()).toBeVisible();

    // Log the missed 08:00 dose as taken (first Taken button in DOM order).
    await page.getByRole('button', { name: '✓ Taken' }).first().click();
    await expect(page.getByText('✓ taken').first()).toBeVisible();
    await expect(page.getByText('marked taken.')).toBeVisible();

    // 1 of 14 scheduled doses → 7% on the per-med strip.
    await expect(page.getByText('7%', { exact: true }).first()).toBeVisible();
  });

  test('missed critical dose raises the family alert in the notification center', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/medications');
    await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();
    await expect(page.getByRole('alert').first()).toContainText('Insulin glargine');

    // The store's critical-miss alert lands in the shared notification center:
    // the shell bell carries an unread count…
    await expect(
      page.getByRole('button', { name: /Notifications, \d+ unread/ })
    ).toBeVisible();

    // …and the panel lists the missed-dose family alert.
    await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
    await expect(
      page.getByRole('dialog', { name: 'Notifications' })
    ).toContainText('Missed dose: Insulin glargine');
  });
});
