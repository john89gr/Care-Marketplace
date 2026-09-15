import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Gov.gr Health Wallet test suite (§15):
 * Covers:
 * - Syncing certified wallet documents (full + category-specific + invalid)
 * - Fetching documents by category
 * - Fetching single document details with digital signature metadata
 * - Uploading verified documents to health wallet
 * - Removing documents from health wallet
 * - Security: authentication guards, authorization boundaries (user isolation)
 */

let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
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
  outsider = await login('nikos@example.com');
});

afterAll(async () => {
  // Cleanup test-created wallet documents
  await query(`DELETE FROM wallet_documents WHERE id LIKE 'gov-%' OR id LIKE 'wd-test-%'`);
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('POST /api/me/wallet/sync', () => {
  it('requires authentication (401)', async () => {
    await request(baseUrl).post('/api/me/wallet/sync').expect(401);
  });

  it('rejects unknown wallet category with 422', async () => {
    const res = await client.post('/api/me/wallet/sync?category=unsupported').expect(422);
    expect(res.body).toMatchObject({ message: 'Unknown wallet category.' });
  });

  it('syncs single category (vaccinations) and returns syncedCount and lastSyncedAtMs', async () => {
    const res = await client.post('/api/me/wallet/sync?category=vaccinations').expect(200);
    expect(res.body).toMatchObject({
      ok: true,
      syncedCount: 2,
      lastSyncedAtMs: expect.any(Number),
    });
    expect(Date.now() - res.body.lastSyncedAtMs).toBeLessThan(5000);
  });

  it('syncs all categories when category query param is omitted', async () => {
    const res = await client.post('/api/me/wallet/sync').expect(200);
    expect(res.body).toMatchObject({
      ok: true,
      syncedCount: 5,
      lastSyncedAtMs: expect.any(Number),
    });
  });

  it('is idempotent: re-syncing updates records without errors or duplications', async () => {
    const firstSync = await client.post('/api/me/wallet/sync').expect(200);
    expect(firstSync.body.ok).toBe(true);

    const secondSync = await client.post('/api/me/wallet/sync').expect(200);
    expect(secondSync.body.ok).toBe(true);
    expect(secondSync.body.syncedCount).toBe(5);
  });
});

describe('GET /api/me/wallet (listing and category filter)', () => {
  it('requires authentication (401)', async () => {
    await request(baseUrl).get('/api/me/wallet').expect(401);
  });

  it('rejects invalid category query param with 422', async () => {
    await client.get('/api/me/wallet?category=invalid_cat').expect(422);
  });

  it('returns all wallet documents for user sorted newest first', async () => {
    const res = await client.get('/api/me/wallet').expect(200);
    expect(res.body.documents).toBeDefined();
    expect(res.body.documents.length).toBeGreaterThanOrEqual(5);

    // Verify sort order by issuedAtMs DESC
    const dates = res.body.documents.map((d: { issuedAtMs: number }) => d.issuedAtMs);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });

  it('filters by category correctly', async () => {
    const categories = ['vaccinations', 'prescriptions', 'exams', 'kepa_certificates'] as const;
    for (const cat of categories) {
      const res = await client.get(`/api/me/wallet?category=${cat}`).expect(200);
      expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
      expect(res.body.documents.every((d: { category: string }) => d.category === cat)).toBe(true);
    }
  });
});

describe('GET /api/me/wallet/:id', () => {
  it('requires authentication (401)', async () => {
    await request(baseUrl).get('/api/me/wallet/wd-1').expect(401);
  });

  it('returns 404 for non-existent document id', async () => {
    const res = await client.get('/api/me/wallet/wd-non-existent-9999').expect(404);
    expect(res.body).toMatchObject({ message: 'Document not found.' });
  });

  it('returns 404 when requesting a document that belongs to another user', async () => {
    // Client has synced documents; outsider should not be able to view them
    const all = await client.get('/api/me/wallet').expect(200);
    const clientDoc = all.body.documents[0];
    expect(clientDoc).toBeDefined();

    await outsider.get(`/api/me/wallet/${clientDoc.id}`).expect(404);
  });

  it('returns full document details including issuer, verification status, docType, dataUrl, and digital signature metadata', async () => {
    const all = await client.get('/api/me/wallet').expect(200);
    const targetDoc = all.body.documents[0];

    const res = await client.get(`/api/me/wallet/${targetDoc.id}`).expect(200);
    const doc = res.body;

    expect(doc.id).toBe(targetDoc.id);
    expect(doc.userId).toBe('u-client');
    expect(doc.title).toBeTruthy();
    expect(doc.issuer).toBeTruthy();
    expect(doc.verified).toBe(true);
    expect(doc.verificationStatus).toBe('verified');
    expect(['pdf', 'image']).toContain(doc.docType);
    expect(doc.dataUrl).toBeTruthy();
    expect(doc.issuedAtMs).toBeTypeOf('number');

    // Verify digital signature metadata structure
    expect(doc.signatureMetadata).toBeTruthy();
    expect(doc.signatureMetadata).toMatchObject({
      signedBy: expect.any(String),
      algorithm: 'SHA256withRSA',
      certificateSerial: expect.any(String),
      timestampMs: expect.any(Number),
      valid: true,
    });
    expect(doc.digitalSignature).toEqual(doc.signatureMetadata);
  });
});

describe('POST /api/me/wallet/upload', () => {
  it('requires authentication (401)', async () => {
    await request(baseUrl).post('/api/me/wallet/upload').send({ title: 'doc' }).expect(401);
  });

  it('validates category against allowed list (422)', async () => {
    const res = await client
      .post('/api/me/wallet/upload')
      .send({
        title: 'My Report',
        category: 'finance',
        issuer: 'Bank',
      })
      .expect(422);
    expect(res.body).toMatchObject({ message: 'Invalid or missing wallet category.' });
  });

  it('validates missing title (422)', async () => {
    const res = await client
      .post('/api/me/wallet/upload')
      .send({
        title: '   ',
        category: 'exams',
      })
      .expect(422);
    expect(res.body).toMatchObject({ message: 'Title is required.' });
  });

  it('validates invalid docType (422)', async () => {
    const res = await client
      .post('/api/me/wallet/upload')
      .send({
        title: 'My Report',
        category: 'exams',
        docType: 'msword',
      })
      .expect(422);
    expect(res.body).toMatchObject({ message: 'docType must be pdf or image.' });
  });

  it('successfully uploads verified document and returns 201 with created document', async () => {
    const payload = {
      title: 'Αιματολογικός Έλεγχος Βιοϊατρική',
      category: 'exams',
      issuer: 'Βιοϊατρική Αμπελοκήπων',
      issuedAtMs: Date.now() - 3600000,
      expiresAtMs: null,
      docType: 'pdf',
      dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCg==',
    };

    const res = await client.post('/api/me/wallet/upload').send(payload).expect(201);
    const created = res.body;

    expect(created.id).toMatch(/^wd-/);
    expect(created.userId).toBe('u-client');
    expect(created.title).toBe(payload.title);
    expect(created.category).toBe('exams');
    expect(created.issuer).toBe(payload.issuer);
    expect(created.issuedAtMs).toBe(payload.issuedAtMs);
    expect(created.expiresAtMs).toBeNull();
    expect(created.docType).toBe('pdf');
    expect(created.dataUrl).toBe(payload.dataUrl);
    expect(created.verified).toBe(true);
    expect(created.verificationStatus).toBe('verified');
    expect(created.signatureMetadata).toMatchObject({
      signedBy: payload.issuer,
      algorithm: 'SHA256withRSA',
      valid: true,
    });

    // Verify it is retrievable via GET /api/me/wallet/:id
    const retrieved = await client.get(`/api/me/wallet/${created.id}`).expect(200);
    expect(retrieved.body.id).toBe(created.id);
    expect(retrieved.body.title).toBe(payload.title);

    // Clean up uploaded document
    await client.delete(`/api/me/wallet/${created.id}`).expect(200);
  });
});

describe('DELETE /api/me/wallet/:id', () => {
  it('requires authentication (401)', async () => {
    await request(baseUrl).delete('/api/me/wallet/wd-1').expect(401);
  });

  it('returns 404 when deleting a non-existent document', async () => {
    const res = await client.delete('/api/me/wallet/wd-does-not-exist').expect(404);
    expect(res.body).toMatchObject({ message: 'Document not found.' });
  });

  it('returns 404 when deleting another user document', async () => {
    // Upload a doc for client
    const res = await client
      .post('/api/me/wallet/upload')
      .send({
        title: 'Client Private Doc',
        category: 'prescriptions',
      })
      .expect(201);
    const docId = res.body.id;

    // Outsider tries to delete client's doc
    await outsider.delete(`/api/me/wallet/${docId}`).expect(404);

    // Doc should still exist for client
    await client.get(`/api/me/wallet/${docId}`).expect(200);

    // Clean up
    await client.delete(`/api/me/wallet/${docId}`).expect(200);
  });

  it('allows citizen to remove an uploaded document from their wallet', async () => {
    const res = await client
      .post('/api/me/wallet/upload')
      .send({
        title: 'Document to delete',
        category: 'vaccinations',
        docType: 'image',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      })
      .expect(201);
    const docId = res.body.id;

    // Verify it exists
    await client.get(`/api/me/wallet/${docId}`).expect(200);

    // Delete it
    const deleteRes = await client.delete(`/api/me/wallet/${docId}`).expect(200);
    expect(deleteRes.body).toEqual({ ok: true });

    // Verify it is gone
    await client.get(`/api/me/wallet/${docId}`).expect(404);
  });
});
