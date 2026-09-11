import { test, expect, Locator, Page } from '@playwright/test';

/**
 * Track 1 (HEALTH_RECORDS_PLAN.md) exit criteria: the contact phone manager
 * manages two groups — emergency / ICE and the care team — over the real demo
 * backend (no network mocks). Adding a primary ICE contact demotes the other
 * primary, a care contact keeps its tap-to-call number, archiving removes the
 * row, and the directory feeds the health-summary export preview.
 *
 * The demo backend keeps its state in module memory, so the spec navigates
 * through the in-app shell nav (SPA routing) rather than `page.goto`, which
 * would reload the app and reset the in-memory store.
 */

const CLIENT = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 3_600_000,
};

async function seedDemoSession(page: Page): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, CLIENT);
}

/** The grouped directory section whose heading matches (ICE or care team). */
function group(page: Page, heading: string): Locator {
  return page
    .locator('section.group')
    .filter({ has: page.getByRole('heading', { name: heading }) });
}

test('a new primary ICE contact demotes the old one and reaches the export', async ({ page }) => {
  await seedDemoSession(page);
  await page.goto('/contacts?demo=1');
  await expect(page.getByRole('heading', { name: 'Επαφές & Τηλέφωνα' })).toBeVisible();

  const emergency = group(page, 'Επαφές έκτακτης ανάγκης (ICE)');
  const spouse = emergency.locator('article.contact').filter({ hasText: 'Γιώργος Παπαδόπουλος' });
  await expect(spouse.getByText('Κύρια')).toBeVisible();

  await emergency.getByRole('button', { name: '+ Προσθήκη' }).click();
  const form = emergency.locator('form');
  await form.getByLabel('Όνομα *').fill('Νίκος Παπαδόπουλος');
  await form.getByLabel(/Σχέση/).fill('Αδελφός');
  await form.getByLabel('Τηλέφωνο *').fill('6970000009');
  await form.getByLabel('Κύρια επαφή').check();
  await form.getByRole('button', { name: 'Αποθήκευση' }).click();

  const added = emergency.locator('article.contact').filter({ hasText: 'Νίκος Παπαδόπουλος' });
  await expect(added.getByText('Κύρια')).toBeVisible();
  await expect(added.getByRole('link', { name: /6970000009/ })).toHaveAttribute(
    'href',
    'tel:6970000009'
  );
  // Exactly one primary per group: the seeded spouse loses the badge (it now
  // offers "Ορισμός ως κύρια" instead).
  await expect(emergency.locator('.badge')).toHaveCount(1);
  await expect(spouse.locator('.badge')).toHaveCount(0);
  await expect(spouse.getByRole('button', { name: 'Ορισμός ως κύρια' })).toBeVisible();

  // The directory feeds the health-summary export (SPA nav keeps demo state):
  // 2 seeded ICE contacts + the one just added.
  await page.getByRole('link', { name: 'Health record' }).click();
  await page.getByRole('link', { name: 'Health summary export' }).click();
  await expect(page.getByRole('heading', { name: 'Health summary export' })).toBeVisible();
  await expect(page.getByRole('status').first()).toContainText('3 emergency contacts');
});

test('a care-team contact taps to call and archives out of the list', async ({ page }) => {
  await seedDemoSession(page);
  await page.goto('/contacts?demo=1');
  await expect(page.getByRole('heading', { name: 'Επαφές & Τηλέφωνα' })).toBeVisible();

  const care = group(page, 'Ομάδα φροντίδας');
  await care.getByRole('button', { name: '+ Προσθήκη' }).click();
  const form = care.locator('form');
  await form.getByLabel('Όνομα *').fill('Φαρμακείο Κέντρου');
  await form.getByLabel('Ρόλος').selectOption('pharmacy');
  await form.getByLabel('Τηλέφωνο *').fill('2101234567');
  await form.getByRole('button', { name: 'Αποθήκευση' }).click();

  const card = care.locator('article.contact').filter({ hasText: 'Φαρμακείο Κέντρου' });
  await expect(card.getByRole('heading', { name: /Φαρμακείο Κέντρου/ })).toBeVisible();
  await expect(card.getByRole('link', { name: /2101234567/ })).toHaveAttribute(
    'href',
    'tel:2101234567'
  );

  await card.getByRole('button', { name: 'Αρχειοθέτηση' }).click();
  await expect(card).toHaveCount(0);
});
