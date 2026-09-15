import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import { hashPassword } from '../src/auth';

/**
 * Clinical Documentation & Shared Care Plans test suite.
 * Tests:
 * 1. Role-based clinical log filtering (clients, providers, super admin)
 * 2. Signing and retrieving clinical logs with signature data URL, author name, observations, vitals, rehab
 * 3. Visit detail retrieval with check-in and check-out GPS data and timestamps
 * 4. Multi-disciplinary care plan collaboration (goals CRUD/status updates, multi-disciplinary notes)
 */

let baseUrl: string;
let server: ReturnType<typeof createServer>;

let clientAgent: request.Agent;
let otherClientAgent: request.Agent;
let nurseAgent: request.Agent;
let physioAgent: request.Agent;
let doctorAgent: request.Agent;
let adminAgent: request.Agent;

async function login(email: string, password = 'demo1234'): Promise<request.Agent> {
  const agent = request.agent(baseUrl);
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return agent;
}

beforeAll(async () => {
  await bootstrapDb();
  await seed();

  // Ensure an additional client and a doctor exist for role-based privacy and multi-disciplinary tests
  const pwHash = await hashPassword('demo1234');
  await query(
    `INSERT INTO user_accounts (id, display_name, email, password_hash, roles, created_at_ms)
     VALUES ('u-other-client', 'George Dimitriou', 'george@example.com', $1, '{client}', $2)
     ON CONFLICT (id) DO NOTHING`,
    [pwHash, Date.now()]
  );

  await query(
    `INSERT INTO user_accounts (id, display_name, email, password_hash, roles, created_at_ms)
     VALUES ('u-doctor', 'Dr. Konstantinos Alexiou', 'doctor@example.com', $1, '{doctor}', $2)
     ON CONFLICT (id) DO NOTHING`,
    [pwHash, Date.now()]
  );

  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  clientAgent = await login('maria@example.com');
  otherClientAgent = await login('george@example.com');
  nurseAgent = await login('elena@example.com');
  physioAgent = await login('anna@example.com');
  doctorAgent = await login('doctor@example.com');
  adminAgent = await login('admin@example.com');
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('Clinical Documentation & Shared Care Plans', () => {
  describe('1. Role-based clinical log filtering', () => {
    const logId1 = 'cl-test-maria-nurse';
    const logId2 = 'cl-test-george-nurse';
    const logId3 = 'cl-test-george-doctor';

    beforeAll(async () => {
      // Clean up previous test entries if any
      await query(`DELETE FROM clinical_log WHERE id IN ($1, $2, $3) OR observations LIKE '%discomfort in left knee%'`, [logId1, logId2, logId3]);
      await query(`DELETE FROM visits WHERE id IN ('visit-test-george-1', 'visit-test-george-2', 'visit-test-maria-anna')`);

      // visit-1 is already seeded for client u-client (Maria) with provider u-nurse (Elena)
      // Create visit-test-george-1 for client u-other-client (George) with provider u-nurse (Elena)
      await query(
        `INSERT INTO visits (id, shift_id, booking_id, provider_id, client_id, client_name, provider_name, act, scheduled_at_ms, status, check_in, check_out)
         VALUES ('visit-test-george-1', 's-geo-1', 'b-geo-1', 'u-nurse', 'u-other-client', 'George Dimitriou', 'Elena Papadaki', 'Nursing care', $1, 'scheduled', NULL, NULL)`,
        [Date.now()]
      );

      // Create visit-test-george-2 for client u-other-client (George) with provider u-doctor (Dr. Konstantinos)
      await query(
        `INSERT INTO visits (id, shift_id, booking_id, provider_id, client_id, client_name, provider_name, act, scheduled_at_ms, status, check_in, check_out)
         VALUES ('visit-test-george-2', 's-geo-2', 'b-geo-2', 'u-doctor', 'u-other-client', 'George Dimitriou', 'Dr. Konstantinos Alexiou', 'Consultation', $1, 'scheduled', NULL, NULL)`,
        [Date.now()]
      );

      // Log 1: visit-1 (Maria, client) authored by nurse Elena
      await query(
        `INSERT INTO clinical_log (id, visit_id, author_id, author_name, specialty, observations, vitals, rehab, signature_data_url, signed_at_ms)
         VALUES ($1, 'visit-1', 'u-nurse', 'Elena Papadaki', 'nurse', 'Maria observation: wound clean.', $2, NULL, 'data:image/png;base64,sig1', $3)`,
        [logId1, JSON.stringify({ bloodPressure: '120/80', pulse: 72 }), Date.now() - 3600000]
      );

      // Log 2: visit-test-george-1 (George, client) authored by nurse Elena
      await query(
        `INSERT INTO clinical_log (id, visit_id, author_id, author_name, specialty, observations, vitals, rehab, signature_data_url, signed_at_ms)
         VALUES ($1, 'visit-test-george-1', 'u-nurse', 'Elena Papadaki', 'nurse', 'George observation: medication administered.', NULL, NULL, 'data:image/png;base64,sig2', $2)`,
        [logId2, Date.now() - 1800000]
      );

      // Log 3: visit-test-george-2 (George, client) authored by doctor Konstantinos
      await query(
        `INSERT INTO clinical_log (id, visit_id, author_id, author_name, specialty, observations, vitals, rehab, signature_data_url, signed_at_ms)
         VALUES ($1, 'visit-test-george-2', 'u-doctor', 'Dr. Konstantinos Alexiou', 'doctor', 'George observation: cardiac exam stable.', NULL, NULL, 'data:image/png;base64,sig3', $2)`,
        [logId3, Date.now() - 900000]
      );
    });

    it('client only sees clinical logs for visits where they are the client', async () => {
      // Maria (u-client) should see log1, but NOT log2 or log3
      const mariaRes = await clientAgent.get('/api/clinical-log').expect(200);
      const mariaLogIds = mariaRes.body.map((l: { id: string }) => l.id);
      expect(mariaLogIds).toContain(logId1);
      expect(mariaLogIds).not.toContain(logId2);
      expect(mariaLogIds).not.toContain(logId3);

      // George (u-other-client) should see log2 and log3, but NOT log1
      const georgeRes = await otherClientAgent.get('/api/clinical-log').expect(200);
      const georgeLogIds = georgeRes.body.map((l: { id: string }) => l.id);
      expect(georgeLogIds).toContain(logId2);
      expect(georgeLogIds).toContain(logId3);
      expect(georgeLogIds).not.toContain(logId1);
    });

    it('providers see logs where they are the author or for visits with active clients', async () => {
      // Elena (nurse) is author of log1 and log2, and George is her active client (visit-test-george-1)
      // Since George is Elena's active client, Elena also sees log3 (by doctor for George)
      const elenaRes = await nurseAgent.get('/api/clinical-log').expect(200);
      const elenaLogIds = elenaRes.body.map((l: { id: string }) => l.id);
      expect(elenaLogIds).toContain(logId1); // author
      expect(elenaLogIds).toContain(logId2); // author
      expect(elenaLogIds).toContain(logId3); // active client George

      // Anna (physio) has no visits/bookings with Maria or George and is not author of any of these
      const annaRes = await physioAgent.get('/api/clinical-log').expect(200);
      const annaLogIds = annaRes.body.map((l: { id: string }) => l.id);
      expect(annaLogIds).not.toContain(logId1);
      expect(annaLogIds).not.toContain(logId2);
      expect(annaLogIds).not.toContain(logId3);

      // Now give Anna an active visit with Maria
      await query(
        `INSERT INTO visits (id, shift_id, booking_id, provider_id, client_id, client_name, provider_name, act, scheduled_at_ms, status, check_in, check_out)
         VALUES ('visit-test-maria-anna', 's-anna-1', 'b-anna-1', 'u-physio', 'u-client', 'Maria Papadopoulou', 'Anna Karakosta', 'Physiotherapy', $1, 'scheduled', NULL, NULL)`,
        [Date.now()]
      );

      // Now Maria is an active client of Anna! Anna should now see log1 (for Maria)
      const annaUpdatedRes = await physioAgent.get('/api/clinical-log').expect(200);
      const annaUpdatedIds = annaUpdatedRes.body.map((l: { id: string }) => l.id);
      expect(annaUpdatedIds).toContain(logId1);
      expect(annaUpdatedIds).not.toContain(logId2); // George is not Anna's client
    });

    it('super admin can see all logs', async () => {
      const adminRes = await adminAgent.get('/api/clinical-log').expect(200);
      const adminLogIds = adminRes.body.map((l: { id: string }) => l.id);
      expect(adminLogIds).toContain(logId1);
      expect(adminLogIds).toContain(logId2);
      expect(adminLogIds).toContain(logId3);
    });
  });

  describe('2. Signing and retrieving clinical logs', () => {
    let createdLogId: string;

    it('creates a clinical log without signature initially', async () => {
      const res = await nurseAgent
        .post('/api/clinical-log')
        .send({
          visitId: 'visit-1',
          observations: 'Patient reports mild discomfort in left knee after exercise.',
          specialty: 'nurse',
          vitals: { bloodPressure: '124/82', heartRate: 72, spo2: 98 },
          rehab: { kneeFlexionDeg: 110, painScale: 3 },
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.visitId).toBe('visit-1');
      expect(res.body.observations).toContain('left knee');
      expect(res.body.vitals).toEqual({ bloodPressure: '124/82', heartRate: 72, spo2: 98 });
      expect(res.body.rehab).toEqual({ kneeFlexionDeg: 110, painScale: 3 });
      expect(res.body.signatureDataUrl).toBeNull();
      expect(res.body.signedAtMs).toBeNull();
      createdLogId = res.body.id;
    });

    it('signs the clinical log with digital signature data URL', async () => {
      const sigDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await nurseAgent
        .post(`/api/clinical-log/${createdLogId}/sign`)
        .send({ signatureDataUrl: sigDataUrl })
        .expect(200);

      expect(res.body.id).toBe(createdLogId);
      expect(res.body.signatureDataUrl).toBe(sigDataUrl);
      expect(res.body.signedAtMs).toBeTypeOf('number');
      expect(res.body.signedAtMs).toBeGreaterThan(0);
    });

    it('rejects signing by unauthorized users and validates input', async () => {
      // Missing signature data URL
      await nurseAgent
        .post(`/api/clinical-log/${createdLogId}/sign`)
        .send({})
        .expect(400);

      // Other client trying to sign
      await otherClientAgent
        .post(`/api/clinical-log/${createdLogId}/sign`)
        .send({ signatureDataUrl: 'data:image/png;base64,fake' })
        .expect(403);
    });

    it('retrieves individual clinical log with all clinical metrics and signature', async () => {
      const res = await nurseAgent.get(`/api/clinical-log/${createdLogId}`).expect(200);

      expect(res.body).toMatchObject({
        id: createdLogId,
        visitId: 'visit-1',
        authorName: 'Elena Papadaki',
        observations: 'Patient reports mild discomfort in left knee after exercise.',
        vitals: { bloodPressure: '124/82', heartRate: 72, spo2: 98 },
        rehab: { kneeFlexionDeg: 110, painScale: 3 },
      });
      expect(res.body.signatureDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(res.body.signedAtMs).toBeTypeOf('number');
    });

    it('enforces access control on individual clinical log retrieval', async () => {
      // Maria (client of visit-1) CAN retrieve it
      await clientAgent.get(`/api/clinical-log/${createdLogId}`).expect(200);

      // Super admin CAN retrieve it
      await adminAgent.get(`/api/clinical-log/${createdLogId}`).expect(200);

      // Other client (George) CANNOT retrieve Maria's log -> 403
      await otherClientAgent.get(`/api/clinical-log/${createdLogId}`).expect(403);

      // Non-existent ID returns 404
      await nurseAgent.get('/api/clinical-log/cl-non-existent-999').expect(404);
    });
  });

  describe('3. Visit detail retrieval', () => {
    it('returns visit details with check-in GPS data and timestamps', async () => {
      await query(
        `UPDATE visits SET status = 'in-progress', check_out = NULL,
         check_in = $1 WHERE id = 'visit-1'`,
        [JSON.stringify({ lat: 37.9838, lng: 23.7275, accuracyM: 12, atMs: Date.now() - 1800000 })]
      );

      const res = await clientAgent.get('/api/visits/visit-1').expect(200);

      expect(res.body).toMatchObject({
        id: 'visit-1',
        providerId: 'u-nurse',
        clientId: 'u-client',
        clientName: 'Maria Papadopoulou',
        providerName: 'Elena Papadaki',
        act: 'Injection',
        status: 'in-progress',
      });
      expect(res.body.checkIn).toMatchObject({
        lat: 37.9838,
        lng: 23.7275,
        accuracyM: 12,
      });
      expect(res.body.checkIn.atMs).toBeTypeOf('number');
      expect(res.body.checkOut).toBeNull();
    });

    it('includes check-out GPS data and timestamp after visit completion', async () => {
      const checkOutPos = {
        lat: 37.9845,
        lng: 23.7281,
        accuracyM: 9,
        atMs: Date.now(),
      };

      // Nurse completes visit
      await nurseAgent
        .post('/api/visits/visit-1/check-out')
        .send({ position: checkOutPos })
        .expect(200);

      // Retrieve visit details
      const res = await nurseAgent.get('/api/visits/visit-1').expect(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.checkIn).toMatchObject({ lat: 37.9838, lng: 23.7275 });
      expect(res.body.checkOut).toMatchObject({
        lat: 37.9845,
        lng: 23.7281,
        accuracyM: 9,
      });
      expect(res.body.checkOut.atMs).toBeTypeOf('number');
    });

    it('enforces access control on visit detail retrieval', async () => {
      // Client Maria CAN view
      await clientAgent.get('/api/visits/visit-1').expect(200);

      // Provider Elena CAN view
      await nurseAgent.get('/api/visits/visit-1').expect(200);

      // Super admin CAN view
      await adminAgent.get('/api/visits/visit-1').expect(200);

      // Unrelated client George CANNOT view visit-1 -> 403
      await otherClientAgent.get('/api/visits/visit-1').expect(403);

      // Non-existent visit -> 404
      await nurseAgent.get('/api/visits/visit-non-existent-999').expect(404);
    });
  });

  describe('4. Multi-disciplinary care plan collaboration', () => {
    it('retrieves single care plan with goals and notes via GET /api/care-plans/:id', async () => {
      const res = await clientAgent.get('/api/care-plans/cp-1').expect(200);

      expect(res.body).toMatchObject({
        id: 'cp-1',
        clientId: 'u-client',
        clientName: 'Maria Papadopoulou',
      });
      expect(Array.isArray(res.body.goals)).toBe(true);
      expect(Array.isArray(res.body.notes)).toBe(true);
      expect(res.body.goals.length).toBeGreaterThanOrEqual(2);
      expect(res.body.notes.length).toBeGreaterThanOrEqual(1);

      // Non-existent plan returns 404
      await clientAgent.get('/api/care-plans/cp-non-existent-999').expect(404);

      // Unrelated client cannot access Maria's care plan
      await otherClientAgent.get('/api/care-plans/cp-1').expect(403);
    });

    it('supports adding goals, updating goal status (open -> in-progress -> done), and deleting goals', async () => {
      // 1. Add new goal
      const addRes = await nurseAgent
        .post('/api/care-plans/cp-1/goals')
        .send({ text: 'Quadriceps strengthening 3x weekly', status: 'open' })
        .expect(200);

      const addedGoal = addRes.body.goals.find((g: { text: string }) => g.text === 'Quadriceps strengthening 3x weekly');
      expect(addedGoal).toBeTruthy();
      expect(addedGoal.status).toBe('open');

      const goalId = addedGoal.id;

      // 2. Update goal status to in-progress
      const inProgressRes = await physioAgent
        .patch(`/api/care-plans/cp-1/goals/${goalId}`)
        .send({ status: 'in-progress' })
        .expect(200);

      const updated1 = inProgressRes.body.goals.find((g: { id: string }) => g.id === goalId);
      expect(updated1.status).toBe('in-progress');

      // 3. Update goal status to done
      const doneRes = await physioAgent
        .patch(`/api/care-plans/cp-1/goals/${goalId}`)
        .send({ status: 'done' })
        .expect(200);

      const updated2 = doneRes.body.goals.find((g: { id: string }) => g.id === goalId);
      expect(updated2.status).toBe('done');

      // 4. Reject invalid goal status
      await physioAgent
        .patch(`/api/care-plans/cp-1/goals/${goalId}`)
        .send({ status: 'archived' })
        .expect(400);

      // 5. Delete goal
      const deleteRes = await nurseAgent
        .delete(`/api/care-plans/cp-1/goals/${goalId}`)
        .expect(200);

      const deletedCheck = deleteRes.body.goals.find((g: { id: string }) => g.id === goalId);
      expect(deletedCheck).toBeUndefined();

      // Deleting already deleted goal returns 404
      await nurseAgent
        .delete(`/api/care-plans/cp-1/goals/${goalId}`)
        .expect(404);
    });

    it('supports multi-disciplinary author roles (nurse, physio, doctor) on care plan notes', async () => {
      // 1. Nurse adds note
      const nurseNoteRes = await nurseAgent
        .post('/api/care-plans/cp-1/notes')
        .send({
          text: 'Vitals stable. Administered prescribed sub-Q heparin.',
          authorRole: 'nurse',
        })
        .expect(200);

      const nurseNote = nurseNoteRes.body.notes.find((n: { text: string }) => n.text.includes('sub-Q heparin'));
      expect(nurseNote).toBeTruthy();
      expect(nurseNote.authorRole).toBe('nurse');
      expect(nurseNote.authorName).toBe('Elena Papadaki');
      expect(nurseNote.atMs).toBeTypeOf('number');

      // 2. Physio adds note
      const physioNoteRes = await physioAgent
        .post('/api/care-plans/cp-1/notes')
        .send({
          text: 'Completed passive range of motion. Knee flexion improved to 115 degrees.',
          authorRole: 'physio',
        })
        .expect(200);

      const physioNote = physioNoteRes.body.notes.find((n: { text: string }) => n.text.includes('115 degrees'));
      expect(physioNote).toBeTruthy();
      expect(physioNote.authorRole).toBe('physio');
      expect(physioNote.authorName).toBe('Anna Karakosta');

      // 3. Doctor adds note
      const doctorNoteRes = await doctorAgent
        .post('/api/care-plans/cp-1/notes')
        .send({
          text: 'Evaluated progress: decrease analgesics, proceed with active weight-bearing exercises.',
          authorRole: 'doctor',
        })
        .expect(200);

      const doctorNote = doctorNoteRes.body.notes.find((n: { text: string }) => n.text.includes('weight-bearing'));
      expect(doctorNote).toBeTruthy();
      expect(doctorNote.authorRole).toBe('doctor');
      expect(doctorNote.authorName).toBe('Dr. Konstantinos Alexiou');

      // 4. Reject invalid author role
      await nurseAgent
        .post('/api/care-plans/cp-1/notes')
        .send({
          text: 'Invalid role note',
          authorRole: 'pharmacist',
        })
        .expect(400);

      // 5. Reject empty note
      await nurseAgent
        .post('/api/care-plans/cp-1/notes')
        .send({
          text: '',
          authorRole: 'nurse',
        })
        .expect(400);

      // 6. Verify single care plan contains all multi-disciplinary notes
      const planRes = await clientAgent.get('/api/care-plans/cp-1').expect(200);
      const rolesPresent = planRes.body.notes.map((n: { authorRole: string }) => n.authorRole);
      expect(rolesPresent).toContain('nurse');
      expect(rolesPresent).toContain('physio');
      expect(rolesPresent).toContain('doctor');
    });
  });
});
