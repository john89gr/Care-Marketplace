import { test, expect } from '@playwright/test';

/**
 * Feature 6 (FEATURE_PLAN.md §6) exit criterion: a due screening shows,
 * marking it done moves it to history. Backend mocked at the network layer.
 */

// 1968-03-14 → 58-year-old woman: mammography + cardio + smear + FIT due.
const PROFILE = { dateOfBirth: '1968-03-14', sex: 'female' };
let records: Array<Record<string, unknown>> = [];

test.beforeEach(async ({ page }) => {
  records = [];
  await page.addInitScript(() => {
    localStorage.setItem('cm.session.v1', JSON.stringify({
      userId: 'u-client-1',
      displayName: 'Maria Papadopoulou',
      roles: ['client'],
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    }));
  });
  await page.route('**/api/me/screenings', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { profile: PROFILE, records } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/me/screenings/*/done', (route) => {
    const url = new URL(route.request().url());
    const type = url.pathname.split('/')[4];
    const record = {
      id: `scr-${type}`,
      type,
      status: 'done',
      atMs: Date.now(),
    };
    records = [...records.filter((r) => r.type !== type), record];
    return route.fulfill({ json: record });
  });
  await page.route('**/api/me/screenings/*/waive', (route) => {
    const url = new URL(route.request().url());
    const type = url.pathname.split('/')[4];
    const body = route.request().postDataJSON() as { reason?: string };
    if (!body.reason?.trim()) {
      return route.fulfill({ status: 422, json: { message: 'A reason is required to waive a screening.' } });
    }
    const record = { id: `scr-${type}`, type, status: 'waived', atMs: Date.now(), reason: body.reason };
    records = [...records.filter((r) => r.type !== type), record];
    return route.fulfill({ json: record });
  });
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
  await page.route('**/api/ws/**', (route) => route.fulfill({ status: 400, json: {} }));
});

test('due screening shows, mark done moves it to history', async ({ page }) => {
  await page.goto('/screenings');
  await expect(page.getByRole('heading', { name: 'Preventive care' })).toBeVisible();

  // Disclaimer is present (not medical advice).
  await expect(page.getByRole('note')).toContainText('not medical advice');

  // Due tab lists the expected screenings for a 58-year-old woman.
  const dueTab = page.getByRole('tab', { name: /Due/ });
  await expect(dueTab).toContainText(/\(\d+\)/);
  await expect(page.getByRole('heading', { name: 'Mammography' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cardiovascular check' })).toBeVisible();

  // Mark mammography done.
  await page.getByRole('button', { name: 'Mark done' }).first().click();

  // It leaves the due list (button re-render) and appears in history.
  await page.getByRole('tab', { name: /History/ }).click();
  await expect(page.getByText(/Completed just now|Completed \d|Completed/).first()).toBeVisible();
});

test('waive requires a reason', async ({ page }) => {
  await page.goto('/screenings');
  await expect(page.getByRole('heading', { name: 'Mammography' })).toBeVisible();

  // Open the waive form and submit without a reason → error surfaces.
  await page.getByRole('button', { name: 'Waive…' }).first().click();
  await page.getByRole('button', { name: 'Waive', exact: true }).click();
  await expect(page.getByText(/reason is required/i)).toBeVisible();

  // With a reason it succeeds and lands in history as waived.
  await page.getByLabel('Reason for waiving').fill('Doctor advised against it this year');
  await page.getByRole('button', { name: 'Waive', exact: true }).click();
  await page.getByRole('tab', { name: /History/ }).click();
  await expect(page.getByText(/Waived .*—/).first()).toBeVisible();
});
