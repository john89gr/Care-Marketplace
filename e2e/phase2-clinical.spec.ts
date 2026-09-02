import { test, expect, Page } from '@playwright/test';

/**
 * Phase 2 (PLAN.md §5): clinical log with digital signature and the shared
 * care plan. Backend mocked at the network layer; the signature is drawn for
 * real on the canvas.
 */

const NURSE_SESSION = {
  userId: 'u-nurse-1',
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

async function seedSession(page: Page, session: Record<string, unknown>): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Phase 2 — Clinical log', () => {
  test('a nurse documents a visit and signs the entry', async ({ page }) => {
    await seedSession(page, NURSE_SESSION);

    await page.route('**/api/visits/me', (route) =>
      route.fulfill({
        json: [
          {
            id: 'visit-1',
            shiftId: 's-1',
            bookingId: 'b-1',
            providerId: 'u-nurse-1',
            clientId: 'u-client-1',
            clientName: 'Maria Papadopoulou',
            providerName: 'Elena Papadaki',
            act: 'Injection',
            scheduledAtMs: Date.now() - 30 * 60 * 1000,
            status: 'in-progress',
            checkIn: { lat: 37.9838, lng: 23.7275, accuracyM: 10, atMs: Date.now() - 30 * 60 * 1000 },
            checkOut: null,
          },
        ],
      })
    );
    await page.route('**/api/clinical-log', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [] });
      } else {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: 'cl-1',
            visitId: body.visitId,
            authorId: 'u-nurse-1',
            authorName: 'Elena Papadaki',
            specialty: 'nurse',
            observations: body.observations,
            vitals: body.vitals,
            rehab: null,
            signatureDataUrl: body.signatureDataUrl,
            signedAtMs: Date.now(),
          },
        });
      }
    });

    await page.goto('/clinical-log');
    await expect(page.getByRole('heading', { name: 'Clinical log' })).toBeVisible();

    await page.getByLabel('Visit').selectOption('visit-1');
    await page
      .getByPlaceholder('Clinical findings, complaints, response to treatment…')
      .fill('BP stable, injection site clean.');

    // Draw a signature on the canvas (scroll it into view first — it sits
    // below the fold, and mouse events outside the viewport hit nothing).
    const canvas = page.locator('canvas[aria-label^="Signature canvas"]');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 40, box.y + 70);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 50, { steps: 8 });
    await page.mouse.move(box.x + 200, box.y + 80, { steps: 8 });
    await page.mouse.up();

    await page.getByRole('button', { name: 'Sign & save' }).click();

    await expect(page.getByRole('heading', { name: 'Signed entries' })).toBeVisible();
    await expect(page.getByText('BP stable, injection site clean.')).toBeVisible();
    await expect(page.locator('img[alt="Signed signature"]')).toBeVisible();
  });
});

test.describe('Phase 2 — Care plan', () => {
  test('nurse and client cross-update the shared care plan', async ({ page }) => {
    await seedSession(page, CLIENT_SESSION);

    const carePlan = () => ({
      id: 'cp-1',
      clientId: 'u-client-1',
      clientName: 'Maria Papadopoulou',
      goals: [{ id: 'g-1', text: 'Mobilise shoulder daily', status: 'in-progress' }],
      notes: [
        {
          id: 'n-1',
          authorId: 'u-nurse-1',
          authorName: 'Elena Papadaki',
          authorRole: 'nurse',
          text: 'BP stable, continue monitoring.',
          atMs: Date.now() - 60 * 60 * 1000,
        },
      ],
      updatedAtMs: Date.now(),
      updatedBy: 'Elena Papadaki',
    });

    await page.route('**/api/care-plans**', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [carePlan()] });
      }
      // Echo the posted note back so the store's plan includes it (cross-update).
      const body = route.request().postDataJSON();
      const note = {
        id: 'n-2',
        authorId: body.authorId ?? 'u-client-1',
        authorName: body.authorName ?? 'Maria Papadopoulou',
        authorRole: body.authorRole ?? 'client',
        text: body.text,
        atMs: Date.now(),
      };
      return route.fulfill({
        json: {
          ...carePlan(),
          notes: [note, ...carePlan().notes],
          updatedAtMs: Date.now(),
          updatedBy: 'Maria Papadopoulou',
        },
      });
    });

    await page.goto('/care-plan');
    await expect(page.getByRole('heading', { name: 'Care plan' })).toBeVisible();
    await expect(page.getByText('Mobilise shoulder daily')).toBeVisible();
    await expect(page.getByText('BP stable, continue monitoring.')).toBeVisible();

    // Add a note from the client side (care team cross-update).
    await page
      .getByPlaceholder('Update for the care team (nurses & physios)…')
      .fill('Pain in shoulder this morning.');
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    await expect(page.getByText('Pain in shoulder this morning.')).toBeVisible();
  });
});