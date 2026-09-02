import { test, expect, Page } from '@playwright/test';

/**
 * Phase 1 exit criteria (PLAN.md §5): "a family can register (email or
 * Taxisnet), find a caregiver, and exchange messages in real time."
 *
 * The backend is mocked at the network layer, so the tests exercise the real
 * app shell, forms, matching engine, routing and chat store against a fake
 * API + WebSocket.
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
    roles: ['caregiver'],
    rating: 4.8,
    distanceKm: 3,
    hourlyRate: 18,
    availableNow: true,
  },
  {
    id: 'cg-2',
    displayName: 'Nikos Georgiou',
    roles: ['nurse'],
    rating: 4.2,
    distanceKm: 12,
    hourlyRate: 25,
    availableNow: false,
  },
];

/** Seeds a logged-in client session before the app boots. */
async function seedSession(page: Page, session = CLIENT_SESSION): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('cm.session.v1', JSON.stringify(payload));
  }, session);
}

/** Mocks the caregiver search endpoint used by the marketplace store. */
async function mockSearch(page: Page): Promise<void> {
  await page.route('**/api/caregivers/search*', (route) =>
    route.fulfill({ json: CAREGIVERS })
  );
}

test.describe('Phase 1 — Core Marketplace', () => {
  test('a family can register and land on the marketplace', async ({ page }) => {
    await page.route('**/api/auth/register', (route) =>
      route.fulfill({ json: CLIENT_SESSION })
    );
    await mockSearch(page);

    await page.goto('/register');
    await page.getByLabel('Full name').fill('Maria Papadopoulou');
    await page.getByLabel('Email').fill('maria@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/marketplace$/);
    await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible();
    // The session is applied: header shows the display name.
    await expect(page.getByRole('link', { name: 'Maria Papadopoulou' })).toBeVisible();
  });

  test('a family can find and filter caregivers', async ({ page }) => {
    await seedSession(page);
    await mockSearch(page);

    await page.goto('/marketplace');

    const elena = page.getByRole('heading', { name: 'Elena Papadaki' });
    const nikos = page.getByRole('heading', { name: 'Nikos Georgiou' });
    await expect(elena).toBeVisible();
    await expect(nikos).toBeVisible();

    // Filter by free-text query (client-side matching engine runs on results).
    await page.getByPlaceholder('Search caregivers…').fill('elena');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(elena).toBeVisible();
    await expect(nikos).toBeHidden();

    // Reset brings both back.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(nikos).toBeVisible();
  });

  test('a family can exchange real-time messages with a caregiver', async ({ page }) => {
    await seedSession(page);
    await mockSearch(page);

    // Mock the chat WebSocket: acknowledge sends and reply from the peer.
    const serverFrames: string[] = [];
    await page.routeWebSocket('**/api/ws/chat', (ws) => {
      ws.onMessage((message) => {
        const frame = JSON.parse(message.toString());
        serverFrames.push(frame);
        if (frame.type === 'chat.send') {
          ws.send(
            JSON.stringify({ type: 'chat.ack', payload: { clientMessageId: frame.payload.clientMessageId } })
          );
          ws.send(
            JSON.stringify({
              type: 'chat.message',
              payload: {
                conversationId: frame.payload.conversationId,
                authorId: 'cg-1',
                text: 'Bonjour! Je suis disponible demain matin.',
                sentAtMs: Date.now(),
              },
            })
          );
        }
      });
    });

    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Message', exact: true }).first().click();

    await expect(page).toHaveURL(/\/chat\?with=cg-1&name=Elena%20Papadaki/);
    await expect(page.getByRole('button', { name: /Elena Papadaki/ })).toHaveClass(/active/);

    // Send a message — it appears immediately in the thread.
    await page.getByPlaceholder('Type a message…').fill('Bonjour Elena!');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Bonjour Elena!')).toBeVisible();

    // The peer's reply arrives over the (mocked) WebSocket in real time.
    await expect(page.getByText('Bonjour! Je suis disponible demain matin.')).toBeVisible();

    // The server saw our outbound frame.
    expect(serverFrames.some((f) => f.type === 'chat.send')).toBe(true);
  });
});
