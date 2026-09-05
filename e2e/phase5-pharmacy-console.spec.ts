import { test, expect, Page } from '@playwright/test';

/**
 * Feature 9 (FEATURE_PLAN.md §9 subtask 12 / 19): the PHARMACY-role console
 * at /pharmacy — queued orders with state-machine-guarded fulfilment actions,
 * plus the RBAC guard that keeps non-pharmacy roles out. Runs against network
 * mocks, matching the sibling phase5-pharmacy.spec.ts conventions.
 */

const PHARMACY_SESSION = {
  userId: 'u-pharmacy',
  displayName: 'Syntagma Central Pharmacy',
  roles: ['pharmacy'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const CLIENT_SESSION = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

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

function orderWith(status: string): MockOrder {
  return {
    id: 'po-console',
    prescriptionId: 'rx-1',
    clientId: 'u-client',
    pharmacyId: 'ph-1',
    pharmacyName: 'Syntagma Central Pharmacy',
    meds: [{ name: 'Atorvastatin', dose: '20 mg', qty: 30 }],
    prescriber: 'Dr. Stavrou',
    status,
    deliveryAddress: 'Mitropoleos 12, Athens',
    timeline: [
      { status: 'uploaded', atMs: Date.now() - 3_600_000 },
      { status: 'routed', atMs: Date.now() - 3_000_000, note: 'Routed to Syntagma Central Pharmacy (1.1 km)' },
    ],
    createdAtMs: Date.now() - 3_600_000,
    updatedAtMs: Date.now() - 3_000_000,
  };
}

async function seedSession(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

async function mockPharmacyApi(page: Page): Promise<MockOrder> {
  const order = orderWith('routed');
  await page.route('**/api/me/pharmacy-orders', (route) => route.fulfill({ json: [order] }));
  await page.route('**/api/pharmacy-orders/*/status', (route) => {
    const { to } = route.request().postDataJSON() as { to: string };
    order.status = to;
    order.updatedAtMs = Date.now();
    order.timeline.push({ status: to, atMs: Date.now() });
    return route.fulfill({ json: order });
  });
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
  return order;
}

test('pharmacy console advances an order through the fulfilment pipeline', async ({ page }) => {
  await seedSession(page, PHARMACY_SESSION);
  const order = await mockPharmacyApi(page);

  await page.goto('/pharmacy');
  await expect(page.getByRole('heading', { name: 'Pharmacy console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Order po-console' })).toBeVisible();
  // Queued orders expose the delivery address + line items.
  await expect(page.getByText('Deliver to: Mitropoleos 12, Athens')).toBeVisible();
  await expect(page.getByText(/Atorvastatin/)).toBeVisible();
  // Routed order offers the next legal actions only.
  await expect(page.locator('.chip[data-status="routed"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accepted' })).toBeVisible();

  // Each fulfilment action replaces the chip and yields the next legal action.
  await page.getByRole('button', { name: 'Accepted' }).click();
  await expect(page.locator('.chip[data-status="accepted"]')).toBeVisible();

  await page.getByRole('button', { name: 'Preparing' }).click();
  await expect(page.locator('.chip[data-status="preparing"]')).toBeVisible();

  await page.getByRole('button', { name: 'Out for delivery' }).click();
  await expect(page.locator('.chip[data-status="out_for_delivery"]')).toBeVisible();

  await page.getByRole('button', { name: 'Delivered' }).click();
  await expect(page.locator('.chip[data-status="delivered"]')).toBeVisible();
  await expect(page.getByText('No further actions.')).toBeVisible();

  // The same store kept the mock in sync end to end.
  expect(order.status).toBe('delivered');
  expect(order.timeline.map((e) => e.status)).toEqual([
    'uploaded',
    'routed',
    'accepted',
    'preparing',
    'out_for_delivery',
    'delivered',
  ]);
});

test('a terminal order shows no fulfilment buttons', async ({ page }) => {
  await seedSession(page, PHARMACY_SESSION);
  const order = orderWith('delivered');
  await page.route('**/api/me/pharmacy-orders', (route) => route.fulfill({ json: [order] }));
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );

  await page.goto('/pharmacy');
  await expect(page.locator('.chip[data-status="delivered"]')).toBeVisible();
  await expect(page.getByText('No further actions.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delivered' })).toHaveCount(0);
});

test('non-pharmacy roles are blocked from the console (RBAC guard)', async ({ page }) => {
  await seedSession(page, CLIENT_SESSION);
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );

  await page.goto('/pharmacy');
  await expect(page).toHaveURL(/\/forbidden/);
  await expect(page.getByRole('heading', { name: /Accès refusé/ })).toBeVisible();
});
