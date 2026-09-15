import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Engagement surfaces (§4, §8, §16): bell notifications, reminder
 * preferences, audit batch upload + admin reads, admin consent oversight.
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let admin: request.Agent;

async function login(email: string): Promise<request.Agent> {
  const agent = request.agent(baseUrl);
  await agent.post('/api/auth/login').send({ email, password: 'demo1234' }).expect(200);
  return agent;
}

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  client = await login('maria@example.com');
  admin = await login('admin@example.com');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('notifications', () => {
  it('requires auth and lists items with an unread count', async () => {
    await request(baseUrl).get('/api/me/notifications').expect(401);
    // Controlled rows: the suite never depends on seeded unread state,
    // which earlier runs may already have consumed via read-all.
    const stamp = Date.now();
    await query(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at_ms, read_at_ms)
       VALUES ($1, 'u-client', 'test.ping', 'Ping', 'pong', '/bookings', $2, NULL),
              ($3, 'u-client', 'test.ping', 'Ping', 'pong', '/bookings', $2, NULL)`,
      [`nt-test-a-${stamp}`, stamp, `nt-test-b-${stamp}`]
    );
    const res = await client.get('/api/me/notifications').expect(200);
    expect(res.body.unread).toBeGreaterThanOrEqual(2);
    expect(res.body.items[0]).toMatchObject({
      kind: expect.any(String),
      title: expect.any(String),
      createdAtMs: expect.any(Number),
    });
  });

  it('marks one and then all as read', async () => {
    const before = await client.get('/api/me/notifications').expect(200);
    const mine = before.body.items.filter((n: { kind: string }) => n.kind === 'test.ping');
    const first = mine.find((n: { readAtMs: number | null }) => n.readAtMs === null) ?? mine[0];
    expect(first).toBeDefined();
    await client.post(`/api/me/notifications/${first.id}/read`).expect(200);
    // Idempotent re-read.
    await client.post(`/api/me/notifications/${first.id}/read`).expect(200);
    await client.post('/api/me/notifications/nope/read').expect(404);
    await client.post('/api/me/notifications/read-all').expect(200);
    const after = await client.get('/api/me/notifications').expect(200);
    expect(after.body.unread).toBe(0);
    await query(`DELETE FROM notifications WHERE kind = 'test.ping'`);
  });
});

describe('reminder preferences', () => {
  it('round-trips a full preferences object', async () => {
    const prefs = {
      channelsByMedication: {},
      quietHours: null,
      timezone: 'Europe/Athens',
      phone: '',
      consents: { sms: false, voice: false, consentedAtMs: null },
      caregiverCopy: { enabled: false, relationship: '' },
      pushEnabled: false,
    };
    const saved = await client.put('/api/me/reminders/preferences').send(prefs).expect(200);
    expect(saved.body).toMatchObject({ timezone: 'Europe/Athens' });
    const loaded = await client.get('/api/me/reminders/preferences').expect(200);
    expect(loaded.body).toMatchObject({ timezone: 'Europe/Athens' });
  });

  it('rejects non-object payloads', async () => {
    await client.put('/api/me/reminders/preferences').send([]).expect(422);
  });
});

describe('audit + admin consents', () => {
  it('accepts a batch from its author and rejects impersonation', async () => {
    const id = `au-test-${Date.now()}`;
    const ok = await client
      .post('/api/audit/batch')
      .send([{ id, actorId: 'u-client', action: 'test.write', resourceType: 't', resourceId: 'r', atMs: Date.now() }])
      .expect(200);
    expect(ok.body).toMatchObject({ ok: true, stored: 1 });
    // Duplicate id is absorbed (append-only, idempotent).
    await client
      .post('/api/audit/batch')
      .send([{ id, actorId: 'u-client', action: 'test.write', resourceType: 't', resourceId: 'r', atMs: Date.now() }])
      .expect(200);
    await client
      .post('/api/audit/batch')
      .send([{ id: `au-x-${Date.now()}`, actorId: 'u-nurse', action: 'x', atMs: Date.now() }])
      .expect(403);
    await client.post('/api/audit/batch').send({ nope: true }).expect(422);
  });

  it('gates the audit list and consent oversight to admins', async () => {
    await client.get('/api/audit/all').expect(403);
    await client.get('/api/admin/consents').expect(403);
    const all = await admin.get('/api/audit/all').expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(1);
    const consents = await admin.get('/api/admin/consents').expect(200);
    const maria = consents.body.items.find((r: { userId: string }) => r.userId === 'u-client');
    expect(maria).toMatchObject({ currentDocumentVersion: expect.any(String) });
    expect(Array.isArray(maria.consents)).toBe(true);
  });
});
