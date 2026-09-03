import { test, expect, Page } from '@playwright/test';

/**
 * Feature 2 (FEATURE_PLAN.md §2) exit criteria: a family saves a search,
 * reloads the page and gets the same filters back (deep-linkable URL), and
 * favorites persist with optimistic toggling.
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
  {
    id: 'cg-2',
    displayName: 'Nikos Georgiou',
    roles: ['caregiver'],
    rating: 4.2,
    reviewCount: 0,
    distanceKm: 12,
    hourlyRate: 15,
    availableNow: false,
  },
];

async function seedSession(page: Page, session = CLIENT_SESSION): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

test.describe('Feature 2 — Saved Searches & Favorites', () => {
  test('URL params restore filters after a reload', async ({ page }) => {
    await seedSession(page);
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.route('**/api/me/saved-searches', (route) =>
      route.fulfill({ json: { savedSearches: [], favorites: [] } })
    );
    await page.route('**/api/me/favorites**', (route) =>
      route.fulfill({ json: { ok: true } })
    );

    await page.goto('/marketplace');
    await page.getByPlaceholder('Search caregivers…').fill('elena');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    // URL reflects the filters (deep-linkable).
    await expect(page).toHaveURL(/\/marketplace\?q=elena/);
    await expect(page.getByRole('heading', { name: 'Elena Papadaki' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nikos Georgiou' })).toBeHidden();

    // Reload → filters are restored from the URL and re-applied.
    await page.reload();
    await expect(page).toHaveURL(/q=elena/);
    await expect(page.getByPlaceholder('Search caregivers…')).toHaveValue('elena');
    await expect(page.getByRole('heading', { name: 'Elena Papadaki' })).toBeVisible();
  });

  test('a family can save, apply and delete a search', async ({ page }) => {
    const savedSearches: Array<Record<string, unknown>> = [];
    await seedSession(page);
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.route('**/api/me/saved-searches', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: { savedSearches, favorites: [] } });
      }
      const body = route.request().postDataJSON() as { name: string };
      const saved = {
        id: `ss-${savedSearches.length + 1}`,
        name: body.name,
        filters: { query: 'elena', roles: [], maxDistanceKm: null, minRating: null, availableNowOnly: false },
        createdAtMs: Date.now(),
      };
      savedSearches.push(saved);
      return route.fulfill({ json: saved });
    });
    await page.route('**/api/me/saved-searches/ss-*', (route) => {
      if (route.request().method() === 'DELETE') {
        const id = route.request().url().split('/').pop();
        const index = savedSearches.findIndex((s) => s.id === id);
        if (index >= 0) savedSearches.splice(index, 1);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 404, json: { message: 'not found' } });
    });

    await page.goto('/marketplace');
    await expect(page.getByText('No saved searches yet')).toBeVisible();

    await page.getByPlaceholder('Search caregivers…').fill('elena');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Save search' }).click();
    await page.getByLabel('Search name').fill('My Elena search');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'My Elena search' })).toBeVisible();

    // Reset, then re-apply the saved search.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nikos Georgiou' })).toBeVisible();
    await page.getByRole('button', { name: 'My Elena search' }).click();
    await expect(page.getByPlaceholder('Search caregivers…')).toHaveValue('elena');
    await expect(page.getByRole('heading', { name: 'Nikos Georgiou' })).toBeHidden();

    // Delete the saved search.
    await page.getByRole('button', { name: 'delete', exact: true }).click();
    await expect(page.getByText('No saved searches yet')).toBeVisible();
  });

  test('favorites toggle optimistically and filter the results', async ({ page }) => {
    const favorites: Array<Record<string, unknown>> = [];
    await seedSession(page);
    await page.route('**/api/caregivers/search*', (route) =>
      route.fulfill({ json: CAREGIVERS })
    );
    await page.route('**/api/me/saved-searches', (route) =>
      route.fulfill({ json: { savedSearches: [], favorites } })
    );
    await page.route('**/api/me/favorites', (route) => {
      const body = route.request().postDataJSON() as { caregiverId: string };
      favorites.push({ caregiverId: body.caregiverId, savedAtMs: Date.now() });
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/me/favorites/cg-*', (route) => {
      if (route.request().method() === 'DELETE') {
        const id = route.request().url().split('/').pop();
        const index = favorites.findIndex((f) => f.caregiverId === id);
        if (index >= 0) favorites.splice(index, 1);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ status: 404 });
    });

    await page.goto('/marketplace');

    // Heart flips immediately (optimistic) without a reload.
    await page
      .getByRole('button', { name: 'Add Elena Papadaki to favorites' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Remove Elena Papadaki from favorites' })
    ).toBeVisible();

    // Favorites-only shows just Elena.
    await page.getByRole('checkbox', { name: 'Favorites only' }).check();
    await expect(page).toHaveURL(/favoritesOnly=true/);
    await expect(page.getByRole('heading', { name: 'Elena Papadaki' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nikos Georgiou' })).toBeHidden();

    // Unfavorite while filtered → Elena disappears from the results.
    await page
      .getByRole('button', { name: 'Remove Elena Papadaki from favorites' })
      .click();
    await expect(
      page.getByText('No favorites match the current filters')
    ).toBeVisible();
  });
});
