import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query, queryOne, Row } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import { computeAuditChainHash, logAuditEvent } from '../src/audit';
import { loadConsents, historyAccessFor, ConsentRecord } from '../src/consents';

let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let nurse: request.Agent;
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
  nurse = await login('elena@example.com');
  admin = await login('admin@example.com');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('Single audit event ingestion (POST /api/audit)', () => {
  it('requires authentication', async () => {
    await request(baseUrl)
      .post('/api/audit')
      .send({ action: 'test.action', atMs: Date.now() })
      .expect(401);
  });

  it('ingests a valid single event authored by session user and returns ok + id', async () => {
    const atMs = Date.now();
    const res = await client
      .post('/api/audit')
      .send({
        actorId: 'u-client',
        action: 'vitals.read',
        resourceType: 'vital-reading',
        resourceId: 'vit-123',
        atMs,
        meta: { source: 'mobile-app' },
      })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, id: expect.any(String) });

    const row = await queryOne<Row>(`SELECT * FROM audit_events WHERE id = $1`, [res.body.id]);
    expect(row).toBeDefined();
    expect(row?.actor_id).toBe('u-client');
    expect(row?.action).toBe('vitals.read');
    expect(row?.resource_type).toBe('vital-reading');
    expect(row?.resource_id).toBe('vit-123');
    expect(Number(row?.at_ms)).toBe(atMs);
    expect(row?.meta).toEqual({ source: 'mobile-app' });
  });

  it('defaults actorId to the session user when omitted', async () => {
    const atMs = Date.now();
    const res = await client
      .post('/api/audit')
      .send({
        action: 'medications.view',
        atMs,
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    const row = await queryOne<Row>(`SELECT * FROM audit_events WHERE id = $1`, [res.body.id]);
    expect(row?.actor_id).toBe('u-client');
  });

  it('rejects an event where actorId does not match the non-admin session user', async () => {
    const res = await client
      .post('/api/audit')
      .send({
        actorId: 'u-nurse',
        action: 'vitals.read',
        atMs: Date.now(),
      })
      .expect(403);

    expect(res.body.message).toContain('authored by the session user');
  });

  it('allows an admin to ingest events authored by another actor', async () => {
    const res = await admin
      .post('/api/audit')
      .send({
        actorId: 'u-nurse',
        action: 'admin.override',
        atMs: Date.now(),
      })
      .expect(200);

    expect(res.body.ok).toBe(true);
    const row = await queryOne<Row>(`SELECT * FROM audit_events WHERE id = $1`, [res.body.id]);
    expect(row?.actor_id).toBe('u-nurse');
  });

  it('validates action is present and non-empty', async () => {
    await client
      .post('/api/audit')
      .send({ atMs: Date.now() })
      .expect(422);

    await client
      .post('/api/audit')
      .send({ action: '', atMs: Date.now() })
      .expect(422);

    await client
      .post('/api/audit')
      .send({ action: '   ', atMs: Date.now() })
      .expect(422);
  });

  it('validates atMs is a valid positive number', async () => {
    await client
      .post('/api/audit')
      .send({ action: 'vitals.view' })
      .expect(422);

    await client
      .post('/api/audit')
      .send({ action: 'vitals.view', atMs: 'not-a-number' })
      .expect(422);

    await client
      .post('/api/audit')
      .send({ action: 'vitals.view', atMs: -100 })
      .expect(422);

    await client
      .post('/api/audit')
      .send({ action: 'vitals.view', atMs: NaN })
      .expect(422);
  });

  it('rejects non-object body payloads', async () => {
    await client.post('/api/audit').send([]).expect(422);
  });

  it('supports server-side logging via exported logAuditEvent helper', async () => {
    const eventId = await logAuditEvent(
      'u-system',
      'system.maintenance',
      'database',
      'db-1',
      { status: 'healthy' }
    );
    expect(eventId).toBeDefined();

    const row = await queryOne<Row>(`SELECT * FROM audit_events WHERE id = $1`, [eventId]);
    expect(row).toBeDefined();
    expect(row?.actor_id).toBe('u-system');
    expect(row?.action).toBe('system.maintenance');
    expect(row?.resource_type).toBe('database');
    expect(row?.resource_id).toBe('db-1');
    expect(row?.meta).toEqual({ status: 'healthy' });
  });
});

describe('Batch audit event ingestion (POST /api/audit/batch)', () => {
  it('requires authentication', async () => {
    await request(baseUrl)
      .post('/api/audit/batch')
      .send([{ action: 'test', atMs: Date.now() }])
      .expect(401);
  });

  it('accepts a batch of events authored by session user', async () => {
    const stamp = Date.now();
    const id1 = `au-batch-1-${stamp}`;
    const id2 = `au-batch-2-${stamp}`;
    const res = await client
      .post('/api/audit/batch')
      .send([
        { id: id1, actorId: 'u-client', action: 'batch.action.1', resourceType: 't1', resourceId: 'r1', atMs: stamp },
        { id: id2, actorId: 'u-client', action: 'batch.action.2', resourceType: 't2', resourceId: 'r2', atMs: stamp },
      ])
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, stored: 2 });

    const rows = await query<Row>(`SELECT * FROM audit_events WHERE id IN ($1, $2)`, [id1, id2]);
    expect(rows).toHaveLength(2);
  });

  it('ignores duplicate IDs idempotently', async () => {
    const stamp = Date.now();
    const id = `au-batch-dup-${stamp}`;
    await client
      .post('/api/audit/batch')
      .send([{ id, actorId: 'u-client', action: 'batch.dup', atMs: stamp }])
      .expect(200);

    const dupRes = await client
      .post('/api/audit/batch')
      .send([{ id, actorId: 'u-client', action: 'batch.dup', atMs: stamp }])
      .expect(200);

    expect(dupRes.body.ok).toBe(true);
  });

  it('rejects batch if any event is authored by another user (non-admin)', async () => {
    const stamp = Date.now();
    await client
      .post('/api/audit/batch')
      .send([
        { actorId: 'u-client', action: 'ok.action', atMs: stamp },
        { actorId: 'u-nurse', action: 'bad.action', atMs: stamp },
      ])
      .expect(403);
  });

  it('allows admin to submit batch with any actorId', async () => {
    const stamp = Date.now();
    const id = `au-admin-batch-${stamp}`;
    const res = await admin
      .post('/api/audit/batch')
      .send([{ id, actorId: 'u-nurse', action: 'admin.batch', atMs: stamp }])
      .expect(200);

    expect(res.body.ok).toBe(true);
  });

  it('rejects non-array batch payloads and batches larger than 100', async () => {
    await client.post('/api/audit/batch').send({ not: 'an-array' }).expect(422);

    const oversized = Array.from({ length: 101 }, (_, i) => ({
      actorId: 'u-client',
      action: `action.${i}`,
      atMs: Date.now(),
    }));
    await client.post('/api/audit/batch').send(oversized).expect(422);
  });
});

describe('Tamper-evident chain hash generation', () => {
  it('pure helper computeAuditChainHash correctly chains hash over events', () => {
    expect(computeAuditChainHash([])).toBe('init');

    const ev1 = { id: 'e1', action: 'login', resource_type: 'user', resource_id: 'u1', at_ms: 1000 };
    const expectedHash1 = Buffer.from('init|e1|login|user|u1|1000').toString('base64');
    expect(computeAuditChainHash([ev1])).toBe(expectedHash1);

    const ev2 = { id: 'e2', action: 'logout', resource_type: 'user', resource_id: 'u1', at_ms: 2000 };
    const expectedHash2 = Buffer.from(`${expectedHash1}|e2|logout|user|u1|2000`).toString('base64');
    expect(computeAuditChainHash([ev1, ev2])).toBe(expectedHash2);

    // Also supports camelCase fields
    const evCamel = { id: 'e1', action: 'login', resourceType: 'user', resourceId: 'u1', atMs: 1000 };
    expect(computeAuditChainHash([evCamel])).toBe(expectedHash1);
  });

  it('chain hash changes when an event is added (tamper-evidence)', async () => {
    const res1 = await admin.get('/api/audit/all').expect(200);
    const hash1 = res1.body.chainHash;
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);

    // Ingest a new event
    await admin
      .post('/api/audit')
      .send({
        actorId: 'u-admin',
        action: 'admin.hash.test',
        resourceType: 'system',
        resourceId: 'test-node',
        atMs: Date.now(),
      })
      .expect(200);

    const res2 = await admin.get('/api/audit/all').expect(200);
    const hash2 = res2.body.chainHash;
    expect(hash2).not.toBe(hash1);
  });

  it('returns items, total, and chainHash in GET /api/audit/all', async () => {
    const res = await admin.get('/api/audit/all').expect(200);
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      chainHash: expect.any(String),
    });
    expect(res.body.items.length).toBe(res.body.total);
  });
});

describe('Admin access control', () => {
  it('blocks unauthenticated access to /api/audit/all', async () => {
    await request(baseUrl).get('/api/audit/all').expect(401);
  });

  it('blocks non-admin access to /api/audit/all', async () => {
    await client.get('/api/audit/all').expect(403);
    await nurse.get('/api/audit/all').expect(403);
  });

  it('allows admin access to /api/audit/all', async () => {
    await admin.get('/api/audit/all').expect(200);
  });

  it('blocks unauthenticated access to /api/admin/consents', async () => {
    await request(baseUrl).get('/api/admin/consents').expect(401);
  });

  it('blocks non-admin access to /api/admin/consents', async () => {
    await client.get('/api/admin/consents').expect(403);
    await nurse.get('/api/admin/consents').expect(403);
  });

  it('allows admin access to /api/admin/consents', async () => {
    const res = await admin.get('/api/admin/consents').expect(200);
    expect(res.body).toMatchObject({ items: expect.any(Array) });
  });
});

describe('Reminder preferences PATCH (merging updates)', () => {
  it('requires authentication', async () => {
    await request(baseUrl).patch('/api/me/reminders/preferences').send({ quietHours: true }).expect(401);
  });

  it('rejects non-object payload with 422', async () => {
    await client.patch('/api/me/reminders/preferences').send([]).expect(422);
  });

  it('merges partial updates into existing preferences', async () => {
    // First set base preferences via PUT
    await client
      .put('/api/me/reminders/preferences')
      .send({ timezone: 'Europe/Athens', pushEnabled: true, quietHours: false })
      .expect(200);

    // Now send PATCH with partial update
    const patchRes = await client
      .patch('/api/me/reminders/preferences')
      .send({ quietHours: true, newSetting: 'test' })
      .expect(200);

    expect(patchRes.body).toMatchObject({
      timezone: 'Europe/Athens',
      pushEnabled: true,
      quietHours: true,
      newSetting: 'test',
    });

    // Verify GET reflects the merged result
    const getRes = await client.get('/api/me/reminders/preferences').expect(200);
    expect(getRes.body).toMatchObject({
      timezone: 'Europe/Athens',
      pushEnabled: true,
      quietHours: true,
      newSetting: 'test',
    });
  });
});

describe('Consents multi-purpose support (loadConsents & historyAccessFor)', () => {
  it('loadConsents populates all 4 purposes', async () => {
    const state = await loadConsents('u-client');
    expect(state.userId).toBe('u-client');
    expect(state.consents).toHaveLength(4);

    const purposes = state.consents.map((c) => c.purpose);
    expect(purposes).toContain('family_sharing');
    expect(purposes).toContain('sms_reminders');
    expect(purposes).toContain('bluetooth');
    expect(purposes).toContain('data_export');
  });

  it('historyAccessFor handles all 4 purposes appropriately', () => {
    const record = (purpose: ConsentRecord['purpose'], granted: boolean): ConsentRecord => ({
      purpose,
      granted,
      documentVersion: 'v1.0',
      updatedAtMs: 1000,
      updatedBy: 'u-client',
    });

    // Owner access is always 'owner'
    expect(historyAccessFor('u-client', 'u-client', [], 'family_sharing')).toBe('owner');
    expect(historyAccessFor('u-client', 'u-client', [], 'sms_reminders')).toBe('owner');
    expect(historyAccessFor('u-client', 'u-client', [], 'bluetooth')).toBe('owner');
    expect(historyAccessFor('u-client', 'u-client', [], 'data_export')).toBe('owner');

    // family_sharing purpose: requires family_sharing grant
    expect(historyAccessFor('u-nurse', 'u-client', [record('family_sharing', true)], 'family_sharing')).toBe('family');
    expect(historyAccessFor('u-nurse', 'u-client', [record('family_sharing', false)], 'family_sharing')).toBe('denied');

    // data_export purpose: requires both family_sharing and data_export
    const both = [record('family_sharing', true), record('data_export', true)];
    expect(historyAccessFor('u-nurse', 'u-client', both, 'data_export')).toBe('family');
    expect(historyAccessFor('u-nurse', 'u-client', [record('data_export', true)], 'data_export')).toBe('denied');
    expect(historyAccessFor('u-nurse', 'u-client', [record('family_sharing', true)], 'data_export')).toBe('denied');

    // sms_reminders and bluetooth are personal only, denied for non-owners
    expect(historyAccessFor('u-nurse', 'u-client', [record('sms_reminders', true)], 'sms_reminders')).toBe('denied');
    expect(historyAccessFor('u-nurse', 'u-client', [record('bluetooth', true)], 'bluetooth')).toBe('denied');
  });
});
