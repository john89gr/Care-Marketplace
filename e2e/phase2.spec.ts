import { test, expect, Page } from '@playwright/test';

/**
 * Phase 2 (PLAN.md §5): nurse/physio onboarding with licence vetting and the
 * shift calendar. The backend is mocked at the network layer, exactly like
 * phase1.spec.ts, so these exercise the real forms, stores, guards and routes.
 */

const NURSE_SESSION = {
  userId: 'u-nurse-1',
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const ADMIN_SESSION = {
  userId: 'u-admin-1',
  displayName: 'Admin User',
  roles: ['admin'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const PENDING_SUBMISSION = {
  id: 'v-1',
  providerId: 'u-nurse-1',
  providerName: 'Elena Papadaki',
  licenceNumber: 'ΝΟΣ-2024-Α123',
  specialties: ['Injections', 'Wound care'],
  submittedAtMs: Date.now() - 48 * 60 * 60 * 1000,
  status: 'pending',
  reviewedAtMs: null,
  reviewedBy: null,
  note: '',
};

async function seedSession(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Phase 2 — Onboarding & vetting', () => {
  test('a nurse submits a licence and sees it under review', async ({ page }) => {
    await seedSession(page, NURSE_SESSION);

    // No submission yet -> the onboarding form is shown.
    await page.route('**/api/vetting/submissions/me', (route) => route.fulfill({ json: null }));
    await page.route('**/api/vetting/submissions', (route) =>
      route.fulfill({
        json: {
          id: 'v-new',
          providerId: 'u-nurse-1',
          providerName: 'Elena Papadaki',
          licenceNumber: 'ΝΟΣ-2024-Α123',
          specialties: ['Injections'],
          submittedAtMs: Date.now(),
          status: 'pending',
          reviewedAtMs: null,
          reviewedBy: null,
          note: '',
        },
      })
    );

    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { name: 'Professional onboarding' })).toBeVisible();

    await page.getByPlaceholder('e.g. ΝΟΣ-2024-Α123').fill('ΝΟΣ-2024-Α123');
    await page.getByRole('checkbox', { name: 'Injections' }).check();
    await page.getByRole('button', { name: 'Submit for review' }).click();

    await expect(page.getByText(/Licence under review/)).toBeVisible();
  });

  test('an admin approves a pending licence submission', async ({ page }) => {
    await seedSession(page, ADMIN_SESSION);

    await page.route('**/api/vetting/submissions', (route) =>
      route.fulfill({ json: [PENDING_SUBMISSION] })
    );
    await page.route('**/api/vetting/submissions/v-1/review', (route) =>
      route.fulfill({
        json: {
          ...PENDING_SUBMISSION,
          status: 'approved',
          reviewedAtMs: Date.now(),
          reviewedBy: 'Admin User',
        },
      })
    );

    await page.goto('/admin');
    await expect(page.getByText('Elena Papadaki')).toBeVisible();
    await expect(page.getByText('pending', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();

    await expect(page.getByText('No submissions awaiting review.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recently reviewed' })).toBeVisible();
    await expect(page.getByText('approved', { exact: true })).toBeVisible();
  });
});

test.describe('Phase 2 — Shift calendar', () => {
  test('a nurse sets availability and sees upcoming shifts', async ({ page }) => {
    await seedSession(page, NURSE_SESSION);

    await page.route('**/api/shifts/me', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          json: {
            availability: [
              { id: 'a-1', weekday: 0, startMinutes: 8 * 60, endMinutes: 12 * 60 },
            ],
            onDemand: true,
            shifts: [
              {
                id: 's-1',
                providerId: 'u-nurse-1',
                clientId: 'u-client-1',
                clientName: 'Maria Papadopoulou',
                act: 'Injection',
                scheduledAtMs: Date.now() + 60 * 60 * 1000,
                durationMinutes: 45,
                status: 'confirmed',
              },
            ],
          },
        });
      } else {
        await route.fulfill({ json: { ok: true } });
      }
    });

    await page.goto('/shifts');
    await expect(page.getByRole('heading', { name: 'Shifts & visits' })).toBeVisible();

    // Upcoming shift rendered from the mocked backend.
    await expect(page.getByRole('heading', { name: 'Injection' })).toBeVisible();
    await expect(page.getByText('Maria Papadopoulou')).toBeVisible();

    // Toggle a segment and save.
    await page.getByRole('checkbox', { name: 'Monday Morning' }).check();
    await page.getByRole('button', { name: 'Save availability' }).click();

    // Saved without an error banner.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
