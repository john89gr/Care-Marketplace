import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import { DEMO_PASSWORD } from '../src/demo';

/**
 * Demo sign-in roster against the real Express app + Postgres.
 *
 * The point of these assertions is that the picker on the login page cannot
 * drift from reality: every account it offers must authenticate, and the
 * endpoint must disappear in production.
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await pool.end();
});

describe('demo sign-in roster', () => {
  it('lists the seeded accounts with their roles and the shared password', async () => {
    const res = await request(baseUrl).get('/api/demo/accounts').expect(200);
    expect(Array.isArray(res.body)).toBe(true);

    const accounts = res.body as Array<{
      userId: string;
      displayName: string;
      email: string;
      roles: string[];
      password: string;
    }>;

    // The roster has to cover every role the product has a console for.
    const roles = new Set(accounts.flatMap((account) => account.roles));
    for (const role of ['client', 'nurse', 'caregiver', 'physio', 'admin', 'pharmacy']) {
      expect(roles, `no demo account with role ${role}`).toContain(role);
    }

    for (const account of accounts) {
      expect(account.userId).toBeTruthy();
      expect(account.email).toContain('@');
      expect(account.roles.length).toBeGreaterThan(0);
      expect(account.password).toBe(DEMO_PASSWORD);
    }

    // Documented personas: the client family account and the admin console.
    expect(accounts.some((account) => account.email === 'maria@example.com')).toBe(true);
    expect(accounts.some((account) => account.email === 'admin@example.com')).toBe(true);
  });

  it('omits fixture accounts that exist only for test invariants', async () => {
    const res = await request(baseUrl).get('/api/demo/accounts').expect(200);
    const emails = (res.body as Array<{ email: string }>).map((account) => account.email);
    expect(emails).not.toContain('expired@example.com');
  });

  it('offers accounts that can actually log in', async () => {
    const res = await request(baseUrl).get('/api/demo/accounts').expect(200);
    const account = (res.body as Array<{ email: string; password: string }>)[0];

    const login = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);
    expect(login.body.userId).toBeTruthy();
  });

  it('is a 404 in production unless explicitly enabled', async () => {
    const previous = process.env.NODE_ENV;
    const previousFlag = process.env.ALLOW_DEMO_ACCOUNTS;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DEMO_ACCOUNTS;
      const app = createApp();
      const isolated = createServer(app);
      await new Promise<void>((resolve) => isolated.listen(0, resolve));
      const url = `http://localhost:${(isolated.address() as AddressInfo).port}`;
      try {
        await request(url).get('/api/demo/accounts').expect(404);
      } finally {
        await new Promise<void>((resolve, reject) =>
          isolated.close((err) => (err ? reject(err) : resolve()))
        );
      }
    } finally {
      process.env.NODE_ENV = previous;
      if (previousFlag === undefined) {
        delete process.env.ALLOW_DEMO_ACCOUNTS;
      } else {
        process.env.ALLOW_DEMO_ACCOUNTS = previousFlag;
      }
    }
  });
});
