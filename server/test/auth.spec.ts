import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Cookie-session auth flow against the real Express app + Postgres (docker
 * compose db). Requires the database to be up; the suite seeds it fresh.
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
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('auth', () => {
  it('registers a user and sets session cookies', async () => {
    const email = `reg-${Date.now()}@example.com`;
    const res = await request(baseUrl).post('/api/auth/register').send({
      displayName: 'Test User',
      email,
      password: 'secret123',
      role: 'client',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: expect.any(String),
      displayName: 'Test User',
      roles: ['client'],
      expiresAtMs: expect.any(Number),
    });
    expect(res.headers['set-cookie']?.join('')).toContain('cm_access');
    expect(res.headers['set-cookie']?.join('')).toContain('cm_refresh');
  });

  it('rejects a duplicate email', async () => {
    const res = await request(baseUrl)
      .post('/api/auth/register')
      .send({ displayName: 'Dup', email: 'maria@example.com', password: 'x', role: 'client' });
    expect(res.status).toBe(409);
  });

  it('logs in with valid credentials only', async () => {
    const ok = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'demo1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.userId).toBe('u-client');

    const bad = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('protects routes without a valid cookie', async () => {
    const res = await request(baseUrl).get('/api/vitals/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token on /refresh and revokes it on logout', async () => {
    // Login, capture both cookies.
    const login = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email: 'maria@example.com', password: 'demo1234' });
    const before = cookies(login);

    // Refresh rotates the refresh cookie.
    const refresh = await request(baseUrl).post('/api/auth/refresh').set('Cookie', before.join('; '));
    expect(refresh.status).toBe(200);
    expect(refresh.body.userId).toBe('u-client');
    const after = cookies(refresh);
    const refreshValue = (name: string, list: string[]) =>
      list.find((c) => c.startsWith(`${name}=`))?.split('=')[1];
    expect(refreshValue('cm_refresh', after)).not.toBe(refreshValue('cm_refresh', before));

    // Access cookie from the new session works.
    const me = await request(baseUrl).get('/api/auth/me').set('Cookie', after.join('; '));
    expect(me.status).toBe(200);

    // Logout revokes the refresh session server-side.
    await request(baseUrl).post('/api/auth/logout').set('Cookie', after.join('; '));
    const reused = await request(baseUrl).post('/api/auth/refresh').set('Cookie', after.join('; '));
    expect(reused.status).toBe(401);
  });
});

describe('RBAC', () => {
  async function loginAs(email: string) {
    const login = await request(baseUrl)
      .post('/api/auth/login')
      .send({ email, password: 'demo1234' });
    return cookies(login);
  }

  it('blocks non-admins from the vetting queue', async () => {
    const cookie = await loginAs('maria@example.com');
    const res = await request(baseUrl).get('/api/vetting/submissions').set('Cookie', cookie.join('; '));
    expect(res.status).toBe(403);
  });

  it('lets an admin see and review the queue', async () => {
    const cookie = await loginAs('admin@example.com');
    const queue = await request(baseUrl).get('/api/vetting/submissions').set('Cookie', cookie.join('; '));
    expect(queue.status).toBe(200);
    expect(Array.isArray(queue.body)).toBe(true);
    expect(queue.body.length).toBeGreaterThan(0);

    const first = queue.body[0];
    const review = await request(baseUrl)
      .post(`/api/vetting/submissions/${first.id}/review`)
      .set('Cookie', cookie.join('; '))
      .send({ decision: 'approved', note: 'Licence verified.' });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe('approved');
  });

  it('returns profile, vitals and care plan for the logged-in client', async () => {
    const cookie = await loginAs('maria@example.com');
    const vitals = await request(baseUrl).get('/api/vitals/me').set('Cookie', cookie.join('; '));
    expect(vitals.status).toBe(200);
    expect(Array.isArray(vitals.body)).toBe(true);

    const carePlans = await request(baseUrl).get('/api/care-plans').set('Cookie', cookie.join('; '));
    expect(carePlans.status).toBe(200);
    expect(carePlans.body[0]).toMatchObject({ id: 'cp-1', clientId: 'u-client' });
  });

  it('books a visit, places the escrow hold, and releases on check-out', async () => {
    const cookie = await loginAs('maria@example.com');
    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', cookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'Test' });
    expect(booking.status).toBe(201);
    expect(booking.body.amountCents).toBeGreaterThan(0);

    const escrow = await request(baseUrl)
      .post('/api/payments/escrow')
      .set('Cookie', cookie.join('; '))
      .send({ bookingId: booking.body.id, providerId: 'u-nurse', amountCents: booking.body.amountCents });
    expect(escrow.status).toBe(201);
    expect(escrow.body.status).toBe('held');
  });
});

function cookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header : []).map((c: string) => c.split(';')[0]);
}