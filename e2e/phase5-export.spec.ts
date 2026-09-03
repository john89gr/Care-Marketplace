import { test, expect } from '@playwright/test';

/**
 * Feature 10 (FEATURE_PLAN.md §10) exit criterion: export click → a
 * `health-summary-<date>.pdf` download fires, composed from profile +
 * vitals + meds + screenings + care-plan. Backend mocked at the network
 * layer; payload composition + PDF generation run for real.
 */

test.beforeEach(async ({ page }) => {
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

  await page.route('**/api/profiles/me', (route) =>
    route.fulfill({
      json: {
        userId: 'u-client-1',
        displayName: 'Maria Papadopoulou',
        phone: '6940000000',
        amka: '01010112345',
        afm: '000000000',
        licenceNumber: '',
        hourlyRate: null,
      },
    })
  );
  await page.route('**/api/vitals/me', (route) =>
    route.fulfill({
      json: [
        { id: 'vt-1', type: 'bloodPressure', value: 132, value2: 86, measuredAtMs: Date.now() - 26 * 60 * 60 * 1000, source: 'manual' },
        { id: 'vt-2', type: 'heartRate', value: 74, value2: null, measuredAtMs: Date.now() - 25 * 60 * 60 * 1000, source: 'manual' },
      ],
    })
  );
  await page.route('**/api/me/medications', (route) =>
    route.fulfill({
      json: {
        medications: [
          {
            id: 'med-1',
            name: 'Insulin glargine',
            dose: '10 units',
            schedule: { kind: 'daily', timesMinutes: [480] },
            critical: true,
            prescriber: 'Dr. Stavrou',
            createdAtMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
          },
        ],
        logs: [],
      },
    })
  );
  await page.route('**/api/me/screenings', (route) =>
    route.fulfill({
      json: {
        profile: { dateOfBirth: '1968-03-14', sex: 'female' },
        records: [{ id: 'scr-1', type: 'cardioCheck', status: 'done', atMs: Date.now() - 400 * 24 * 60 * 60 * 1000 }],
      },
    })
  );
  await page.route('**/api/care-plans*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'cp-1',
          clientId: 'u-client-1',
          clientName: 'Maria Papadopoulou',
          goals: [{ id: 'g-1', text: 'Mobilise shoulder daily', status: 'in-progress' }],
          notes: [],
          updatedAtMs: Date.now(),
          updatedBy: 'Elena Papadaki',
        },
      ],
    })
  );
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
  await page.route('**/api/audit', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/ws/**', (route) => route.fulfill({ status: 400, json: {} }));
});

test('export click fires a health-summary PDF download', async ({ page }) => {
  await page.goto('/health-summary');
  await expect(page.getByRole('heading', { name: 'Health summary export' })).toBeVisible();

  // Export is blocked until consent is confirmed (no silent generation).
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByRole('alert')).toContainText(/consent/i);

  // Confirm consent, pick a range, then export → download event fires.
  await page.getByText(/I consent to exporting/).click();
  await page.getByLabel(/Last 30 days/).check();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^health-summary-\d{4}-\d{2}-\d{2}\.pdf$/);

  // The export is acknowledged in the UI.
  await expect(page.getByText(/Last export:/)).toContainText('health-summary-');
});

test('range selector updates the summary and share stub renders a link', async ({ page }) => {
  await page.goto('/health-summary');
  await page.getByText(/I consent to exporting/).click();

  await page.getByLabel(/All history/).check();
  await expect(page.getByRole('status').first()).toContainText(/2 vitals readings/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await downloadPromise;

  await page.getByRole('button', { name: 'Share with physician' }).click();
  await expect(page.getByText(/health-summary-share:\/\//)).toBeVisible();
});
