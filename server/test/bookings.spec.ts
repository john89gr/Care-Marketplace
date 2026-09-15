import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Booking lifecycle (§3) against the real app + Postgres: guarded
 * transitions with 409s on illegal moves, reschedule dual-confirmation,
 * and the per-booking event timeline.
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let provider: request.Agent;
let outsider: request.Agent;

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
  provider = await login('nikos@example.com');
  outsider = await login('admin@example.com');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function createBooking(note: string): Promise<string> {
  const res = await client
    .post('/api/bookings')
    .send({ caregiverId: 'u-nikos', scheduledAtMs: Date.now() + 86400000, note })
    .expect(201);
  return res.body.id as string;
}

describe('booking lifecycle', () => {
  it('runs accept → start → complete with timeline events', async () => {
    const id = await createBooking(`lifecycle-${Date.now()}`);

    const accepted = await provider.post(`/api/bookings/${id}/accept`).expect(200);
    expect(accepted.body.status).toBe('accepted');

    // The client cannot drive the visit forward.
    await client.post(`/api/bookings/${id}/start`).expect(403);

    const started = await provider.post(`/api/bookings/${id}/start`).expect(200);
    expect(started.body.status).toBe('in_progress');

    const completed = await provider.post(`/api/bookings/${id}/complete`).expect(200);
    expect(completed.body.status).toBe('completed');

    const events = await client.get(`/api/bookings/${id}/events`).expect(200);
    expect(events.body.map((e: { kind: string }) => e.kind)).toEqual(
      expect.arrayContaining(['created', 'accepted', 'started', 'completed'])
    );
  });

  it('rejects illegal transitions with 409', async () => {
    const id = await createBooking(`illegal-${Date.now()}`);
    // Requested → complete skips the matrix.
    await provider.post(`/api/bookings/${id}/complete`).expect(409);
    // Outsiders see neither timeline nor transitions.
    await outsider.get(`/api/bookings/${id}/events`).expect(403);
    await outsider.post(`/api/bookings/${id}/cancel`).expect(403);
  });

  it('cancels from requested and then refuses further moves', async () => {
    const id = await createBooking(`cancel-${Date.now()}`);
    const cancelled = await client.post(`/api/bookings/${id}/cancel`).expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await provider.post(`/api/bookings/${id}/start`).expect(409);
  });

  it('proposes and dual-confirms a reschedule', async () => {
    const id = await createBooking(`resched-${Date.now()}`);
    const at = Date.now() + 3 * 86400000;
    const proposed = await client
      .post(`/api/bookings/${id}/reschedule`)
      .send({ scheduledAtMs: at, note: 'Morning instead' })
      .expect(200);
    expect(proposed.body.scheduledAtMs).toBe(at);
    expect(proposed.body.pendingReschedule).toMatchObject({
      proposedBy: 'client',
      clientConfirmed: true,
      providerConfirmed: false,
    });

    const confirmed = await provider.post(`/api/bookings/${id}/reschedule/confirm`).expect(200);
    expect(confirmed.body.pendingReschedule).toMatchObject({
      clientConfirmed: true,
      providerConfirmed: true,
    });
  });

  it('validates reschedule payloads and terminal states', async () => {
    const id = await createBooking(`resched-bad-${Date.now()}`);
    await client.post(`/api/bookings/${id}/reschedule`).send({}).expect(422);
    await client.post(`/api/bookings/${id}/reschedule/confirm`).send({}).expect(422);

    await client.post(`/api/bookings/${id}/cancel`).expect(200);
    await client
      .post(`/api/bookings/${id}/reschedule`)
      .send({ scheduledAtMs: Date.now() + 86400000 })
      .expect(409);
  });

  it('disputes from in_progress and then locks the booking', async () => {
    const id = await createBooking(`dispute-${Date.now()}`);
    await provider.post(`/api/bookings/${id}/accept`).expect(200);
    await provider.post(`/api/bookings/${id}/start`).expect(200);
    const disputed = await client.post(`/api/bookings/${id}/dispute`).expect(200);
    expect(disputed.body.status).toBe('disputed');
    await client.post(`/api/bookings/${id}/cancel`).expect(409);
  });

  it('cleans up its own bookings and events', async () => {
    await query(
      `DELETE FROM booking_events WHERE booking_id IN (
         SELECT id FROM bookings
         WHERE note LIKE 'lifecycle-%' OR note LIKE 'illegal-%' OR note LIKE 'cancel-%'
            OR note LIKE 'resched-%' OR note LIKE 'dispute-%')`
    );
    await query(
      `DELETE FROM bookings
       WHERE note LIKE 'lifecycle-%' OR note LIKE 'illegal-%' OR note LIKE 'cancel-%'
          OR note LIKE 'resched-%' OR note LIKE 'dispute-%'`
    );
  });
});
