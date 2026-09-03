import { test, expect, Page } from '@playwright/test';

/**
 * Feature 4 (FEATURE_PLAN.md §4) exit criteria: a notification received while
 * on another page shows the badge, opens into the panel, click-through marks
 * it read and routes to the target, and "Mark all read" clears the badge.
 * Also exercises the live WebSocket push path.
 */

const CLIENT_SESSION = {
  userId: 'u-client-1',
  displayName: 'Maria Papadopoulou',
  roles: ['client'],
  expiresAtMs: Date.now() + 60 * 60 * 1000,
};

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, CLIENT_SESSION);
}

const NOTIFICATIONS = [
  {
    id: 'ntf-1',
    kind: 'vitals.alert',
    title: 'Blood pressure above range',
    body: 'Latest reading 165/100 mmHg — check the trends view.',
    link: '/vitals',
    createdAtMs: Date.now() - 60 * 60 * 1000,
    readAtMs: null,
  },
  {
    id: 'ntf-2',
    kind: 'booking.accepted',
    title: 'Booking accepted',
    body: 'Elena Papadaki accepted your visit request.',
    link: '/bookings',
    createdAtMs: Date.now() - 2 * 60 * 60 * 1000,
    readAtMs: null,
  },
];

test.describe('Feature 4 — Notification center', () => {
  test('badge → panel → click-through routes and marks read', async ({ page }) => {
    const notifications = structuredClone(NOTIFICATIONS);
    let readIds: string[] = [];

    await seedSession(page);
    await page.route('**/api/me/notifications', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: { items: notifications, unread: notifications.filter((n) => !readIds.includes(n.id)).length },
        });
      }
      return route.fulfill({ json: { ok: true } });
    });
    await page.route('**/api/me/notifications/*/read', (route) => {
      const parts = route.request().url().split('/');
      readIds.push(parts[parts.length - 2]); // .../notifications/{id}/read
      return route.fulfill({ json: { ok: true } });
    });

    // On another page (marketplace), the badge shows the unread count.
    await page.goto('/marketplace');
    await expect(page.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible();

    // Open the panel: day groups + unread highlighting.
    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.day', { hasText: 'Today' }).first()).toBeVisible();
    await expect(panel.getByText('Blood pressure above range')).toBeVisible();

    // Click-through: marks read + navigates to /vitals.
    await panel.getByRole('button', { name: /Blood pressure above range/ }).click();
    await expect(page).toHaveURL(/\/vitals$/);
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
    expect(readIds).toContain('ntf-1');

    // Back to any page: the read item stays read after reload (persistence).
    await page.reload();
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
  });

  test('mark all read clears the badge', async ({ page }) => {
    const notifications = structuredClone(NOTIFICATIONS);
    const readIds: string[] = [];

    await seedSession(page);
    await page.route('**/api/me/notifications', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: { items: notifications, unread: notifications.filter((n) => !readIds.includes(n.id)).length },
        });
      }
      const url = route.request().url();
      if (url.endsWith('/read-all')) {
        readIds.push(...notifications.map((n) => n.id));
      }
      return route.fulfill({ json: { ok: true } });
    });

    await page.goto('/marketplace');
    await expect(page.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible();

    await page.getByRole('button', { name: /Notifications/ }).click();
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  });

  test('muted kinds are hidden from the panel and unread count', async ({ page }) => {
    const notifications = structuredClone(NOTIFICATIONS);

    await seedSession(page);
    await page.route('**/api/me/notifications', (route) =>
      route.fulfill({
        json: { items: notifications, unread: notifications.filter((n) => n.readAtMs === null).length },
      })
    );
    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });

    // Mute vitals alerts from the mutes drawer.
    await panel.getByRole('button', { name: 'Mutes' }).click();
    await panel.getByRole('checkbox', { name: 'vitals.alert' }).check();

    // The muted item disappears from the panel and the badge drops.
    await expect(
      panel.getByRole('button', {
        name: 'Blood pressure above range Latest reading 165/100 mmHg — check the trends view. Today',
      })
    ).toBeHidden();
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();
  });

  test('a notification pushed over the WebSocket appears live with a toast', async ({ page }) => {
    const notifications = structuredClone(NOTIFICATIONS);
    let pushSent = false;

    await seedSession(page);
    await page.route('**/api/me/notifications', (route) =>
      route.fulfill({ json: { items: notifications, unread: 2 } })
    );
    await page.routeWebSocket('**/api/ws/visits', (ws) => {
      ws.onMessage((message) => {
        const frame = JSON.parse(message.toString());
        if (frame.type === 'notification.poll' && !pushSent) {
          pushSent = true;
          ws.send(
            JSON.stringify({
              type: 'notification.push',
              payload: {
                id: 'ntf-live',
                kind: 'system',
                title: 'Live update',
                body: 'This notification arrived over the WebSocket in real time.',
                createdAtMs: Date.now(),
                readAtMs: null,
              },
            })
          );
        }
      });
    });

    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByText('Live update')).toBeVisible();
    // The push also raised a toast.
    await expect(page.getByText('Live update — This notification arrived over the WebSocket in real time.')).toBeVisible();
    expect(pushSent).toBe(true);
  });
});
