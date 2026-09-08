import { test, expect, Page } from '@playwright/test';

/**
 * Feature 20 (§20 subtask 9): the browser-push opt-in prompt appears after
 * the FIRST completed booking — never on page load — and only once per user:
 * dismissing it persists a flag, so a later completed booking does not prompt
 * again.
 */

const PROVIDER_SESSION = {
  userId: 'cg-1', // matches providerUserId so the provider role resolves
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

function makeBooking(status: string, id = 'b-1') {
  return {
    id,
    caregiverId: 'cg-1',
    caregiverName: 'Elena Papadaki',
    clientId: 'u-client-1',
    clientName: 'Maria Papadopoulou',
    providerUserId: 'cg-1',
    scheduledAtMs: Date.now() + 48 * 60 * 60 * 1000,
    note: 'Morning insulin injection',
    status,
    createdAtMs: Date.now() - 24 * 60 * 60 * 1000,
    pendingReschedule: null,
  };
}

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    // Simulate a user who hasn't decided about notifications yet: headless
    // Chromium defaults the permission to 'denied', which would suppress the
    // prompt entirely. 'default' is the real precondition for the opt-in.
    Object.defineProperty(Notification, 'permission', { get: () => 'default' });
    // Keep the grant path inert — this test exercises the prompt, not the
    // (server-dependent) subscription handshake.
    Notification.requestPermission = () => Promise.resolve('denied') as Promise<NotificationPermission>;
  }, PROVIDER_SESSION);
}

/** Mock the booking lifecycle endpoints for one booking (accept/start/complete). */
async function mockBookingLifecycle(page: Page, booking: ReturnType<typeof makeBooking>): Promise<void> {
  await page.route('**/api/bookings', (route) => route.fulfill({ json: [booking] }));
  await page.route(`**/api/bookings/${booking.id}/events`, (route) => route.fulfill({ json: [] }));
  await page.route('**/api/reviews', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/payments/escrow', (route) =>
    route.fulfill({
      json: [
        {
          id: 'e-1',
          bookingId: booking.id,
          providerId: 'cg-1',
          clientId: 'u-client-1',
          amountCents: 4500,
          status: 'held',
          createdAtMs: Date.now() - 24 * 60 * 60 * 1000,
          settledAtMs: null,
        },
      ],
    })
  );
  await page.route(`**/api/bookings/${booking.id}/accept`, (route) => {
    booking.status = 'accepted';
    return route.fulfill({ json: booking });
  });
  await page.route(`**/api/bookings/${booking.id}/start`, (route) => {
    booking.status = 'in_progress';
    return route.fulfill({ json: booking });
  });
  await page.route(`**/api/bookings/${booking.id}/complete`, (route) => {
    booking.status = 'completed';
    return route.fulfill({ json: booking });
  });
}

/** Drive the provider through accept → start → complete on the bookings page. */
async function completeBooking(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByRole('button', { name: 'Start visit' }).click();
  await page.getByRole('button', { name: 'Complete (releases escrow)' }).click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
}

test('push opt-in prompt appears after the first completed booking and only once', async ({
  page,
}) => {
  await seedSession(page);
  const booking = makeBooking('requested', 'b-1');
  await mockBookingLifecycle(page, booking);

  await page.goto('/bookings');

  // Never on load — the prompt requires a completed booking.
  await expect(page.locator('.push-prompt')).toBeHidden();

  // First completed booking → the prompt appears.
  await completeBooking(page);
  await expect(page.locator('.push-prompt')).toBeVisible();
  await expect(page.getByText('Never miss a booking update.')).toBeVisible();

  // Dismissing persists the flag.
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('.push-prompt')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('cm.push.prompted.v1'))).toBe('1');

  // A second completed booking must NOT re-prompt (appears once per user).
  const booking2 = makeBooking('requested', 'b-2');
  await mockBookingLifecycle(page, booking2);
  await page.goto('/bookings');
  await expect(page.getByText('requested', { exact: true })).toBeVisible();
  await completeBooking(page);
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await expect(page.locator('.push-prompt')).toBeHidden();
});