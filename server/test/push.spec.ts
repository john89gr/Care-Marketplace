import { beforeAll, afterAll, describe, expect, it, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Web Push end-to-end contract (FEATURE_PLAN.md §20): subscription CRUD, the
 * /me/push/test sender, and the real notification triggers (booking accepted,
 * out-of-range vitals) — with web-push's network call mocked so the suite
 * needs no push service. Requires Postgres (docker compose db); seeds fresh.
 */

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification },
}));

const CLIENT_EMAIL = 'maria@example.com';
const NURSE_EMAIL = 'elena@example.com';
const ADMIN_EMAIL = 'admin@example.com';
const PASSWORD = 'demo1234';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.example/push/demo-subscription-1',
  keys: { p256dh: 'p256dh-demo', auth: 'auth-demo' },
};

const NURSE_SUBSCRIPTION = {
  endpoint: 'https://fcm.example/push/nurse-subscription',
  keys: { p256dh: 'n-p256', auth: 'n-auth' },
};

/** Minutes from local midnight for a timestamp (schedule times are minutes). */
function minutesSinceMidnight(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

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

beforeEach(() => {
  sendNotification.mockReset();
});

async function login(email: string): Promise<string[]> {
  const res = await request(baseUrl)
    .post('/api/auth/login')
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return cookies(res);
}

function callsWithKind(kind: string) {
  return sendNotification.mock.calls.filter(([, payload]) =>
    JSON.parse(payload as string).kind === kind
  );
}

describe('push subscriptions', () => {
  it('requires auth', async () => {
    const res = await request(baseUrl).get('/api/me/push-subscription');
    expect(res.status).toBe(401);
  });

  it('saves, reads and deletes a subscription', async () => {
    const cookie = await login(CLIENT_EMAIL);

    const save = await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    expect(save.status).toBe(200);
    expect(save.body).toMatchObject({ ok: true, endpoint: SUBSCRIPTION.endpoint });

    const read = await request(baseUrl)
      .get('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '));
    expect(read.body).toMatchObject({ subscribed: true, endpoint: SUBSCRIPTION.endpoint });

    const del = await request(baseUrl)
      .delete('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '));
    expect(del.status).toBe(200);

    const after = await request(baseUrl)
      .get('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '));
    expect(after.body).toEqual({ endpoint: null, subscribed: false });
  });

  it('rejects a subscription without endpoint or keys', async () => {
    const cookie = await login(CLIENT_EMAIL);
    const res = await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send({ endpoint: 'https://fcm.example/x' });
    expect(res.status).toBe(422);
  });

  it('sends a test push to the current user’s subscription', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);

    sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    const res = await request(baseUrl)
      .post('/api/me/push/test')
      .set('Cookie', cookie.join('; '));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, result: 'sent' });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [sub, payload] = sendNotification.mock.calls[0] as [unknown, string];
    expect(sub).toEqual({
      endpoint: SUBSCRIPTION.endpoint,
      keys: { p256dh: 'p256dh-demo', auth: 'auth-demo' },
    });
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Test notification');
    // Click routing: ngsw navigates the focused client to the link.
    expect(body.notification.data.onActionClick.default).toEqual({
      operation: 'navigateLastFocusedOrOpen',
      url: '/marketplace',
    });
  });

  it('refuses a test push when the user has no subscription', async () => {
    const cookie = await login(NURSE_EMAIL);
    // Suite runs share the dev DB across runs — drop any leftover subscription
    // first so the 422 is deterministic.
    await request(baseUrl)
      .delete('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '));
    const res = await request(baseUrl)
      .post('/api/me/push/test')
      .set('Cookie', cookie.join('; '));
    expect(res.status).toBe(422);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('drops a dead subscription on 410 and reports failure', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);

    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const first = await request(baseUrl)
      .post('/api/me/push/test')
      .set('Cookie', cookie.join('; '));
    expect(first.status).toBe(200);
    expect(first.body.result).toBe('expired');

    const read = await request(baseUrl)
      .get('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '));
    expect(read.body.subscribed).toBe(false);
  });
});

describe('real notification triggers', () => {
  it('pushes a vitals alert when a reading is out of range', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const res = await request(baseUrl)
      .post('/api/vitals/me')
      .set('Cookie', cookie.join('; '))
      .send({ type: 'heartRate', value: 121, measuredAtMs: Date.now() });
    expect(res.status).toBe(201);

    const calls = callsWithKind('vitals.alert');
    expect(calls).toHaveLength(1);
    const [, payload] = calls[0] as [unknown, string];
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Heart rate outside reference range');
    expect(body.notification.data.onActionClick.default.url).toBe('/vitals');
  });

  it('checks diastolic blood pressure against its own range', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    await request(baseUrl)
      .post('/api/vitals/me')
      .set('Cookie', cookie.join('; '))
      .send({ type: 'bloodPressure', value: 120, value2: 95, measuredAtMs: Date.now() });

    expect(callsWithKind('vitals.alert')).toHaveLength(1);
  });

  it('does not push for in-range readings', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);

    await request(baseUrl)
      .post('/api/vitals/me')
      .set('Cookie', cookie.join('; '))
      .send({ type: 'heartRate', value: 80, measuredAtMs: Date.now() });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('pushes booking.accepted to the client when the provider accepts', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', clientCookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', clientCookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'Push test' });
    expect(booking.status).toBe(201);

    const nurseCookie = await login(NURSE_EMAIL);
    const accept = await request(baseUrl)
      .post(`/api/bookings/${booking.body.id}/accept`)
      .set('Cookie', nurseCookie.join('; '));
    expect(accept.status).toBe(200);
    expect(accept.body).toMatchObject({ id: booking.body.id, status: 'accepted' });

    const calls = callsWithKind('booking.accepted');
    expect(calls).toHaveLength(1);
    const [sub, payload] = calls[0] as [unknown, string];
    expect(sub).toMatchObject({ endpoint: SUBSCRIPTION.endpoint });
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Booking accepted');
    expect(body.notification.body).toContain('Elena Papadaki');
    expect(body.notification.data.onActionClick.default.url).toBe('/bookings');
  });

  it('blocks clients from accepting a booking', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', clientCookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'RBAC' });
    expect(booking.status).toBe(201);

    const res = await request(baseUrl)
      .post(`/api/bookings/${booking.body.id}/accept`)
      .set('Cookie', clientCookie.join('; '));
    expect(res.status).toBe(403);
  });

  it('pushes booking.completed to the client when the visit is checked out', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', clientCookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    // Seeded visit visit-1 belongs to provider u-nurse / client u-client.
    const nurseCookie = await login(NURSE_EMAIL);
    const res = await request(baseUrl)
      .post('/api/visits/visit-1/check-out')
      .set('Cookie', nurseCookie.join('; '))
      .send({ position: { lat: 37.98, lng: 23.72 } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');

    const calls = callsWithKind('booking.completed');
    expect(calls).toHaveLength(1);
    const [sub, payload] = calls[0] as [unknown, string];
    expect(sub).toMatchObject({ endpoint: SUBSCRIPTION.endpoint });
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Visit completed');
    // Deep-links to the review form for that booking.
    expect(body.notification.data.onActionClick.default.url).toMatch(/^\/review\?booking=/);
  });

  it('pushes medication.missed once for a due critical dose (idempotent)', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    // Dose scheduled 2h ago → well past the 60-min grace window.
    const pastMinutes = minutesSinceMidnight(Date.now() - 2 * 60 * 60 * 1000);
    const created = await request(baseUrl)
      .post('/api/me/medications')
      .set('Cookie', cookie.join('; '))
      .send({
        name: 'Insulin',
        dose: '10u',
        critical: true,
        schedule: { kind: 'daily', timesMinutes: [pastMinutes] },
      });
    expect(created.status).toBe(201);

    // Missed-dose detection runs on read → log + push.
    await request(baseUrl).get('/api/me/medications').set('Cookie', cookie.join('; '));
    const calls = callsWithKind('medication.missed');
    expect(calls).toHaveLength(1);
    const [, payload] = calls[0] as [unknown, string];
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Missed dose: Insulin');
    expect(body.notification.data.onActionClick.default.url).toBe('/medications');

    // A second read must not re-push the same dose.
    await request(baseUrl).get('/api/me/medications').set('Cookie', cookie.join('; '));
    expect(callsWithKind('medication.missed')).toHaveLength(1);
  });

  it('does not push medication.missed for non-critical meds or taken doses', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    const pastMinutes = minutesSinceMidnight(Date.now() - 2 * 60 * 60 * 1000);

    // Non-critical med → missed log, but no push.
    await request(baseUrl)
      .post('/api/me/medications')
      .set('Cookie', cookie.join('; '))
      .send({ name: 'Paracetamol', critical: false, schedule: { kind: 'daily', timesMinutes: [pastMinutes] } });
    await request(baseUrl).get('/api/me/medications').set('Cookie', cookie.join('; '));
    expect(sendNotification).not.toHaveBeenCalled();

    // Critical med whose dose was already logged as taken → no push.
    const critical = await request(baseUrl)
      .post('/api/me/medications')
      .set('Cookie', cookie.join('; '))
      .send({ name: 'Warfarin', critical: true, schedule: { kind: 'daily', timesMinutes: [pastMinutes] } });
    await request(baseUrl)
      .post(`/api/medications/${critical.body.id}/log`)
      .set('Cookie', cookie.join('; '))
      .send({ timeMinutes: pastMinutes });
    await request(baseUrl).get('/api/me/medications').set('Cookie', cookie.join('; '));
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('pushes dispute.opened to the other party', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', clientCookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'Dispute test' });
    expect(booking.status).toBe(201);

    const nurseCookie = await login(NURSE_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', nurseCookie.join('; '))
      .send(NURSE_SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const opened = await request(baseUrl)
      .post('/api/disputes')
      .set('Cookie', clientCookie.join('; '))
      .send({ bookingId: booking.body.id, reason: 'provider_no_show', description: 'Never arrived.' });
    expect(opened.status).toBe(201);
    expect(opened.body).toMatchObject({ state: 'open', bookingId: booking.body.id });

    const calls = callsWithKind('dispute.opened');
    expect(calls).toHaveLength(1);
    const [sub] = calls[0] as [unknown, string];
    // The client opened it → the provider is notified.
    expect(sub).toMatchObject({ endpoint: NURSE_SUBSCRIPTION.endpoint });
  });

  it('pushes dispute.resolved to both parties on admin resolution', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', clientCookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'Resolution test' });
    const dispute = await request(baseUrl)
      .post('/api/disputes')
      .set('Cookie', clientCookie.join('; '))
      .send({ bookingId: booking.body.id, reason: 'quality_of_care', description: 'Not satisfied.' });
    expect(dispute.status).toBe(201);

    // Subscribe both parties so both get the resolution push.
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', clientCookie.join('; '))
      .send(SUBSCRIPTION);
    const nurseCookie = await login(NURSE_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', nurseCookie.join('; '))
      .send(NURSE_SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const adminCookie = await login(ADMIN_EMAIL);
    const res = await request(baseUrl)
      .post(`/api/disputes/${dispute.body.id}/state`)
      .set('Cookie', adminCookie.join('; '))
      .send({ state: 'resolved_client', resolution: 'full_refund' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('resolved_client');

    const calls = callsWithKind('dispute.resolved');
    expect(calls).toHaveLength(2);
    const endpoints = calls.map(([sub]) => (sub as { endpoint: string }).endpoint).sort();
    expect(endpoints).toEqual([SUBSCRIPTION.endpoint, NURSE_SUBSCRIPTION.endpoint].sort());
  });

  it('pushes screening.due for every newly due screening (once per due cycle)', async () => {
    const cookie = await login(CLIENT_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    // Clean leftover notices from earlier runs (dev DB persists across runs).
    await pool.query(`DELETE FROM screening_notices WHERE user_id = 'u-client'`);

    // Seeded profile (1968-03-14, female) + cardioCheck done ~14 months ago
    // (12-month interval) → overdue; mammography/cervicalSmear/colorectalScreening
    // apply with no record → due.
    const res = await request(baseUrl).get('/api/screenings/me').set('Cookie', cookie.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ dateOfBirth: '1968-03-14', sex: 'female' });

    const dueCalls = callsWithKind('screening.due');
    expect(dueCalls).toHaveLength(4);
    const cardio = dueCalls.find(([, payload]) =>
      JSON.parse(payload as string).notification.title === 'Cardiovascular check is due'
    ) as [unknown, string] | undefined;
    expect(cardio).toBeDefined();
    const body = JSON.parse(cardio![1]);
    expect(body.notification.body).toContain('overdue');
    expect(body.notification.data.onActionClick.default.url).toBe('/screenings');

    // Second read: nothing new → no re-push.
    await request(baseUrl).get('/api/screenings/me').set('Cookie', cookie.join('; '));
    expect(callsWithKind('screening.due')).toHaveLength(4);
  });

  it('does not push screening.due when nothing is due', async () => {
    const cookie = await login(NURSE_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(NURSE_SUBSCRIPTION);
    // u-nurse has no profile DOB → no rules apply → no pushes.
    const res = await request(baseUrl).get('/api/screenings/me').set('Cookie', cookie.join('; '));
    expect(res.status).toBe(200);
    expect(callsWithKind('screening.due')).toHaveLength(0);
  });

  it('pushes certification.expiring to the provider once per certificate', async () => {
    const cookie = await login(NURSE_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', cookie.join('; '))
      .send(NURSE_SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    // Clean leftover notices from earlier runs (dev DB persists across runs).
    await pool.query(`DELETE FROM certification_notices WHERE cert_id = 'cert-nurse-1'`);

    // Seeded licence expires in 14 days → expiring push on the vetting read.
    const res = await request(baseUrl)
      .get('/api/vetting/submissions/me')
      .set('Cookie', cookie.join('; '));
    expect(res.status).toBe(200);

    const calls = callsWithKind('certification.expiring');
    expect(calls).toHaveLength(1);
    const [sub, payload] = calls[0] as [unknown, string];
    expect(sub).toMatchObject({ endpoint: NURSE_SUBSCRIPTION.endpoint });
    const body = JSON.parse(payload);
    expect(body.notification.title).toBe('Licence expires soon');
    expect(body.notification.body).toContain('expires in 14 days');
    expect(body.notification.data.onActionClick.default.url).toBe('/onboarding');

    // Second read: already notified → no re-push.
    await request(baseUrl)
      .get('/api/vetting/submissions/me')
      .set('Cookie', cookie.join('; '));
    expect(callsWithKind('certification.expiring')).toHaveLength(1);
  });

  it('does not push certification expiry for a far-future certificate', async () => {
    const cookie = await login(NURSE_EMAIL);
    // Insert a cert expiring well past the 30-day window (no notice yet).
    await pool.query(
      `INSERT INTO certifications (id, provider_id, name, licence_number, expires_at_ms, created_at_ms)
       VALUES ('cert-far-future', 'u-nurse', 'CPR', 'CPR-1', $1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [Date.now() + 200 * 24 * 60 * 60 * 1000, Date.now()]
    );
    await pool.query(`DELETE FROM certification_notices WHERE cert_id = 'cert-far-future'`);
    await request(baseUrl)
      .get('/api/vetting/submissions/me')
      .set('Cookie', cookie.join('; '));
    expect(callsWithKind('certification.expiring')).toHaveLength(0);
    expect(callsWithKind('certification.expired')).toHaveLength(0);
  });

  it('pushes dispute.rejected on admin rejection', async () => {
    const clientCookie = await login(CLIENT_EMAIL);
    const booking = await request(baseUrl)
      .post('/api/bookings')
      .set('Cookie', clientCookie.join('; '))
      .send({ caregiverId: 'u-nurse', scheduledAtMs: Date.now() + 60 * 60 * 1000, note: 'Rejection test' });
    const dispute = await request(baseUrl)
      .post('/api/disputes')
      .set('Cookie', clientCookie.join('; '))
      .send({ bookingId: booking.body.id, reason: 'fraudulent_claim', description: 'No evidence.' });
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', clientCookie.join('; '))
      .send(SUBSCRIPTION);
    const nurseCookie = await login(NURSE_EMAIL);
    await request(baseUrl)
      .post('/api/me/push-subscription')
      .set('Cookie', nurseCookie.join('; '))
      .send(NURSE_SUBSCRIPTION);
    sendNotification.mockResolvedValue({ statusCode: 201 });

    const adminCookie = await login(ADMIN_EMAIL);
    const res = await request(baseUrl)
      .post(`/api/disputes/${dispute.body.id}/state`)
      .set('Cookie', adminCookie.join('; '))
      .send({ state: 'rejected', resolution: 'release' });
    expect(res.status).toBe(200);
    expect(callsWithKind('dispute.rejected')).toHaveLength(2);
    expect(callsWithKind('dispute.resolved')).toHaveLength(0);
  });
});

function cookies(res: request.Response): string[] {
  const header = res.headers['set-cookie'];
  return (Array.isArray(header) ? header : []).map((c: string) => c.split(';')[0]);
}