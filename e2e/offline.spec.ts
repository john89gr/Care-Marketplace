import { test, expect, Page } from '@playwright/test';

/**
 * PWA offline flow (FEATURE_PLAN.md §20): a queued action must survive a tab
 * restart in IndexedDB and flush once the app boots again — even when the
 * reload itself happens offline and the shell is served by the service worker.
 *
 * Flow:
 *  1. Load the app online so the service worker registers + precaches the shell.
 *  2. Seed one `pending` outbox entry directly into IndexedDB (the app never
 *     went offline in demo mode, so this simulates a write that was queued).
 *  3. Go offline and reload — the SW must serve the shell.
 *  4. The app boots, reads the outbox from IndexedDB and replays the entry
 *     against the API; the reading appears and the entry is marked `synced`.
 */

const SESSION = {
  userId: 'u-client',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 3_600_000,
};

const OUTBOX_ENTRY = {
  id: 'offline-e2e-1',
  store: 'vitals',
  action: 'create',
  payload: {
    method: 'POST',
    url: '/api/vitals/me',
    body: { type: 'heartRate', value: 121, source: 'bluetooth', measuredAtMs: Date.now() },
  },
  createdAtMs: Date.now() - 5000,
  attempts: 0,
  status: 'pending',
  syncedAtMs: null,
  dedupeKey: null,
  error: null,
};

/** Seed the outbox store (idempotent) so a later reload picks the entry up. */
async function seedOutbox(page: Page): Promise<void> {
  await page.evaluate((entry) => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('care-marketplace', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('outbox')) {
          const store = db.createObjectStore('outbox', { keyPath: 'id' });
          store.createIndex('by_status', ['status', 'createdAtMs'], { unique: false });
          store.createIndex('by_store', ['store', 'createdAtMs'], { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put(entry);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, OUTBOX_ENTRY);
}

async function outboxStatus(page: Page): Promise<string | null> {
  return page.evaluate((id) => {
    return new Promise<string | null>((resolve, reject) => {
      const req = indexedDB.open('care-marketplace', 1);
      req.onsuccess = () => {
        const db = req.result;
        const get = db.transaction('outbox', 'readonly').objectStore('outbox').get(id);
        get.onsuccess = () => resolve(get.result ? get.result.status : null);
        get.onerror = () => reject(get.error);
        db.close();
      };
      req.onerror = () => reject(req.error);
    });
  }, OUTBOX_ENTRY.id);
}

test('queued actions persist in IndexedDB and flush after an offline reload served by the SW', async ({
  page,
  context,
}) => {
  // Session + demo backend before the app boots.
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, SESSION);

  // 1. First load online: registers the service worker and precaches the shell.
  await page.goto('/vitals?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker?.ready);
  // Give the precache a moment to finish writing the hashed chunks.
  await page.waitForTimeout(1500);
  expect(await page.locator('h1', { hasText: 'Vitals' }).count()).toBeGreaterThan(0);

  // 2. Queue a write into the IndexedDB outbox (simulating an offline action).
  await seedOutbox(page);

  // 3. Reload offline — the service worker must serve the app shell.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // The app is up despite being offline (SW-served shell). Note: Chromium
  // reports navigator.onLine = true in SW-served documents under Playwright's
  // CDP offline emulation, so the banner is asserted in the connection-loss
  // test below (event-driven detection) rather than here.
  expect(await page.locator('h1', { hasText: 'Vitals' }).count()).toBeGreaterThan(0);

  // 4. … and the queued action has been flushed: entry is `synced`.
  await expect
    .poll(() => outboxStatus(page), { timeout: 10_000 })
    .toBe('synced');

  // The replayed reading is now in the demo backend state of this page
  // session. Re-enter the vitals page via the nav (SPA navigation keeps the
  // in-memory demo state alive — a full page load would reset it).
  await page.getByRole('link', { name: 'Marketplace', exact: true }).click();
  await page.getByRole('link', { name: 'Vitals', exact: true }).click();
  await expect(page.getByText('121 bpm').first()).toBeVisible();
  // Out-of-range heart rate also raises the threshold alert.
  await expect(page.getByText(/outside the normal range \(60–100 bpm\)/).first()).toBeVisible();

  await context.setOffline(false);
});

test('offline banner appears on connection loss and clears on reconnect (§20 subtask 4)', async ({
  page,
  context,
}) => {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, SESSION);

  await page.goto('/vitals?demo=1', { waitUntil: 'load' });
  await expect(page.locator('.offline-banner')).toBeHidden();

  // Going offline on the live page fires the window `offline` event → banner.
  await context.setOffline(true);
  await expect(page.locator('.offline-banner')).toBeVisible();

  // Back online → the `online` event clears the banner (and the queue
  // attempts a reconnect flush).
  await context.setOffline(false);
  await expect(page.locator('.offline-banner')).toBeHidden();
});

test('manifest is valid and the app is installable (§20 subtasks 1 & 3)', async ({ page }) => {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
    localStorage.setItem('cm.demo.v1', '1');
  }, SESSION);

  await page.goto('/vitals?demo=1', { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker?.ready);

  // The shell links the manifest + theme color.
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute('href');
  expect(manifestHref).toBe('manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f6bb5');

  // The manifest is served and satisfies the installability criteria.
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.name).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  const maskable = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');
  expect(maskable).toBeTruthy();

  // Every icon resolves to a real PNG.
  for (const icon of manifest.icons as { src: string }[]) {
    const iconRes = await page.request.get(`/${icon.src}`);
    expect(iconRes.status()).toBe(200);
    expect(iconRes.headers()['content-type']).toContain('image/png');
  }
});