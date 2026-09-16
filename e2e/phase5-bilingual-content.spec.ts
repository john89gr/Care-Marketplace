import { test, expect, Page } from '@playwright/test';

/**
 * Bilingual *content* (as opposed to chrome).
 *
 * Labels are translated in the browser, but provider bios, specialities,
 * service names, review comments and care-plan notes are rendered by the
 * backend, so switching language has to re-fetch them. These tests run against
 * the real demo backend (`?demo=1`) rather than route mocks, so the whole path
 * is exercised: locale interceptor → `?lang=el` → localised payload → re-render.
 */

const CLIENT_SESSION = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 3_600_000,
};

const NURSE_SESSION = {
  userId: 'u-nurse',
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  expiresAtMs: Date.now() + 3_600_000,
};

async function seed(page: Page, session: unknown): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, session);
}

/** The topbar language control. */
function greek(page: Page) {
  return page.getByRole('button', { name: 'ΕΛ' });
}

test.describe('bilingual content', () => {
  test('a provider profile re-fetches its bio and services in Greek', async ({ page }) => {
    await seed(page, CLIENT_SESSION);
    await page.goto('/caregivers/cg-1?demo=1');

    // English first: the default content language is the reference locale.
    await expect(page.getByText('Registered nurse with 12 years in home care.')).toBeVisible();
    await expect(page.getByText('Injection at home')).toBeVisible();

    await greek(page).click();

    // The Greek payload replaces the English copy without a page reload…
    await expect(page.getByText('Πιστοποιημένη νοσηλεύτρια', { exact: false })).toBeVisible();
    await expect(page.getByText('Ένεση στο σπίτι')).toBeVisible();
    await expect(page.getByText('Registered nurse with 12 years in home care.')).toBeHidden();
    // …and the speciality tags follow.
    await expect(page.getByText('Ενέσεις', { exact: true })).toBeVisible();
  });

  test('review comments follow the language switch', async ({ page }) => {
    await seed(page, CLIENT_SESSION);
    await page.goto('/caregivers/cg-1?demo=1');

    await expect(page.getByText('Punctual, gentle and very professional', { exact: false })).toBeVisible();

    await greek(page).click();

    await expect(
      page.getByText('Συνεπής, ευγενική και πολύ επαγγελματική', { exact: false })
    ).toBeVisible();
    // The reviewer's name and rating are facts, not copy — they never move.
    await expect(page.getByText('Maria Papadopoulou').first()).toBeVisible();
  });

  test('care-plan goals and notes are served in the selected language', async ({ page }) => {
    await seed(page, NURSE_SESSION);
    await page.goto('/care-plan?demo=1');

    await expect(page.getByText('Mobilise shoulder daily')).toBeVisible();

    await greek(page).click();

    await expect(page.getByText('Καθημερινή κινητοποίηση ώμου')).toBeVisible();
    await expect(page.getByText('Mobilise shoulder daily')).toBeHidden();
  });

  test('the language choice survives a reload', async ({ page }) => {
    await seed(page, CLIENT_SESSION);
    await page.goto('/caregivers/cg-1?demo=1');
    await greek(page).click();
    await expect(page.getByText('Ένεση στο σπίτι')).toBeVisible();

    await page.reload();

    // Detection reads the persisted choice, so the first paint is already Greek.
    await expect(page.getByText('Ένεση στο σπίτι')).toBeVisible();
  });
});
