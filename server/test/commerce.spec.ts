import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Pharmacy (§9), wallet (§15), Gov.gr sandbox (§15) and uploads (§18)
 * against the real app + Postgres.
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let pharmacyClient: request.Agent;
let adminClient: request.Agent;

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  client = request.agent(baseUrl);
  await client
    .post('/api/auth/login')
    .send({ email: 'maria@example.com', password: 'demo1234' })
    .expect(200);

  pharmacyClient = request.agent(baseUrl);
  await pharmacyClient
    .post('/api/auth/login')
    .send({ email: 'pharmacy@example.com', password: 'demo1234' })
    .expect(200);

  adminClient = request.agent(baseUrl);
  await adminClient
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'demo1234' })
    .expect(200);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('pharmacy scan + orders', () => {
  it('parses a JSON e-prescription and routes to a partner', async () => {
    const res = await client
      .post('/api/prescriptions/scan')
      .send({
        barcode: JSON.stringify({
          prescriber: 'Dr. Test',
          meds: [{ name: 'Aspirin', dose: '100mg', qty: 2 }],
        }),
        deliveryAddress: 'Test 1, Athens',
      })
      .expect(201);
    expect(res.body.prescription.meds).toHaveLength(1);
    expect(res.body.order.status).toBe('routed');
    expect(res.body.order.pharmacyName).toEqual(expect.any(String));
  });

  it('parses manual lines and rejects garbage with 422', async () => {
    const manual = await client
      .post('/api/prescriptions/scan')
      .send({ barcode: 'Amoxicillin | 500 mg | x21' })
      .expect(201);
    expect(manual.body.prescription.meds[0]).toMatchObject({ name: 'Amoxicillin', qty: 21 });

    await client.post('/api/prescriptions/scan').send({ barcode: '{"nope":true}' }).expect(422);
    await client.post('/api/prescriptions/scan').send({ barcode: '' }).expect(422);
  });

  it('lists orders and advances the pipeline with 409s on illegal moves', async () => {
    const scan = await client
      .post('/api/prescriptions/scan')
      .send({ barcode: 'Vitamin D | 1000 IU | x30' })
      .expect(201);
    const orderId = scan.body.order.id as string;

    await client.post( `/api/pharmacy-orders/${orderId}/status`).send({ to: 'delivered' }).expect(409);
    for (const to of ['accepted', 'preparing', 'out_for_delivery', 'delivered']) {
      const advanced = await client.post( `/api/pharmacy-orders/${orderId}/status`).send({ to }).expect(200);
      expect(advanced.body.status).toBe(to);
    }
    const listed = await client.get('/api/me/pharmacy-orders').expect(200);
    expect(listed.body.map((o: { id: string }) => o.id)).toContain(orderId);
    expect(listed.body.map((o: { id: string }) => o.id)).toContain('po-1');

    // Hygiene: the suite's scans must not accumulate demo orders.
    await query(`DELETE FROM pharmacy_orders WHERE id <> 'po-1' AND client_id = 'u-client'`);
    await query(
      `DELETE FROM prescriptions_scanned WHERE user_id = 'u-client' AND barcode_payload <> '' AND id NOT LIKE 'rx-seed-%'`
    );
  });

  it('allows partner pharmacy stock listing and updates with RBAC', async () => {
    // Unauthenticated GET is allowed (public list of partner pharmacies)
    const partnersRes = await request(baseUrl).get('/api/pharmacy/partners').expect(200);
    expect(Array.isArray(partnersRes.body)).toBe(true);
    expect(partnersRes.body.length).toBeGreaterThanOrEqual(3);
    const p1 = partnersRes.body.find((p: { id: string }) => p.id === 'ph-1');
    expect(p1).toMatchObject({
      id: 'ph-1',
      name: expect.any(String),
      address: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
      inStock: expect.any(Boolean),
      phone: expect.any(String),
      workingHours: expect.any(String),
    });

    // Unauthenticated PATCH stock is rejected
    await request(baseUrl).patch('/api/pharmacy/partners/ph-1/stock').send({ inStock: false }).expect(401);

    // Client (non-pharmacy / non-admin) is rejected with 403
    await client.patch('/api/pharmacy/partners/ph-1/stock').send({ inStock: false }).expect(403);

    // Non-existent partner pharmacy -> 404
    await pharmacyClient.patch('/api/pharmacy/partners/ph-9999/stock').send({ inStock: false }).expect(404);

    // Invalid body without inStock or stockItems -> 422
    await pharmacyClient.patch('/api/pharmacy/partners/ph-1/stock').send({}).expect(422);

    // Pharmacy partner can toggle inStock and update stockItems
    const updated = await pharmacyClient
      .patch('/api/pharmacy/partners/ph-1/stock')
      .send({ inStock: false, stockItems: [{ code: 'ASP-100', qty: 25 }] })
      .expect(200);
    expect(updated.body.inStock).toBe(false);
    expect(updated.body.stockItems).toEqual([{ code: 'ASP-100', qty: 25 }]);

    // Admin can also update stock
    const restocked = await adminClient
      .patch('/api/pharmacy/partners/ph-1/stock')
      .send({ inStock: true })
      .expect(200);
    expect(restocked.body.inStock).toBe(true);
  });

  it('retries routing a failed order when partner restocks', async () => {
    // Put all pharmacies out of stock temporarily
    await adminClient.patch('/api/pharmacy/partners/ph-1/stock').send({ inStock: false }).expect(200);
    await adminClient.patch('/api/pharmacy/partners/ph-2/stock').send({ inStock: false }).expect(200);
    await adminClient.patch('/api/pharmacy/partners/ph-3/stock').send({ inStock: false }).expect(200);

    const scan = await client
      .post('/api/prescriptions/scan')
      .send({
        barcode: 'Ibuprofen | 400 mg | x10',
        deliveryAddress: 'Solonos 5, Athens',
        lat: 37.979,
        lng: 23.738,
      })
      .expect(201);
    const orderId = scan.body.order.id as string;
    expect(scan.body.order.status).toBe('failed');
    expect(scan.body.order.pharmacyId).toBeNull();

    // Retry when still out of stock -> 409
    const stillOut = await client
      .post(`/api/pharmacy-orders/${orderId}/status`)
      .send({ to: 'routed' })
      .expect(409);
    expect(stillOut.body.message).toBe('Still no partner pharmacy with stock. Please try again later.');

    // Restock ph-1
    await adminClient.patch('/api/pharmacy/partners/ph-1/stock').send({ inStock: true }).expect(200);

    // Retry should now succeed and re-route to ph-1
    const retried = await client
      .post(`/api/pharmacy-orders/${orderId}/status`)
      .send({ to: 'routed' })
      .expect(200);
    expect(retried.body.status).toBe('routed');
    expect(retried.body.pharmacyId).toBe('ph-1');
    expect(retried.body.pharmacyName).toBe('Φαρμακείο Συντάγματος');
    const lastNote = retried.body.timeline[retried.body.timeline.length - 1]?.note;
    expect(lastNote).toMatch(/Re-routed to Φαρμακείο Συντάγματος \(\d+(\.\d+)? km\)/);

    // Restore ph-2 stock
    await adminClient.patch('/api/pharmacy/partners/ph-2/stock').send({ inStock: true }).expect(200);

    // Hygiene
    await query(`DELETE FROM pharmacy_orders WHERE id = $1`, [orderId]);
    await query(
      `DELETE FROM prescriptions_scanned WHERE user_id = 'u-client' AND barcode_payload LIKE '%Ibuprofen%'`
    );
  });

  it('allows pharmacy user and admin to view assigned orders', async () => {
    // Seed an order explicitly assigned to ph-1 and another for ph-2
    const at = Date.now();
    await query(
      `INSERT INTO pharmacy_orders
         (id, prescription_id, client_id, pharmacy_id, pharmacy_name, meds, prescriber, status, delivery_address, timeline, created_at_ms, updated_at_ms)
       VALUES
         ('po-ph1-test', 'rx-test-1', 'u-client', 'ph-1', 'Φαρμακείο Συντάγματος', '[]', 'Dr. Test', 'preparing', 'Addr 1', '[]', $1, $1),
         ('po-ph2-test', 'rx-test-2', 'u-client', 'ph-2', 'Φαρμακείο Κολωνακίου', '[]', 'Dr. Test', 'accepted', 'Addr 2', '[]', $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [at - 1000, at]
    );

    // Pharmacy user (linked to ph-1) should see ph-1 orders
    const ph1Orders = await pharmacyClient.get('/api/me/pharmacy-orders').expect(200);
    expect(ph1Orders.body.length).toBeGreaterThan(0);
    expect(ph1Orders.body.some((o: { id: string }) => o.id === 'po-ph1-test')).toBe(true);
    expect(ph1Orders.body.every((o: { pharmacyId: string | null }) => o.pharmacyId === 'ph-1')).toBe(true);

    // Check descending order
    for (let i = 1; i < ph1Orders.body.length; i++) {
      expect(ph1Orders.body[i - 1].createdAtMs).toBeGreaterThanOrEqual(ph1Orders.body[i].createdAtMs);
    }

    // Client maria only sees client orders
    const clientOrders = await client.get('/api/me/pharmacy-orders').expect(200);
    expect(clientOrders.body.every((o: { clientId: string }) => o.clientId === 'u-client')).toBe(true);

    // Admin can query specific pharmacy
    const adminPh2Orders = await adminClient.get('/api/me/pharmacy-orders?pharmacy_id=ph-2').expect(200);
    expect(adminPh2Orders.body.some((o: { id: string }) => o.id === 'po-ph2-test')).toBe(true);
    expect(adminPh2Orders.body.every((o: { pharmacyId: string | null }) => o.pharmacyId === 'ph-2')).toBe(true);

    // Hygiene
    await query(`DELETE FROM pharmacy_orders WHERE id IN ('po-ph1-test', 'po-ph2-test')`);
  });
});

describe('wallet', () => {
  it('requires auth and lists seeded documents with category filter', async () => {
    await request(baseUrl).get('/api/me/wallet').expect(401);
    const all = await client.get('/api/me/wallet').expect(200);
    expect(all.body.documents.length).toBeGreaterThanOrEqual(2);
    const exams = await client.get('/api/me/wallet?category=vaccinations').expect(200);
    expect(exams.body.documents.length).toBeGreaterThanOrEqual(1);
    expect(exams.body.documents.every((d: { category: string }) => d.category === 'vaccinations')).toBe(true);
    await client.get('/api/me/wallet?category=bogus').expect(422);
  });
});

describe('gov.gr sandbox', () => {
  it('authorizes and exchanges a state-bound code once', async () => {
    const authz = await request(baseUrl).get('/api/auth/gov-gr/authorize').expect(200);
    expect(authz.body).toMatchObject({ demo: true });
    const { code, state } = authz.body as { code: string; state: string };

    const fresh = request.agent(baseUrl);
    const callback = await fresh.post('/api/auth/gov-gr/callback').send({ code, state }).expect(200);
    expect(callback.body).toMatchObject({ userId: 'u-client', idVerifiedVia: 'gov_gr' });

    // Single-use: replaying the pair fails.
    await request(baseUrl).post('/api/auth/gov-gr/callback').send({ code, state }).expect(400);
    await request(baseUrl).post('/api/auth/gov-gr/callback').send({ code: 'demo-code-nope', state }).expect(400);
  });
});

describe('uploads', () => {
  it('accepts an image and serves it back, rejecting other types', async () => {
    await request(baseUrl).post('/api/uploads').expect(401);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const up = await client
      .post('/api/uploads')
      .attach('file', png, { filename: 'dot.png', contentType: 'image/png' })
      .expect(201);
    expect(up.body).toMatchObject({ kind: 'image', name: 'dot.png' });
    expect(up.body.url).toMatch(/^\/api\/uploads\//);
    await client.get(up.body.url as string).expect(200);

    await client
      .post('/api/uploads')
      .attach('file', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' })
      .expect(422);
  });
});
