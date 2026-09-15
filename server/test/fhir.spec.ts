import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import {
  AMKA_SYSTEM,
  AFM_SYSTEM,
  LOINC_CODES,
  mapDomainToFhirBundle,
  mapGender,
  mapGoalStatus,
  splitName,
  timeOfDay,
  timingFromSchedule,
} from '../src/fhir';

let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;

const CLIENT_EMAIL = 'maria@example.com';
const PASSWORD = 'demo1234';

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  client = request.agent(baseUrl);
  await client.post('/api/auth/login').send({ email: CLIENT_EMAIL, password: PASSWORD }).expect(200);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
  await pool.end();
});

describe('FHIR R4 Export API (GET /api/me/fhir/export)', () => {
  it('blocks unauthenticated requests with 401', async () => {
    const unauthed = request(baseUrl);
    const res = await unauthed.get('/api/me/fhir/export');
    expect(res.status).toBe(401);
  });

  it('returns 200 and a valid HL7 FHIR R4 document Bundle for authenticated user', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);

    expect(res.headers['content-type']).toContain('json');
    const bundle = res.body;

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('document');
    expect(bundle.id).toMatch(/^bundle-/);
    expect(typeof bundle.timestamp).toBe('string');
    expect(new Date(bundle.timestamp).toString()).not.toBe('Invalid Date');
    expect(Array.isArray(bundle.entry)).toBe(true);
    expect(bundle.total).toBe(bundle.entry.length);
    expect(bundle.entry.length).toBeGreaterThan(5);

    // Every entry must have fullUrl and resource
    for (const entry of bundle.entry) {
      expect(entry.fullUrl).toMatch(/^urn:uuid:/);
      expect(entry.resource).toBeDefined();
      expect(typeof entry.resource.resourceType).toBe('string');
      expect(typeof entry.resource.id).toBe('string');
    }
  });

  it('supports collection bundleType via ?type=collection query parameter', async () => {
    const res = await client.get('/api/me/fhir/export?type=collection').expect(200);
    expect(res.body.resourceType).toBe('Bundle');
    expect(res.body.type).toBe('collection');
  });

  it('aliases /api/me/fhir/bundle to the same export endpoint', async () => {
    const res = await client.get('/api/me/fhir/bundle').expect(200);
    expect(res.body.resourceType).toBe('Bundle');
    expect(res.body.entry.length).toBeGreaterThan(5);
  });

  it('verifies Patient entry structure, AMKA identifier and primary ICE contact', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const patientEntry = entries.find((e: any) => e.resource.resourceType === 'Patient');
    expect(patientEntry).toBeDefined();
    const patient = patientEntry.resource;

    expect(patient.id).toBe('patient-u-client');
    expect(patient.active).toBe(true);

    // AMKA identifier check (PLAN §3.C, §4)
    const amkaId = patient.identifier.find((i: any) => i.system === AMKA_SYSTEM);
    expect(amkaId).toBeDefined();
    expect(amkaId.value).toBe('14036801234');
    expect(amkaId.use).toBe('official');

    // AFM identifier check
    const afmId = patient.identifier.find((i: any) => i.system === AFM_SYSTEM);
    expect(afmId).toBeDefined();
    expect(afmId.value).toMatch(/^\d{9}$/);

    // Name check
    expect(patient.name).toBeDefined();
    expect(patient.name[0].text).toBe('Maria Papadopoulou');
    expect(patient.name[0].family).toBe('Papadopoulou');
    expect(patient.name[0].given).toEqual(['Maria']);

    // Telecom check
    expect(patient.telecom).toBeDefined();
    const phone = patient.telecom.find((t: any) => t.system === 'phone');
    const email = patient.telecom.find((t: any) => t.system === 'email');
    expect(phone).toBeDefined();
    expect(phone.value).toBe('6940000000');
    expect(email).toBeDefined();
    expect(email.value).toBe(CLIENT_EMAIL);

    // Gender and birthDate
    expect(patient.gender).toBe('female');
    expect(patient.birthDate).toBe('1968-03-14');

    // Primary ICE contact check
    expect(Array.isArray(patient.contact)).toBe(true);
    expect(patient.contact.length).toBeGreaterThan(0);
    const ice = patient.contact[0];
    expect(ice.name.text).toBe('Γιώργος Παπαδόπουλος');
    expect(ice.name.family).toBe('Παπαδόπουλος');
    expect(ice.relationship[0].text).toBe('Σύζυγος');
    const icePhone = ice.telecom.find((t: any) => t.system === 'phone');
    expect(icePhone.value).toBe('6970000001');
  });

  it('verifies Observations have correct standard LOINC codes and structures', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const observations = entries
      .filter((e: any) => e.resource.resourceType === 'Observation')
      .map((e: any) => e.resource);

    expect(observations.length).toBeGreaterThanOrEqual(3);

    // Every vital observation must have final status, vital-signs category, subject ref
    const vitalObs = observations.filter((o: any) =>
      o.category?.some((c: any) => c.text === 'vital-signs' || c.coding?.[0]?.code === 'vital-signs')
    );
    expect(vitalObs.length).toBeGreaterThanOrEqual(3);
    for (const o of vitalObs) {
      expect(o.status).toBe('final');
      expect(o.subject?.reference).toBe('Patient/patient-u-client');
      expect(typeof o.effectiveDateTime).toBe('string');
    }

    // 1. Blood Pressure LOINC 85354-9 with systolic and diastolic components
    const bp = vitalObs.find((o: any) => o.code.coding?.some((c: any) => c.code === '85354-9'));
    expect(bp).toBeDefined();
    expect(bp.component).toBeDefined();
    expect(bp.component.length).toBe(2);

    const systolic = bp.component.find((c: any) => c.code.coding?.some((x: any) => x.code === '8480-6'));
    expect(systolic).toBeDefined();
    expect(typeof systolic.valueQuantity.value).toBe('number');
    expect(systolic.valueQuantity.value).toBeGreaterThanOrEqual(90);
    expect(systolic.valueQuantity.unit).toBe('mmHg');
    expect(systolic.valueQuantity.code).toBe('mm[Hg]');

    const diastolic = bp.component.find((c: any) => c.code.coding?.some((x: any) => x.code === '8462-4'));
    expect(diastolic).toBeDefined();
    expect(typeof diastolic.valueQuantity.value).toBe('number');
    expect(diastolic.valueQuantity.value).toBeGreaterThanOrEqual(50);
    expect(diastolic.valueQuantity.unit).toBe('mmHg');
    expect(diastolic.valueQuantity.code).toBe('mm[Hg]');

    // 2. Heart Rate LOINC 8867-4
    const hr = vitalObs.find((o: any) => o.code.coding?.some((c: any) => c.code === '8867-4'));
    expect(hr).toBeDefined();
    expect(typeof hr.valueQuantity.value).toBe('number');
    expect(hr.valueQuantity.value).toBeGreaterThanOrEqual(50);
    expect(hr.valueQuantity.unit).toBe('/min');
    expect(hr.valueQuantity.code).toBe('/min');

    // 3. SpO2 LOINC 59408-5 (or 5940-8)
    const spo2 = vitalObs.find((o: any) =>
      o.code.coding?.some((c: any) => c.code === '59408-5' || c.code === '5940-8')
    );
    expect(spo2).toBeDefined();
    expect(spo2.valueQuantity.value).toBe(98);
    expect(spo2.valueQuantity.unit).toBe('%');
    expect(spo2.valueQuantity.code).toBe('%');
  });

  it('verifies MedicationRequest entries for active and past medications', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const medRequests = entries
      .filter((e: any) => e.resource.resourceType === 'MedicationRequest')
      .map((e: any) => e.resource);

    expect(medRequests.length).toBeGreaterThanOrEqual(2);

    const insulin = medRequests.find((m: any) =>
      m.medicationCodeableConcept.text.includes('Insulin glargine')
    );
    expect(insulin).toBeDefined();
    expect(insulin.status).toBe('active');
    expect(insulin.intent).toBe('plan');
    expect(insulin.subject?.reference).toBe('Patient/patient-u-client');
    expect(insulin.requester?.display).toContain('Σταύρου');
    expect(insulin.dosageInstruction).toBeDefined();
    expect(insulin.dosageInstruction[0].text).toContain('Daily at 08:00');
    expect(insulin.note?.some((n: any) => n.text.includes('Σταύρου'))).toBe(true);

    const statin = medRequests.find((m: any) =>
      m.medicationCodeableConcept.text.includes('Atorvastatin')
    );
    expect(statin).toBeDefined();
    expect(statin.status).toBe('active');
    expect(statin.dosageInstruction[0].text).toContain('Daily at 21:00');
  });

  it('verifies CarePlan entry with goals, activity and notes', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const carePlanEntry = entries.find((e: any) => e.resource.resourceType === 'CarePlan');
    expect(carePlanEntry).toBeDefined();
    const carePlan = carePlanEntry.resource;

    expect(carePlan.id).toBe('careplan-cp-1');
    expect(carePlan.status).toBe('active');
    expect(carePlan.intent).toBe('plan');
    expect(carePlan.subject?.reference).toBe('Patient/patient-u-client');
    expect(carePlan.title).toContain('Maria Papadopoulou');

    // Goals reference and description check
    expect(Array.isArray(carePlan.goal)).toBe(true);
    expect(carePlan.goal.length).toBe(2);
    expect(carePlan.goal[0].reference).toBe('Goal/goal-g-1');
    expect(carePlan.goal[0].description).toBe('Mobilise shoulder daily');
    expect(carePlan.goal[0].status).toBe('in-progress');

    expect(carePlan.goal[1].reference).toBe('Goal/goal-g-2');
    expect(carePlan.goal[1].description).toBe('Stabilise blood pressure');
    expect(carePlan.goal[1].status).toBe('planned');

    // Activities
    expect(Array.isArray(carePlan.activity)).toBe(true);
    expect(carePlan.activity.length).toBe(2);

    // Notes
    expect(Array.isArray(carePlan.note)).toBe(true);
    expect(carePlan.note.length).toBeGreaterThanOrEqual(1);
    expect(
      carePlan.note.some(
        (n: any) => n.authorString?.includes('Elena Papadaki') || n.authorString?.includes('Alexiou')
      )
    ).toBe(true);
    expect(carePlan.note.some((n: any) => n.text?.length > 0)).toBe(true);

    // Referenced Goal resources must also exist in the bundle
    const goalResources = entries
      .filter((e: any) => e.resource.resourceType === 'Goal')
      .map((e: any) => e.resource);
    expect(goalResources.some((g: any) => g.id === 'goal-g-1')).toBe(true);
    expect(goalResources.some((g: any) => g.id === 'goal-g-2')).toBe(true);
  });

  it('verifies AllergyIntolerance entries with substance, criticality and reaction', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const allergies = entries
      .filter((e: any) => e.resource.resourceType === 'AllergyIntolerance')
      .map((e: any) => e.resource);

    expect(allergies.length).toBeGreaterThanOrEqual(1);
    const pen = allergies.find((a: any) =>
      a.code?.text?.includes('Πενικιλίνη') || a.substance?.text?.includes('Πενικιλίνη')
    );
    expect(pen).toBeDefined();
    expect(pen.clinicalStatus.text).toBe('active');
    expect(pen.verificationStatus.text).toBe('confirmed');
    expect(pen.criticality).toBe('high');
    expect(pen.category).toContain('medication');
    expect(pen.reaction).toBeDefined();
    expect(pen.reaction[0].manifestation[0].text).toContain('Κνίδωση');
  });

  it('verifies Condition entries with ICD-11 coding, status and onset', async () => {
    const res = await client.get('/api/me/fhir/export').expect(200);
    const entries = res.body.entry;

    const conditions = entries
      .filter((e: any) => e.resource.resourceType === 'Condition')
      .map((e: any) => e.resource);

    expect(conditions.length).toBeGreaterThanOrEqual(1);
    const cond = conditions.find((c: any) => c.code?.text?.includes('Υπέρταση'));
    expect(cond).toBeDefined();
    expect(cond.clinicalStatus.text).toBe('active');
    expect(cond.verificationStatus.text).toBe('confirmed');
    expect(cond.category?.[0]?.text).toBe('chronic');
    expect(cond.code.coding?.[0]?.code).toBe('BA00');
    expect(cond.code.coding?.[0]?.system).toBe('http://id.who.int/icd/release/11/mms');
    expect(typeof cond.onsetDateTime).toBe('string');
  });

  it('records an audit log event on FHIR export', async () => {
    await client.get('/api/me/fhir/export').expect(200);

    const auditRows = await query<any>(
      `SELECT * FROM audit_events WHERE actor_id = 'u-client' AND action = 'fhir_export' ORDER BY at_ms DESC LIMIT 1`
    );
    expect(auditRows.length).toBe(1);
    expect(auditRows[0].resource_type).toBe('Bundle');
    expect(auditRows[0].resource_id).toMatch(/^bundle-/);
  });
});

describe('FHIR Pure Mapping Helpers', () => {
  it('splits single-word, two-word and multi-word names properly', () => {
    expect(splitName('Maria')).toEqual({ family: 'Maria', given: ['Maria'], text: 'Maria' });
    expect(splitName('Maria Papadopoulou')).toEqual({
      family: 'Papadopoulou',
      given: ['Maria'],
      text: 'Maria Papadopoulou',
    });
    expect(splitName('Anna Maria De La Cruz')).toEqual({
      family: 'Cruz',
      given: ['Anna', 'Maria', 'De', 'La'],
      text: 'Anna Maria De La Cruz',
    });
    expect(splitName('')).toEqual({ family: '', given: [], text: '' });
  });

  it('maps sex strings to administrative gender', () => {
    expect(mapGender('female')).toBe('female');
    expect(mapGender('Female')).toBe('female');
    expect(mapGender('male')).toBe('male');
    expect(mapGender('Male')).toBe('male');
    expect(mapGender('other')).toBe('other');
    expect(mapGender('unknown')).toBe('unknown');
    expect(mapGender(null)).toBe('unknown');
  });

  it('maps care goal status correctly', () => {
    expect(mapGoalStatus('open')).toBe('planned');
    expect(mapGoalStatus('in-progress')).toBe('in-progress');
    expect(mapGoalStatus('done')).toBe('achieved');
    expect(mapGoalStatus('unknown')).toBe('planned');
  });

  it('formats minutes into HH:MM string', () => {
    expect(timeOfDay(0)).toBe('00:00');
    expect(timeOfDay(480)).toBe('08:00');
    expect(timeOfDay(1260)).toBe('21:00');
    expect(timeOfDay(1439)).toBe('23:59');
  });

  it('generates FHIR timing structures from medication schedules', () => {
    const daily = timingFromSchedule({ kind: 'daily', timesMinutes: [480, 1260] });
    expect(daily.repeat.period).toBe(1);
    expect(daily.repeat.periodUnit).toBe('d');
    expect(daily.repeat.timeOfDay).toEqual(['08:00', '21:00']);

    const interval = timingFromSchedule({ kind: 'interval', everyDays: 3, timeMinutes: 600 });
    expect(interval.repeat.period).toBe(3);
    expect(interval.repeat.periodUnit).toBe('d');
    expect(interval.repeat.timeOfDay).toEqual(['10:00']);

    const weekly = timingFromSchedule({ kind: 'weekly', weekdays: [1, 3], timeMinutes: 720 });
    expect(weekly.repeat.period).toBe(1);
    expect(weekly.repeat.periodUnit).toBe('wk');
    expect(weekly.repeat.dayOfWeek).toEqual(['mon', 'wed']);
    expect(weekly.repeat.timeOfDay).toEqual(['12:00']);

    expect(timingFromSchedule(null)).toBeUndefined();
  });

  it('contains valid LOINC specifications for all required vitals', () => {
    expect(LOINC_CODES.bloodPressure.code).toBe('85354-9');
    expect(LOINC_CODES.bloodPressure.systolicLoinc).toBe('8480-6');
    expect(LOINC_CODES.bloodPressure.diastolicLoinc).toBe('8462-4');

    expect(LOINC_CODES.heartRate.code).toBe('8867-4');
    expect(LOINC_CODES.heartRate.unit).toBe('/min');

    expect(LOINC_CODES.glucose.code).toBe('2339-0');
    expect(LOINC_CODES.glucose.unit).toBe('mg/dL');

    expect(LOINC_CODES.spo2.code).toBe('59408-5');
    expect(LOINC_CODES.spo2.unit).toBe('%');

    expect(LOINC_CODES.weight.code).toBe('29463-7');
    expect(LOINC_CODES.weight.unit).toBe('kg');

    expect(LOINC_CODES.temperature.code).toBe('8310-5');
    expect(LOINC_CODES.temperature.unit).toBe('Cel');
  });

  it('maps domain snapshot with missing optional fields without crashing', () => {
    const bundle = mapDomainToFhirBundle({
      user: { id: 'u-empty', display_name: 'Solo', email: 'solo@example.com' },
      profile: null,
      vitals: [
        { id: 'v-1', type: 'glucose', value: 105, measured_at_ms: Date.now() },
        { id: 'v-2', type: 'temperature', value: 36.6, measured_at_ms: Date.now() },
        { id: 'v-3', type: 'weight', value: 72.5, measured_at_ms: Date.now() },
      ],
      medications: [],
      carePlans: [],
      conditions: [],
      allergies: [],
      immunizations: [],
      events: [],
      symptoms: [],
      prescriptionRecords: [],
      iceContacts: [],
    });

    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry.length).toBe(4); // 1 patient + 3 vitals
    const patient = bundle.entry[0].resource;
    expect(patient.id).toBe('patient-u-empty');
    expect(patient.gender).toBe('unknown');
    expect(patient.contact).toBeUndefined();

    const glucose = bundle.entry.find((e: any) => e.resource.code?.coding?.[0]?.code === '2339-0');
    expect(glucose).toBeDefined();
    expect(glucose.resource.valueQuantity.value).toBe(105);

    const temp = bundle.entry.find((e: any) => e.resource.code?.coding?.[0]?.code === '8310-5');
    expect(temp).toBeDefined();
    expect(temp.resource.valueQuantity.value).toBe(36.6);

    const weight = bundle.entry.find((e: any) => e.resource.code?.coding?.[0]?.code === '29463-7');
    expect(weight).toBeDefined();
    expect(weight.resource.valueQuantity.value).toBe(72.5);
  });
});
