import { test, expect, Locator, Page } from '@playwright/test';

/**
 * Track 2 (HEALTH_RECORDS_PLAN.md) exit criteria: the structured medicine
 * instructions sheet + curated catalog auto-fill, over the real demo backend.
 * Opening a pill's sheet loads the saved sheet; auto-fill refuses to replace
 * it without a confirmation; the confirmed catalog sheet can be edited and
 * saved, and survives a store reload (navigating away and back re-fetches
 * from the API).
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

/** The medications-page card for one drug. */
function medCard(page: Page, name: string): Locator {
  return page.locator('li.med').filter({ hasText: name });
}

/** Shell nav link (the page body can link to the same route). */
function navLink(page: Page, name: string): Locator {
  return page.locator('nav').getByRole('link', { name });
}

test('catalog auto-fill asks before replacing the saved sheet, then persists edits', async ({
  page,
}) => {
  await seedDemoSession(page);
  await page.goto('/medications?demo=1');
  await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();

  const card = medCard(page, 'Atorvastatin');
  await card.getByRole('button', { name: /How to take Atorvastatin/ }).click();

  const sheet = card.locator('.sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/Catalog suggestion available \(Atorvastatin\)/)).toBeVisible();

  // The saved demo sheet is loaded, not the catalog suggestion.
  const warnings = sheet.getByLabel('Warnings (one per line)');
  await expect(warnings).toHaveValue(/Αποφύγετε τον χυμό γκρέιπφρουτ/);

  // Auto-fill would discard the saved sheet → it must be confirmed first.
  await sheet.getByRole('button', { name: 'Auto-fill from catalog' }).click();
  await expect(sheet.getByText(/will be replaced/)).toBeVisible();
  await expect(warnings).toHaveValue(/Αποφύγετε τον χυμό γκρέιπφρουτ/);

  await sheet.getByRole('button', { name: /Replace my sheet with the catalog suggestion/ }).click();
  await expect(sheet.getByText(/Catalog suggestion loaded/)).toBeVisible();
  await expect(warnings).toHaveValue(/Συνήθως λαμβάνεται το βράδυ/);

  // Edit the sheet and save it.
  await warnings.fill('Δοκιμαστική προειδοποίηση (E2E)');
  await sheet.getByRole('button', { name: 'Save instructions' }).click();
  await expect(sheet.getByText('Instructions saved.')).toBeVisible();

  // Leave and come back through SPA nav → the page re-fetches from the API.
  // Await the intermediate page so the two navigations cannot race (a raced
  // pair would cancel the first hop and never unmount the medications page).
  await navLink(page, 'Health record').click();
  await expect(page.getByRole('heading', { name: 'Personal Health Record' })).toBeVisible();
  await navLink(page, 'Medications').click();
  await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();

  const reopened = medCard(page, 'Atorvastatin');
  // A fresh page mount starts with the sheet closed.
  await expect(reopened.locator('.sheet')).toHaveCount(0);
  await reopened.getByRole('button', { name: /How to take Atorvastatin/ }).click();
  await expect(reopened.locator('.sheet')).toBeVisible();
  await expect(reopened.locator('.sheet').getByLabel('Warnings (one per line)')).toHaveValue(
    'Δοκιμαστική προειδοποίηση (E2E)'
  );
});

test('clearing a saved sheet persists too', async ({ page }) => {
  await seedDemoSession(page);
  await page.goto('/medications?demo=1');

  const card = medCard(page, 'Atorvastatin');
  await card.getByRole('button', { name: /How to take Atorvastatin/ }).click();
  const sheet = card.locator('.sheet');
  await sheet.getByRole('button', { name: 'Clear sheet' }).click();
  await expect(sheet.getByText('Sheet cleared.')).toBeVisible();

  await navLink(page, 'Health record').click();
  await expect(page.getByRole('heading', { name: 'Personal Health Record' })).toBeVisible();
  await navLink(page, 'Medications').click();
  await expect(page.getByRole('heading', { name: 'Medications' })).toBeVisible();

  const reopened = medCard(page, 'Atorvastatin');
  // No saved sheet → the toggle falls back to the catalog suggestion label.
  await expect(reopened.getByRole('button', { name: /How to take Atorvastatin/ })).toContainText(
    'suggested:'
  );
});
