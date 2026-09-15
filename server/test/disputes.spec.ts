import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query, queryOne, Row } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let provider: request.Agent;
let admin: request.Agent;
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
  admin = await login('admin@example.com');
  outsider = await login('anna@example.com');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function createBookingWithEscrow(amountCents = 6000): Promise<{ bookingId: string; escrowId: string }> {
  const bRes = await client
    .post('/api/bookings')
    .send({ caregiverId: 'u-nikos', scheduledAtMs: Date.now() + 86400000, note: `test-booking-${Date.now()}` })
    .expect(201);
  const bookingId = bRes.body.id as string;

  const escrowId = `e-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await query(
    `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
     VALUES ($1, $2, 'u-nikos', 'u-client', $3, 'held', $4, NULL)`,
    [escrowId, bookingId, amountCents, Date.now()]
  );
  return { bookingId, escrowId };
}

describe('Dispute Resolution & Escrow Settlement', () => {
  describe('POST /api/disputes (opening a dispute)', () => {
    it('validates required fields', async () => {
      await client.post('/api/disputes').send({}).expect(422);
      await client.post('/api/disputes').send({ bookingId: 'b-dummy' }).expect(422);
      await client.post('/api/disputes').send({ reason: 'not_delivered' }).expect(422);
    });

    it('returns 404 for non-existent booking', async () => {
      await client
        .post('/api/disputes')
        .send({ bookingId: 'b-nonexistent', reason: 'not_delivered' })
        .expect(404);
    });

    it('returns 403 when caller is not party to booking', async () => {
      const { bookingId } = await createBookingWithEscrow();
      await outsider
        .post('/api/disputes')
        .send({ bookingId, reason: 'quality', description: 'Unauthorized dispute' })
        .expect(403);
    });

    it('opens dispute, freezes held escrow, appends booking event, and creates dispute row', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(5000);

      const res = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'not_delivered', description: 'Provider did not arrive' })
        .expect(201);

      // Verify returned shape matches specification
      expect(res.body).toMatchObject({
        id: expect.stringMatching(/^dp-/),
        bookingId,
        clientId: 'u-client',
        clientName: 'Maria Papadopoulou',
        providerId: 'u-nikos',
        providerName: 'Nikos Georgiou',
        openedBy: 'u-client',
        openedByName: 'Maria Papadopoulou',
        reason: 'not_delivered',
        description: 'Provider did not arrive',
        state: 'open',
        resolution: null,
        refundCents: null,
        escrowTransactionId: escrowId,
        evidence: [],
      });
      expect(typeof res.body.createdAtMs).toBe('number');
      expect(typeof res.body.updatedAtMs).toBe('number');

      // Verify escrow status was frozen
      const escrowRow = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId]);
      expect(escrowRow?.status).toBe('frozen');

      // Verify booking event was appended
      const events = await query<Row>(
        `SELECT * FROM booking_events WHERE booking_id = $1 AND kind = 'disputed'`,
        [bookingId]
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].by_user_id).toBe('u-client');
      expect(events[0].kind).toBe('disputed');

      // Verify bell notification was sent to the provider
      const notifications = await query<Row>(
        `SELECT * FROM notifications WHERE user_id = 'u-nikos' AND kind = 'dispute.opened' ORDER BY created_at_ms DESC LIMIT 1`
      );
      expect(notifications.length).toBe(1);
      expect(notifications[0].body).toContain(bookingId);
    });

    it('returns 409 if an open dispute already exists for the booking', async () => {
      const { bookingId } = await createBookingWithEscrow();

      await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'quality', description: 'First dispute' })
        .expect(201);

      // Second attempt by client or provider must be rejected with 409
      const dupRes = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'overcharged', description: 'Second dispute' })
        .expect(409);
      expect(dupRes.body.message).toMatch(/already open/i);

      await provider
        .post('/api/disputes')
        .send({ bookingId, reason: 'other', description: 'Provider second dispute' })
        .expect(409);
    });
  });

  describe('POST /api/disputes/:id/evidence (appending evidence)', () => {
    it('validates evidence authorization and kinds', async () => {
      const { bookingId } = await createBookingWithEscrow();
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'not_delivered', description: 'Need proof' })
        .expect(201);

      // Non-party cannot submit evidence
      await outsider
        .post(`/api/disputes/${disp.body.id}/evidence`)
        .send({ kind: 'message', body: 'Third party comment' })
        .expect(403);

      // Invalid kind is rejected
      await client
        .post(`/api/disputes/${disp.body.id}/evidence`)
        .send({ kind: 'invalid_kind', body: 'Wrong type' })
        .expect(422);

      // 404 for non-existent dispute
      await client
        .post('/api/disputes/dp-nonexistent/evidence')
        .send({ kind: 'message', body: 'Ghost dispute' })
        .expect(404);
    });

    it('allows client and provider to append evidence items', async () => {
      const { bookingId } = await createBookingWithEscrow();
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'quality', description: 'Incomplete care' })
        .expect(201);

      const ev1 = await client
        .post(`/api/disputes/${disp.body.id}/evidence`)
        .send({ kind: 'message', body: 'Caregiver left 30 minutes early.' })
        .expect(201);
      expect(ev1.body).toMatchObject({
        disputeId: disp.body.id,
        authorId: 'u-client',
        authorName: 'Maria Papadopoulou',
        kind: 'message',
        body: 'Caregiver left 30 minutes early.',
      });

      const ev2 = await provider
        .post(`/api/disputes/${disp.body.id}/evidence`)
        .send({ kind: 'photo', url: 'https://example.com/checkin.jpg', body: 'Photo of arrived timesheet' })
        .expect(201);
      expect(ev2.body).toMatchObject({
        disputeId: disp.body.id,
        authorId: 'u-nikos',
        authorName: 'Nikos Georgiou',
        kind: 'photo',
        url: 'https://example.com/checkin.jpg',
      });

      const ev3 = await provider
        .post(`/api/disputes/${disp.body.id}/evidence`)
        .send({ kind: 'visit_gps', body: 'GPS verified: 37.9838, 23.7275' })
        .expect(201);
      expect(ev3.body.kind).toBe('visit_gps');

      // Check dispute query includes all 3 evidence items
      const fetched = await client.get(`/api/disputes/${disp.body.id}`).expect(200);
      expect(fetched.body.evidence).toHaveLength(3);
      expect(fetched.body.evidence[0]).toMatchObject({ kind: 'message', body: 'Caregiver left 30 minutes early.' });
      expect(fetched.body.evidence[1]).toMatchObject({ kind: 'photo', url: 'https://example.com/checkin.jpg' });
      expect(fetched.body.evidence[2]).toMatchObject({ kind: 'visit_gps' });
    });
  });

  describe('Dispute queries (GET /api/me/disputes, GET /api/disputes, GET /api/disputes/:id)', () => {
    it('returns all 17 fields for each dispute', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(4500);
      const created = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'other', description: 'Query contract test' })
        .expect(201);

      const requiredFields = [
        'id',
        'bookingId',
        'clientId',
        'clientName',
        'providerId',
        'providerName',
        'openedBy',
        'openedByName',
        'reason',
        'description',
        'state',
        'resolution',
        'refundCents',
        'escrowTransactionId',
        'evidence',
        'createdAtMs',
        'updatedAtMs',
      ];

      // Single item query
      const single = await client.get(`/api/disputes/${created.body.id}`).expect(200);
      for (const field of requiredFields) {
        expect(single.body).toHaveProperty(field);
      }
      expect(single.body.escrowTransactionId).toBe(escrowId);

      // /me/disputes for client
      const myClient = await client.get('/api/me/disputes').expect(200);
      expect(Array.isArray(myClient.body)).toBe(true);
      const foundInClient = myClient.body.find((d: { id: string }) => d.id === created.body.id);
      expect(foundInClient).toBeDefined();
      for (const field of requiredFields) {
        expect(foundInClient).toHaveProperty(field);
      }

      // /me/disputes for provider
      const myProvider = await provider.get('/api/me/disputes').expect(200);
      expect(Array.isArray(myProvider.body)).toBe(true);
      const foundInProvider = myProvider.body.find((d: { id: string }) => d.id === created.body.id);
      expect(foundInProvider).toBeDefined();

      // Admin queue
      const adminQueue = await admin.get('/api/disputes').expect(200);
      expect(Array.isArray(adminQueue.body)).toBe(true);
      const foundInAdmin = adminQueue.body.find((d: { id: string }) => d.id === created.body.id);
      expect(foundInAdmin).toBeDefined();

      // Non-admin forbidden from admin queue
      await client.get('/api/disputes').expect(403);
      await provider.get('/api/disputes').expect(403);

      // Outsider forbidden from viewing dispute details
      await outsider.get(`/api/disputes/${created.body.id}`).expect(403);
    });
  });

  describe('POST /api/disputes/:id/state (admin resolution)', () => {
    it('requires admin role and validates state/resolution', async () => {
      const { bookingId } = await createBookingWithEscrow();
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'quality', description: 'Admin test' })
        .expect(201);

      // Non-admin rejected with 403
      await client.post(`/api/disputes/${disp.body.id}/state`).send({ state: 'resolved_client', resolution: 'full_refund' }).expect(403);

      // Invalid state rejected with 422
      await admin.post(`/api/disputes/${disp.body.id}/state`).send({ state: 'bogus_state', resolution: 'release' }).expect(422);

      // Invalid resolution rejected with 422
      await admin.post(`/api/disputes/${disp.body.id}/state`).send({ state: 'resolved_client', resolution: 'bogus_resolution' }).expect(422);
    });

    it('settles escrow with release to provider', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(7000);
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'quality', description: 'Release test' })
        .expect(201);

      const res = await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_provider', resolution: 'release' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: disp.body.id,
        state: 'resolved_provider',
        resolution: 'release',
        refundCents: null,
      });

      const escrowRow = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId]);
      expect(escrowRow?.status).toBe('released');
      expect(Number(escrowRow?.settled_at_ms)).toBeGreaterThan(0);
      expect(Number(escrowRow?.refunded_cents)).toBe(0);

      // Notifications sent to client and provider
      const clientNotif = await queryOne<Row>(
        `SELECT * FROM notifications WHERE user_id = 'u-client' AND kind = 'dispute.resolved' ORDER BY created_at_ms DESC`
      );
      expect(clientNotif).toBeDefined();

      const provNotif = await queryOne<Row>(
        `SELECT * FROM notifications WHERE user_id = 'u-nikos' AND kind = 'dispute.resolved' ORDER BY created_at_ms DESC`
      );
      expect(provNotif).toBeDefined();
    });

    it('settles escrow with full_refund to client', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(8000);
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'not_delivered', description: 'Full refund test' })
        .expect(201);

      const res = await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_client', resolution: 'full_refund' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: disp.body.id,
        state: 'resolved_client',
        resolution: 'full_refund',
        refundCents: null,
      });

      const escrowRow = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId]);
      expect(escrowRow?.status).toBe('refunded');
      expect(Number(escrowRow?.settled_at_ms)).toBeGreaterThan(0);
    });

    it('validates partial_refund boundaries and settles escrow partially', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(10000); // 100 EUR
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'overcharged', description: 'Partial refund test' })
        .expect(201);

      // refundCents = 0 -> 422
      await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_client', resolution: 'partial_refund', refundCents: 0 })
        .expect(422);

      // refundCents = -500 -> 422
      await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_client', resolution: 'partial_refund', refundCents: -500 })
        .expect(422);

      // refundCents > amount_cents (10001 > 10000) -> 422
      await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_client', resolution: 'partial_refund', refundCents: 10001 })
        .expect(422);

      // Valid partial refund: 4000 cents (40 EUR refunded to client, 60 EUR released to provider)
      const res = await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'resolved_client', resolution: 'partial_refund', refundCents: 4000 })
        .expect(200);

      expect(res.body).toMatchObject({
        id: disp.body.id,
        state: 'resolved_client',
        resolution: 'partial_refund',
        refundCents: 4000,
      });

      const escrowRow = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId]);
      expect(escrowRow?.status).toBe('released');
      expect(Number(escrowRow?.refunded_cents)).toBe(4000);
      expect(Number(escrowRow?.settled_at_ms)).toBeGreaterThan(0);

      // Provider payout account balance check (from payments router)
      const payoutRes = await provider.get('/api/me/payout-account').expect(200);
      // Payout balance includes the provider's share (10000 - 4000 = 6000 cents)
      expect(payoutRes.body.balanceCents).toBeGreaterThanOrEqual(6000);
    });

    it('settles escrow with rejection (release to provider)', async () => {
      const { bookingId, escrowId } = await createBookingWithEscrow(3500);
      const disp = await client
        .post('/api/disputes')
        .send({ bookingId, reason: 'other', description: 'Rejection test' })
        .expect(201);

      const res = await admin
        .post(`/api/disputes/${disp.body.id}/state`)
        .send({ state: 'rejected', resolution: 'release' })
        .expect(200);

      expect(res.body).toMatchObject({
        id: disp.body.id,
        state: 'rejected',
        resolution: 'release',
      });

      const escrowRow = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId]);
      expect(escrowRow?.status).toBe('released');
    });
  });
});
