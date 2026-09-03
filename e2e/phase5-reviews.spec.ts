import { test, expect, Page } from '@playwright/test';

/**
 * Feature 1 (FEATURE_PLAN.md §1) exit criteria: a client completes a booking,
 * leaves a review, and the rating + review become visible on the marketplace.
 * Backend mocked at the network layer, consistent with the other phase specs.
 */

const CLIENT_SESSION = {
  userId: 'u-client-1',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const CAREGIVERS = [
  {
    id: 'cg-1',
    displayName: 'Elena Papadaki',
    roles: ['nurse'],
    rating: 4.8,
    reviewCount: 1,
    distanceKm: 3,
    hourlyRate: 25,
    availableNow: true,
  },
];

const BOOKINGS = [
  {
    id: 'b-1',
    caregiverId: 'cg-1',
    caregiverName: 'Elena Papadaki',
    clientId: 'u-client-1',
    scheduledAtMs: Date.now() - 24 * 60 * 60 * 1000,
    note: 'Morning insulin injection',
    status: 'requested',
    createdAtMs: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
];

const REVIEWS: unknown[] = [];

async function seedSession(page: Page, session = CLIENT_SESSION): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Feature 1 — Reviews & Ratings', () => {
  test('a client can complete a booking, leave a review, and see it on the marketplace', async ({
    page,
  }) => {
    const bookings = structuredClone(BOOKINGS);
    const reviews = structuredClone(REVIEWS);

    await seedSession(page);
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.route('**/api/bookings', (route) => route.fulfill({ json: bookings }));
    await page.route('**/api/reviews', (route) => route.fulfill({ json: reviews }));
    await page.route('**/api/caregivers/cg-1/reviews', (route) =>
      route.fulfill({ json: reviews })
    );

    // 1. The visit is completed (provider flow — see phase5-booking-lifecycle).
    await page.route('**/api/bookings/b-1/complete', (route) => {
      bookings[0].status = 'completed';
      return route.fulfill({ json: bookings[0] });
    });
    bookings[0].status = 'completed';

    await page.goto('/bookings');
    await expect(page.getByText('completed', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Rate this visit' })
    ).toBeVisible();

    // 2. Leave the review.
    let reviewCreated = false;
    await page.route('**/api/bookings/b-1/review', (route) => {
      if (reviewCreated) {
        return route.fulfill(
          { status: 409, json: { message: 'You already rated this visit.' } }
        );
      }
      reviewCreated = true;
      const review = {
        id: 'rv-1',
        caregiverId: 'cg-1',
        bookingId: 'b-1',
        authorId: 'u-client-1',
        authorName: 'Maria Papadopoulou',
        rating: 5,
        comment: 'Wonderful care.',
        createdAtMs: Date.now(),
        status: 'published',
      };
      reviews.push(review);
      return route.fulfill({ json: review });
    });

    await page.getByRole('button', { name: 'Rate this visit' }).click();
    await expect(page).toHaveURL(/\/review\?booking=b-1/);
    await page.getByRole('radio', { name: '5 stars' }).check();
    await page.getByLabel('Comment (optional)').fill('Wonderful care.');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(
      page.getByText('Thank you — your review is published.')
    ).toBeVisible();

    // 3. The rating and review are visible on the marketplace.
    await page.goto('/marketplace');
    await expect(page.getByText('1 reviews')).toBeVisible();
    await page
      .getByRole('button', { name: /Reviews \(1\)/ })
      .click();
    await expect(page.getByText('Maria Papadopoulou')).toBeVisible();
    await expect(page.getByText('Wonderful care.')).toBeVisible();
  });

  test('a review can be flagged for moderation from the marketplace', async ({ page }) => {
    const reviews = [
      {
        id: 'rv-9',
        caregiverId: 'cg-1',
        bookingId: 'b-9',
        authorId: 'u-other',
        authorName: 'Another client',
        rating: 2,
        comment: 'Unacceptable comment.',
        createdAtMs: Date.now(),
        status: 'published',
      },
    ];

    await seedSession(page);
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.route('**/api/caregivers/cg-1/reviews', (route) =>
      route.fulfill({ json: reviews })
    );
    let flagged = false;
    await page.route('**/api/reviews/rv-9/flag', (route) => {
      flagged = true;
      return route.fulfill({ json: { ...reviews[0], status: 'flagged' } });
    });

    await page.goto('/marketplace');
    await page.getByRole('button', { name: /Reviews \(1\)/ }).click();
    await page.getByRole('button', { name: 'Report' }).click();
    await expect.poll(() => flagged).toBe(true);
  });

  test('a caregiver cannot review their own visit', async ({ page }) => {
    const providerSession = {
      userId: 'cg-1',
      displayName: 'Elena Papadaki',
      roles: ['nurse'],
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    };
    await page.addInitScript((payload) => {
      localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    }, providerSession);

    // Route guard blocks the page for non-clients.
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.goto('/review');
    await expect(page).toHaveURL(/\/forbidden/);
  });
});
