import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import { vitalsAlert, computeVitalStats, VITAL_TYPES } from '../src/vitals';

/**
 * Pure boundary tests for the server-side reference ranges (vitals.ts) — the
 * mirror of the frontend vitals.store.ts ranges that drives the vitals.alert
 * Web Push. Bounds are INCLUSIVE: exactly on the min/max is in range, one
 * step outside flags.
 */
describe('vitalsAlert reference ranges (boundaries)', () => {
  it.each<[string, number, number | null, boolean]>([
    // heartRate: 60–100 bpm
    ['heartRate', 60, null, false],
    ['heartRate', 59, null, true],
    ['heartRate', 100, null, false],
    ['heartRate', 101, null, true],
    // glucose: 70–180 mg/dL
    ['glucose', 70, null, false],
    ['glucose', 69, null, true],
    ['glucose', 180, null, false],
    ['glucose', 181, null, true],
    // spo2: ≥95 %, no upper bound
    ['spo2', 95, null, false],
    ['spo2', 94, null, true],
    ['spo2', 100, null, false],
    ['spo2', 101, null, false],
    // temperature: 36–37.8 °C
    ['temperature', 36, null, false],
    ['temperature', 35.9, null, true],
    ['temperature', 37.8, null, false],
    ['temperature', 37.9, null, true],
    // bloodPressure systolic 90–140, diastolic 60–90 (both must be in range)
    ['bloodPressure', 90, 60, false],
    ['bloodPressure', 89, 60, true],
    ['bloodPressure', 141, 60, true],
    ['bloodPressure', 120, 60, false],
    ['bloodPressure', 120, 59, true],
    ['bloodPressure', 120, 91, true],
    ['bloodPressure', 120, null, false], // no diastolic → systolic only
    ['bloodPressure', 89, 59, true], // both out → still a single alert
    // weight: unbounded both sides → never flags
    ['weight', 5, null, false],
    ['weight', 500, null, false],
    // unknown types are ignored
    ['vitalSignUnknown', 100, null, false],
  ])('type=%s value=%s value2=%s → alert=%s', (type, value, value2, expected) => {
    const result = vitalsAlert(type, value, value2);
    if (expected) {
      expect(result).not.toBeNull();
      expect(result?.label).toBeTruthy();
    } else {
      expect(result).toBeNull();
    }
  });
});

describe('vitalsAlert alert copy', () => {
  it('returns the label and body used for the push payload', () => {
    expect(vitalsAlert('heartRate', 121, null)).toEqual({
      label: 'Heart rate',
      body: 'Latest reading is outside the expected range — check the trends view.',
    });
  });

  it('labels diastolic flags as blood pressure', () => {
    expect(vitalsAlert('bloodPressure', 120, 95)?.label).toBe('Blood pressure');
    expect(vitalsAlert('bloodPressure', 165, 100)?.label).toBe('Blood pressure');
  });

  it('keeps the SpO₂ label with its unicode subscript', () => {
    expect(vitalsAlert('spo2', 90, null)?.label).toBe('SpO₂');
  });
});

describe('computeVitalStats (pure logic)', () => {
  it('computes stats for all vital types including 30-day window and alert count', () => {
    const now = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const rows = [
      // heartRate readings
      { type: 'heartRate', value: 70, value2: null, measured_at_ms: now - 5 * day }, // in 30d
      { type: 'heartRate', value: 80, value2: null, measured_at_ms: now - 15 * day }, // in 30d
      { type: 'heartRate', value: 120, value2: null, measured_at_ms: now - 45 * day }, // out of 30d, out of range (>100)
      // glucose readings
      { type: 'glucose', value: 100, value2: null, measured_at_ms: now - 2 * day },
      { type: 'glucose', value: 60, value2: null, measured_at_ms: now - 10 * day }, // out of range (<70)
    ];

    const stats = computeVitalStats(rows, 30, now);
    expect(stats.heartRate.latest).toBe(70);
    expect(stats.heartRate.count).toBe(3);
    expect(stats.heartRate.min).toBe(70);
    expect(stats.heartRate.max).toBe(120);
    expect(stats.heartRate.average).toBe(75); // (70 + 80) / 2
    expect(stats.heartRate.outOfRangeAlerts).toBe(1);

    expect(stats.glucose.latest).toBe(100);
    expect(stats.glucose.count).toBe(2);
    expect(stats.glucose.min).toBe(60);
    expect(stats.glucose.max).toBe(100);
    expect(stats.glucose.average).toBe(80);
    expect(stats.glucose.outOfRangeAlerts).toBe(1);

    // Empty type
    expect(stats.temperature.count).toBe(0);
    expect(stats.temperature.latest).toBeNull();
    expect(stats.temperature.average).toBeNull();
    expect(stats.temperature.outOfRangeAlerts).toBe(0);
  });
});

describe('vitals API endpoints', () => {
  let baseUrl: string;
  let server: ReturnType<typeof createServer>;
  let client: request.Agent;
  let nurse: request.Agent;

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
    nurse = await login('nurse@example.com');
  });

  afterAll(async () => {
    // Restore family_sharing consent for u-client
    await query(
      `UPDATE user_consents SET consents = $1 WHERE user_id = 'u-client'`,
      [
        JSON.stringify([
          { purpose: 'family_sharing', granted: true, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
          { purpose: 'sms_reminders', granted: false, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
          { purpose: 'bluetooth', granted: false, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
          { purpose: 'data_export', granted: true, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
        ]),
      ]
    );
    if (server) {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
    await pool.end();
  });

  describe('GET /api/vitals/:userId consent gating', () => {
    it('allows owner to read their own vitals regardless of consent', async () => {
      // Set family_sharing to false
      await query(
        `UPDATE user_consents SET consents = $1 WHERE user_id = 'u-client'`,
        [
          JSON.stringify([
            { purpose: 'family_sharing', granted: false, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
          ]),
        ]
      );

      const res = await client.get('/api/vitals/u-client').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns 403 when another user requests vitals without family_sharing consent', async () => {
      // family_sharing is false for u-client
      const res = await nurse.get('/api/vitals/u-client').expect(403);
      expect(res.body.message).toBe('This person has not granted family-sharing consent.');
    });

    it('returns 200 when another user requests vitals and family_sharing consent is granted', async () => {
      // Grant family_sharing
      await query(
        `UPDATE user_consents SET consents = $1 WHERE user_id = 'u-client'`,
        [
          JSON.stringify([
            { purpose: 'family_sharing', granted: true, documentVersion: 'v1.0', updatedAtMs: Date.now(), updatedBy: 'u-client' },
          ]),
        ]
      );

      const res = await nurse.get('/api/vitals/u-client').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('filters vitals by source (manual or bluetooth only)', async () => {
      // Insert a vital with another source
      const testId = `vt-test-other-${Date.now()}`;
      await query(
        `INSERT INTO vitals (id, user_id, type, value, measured_at_ms, source)
         VALUES ($1, 'u-client', 'heartRate', 72, $2, 'external_import')`,
        [testId, Date.now()]
      );

      const res = await client.get('/api/vitals/u-client').expect(200);
      const sources = res.body.map((v: { source: string }) => v.source);
      expect(sources.every((s: string) => s === 'manual' || s === 'bluetooth')).toBe(true);
      expect(res.body.some((v: { id: string }) => v.id === testId)).toBe(false);

      await query(`DELETE FROM vitals WHERE id = $1`, [testId]);
    });
  });

  describe('GET /api/vitals/stats', () => {
    it('returns statistics for all vital types', async () => {
      const res = await client.get('/api/vitals/stats').expect(200);
      for (const type of VITAL_TYPES) {
        expect(res.body).toHaveProperty(type);
        const s = res.body[type];
        expect(s).toHaveProperty('latest');
        expect(s).toHaveProperty('min');
        expect(s).toHaveProperty('max');
        expect(s).toHaveProperty('average');
        expect(s).toHaveProperty('count');
        expect(s).toHaveProperty('outOfRangeAlerts');
      }
    });

    it('computes accurate stats including out-of-range count and 30-day average', async () => {
      const nowMs = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const testIds = [`vt-s1-${nowMs}`, `vt-s2-${nowMs}`, `vt-s3-${nowMs}`];

      // Clean existing glucose for u-client to test exact values
      await query(`DELETE FROM vitals WHERE user_id = 'u-client' AND type = 'glucose'`);

      // 1. in last 30d, in range (glucose 100)
      await query(
        `INSERT INTO vitals (id, user_id, type, value, measured_at_ms, source)
         VALUES ($1, 'u-client', 'glucose', 100, $2, 'manual')`,
        [testIds[0], nowMs - 5 * dayMs]
      );
      // 2. in last 30d, out of range (glucose 200 > 180)
      await query(
        `INSERT INTO vitals (id, user_id, type, value, measured_at_ms, source)
         VALUES ($1, 'u-client', 'glucose', 200, $2, 'manual')`,
        [testIds[1], nowMs - 10 * dayMs]
      );
      // 3. older than 30d, in range (glucose 80)
      await query(
        `INSERT INTO vitals (id, user_id, type, value, measured_at_ms, source)
         VALUES ($1, 'u-client', 'glucose', 80, $2, 'manual')`,
        [testIds[2], nowMs - 40 * dayMs]
      );

      const res = await client.get('/api/vitals/stats').expect(200);
      const g = res.body.glucose;
      expect(g.count).toBe(3);
      expect(g.latest).toBe(100); // 5 days ago is newest
      expect(g.min).toBe(80);
      expect(g.max).toBe(200);
      expect(g.average).toBe(150); // (100 + 200) / 2 = 150 (3rd reading excluded from 30d avg)
      expect(g.outOfRangeAlerts).toBe(1);

      await query(`DELETE FROM vitals WHERE id = ANY($1)`, [testIds]);
    });
  });

  describe('DELETE /api/vitals/:id', () => {
    it('allows a user to delete their own vital measurement', async () => {
      // Create a vital reading
      const createRes = await client
        .post('/api/vitals/me')
        .send({ type: 'weight', value: 68.5, source: 'manual' })
        .expect(201);
      const vitalId = createRes.body.id;
      expect(vitalId).toBeDefined();

      // Another user (nurse) cannot delete it
      await nurse.delete(`/api/vitals/${vitalId}`).expect(404);

      // Owner can delete it
      const deleteRes = await client.delete(`/api/vitals/${vitalId}`).expect(200);
      expect(deleteRes.body).toEqual({ ok: true, id: vitalId });

      // Deleting again returns 404
      await client.delete(`/api/vitals/${vitalId}`).expect(404);

      // Confirm it's gone from vitals
      const listRes = await client.get('/api/vitals/me').expect(200);
      expect(listRes.body.some((v: { id: string }) => v.id === vitalId)).toBe(false);
    });

    it('returns 404 when deleting a non-existent vital', async () => {
      await client.delete('/api/vitals/vt-non-existent').expect(404);
    });
  });
});