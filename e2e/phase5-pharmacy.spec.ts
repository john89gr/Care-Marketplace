import { test, expect } from '@playwright/test';

/**
 * Feature 9 (FEATURE_PLAN.md §9) exit criterion: scan (mocked) → order routed
 * → status advances → delivered → added to medications. Backend mocked at the
 * network layer; the WS path is covered by the store unit tests.
 */

interface MockOrder {
  id: string;
  prescriptionId: string;
  clientId: string;
  pharmacyId: string | null;
  pharmacyName: string | null;
  meds: { name: string; dose: string; qty: number }[];
  prescriber: string;
  status: string;
  deliveryAddress: string;
  timeline: { status: string; atMs: number; note?: string }[];
  createdAtMs: number;
  updatedAtMs: number;
}

let orders: MockOrder[];
let scanMode: 'routed' | 'failed' | 'unreadable';

const routedOrder = (): MockOrder => ({
  id: 'po-1',
  prescriptionId: 'rx-1',
  clientId: 'u-client',
  pharmacyId: 'ph-1',
  pharmacyName: 'Syntagma Central Pharmacy',
  meds: [{ name: 'Atorvastatin', dose: '20 mg', qty: 30 }],
  prescriber: 'Dr. Stavrou',
  status: 'routed',
  deliveryAddress: 'Mitropoleos 12, Athens',
  timeline: [
    { status: 'uploaded', atMs: Date.now() - 60_000 },
    { status: 'routed', atMs: Date.now(), note: 'Routed to Syntagma Central Pharmacy (1.1 km)' },
  ],
  createdAtMs: Date.now() - 60_000,
  updatedAtMs: Date.now(),
});

test.beforeEach(async ({ page }) => {
  orders = [routedOrder()];
  scanMode = 'routed';
  await page.addInitScript(() => {
    localStorage.setItem('cm.session.v1', JSON.stringify({
      userId: 'u-client',
      displayName: 'Maria Papadopoulou',
      roles: ['client'],
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    }));
  });
  await page.route('**/api/profiles/me', (route) =>
    route.fulfill({
      json: {
        userId: 'u-client',
        displayName: 'Maria Papadopoulou',
        phone: '6940000000',
        amka: '01010112345',
        afm: '000000000',
        licenceNumber: '',
        hourlyRate: null,
        address: 'Mitropoleos 12, Athens',
      },
    })
  );
  await page.route('**/api/prescriptions/scan', (route) => {
    if (scanMode === 'unreadable') {
      return route.fulfill({
        status: 422,
        json: { message: 'The barcode could not be read. Please check the code or enter the details manually.' },
      });
    }
    const body = route.request().postDataJSON() as { deliveryAddress?: string };
    const order: MockOrder = {
      ...routedOrder(),
      id: 'po-new',
      status: scanMode === 'failed' ? 'failed' : 'routed',
      pharmacyId: scanMode === 'failed' ? null : 'ph-1',
      pharmacyName: scanMode === 'failed' ? null : 'Syntagma Central Pharmacy',
      deliveryAddress: String(body.deliveryAddress ?? ''),
    };
    orders.unshift(order);
    return route.fulfill({
      json: {
        prescription: {
          id: 'rx-new',
          barcodePayload: 'mock',
          meds: order.meds,
          prescriber: 'Dr. Stavrou',
          state: 'confirmed',
          createdAtMs: Date.now(),
        },
        order,
      },
    });
  });
  await page.route('**/api/me/pharmacy-orders', (route) =>
    route.fulfill({ json: orders })
  );
  await page.route('**/api/pharmacy-orders/*/status', (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    const { to } = route.request().postDataJSON() as { to: string };
    const order = orders.find((o) => o.id === id);
    if (!order) {
      return route.fulfill({ status: 404, json: { message: 'Order not found.' } });
    }
    order.status = to;
    order.updatedAtMs = Date.now();
    order.timeline.push({ status: to, atMs: Date.now() });
    return route.fulfill({ json: order });
  });
  await page.route('**/api/me/medications', (route) =>
    route.fulfill({ json: { id: 'med-imported' } })
  );
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
});

test('manual entry scans, confirms meds and routes to a pharmacy', async ({ page }) => {
  await page.goto('/prescriptions');
  await expect(page.getByRole('heading', { name: 'E-prescription scan' })).toBeVisible();

  // Delivery address is prefilled from the profile but overridable.
  await expect(page.getByLabel('Delivery address')).toHaveValue('Mitropoleos 12, Athens');

  // Manual entry is fully keyboard operable: type, preview, submit.
  await page.getByLabel(/Code or medication lines/).fill(
    '{"prescriber":"Dr. Stavrou","meds":[{"name":"Atorvastatin","dose":"20 mg","qty":30}]}'
  );
  await expect(page.getByText(/Parsed medications/)).toBeVisible();
  await expect(page.getByText(/Atorvastatin/)).toBeVisible();

  await page.getByRole('button', { name: 'Submit prescription' }).click();
  await expect(page.getByText(/Routed to/)).toBeVisible();
  await expect(page.getByText('Syntagma Central Pharmacy').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Track in pharmacy orders/ })).toBeVisible();
});

test('unreadable barcode surfaces an error with retry', async ({ page }) => {
  scanMode = 'unreadable';
  await page.goto('/prescriptions');
  await page.getByLabel(/Code or medication lines/).fill('not-a-real-code');
  await page.getByRole('button', { name: 'Submit prescription' }).click();
  await expect(page.getByRole('alert')).toContainText(/could not be read/);

  // Retry returns focus to the code field for keyboard users.
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByLabel(/Code or medication lines/)).toBeFocused();
});

test('order timeline advances to delivered, then imports to medications', async ({ page }) => {
  await page.goto('/pharmacy-orders');
  await expect(page.getByRole('heading', { name: 'Order po-1' })).toBeVisible();
  await expect(page.getByText('Routed to pharmacy').first()).toBeVisible();
  await expect(page.getByText(/Routed to Syntagma Central Pharmacy/)).toBeVisible();

  // Simulate the WS/API status progression, then refresh.
  orders[0]!.status = 'delivered';
  orders[0]!.updatedAtMs = Date.now();
  orders[0]!.timeline.push({ status: 'delivered', atMs: Date.now() });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Delivered').first()).toBeVisible();

  await page.getByRole('button', { name: 'Add to my medications' }).click();
  await expect(page.getByText(/added — review the schedule/)).toBeVisible();
  await expect(page.getByText(/Added to your medications/)).toBeVisible();
});

test('failed routing offers a retry that re-routes', async ({ page }) => {
  orders = [{ ...routedOrder(), id: 'po-bad', status: 'failed', pharmacyId: null, pharmacyName: null }];
  await page.goto('/pharmacy-orders');
  await expect(page.getByRole('heading', { name: 'Order po-bad' })).toBeVisible();

  await page.getByRole('button', { name: 'Retry routing' }).click();
  await expect(page.getByText(/re-routed/)).toBeVisible();
});
