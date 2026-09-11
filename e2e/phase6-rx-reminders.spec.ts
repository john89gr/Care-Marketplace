import { test, expect, Page } from '@playwright/test';

/**
 * Track 3 (HEALTH_RECORDS_PLAN.md) exit criteria: a prescription's free-text
 * frequency drives the pill-reminder wizard end-to-end in demo mode (no
 * backend). A "1x3" prescription pre-fills 08:00/14:00/20:00, confirming it
 * creates the medication with that schedule and wires the reminders; an
 * "SOS"/PRN prescription has no fixed schedule and requires explicit times.
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

/** Add a prescription through the register form and return its list item. */
async function addPrescription(
  page: Page,
  drug: string,
  instructions: string
): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('tab', { name: 'Συνταγές' }).click();
  await page.getByRole('button', { name: '+ Προσθήκη συνταγής' }).click();
  await page.getByLabel('Φάρμακο').fill(drug);
  await page.getByLabel('Δοσολογία').fill('500mg');
  await page.getByLabel('Οδηγίες').fill(instructions);
  await page.getByRole('button', { name: 'Αποθήκευση' }).click();
  const item = page.locator('li').filter({ hasText: drug });
  await expect(item.getByRole('heading', { name: drug })).toBeVisible();
  return item;
}

test('1x3 prescription pre-fills 08/14/20, then creates the medication and reminders', async ({
  page,
}) => {
  await seedDemoSession(page);
  await page.goto('/history?demo=1');
  await expect(page.getByRole('heading', { name: 'Ιατρικό ιστορικό' })).toBeVisible();

  const item = await addPrescription(page, 'Μετφορμίνη', '1x3');
  await item.getByRole('button', { name: /Υπενθύμιση από συνταγή/ }).click();

  // Wizard opens with the parsed schedule: 1x3 → 08:00 / 14:00 / 20:00.
  const wizard = page.getByRole('dialog', { name: 'Υπενθύμιση για Μετφορμίνη' });
  await expect(wizard).toBeVisible();
  await expect(wizard.getByLabel('Ώρα 1')).toHaveValue('08:00');
  await expect(wizard.getByLabel('Ώρα 2')).toHaveValue('14:00');
  await expect(wizard.getByLabel('Ώρα 3')).toHaveValue('20:00');

  // The parse is labelled as coming from the prescription (not a default).
  await expect(wizard.getByText('από τη συνταγή')).toBeVisible();

  await wizard.getByRole('button', { name: /Δημιουργία φαρμάκου/ }).click();

  // Success names the drug and previews the next reminder.
  await expect(wizard.getByText(/προστέθηκε στα φάρμακα/)).toBeVisible();
  await expect(wizard.getByText(/next reminder fires/)).toBeVisible();

  await wizard.getByRole('button', { name: 'Κλείσιμο' }).click();
  await expect(wizard).toHaveCount(0);

  // The register links the prescription to the created medication.
  await expect(item.getByText('πρόγραμμα φαρμάκων')).toBeVisible();

  // Shell nav = SPA navigation, so the demo medication list is preserved.
  await page.getByRole('link', { name: 'Medications' }).click();
  await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();

  // The medication exists with all three parsed dose times…
  const medCard = page.locator('li').filter({ hasText: 'Μετφορμίνη' });
  await expect(medCard.getByRole('heading', { name: 'Μετφορμίνη' })).toBeVisible();
  await expect(medCard.getByText('14:00', { exact: true })).toBeVisible();

  // …and its reminders are wired (channel prefs + a next-reminder preview).
  await expect(medCard.getByText('Reminder channels for Μετφορμίνη')).toBeVisible();
  await expect(medCard.getByText(/next reminder fires/)).toBeVisible();
});

test('SOS prescription has no fixed schedule and requires explicit times', async ({ page }) => {
  await seedDemoSession(page);
  await page.goto('/history?demo=1');
  await expect(page.getByRole('heading', { name: 'Ιατρικό ιστορικό' })).toBeVisible();

  const item = await addPrescription(page, 'Παρακεταμόλη', 'SOS για πόνο');
  await item.getByRole('button', { name: /Υπενθύμιση από συνταγή/ }).click();

  const wizard = page.getByRole('dialog', { name: 'Υπενθύμιση για Παρακεταμόλη' });
  await expect(wizard).toBeVisible();

  // PRN is flagged (the dedicated note, not the parse explanation) and no
  // times are pre-filled…
  await expect(wizard.locator('p.prn')).toContainText('κατά περίπτωση');
  await expect(wizard.getByLabel(/^Ώρα \d$/)).toHaveCount(0);

  // …so confirming is blocked until the user sets at least one time.
  const confirm = wizard.getByRole('button', { name: /Δημιουργία φαρμάκου/ });
  await expect(confirm).toBeDisabled();

  await wizard.getByLabel('Νέα ώρα').fill('09:00');
  await wizard.getByRole('button', { name: '+ Προσθήκη ώρας' }).click();
  await expect(wizard.getByLabel('Ώρα 1')).toHaveValue('09:00');
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(wizard.getByText(/προστέθηκε στα φάρμακα/)).toBeVisible();
});
