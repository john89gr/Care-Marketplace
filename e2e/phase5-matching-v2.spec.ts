import { test, expect } from '@playwright/test';

/**
 * Feature 5 (FEATURE_PLAN.md §5) exit criteria: changing the sort option
 * reorders results predictably, and sort/budget filters persist in the URL.
 * Backend mocked at the network layer, consistent with the other phase specs.
 */

const CAREGIVERS = [
  // Elena: closest + high rating, expensive.
  { id: 'cg-1', displayName: 'Elena Papadaki', roles: ['nurse'], rating: 4.8, distanceKm: 3, hourlyRate: 25, availableNow: true, completedVisits: 34, recentCancellations: 0, reviewCount: 12 },
  // Nikos: far + low rating, cheap.
  { id: 'cg-2', displayName: 'Nikos Georgiou', roles: ['caregiver'], rating: 4.2, distanceKm: 12, hourlyRate: 15, availableNow: false, completedVisits: 6, recentCancellations: 2, reviewCount: 3 },
  // Anna: mid distance, top rating, most expensive.
  { id: 'cg-3', displayName: 'Anna Karakosta', roles: ['physio'], rating: 4.9, distanceKm: 5, hourlyRate: 30, availableNow: true, completedVisits: 21, recentCancellations: 0, reviewCount: 8 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cm.session.v1', JSON.stringify({
      userId: 'u-client-1',
      displayName: 'Maria Papadopoulou',
      roles: ['client'],
      expiresAtMs: Date.now() + 60 * 60 * 1000,
    }));
  });
  await page.route('**/api/caregivers/search*', (route) =>
    route.fulfill({ json: CAREGIVERS })
  );
  await page.route('**/api/me/saved-searches*', (route) =>
    route.fulfill({ json: { savedSearches: [], favorites: [] } })
  );
  await page.route('**/api/me/favorites*', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/me/notifications*', (route) =>
    route.fulfill({ json: { items: [], unread: 0 } })
  );
});

async function openMarketplace(page: import('@playwright/test').Page) {
  await page.goto('/marketplace');
  await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible();
  // Wait for the three cards to render.
  await expect(page.locator('.results .card')).toHaveCount(3);
}

async function cardTitles(page: import('@playwright/test').Page): Promise<string[]> {
  return page.locator('.results .card h3').allInnerTexts();
}

test('sort dropdown reorders results predictably', async ({ page }) => {
  await openMarketplace(page);

  // Relevance (default): Elena wins on availability + distance + rating.
  const relevance = await cardTitles(page);
  expect(relevance[0]).toContain('Elena');

  // Distance: Elena (3 km) → Anna (5 km) → Nikos (12 km).
  await page.getByLabel('Sort by').selectOption('distance');
  await expect
    .poll(async () => (await cardTitles(page)).join('|'), { timeout: 5_000 })
    .toBe('Elena Papadaki|Anna Karakosta|Nikos Georgiou');

  // Rating: Anna (4.9) → Elena (4.8) → Nikos (4.2).
  await page.getByLabel('Sort by').selectOption('rating');
  await expect
    .poll(async () => (await cardTitles(page)).join('|'), { timeout: 5_000 })
    .toBe('Anna Karakosta|Elena Papadaki|Nikos Georgiou');

  // Price: Nikos (€15) → Elena (€25) → Anna (€30).
  await page.getByLabel('Sort by').selectOption('price');
  await expect
    .poll(async () => (await cardTitles(page)).join('|'), { timeout: 5_000 })
    .toBe('Nikos Georgiou|Elena Papadaki|Anna Karakosta');
});

test('budget filter hides over-budget caregivers and persists in URL', async ({ page }) => {
  await openMarketplace(page);

  const budget = page.getByLabel('Maximum hourly rate in euros');
  await budget.fill('20');
  await budget.press('Enter');
  await expect(page.locator('.results .card')).toHaveCount(1);
  await expect(page.locator('.results .card h3')).toHaveText(/Nikos/);

  // Budget persists in the URL (deep-linkable).
  await expect(page).toHaveURL(/maxRate=20/);

  // Reload: filters restore from the URL.
  await page.reload();
  await expect(page.locator('.results .card')).toHaveCount(1);
  await expect(page.locator('.results .card h3')).toHaveText(/Nikos/);
});

test('score explainer shows breakdown lines for a card', async ({ page }) => {
  await openMarketplace(page);

  await page.getByRole('button', { name: 'why these results?' }).first().click();
  const breakdown = page.getByLabel('Score breakdown');
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText('Rating ★');
  await expect(breakdown).toContainText('Distance band');
  await expect(breakdown).toContainText('Price fit');
});
