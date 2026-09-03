import { test, expect, Page } from '@playwright/test';

/**
 * Feature 3 (FEATURE_PLAN.md §3) exit criteria: the full booking lifecycle —
 * accept → start → complete with escrow released (provider), plus client
 * cancellation with the refund reaching the ledger — against network mocks.
 */

const PROVIDER_SESSION = {
  userId: 'cg-1', // matches providerUserId so the provider role resolves
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const CLIENT_SESSION = {
  userId: 'u-client-1',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const HELD_ESCROW = [
  {
    id: 'e-1',
    bookingId: 'b-1',
    providerId: 'cg-1',
    clientId: 'u-client-1',
    amountCents: 4500,
    status: 'held',
    createdAtMs: Date.now() - 24 * 60 * 60 * 1000,
    settledAtMs: null,
  },
];

function makeBooking(status: string) {
  return {
    id: 'b-1',
    caregiverId: 'cg-1',
    caregiverName: 'Elena Papadaki',
    clientId: 'u-client-1',
    clientName: 'Maria Papadopoulou',
    providerUserId: 'cg-1',
    scheduledAtMs: Date.now() + 48 * 60 * 60 * 1000,
    note: 'Morning insulin injection',
    status,
    createdAtMs: Date.now() - 24 * 60 * 60 * 1000,
  };
}

async function seedSession(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Feature 3 — Booking lifecycle', () => {
  test('provider: accept → start → complete releases the escrow', async ({ page }) => {
    const booking = makeBooking('requested');
    const escrow = structuredClone(HELD_ESCROW);

    await seedSession(page, PROVIDER_SESSION);
    await page.route('**/api/bookings', (route) =>
      route.fulfill({ json: [booking] })
    );
    await page.route('**/api/bookings/b-1/events', (route) =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/reviews', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/payments/escrow', (route) =>
      route.fulfill({ json: escrow })
    );

    await page.route('**/api/bookings/b-1/accept', (route) => {
      booking.status = 'accepted';
      return route.fulfill({ json: booking });
    });
    await page.route('**/api/bookings/b-1/start', (route) => {
      booking.status = 'in_progress';
      return route.fulfill({ json: booking });
    });
    let released = false;
    await page.route('**/api/bookings/b-1/complete', (route) => {
      booking.status = 'completed';
      return route.fulfill({ json: booking });
    });
    await page.route('**/api/payments/escrow/e-1/release', (route) => {
      released = true;
      escrow[0].status = 'released';
      escrow[0].settledAtMs = Date.now();
      return route.fulfill({ json: escrow[0] });
    });

    await page.goto('/bookings');
    await expect(page.getByText('requested', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByText('accepted', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start visit' }).click();
    await expect(page.getByText('in_progress', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Complete (releases escrow)' }).click();
    await expect(page.getByText('completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Visit completed — escrow released.')).toBeVisible();
    expect(released).toBe(true);
  });

  test('client: cancel shows the policy preview and the refund reaches the ledger', async ({ page }) => {
    const booking = makeBooking('accepted');
    const escrow = structuredClone(HELD_ESCROW);

    await seedSession(page, CLIENT_SESSION);
    await page.route('**/api/bookings', (route) =>
      route.fulfill({ json: [booking] })
    );
    await page.route('**/api/bookings/b-1/events', (route) =>
      route.fulfill({ json: [] })
    );
    await page.route('**/api/reviews', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/payments/escrow', (route) =>
      route.fulfill({ json: escrow })
    );
    await page.route('**/api/bookings/b-1/cancel', (route) => {
      booking.status = 'cancelled';
      escrow[0].status = 'refunded';
      escrow[0].settledAtMs = Date.now();
      return route.fulfill({ json: booking });
    });

    await page.goto('/bookings');
    await expect(page.getByText('accepted', { exact: true })).toBeVisible();

    // First click previews the policy (visit is >24h away → free).
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText(/Free cancellation/)).toBeVisible();

    // Second click executes.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('cancelled', { exact: true })).toBeVisible();

    // The refund is visible in the payments ledger.
    await page.goto('/payments');
    await expect(page.getByText('refunded', { exact: true })).toBeVisible();
  });
});
