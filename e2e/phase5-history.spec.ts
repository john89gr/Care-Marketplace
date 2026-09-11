import { test, expect, Page } from '@playwright/test';

/**
 * Medical history & prescriptions register (FEATURE_PLAN.md §21) exit
 * criterion: the register works end-to-end in demo mode (no backend) — the
 * seeded rows render for the client, the client can add a record, and a
 * family role opens another user's register read-only through the
 * consent-gated family endpoint (server enforcement mirrored by the demo API).
 */

const CLIENT = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 3_600_000,
};

const NURSE = {
  userId: 'u-nurse',
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  expiresAtMs: Date.now() + 3_600_000,
};

/** The nurse's visit — drives care-recipient resolution (client = u-client). */
const VISIT = {
  id: 'visit-1',
  shiftId: 's-1',
  bookingId: 'b-1',
  providerId: 'u-nurse',
  clientId: 'u-client',
  clientName: 'Maria Papadopoulou',
  providerName: 'Elena Papadaki',
  act: 'Injection',
  scheduledAtMs: Date.now() - 60_000,
  status: 'in-progress',
  checkIn: null,
  checkOut: null,
};

async function seedDemoSession(page: Page, session: typeof CLIENT): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, session);
}

test('client sees the seeded register and can add a record without a backend', async ({ page }) => {
  await seedDemoSession(page, CLIENT);
  await page.goto('/history?demo=1');
  await expect(page.getByRole('heading', { name: 'Ιατρικό ιστορικό' })).toBeVisible();

  // Conditions tab (default): the seeded chronic condition, ICD-11 labelled.
  await expect(page.getByRole('heading', { name: 'Υπέρταση' })).toBeVisible();
  await expect(page.getByText(/Χρόνια · BA00|BA00/).first()).toBeVisible();

  // Allergies: the seeded severe drug allergy (safety banner source).
  await page.getByRole('tab', { name: 'Αλλεργίες' }).click();
  await expect(page.getByRole('heading', { name: 'Πενικιλίνη' })).toBeVisible();

  // Immunizations: wallet-imported row carries the Gov.gr source label.
  await page.getByRole('tab', { name: 'Εμβολιασμοί' }).click();
  await expect(page.getByRole('heading', { name: /COVID-19/ })).toBeVisible();
  await expect(page.getByText('από Gov.gr Wallet')).toBeVisible();

  // Prescriptions register: the seeded active prescription.
  await page.getByRole('tab', { name: 'Συνταγές' }).click();
  await expect(page.getByRole('heading', { name: 'Ατορβαστατίνη' })).toBeVisible();

  // Add a symptom → optimistic create round-trips through the demo backend.
  await page.getByRole('tab', { name: 'Συμπτώματα' }).click();
  await page.getByRole('button', { name: '+ Προσθήκη συμπτώματος' }).click();
  await page.getByLabel('Σύμπτωμα').fill('Ζάλη');
  await page.getByRole('button', { name: 'Αποθήκευση' }).click();
  await expect(page.getByRole('heading', { name: 'Ζάλη' })).toBeVisible();
});

test('nurse views the care recipient record read-only via the family endpoint', async ({ page }) => {
  await seedDemoSession(page, NURSE);
  await page.goto('/history?demo=1');

  // The read-only notice names the recipient resolved from the nurse's visits.
  await expect(page.getByRole('note').filter({ hasText: 'Maria Papadopoulou' })).toBeVisible();

  // The recipient's seeded register renders (family read, consent granted).
  await expect(page.getByRole('heading', { name: 'Υπέρταση' })).toBeVisible();

  // Family roles get no write controls.
  await expect(page.getByRole('button', { name: /Προσθήκη πάθησης/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Αρχειοθέτηση/ })).toHaveCount(0);
});

test('surfaces the consent error when the family endpoint refuses', async ({ page }) => {
  // No demo flag: requests go to the network so the 403 can be simulated.
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.removeItem('cm.demo.v1');
  }, NURSE);
  await page.route('**/api/visits/me', (route) => route.fulfill({ json: [VISIT] }));
  await page.route('**/api/history/u-client/**', (route) =>
    route.fulfill({
      status: 403,
      json: { message: 'This person has not granted family-sharing consent.' },
    })
  );
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
  await page.route('**/api/ws/**', (route) => route.fulfill({ status: 400, json: {} }));

  await page.goto('/history');
  await expect(page.getByRole('alert')).toContainText(
    'has not granted family-sharing consent'
  );
});
