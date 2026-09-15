import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Payments (§13): simulated tokenization, method CRUD, payout accounts,
 * escrow freeze + partial refunds.
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let provider: request.Agent;

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
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('tokenize', () => {
  it('tokenizes a valid card without persisting the PAN', async () => {
    const res = await client
      .post('/api/me/payment-methods/tokenize')
      .send({ cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2030, cvc: '123' })
      .expect(200);
    expect(res.body).toMatchObject({ brand: 'visa', last4: '4242' });
    expect(res.body.token).toMatch(/^tok_/);
  });

  it('declines the test decline card and rejects bad input', async () => {
    const declined = await client
      .post('/api/me/payment-methods/tokenize')
      .send({ cardNumber: '4000000000000002', expiryMonth: 12, expiryYear: 2030, cvc: '123' })
      .expect(200);
    expect(declined.body).toEqual({ declined: true });
    await client
      .post('/api/me/payment-methods/tokenize')
      .send({ cardNumber: '1234', expiryMonth: 12, expiryYear: 2030, cvc: '123' })
      .expect(422);
    await client
      .post('/api/me/payment-methods/tokenize')
      .send({ cardNumber: '4242424242424242', expiryMonth: 1, expiryYear: 2020, cvc: '123' })
      .expect(422);
  });
});

describe('payment methods', () => {
  it('rejects a PAN at the storage endpoint and CRUDs tokens', async () => {
    await client
      .post('/api/me/payment-methods')
      .send({ cardNumber: '4242424242424242', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 })
      .expect(422);

    const first = await client
      .post('/api/me/payment-methods')
      .send({ token: `tok_a${Date.now()}`, brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 })
      .expect(201);
    const second = await client
      .post('/api/me/payment-methods')
      .send({ token: `tok_b${Date.now()}`, brand: 'mastercard', last4: '5555', expiryMonth: 6, expiryYear: 2029 })
      .expect(201);

    // Second becomes default; first stays non-default.
    await client.patch( `/api/me/payment-methods/${second.body.id}/default`).send({}).expect(200);
    const listed = await client.get('/api/me/payment-methods').expect(200);
    const defaults = listed.body.filter((m: { isDefault: boolean }) => m.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.id);

    // Deleting the default promotes a survivor.
    await client.delete( `/api/me/payment-methods/${second.body.id}`).expect(200);
    const relisted = await client.get('/api/me/payment-methods').expect(200);
    expect(relisted.body.filter((m: { isDefault: boolean }) => m.isDefault)).toHaveLength(1);

    await client.delete( `/api/me/payment-methods/${first.body.id}`).expect(200);
    await client.patch('/api/me/payment-methods/nope/default').send({}).expect(404);
  });
});

describe('payout accounts', () => {
  it('404s before onboarding and round-trips a patch', async () => {
    // Rerun-safe: start without an account row.
    await query(`DELETE FROM payout_accounts WHERE user_id = 'u-nikos'`);
    await provider.get('/api/me/payout-account').expect(404);
    const saved = await provider
      .put('/api/me/payout-account')
      .send({ status: 'pending', country: 'GR', payoutSchedule: 'manual' })
      .expect(200);
    expect(saved.body).toMatchObject({ status: 'pending', country: 'GR', payoutSchedule: 'manual' });
    expect(saved.body.accountId).toMatch(/^acct_/);
    const loaded = await provider.get('/api/me/payout-account').expect(200);
    expect(loaded.body.balanceCents).toBeGreaterThanOrEqual(0);
    await provider.put('/api/me/payout-account').send({ status: 'bogus' }).expect(422);
  });
});

describe('escrow freeze + partial refund', () => {
  it('freezes, partially refunds and releases from frozen', async () => {
    await query(
      `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
       VALUES ('e-flow-test', 'b-2', 'u-nikos', 'u-client', 5000, 'held', $1, NULL)
       ON CONFLICT (id) DO UPDATE SET status = 'held', refunded_cents = 0, settled_at_ms = NULL`,
      [Date.now()]
    );
    const frozen = await client.post('/api/payments/escrow/e-flow-test/freeze').expect(200);
    expect(frozen.body.status).toBe('frozen');

    await client.post('/api/payments/escrow/e-flow-test/partial-refund').send({ amountCents: 0 }).expect(422);
    await client.post('/api/payments/escrow/e-flow-test/partial-refund').send({ amountCents: 99999 }).expect(422);
    const partial = await client
      .post('/api/payments/escrow/e-flow-test/partial-refund')
      .send({ amountCents: 2000 })
      .expect(200);
    expect(partial.body).toMatchObject({ status: 'released', refundedCents: 2000 });
  });

  it('releases a frozen transaction directly', async () => {
    await query(
      `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
       VALUES ('e-frozen-test', 'b-2', 'u-nikos', 'u-client', 3000, 'held', $1, NULL)
       ON CONFLICT (id) DO UPDATE SET status = 'held', refunded_cents = 0, settled_at_ms = NULL`,
      [Date.now()]
    );
    await client.post('/api/payments/escrow/e-frozen-test/freeze').expect(200);
    const released = await client.post('/api/payments/escrow/e-frozen-test/release').expect(200);
    expect(released.body.status).toBe('released');
    await query(`DELETE FROM escrow WHERE id IN ('e-flow-test', 'e-frozen-test')`);
  });
});
