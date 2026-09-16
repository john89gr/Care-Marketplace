import { test, expect, Page } from '@playwright/test';

/**
 * Provider profile (`/caregivers/:id`): the detail page reachable from a
 * marketplace card, with the full review record behind the rating — summary,
 * distribution, filtering/ordering, and the write-a-review panel.
 *
 * Backend mocked at the network layer, consistent with the other phase specs.
 */

const DAY = 24 * 60 * 60 * 1000;

const CLIENT_SESSION = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

const PROFILE = {
  id: 'cg-1',
  displayName: 'Elena Papadaki',
  roles: ['nurse'],
  rating: 4.8,
  reviewCount: 3,
  distanceKm: 3,
  hourlyRate: 25,
  availableNow: true,
  specialties: ['Injections', 'Wound care'],
  completedVisits: 34,
  recentCancellations: 0,
  expiresAtMs: Date.now() + 300 * DAY,
  bio: 'Registered nurse with 12 years in home care.',
  city: 'Athens — Syntagma',
  languages: ['Ελληνικά', 'English'],
  experienceYears: 12,
  responseMinutes: 12,
  repeatClients: 21,
  verified: true,
  education: 'BSc Nursing, National and Kapodistrian University of Athens',
  memberSinceMs: Date.now() - 3 * 365 * DAY,
  services: [
    { name: 'Injection at home', price: 25, durationMin: 30 },
    { name: 'Wound dressing & care', price: 30, durationMin: 45 },
  ],
};

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rv-1',
    caregiverId: 'cg-1',
    bookingId: 'b-seed',
    authorId: 'u-other',
    authorName: 'Katerina Vlachou',
    rating: 5,
    comment: 'Arrived exactly on time.',
    createdAtMs: Date.now() - 2 * DAY,
    status: 'published',
    ...overrides,
  };
}

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, CLIENT_SESSION);
}

/** Routes the profile page needs, with `profile`/`reviews` overridable. */
async function mockProfile(
  page: Page,
  profile: Record<string, unknown>,
  reviews: unknown[],
  bookings: unknown[] = []
): Promise<void> {
  await page.route('**/api/caregivers/search*', (route) =>
    route.fulfill({ json: [PROFILE] })
  );
  await page.route('**/api/caregivers/cg-1/reviews', (route) =>
    route.fulfill({ json: reviews })
  );
  await page.route('**/api/caregivers/cg-1', (route) =>
    route.fulfill({ json: profile })
  );
  await page.route('**/api/bookings', (route) => route.fulfill({ json: bookings }));
}

test.describe('Provider profile', () => {
  test('opens from a marketplace card and shows the full review record', async ({ page }) => {
    const reviews = [
      review({ id: 'rv-1', rating: 5, comment: 'Arrived exactly on time.' }),
      review({
        id: 'rv-2',
        rating: 4,
        authorName: 'Petros Manolis',
        comment: 'Good clinical care.',
        createdAtMs: Date.now() - 20 * DAY,
      }),
      review({
        id: 'rv-3',
        rating: 3,
        authorName: 'Ioanna Davaki',
        comment: 'Late but kind.',
        createdAtMs: Date.now() - 40 * DAY,
      }),
    ];

    await seedSession(page);
    await mockProfile(page, PROFILE, reviews);

    await page.goto('/marketplace');
    await page.getByRole('link', { name: 'View profile' }).click();

    await expect(page).toHaveURL(/\/caregivers\/cg-1$/);
    await expect(page.getByRole('heading', { name: 'Elena Papadaki' })).toBeVisible();
    await expect(page.getByText('Verified')).toBeVisible();
    await expect(page.getByText('Based on 3 reviews')).toBeVisible();

    // The public record: services, stats and the licence state.
    await expect(page.getByText('Injection at home')).toBeVisible();
    await expect(
      page.locator('.stat-card').filter({ hasText: 'Completed visits' })
    ).toContainText('34');
    await expect(page.getByText('Licence in good standing')).toBeVisible();

    // Distribution: the 5★ bucket holds the single 5★ review.
    const topBucket = page.locator('.distribution li').first();
    await expect(topBucket).toContainText('5★');
    await expect(topBucket).toContainText('1');

    // Newest first by default.
    await expect(page.locator('.review-list .review').first()).toContainText(
      'Arrived exactly on time.'
    );

    // Filter by stars.
    await page.getByLabel('Filter reviews by rating').selectOption('3');
    await expect(page.locator('.review-list .review')).toHaveCount(1);
    await expect(page.getByText('Late but kind.')).toBeVisible();
    await expect(page.getByText('Arrived exactly on time.')).toBeHidden();

    // Ordering.
    await page.getByLabel('Filter reviews by rating').selectOption('');
    await page.getByLabel('Sort reviews').selectOption('lowest');
    await expect(page.locator('.review-list .review').first()).toContainText('Late but kind.');

    // Free-text search over comments and authors.
    await page.getByLabel('Search reviews').fill('petros');
    await expect(page.locator('.review-list .review')).toHaveCount(1);
    await expect(page.getByText('Good clinical care.')).toBeVisible();

    // No completed visit with this provider → no review form, just the rule.
    await expect(
      page.getByText('You can review a provider once a visit with them is completed.')
    ).toBeVisible();
  });

  test('a family can rate a completed visit straight from the profile', async ({ page }) => {
    const reviews: unknown[] = [];
    const bookings = [
      {
        id: 'b-1',
        caregiverId: 'cg-1',
        caregiverName: 'Elena Papadaki',
        clientId: 'u-client',
        clientName: 'Maria Papadopoulou',
        providerUserId: 'cg-1',
        scheduledAtMs: Date.now() - DAY,
        note: 'Morning insulin injection',
        status: 'completed',
        createdAtMs: Date.now() - 3 * DAY,
        pendingReschedule: null,
      },
    ];

    await seedSession(page);
    await mockProfile(page, { ...PROFILE, reviewCount: 0, rating: 0 }, reviews, bookings);

    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/bookings/b-1/review', (route) => {
      posted = route.request().postDataJSON() as Record<string, unknown>;
      const created = review({
        id: 'rv-9',
        bookingId: 'b-1',
        authorId: 'u-client',
        authorName: 'Maria Papadopoulou',
        rating: 5,
        comment: 'Wonderful care.',
      });
      reviews.push(created);
      return route.fulfill({ json: created });
    });

    await page.goto('/caregivers/cg-1');

    await expect(page.getByRole('heading', { name: 'Rate this provider' })).toBeVisible();
    await page.getByRole('radio', { name: '5 stars' }).check();
    await page.getByLabel('Comment (optional)').fill('Wonderful care.');
    await page.getByRole('button', { name: 'Submit review' }).click();

    await expect(page.getByText('Thank you — your review is published.')).toBeVisible();
    expect(posted).toMatchObject({ bookingId: 'b-1', rating: 5, comment: 'Wonderful care.' });
    // The new review joins the list, and the panel closes (one per visit).
    await expect(page.locator('.review-list')).toContainText('Wonderful care.');
    await expect(page.getByText('You have already reviewed this provider.')).toBeVisible();
  });

  test('a lapsed licence is called out on the profile', async ({ page }) => {
    await seedSession(page);
    await mockProfile(page, { ...PROFILE, expiresAtMs: Date.now() - 5 * DAY }, []);

    await page.goto('/caregivers/cg-1');

    await expect(page.getByText('Licence expired')).toBeVisible();
    await expect(page.getByText('No reviews yet.')).toBeVisible();
  });
});
