import { query, queryOne } from './db';
import { createUser, findUserByEmail } from './auth';

const hour = 60 * 60 * 1000;
const now = () => Date.now();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';

/**
 * Seeds the demo dataset that the frontend E2E and manual flows rely on —
 * the same accounts documented in README.md (`maria@example.com` client,
 * `elena@example.com` nurse, `admin@example.com` admin). Idempotent: users
 * are created only when missing.
 */
export async function seed(): Promise<void> {
  await ensureUser('maria@example.com', 'Maria Papadopoulou', ['client'], 'u-client');
  await ensureUser('elena@example.com', 'Elena Papadaki', ['nurse'], 'u-nurse');
  await ensureUser('admin@example.com', 'Admin', ['admin'], 'u-admin');
  await ensureUser('anna@example.com', 'Anna Karakosta', ['physio'], 'u-physio');
  await ensureUser('nikos@example.com', 'Nikos Georgiou', ['caregiver'], 'u-nikos');

  await seedMedications();
  await seedCaregivers();
  await seedProfiles();
  await seedVetting();
  await seedCertifications();
  await seedAvailability();
  await seedVisitAndEscrow();
  await seedScreenings();
  await seedCarePlan();
  await seedHistory();
  await seedContacts();
  await seedConsents();
}

async function ensureUser(
  email: string,
  displayName: string,
  roles: string[],
  id: string
): Promise<void> {
  const existing = await findUserByEmail(email);
  if (existing) {
    return;
  }
  // Insert with a fixed id so seeded relational data can reference it.
  const { hashPassword } = await import('./auth');
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await query(
    `INSERT INTO user_accounts (id, display_name, email, password_hash, roles, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, displayName, email, passwordHash, roles, now()]
  );
}

/**
 * Medication calendar demo rows (FEATURE_PLAN.md §7) with structured
 * instruction sheets (medicine instructions manager): a critical insulin
 * (injection) and a nightly statin (oral) — the surface the medications page
 * and the instructions editor render. Idempotent per fixed id.
 */
async function seedMedications(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM medications WHERE id = 'med-1'`);
  if (existing) {
    return;
  }
  const nowMs = now();
  const insulin = {
    doseForm: 'Πένα ένεσης',
    route: 'injection',
    foodRelation: 'any',
    maxDailyDoses: 1,
    warnings: [
      'Ελέγχετε το σάκχαρο πριν από τη δόση.',
      'Αλλάζετε σημείο ένεσης κάθε φορά.',
    ],
    sideEffects: 'Υπογλυκαιμία, αντίδραση στο σημείο της ένεσης.',
    storage: 'Στο ψυγείο πριν το άνοιγμα.',
    specialInstructions: '',
  };
  const statin = {
    doseForm: 'Δισκίο',
    route: 'oral',
    foodRelation: 'any',
    maxDailyDoses: 1,
    warnings: ['Αποφύγετε τον χυμό γκρέιπφρουτ.', 'Αναφέρετε ανεξήγητο μυϊκό πόνο.'],
    sideEffects: 'Μυϊκός πόνος, κεφαλαλγία.',
    storage: 'Σε ξηρό, δροσερό μέρος.',
    specialInstructions: 'Λαμβάνεται το βράδυ, την ίδια ώρα.',
  };
  await query(
    `INSERT INTO medications (id, user_id, name, dose, schedule, critical, prescriber, instructions, archived, created_at_ms)
     VALUES ($1, 'u-client', $2, $3, $4::jsonb, $5, $6, $7::jsonb, FALSE, $8),
            ($9, 'u-client', $10, $11, $12::jsonb, FALSE, $13, $14::jsonb, FALSE, $15)
     ON CONFLICT (id) DO NOTHING`,
    [
      'med-1', 'Insulin glargine', '10 units', JSON.stringify({ kind: 'daily', timesMinutes: [8 * 60] }), true, 'Dr. Stavrou', JSON.stringify(insulin), nowMs - 30 * 24 * hour,
      'med-2', 'Atorvastatin', '20 mg', JSON.stringify({ kind: 'daily', timesMinutes: [21 * 60] }), 'Dr. Stavrou', JSON.stringify(statin), nowMs - 60 * 24 * hour,
    ]
  );
}

async function seedCaregivers(): Promise<void> {
  // Caregiver ids ARE user ids so chat conversations (keyed by peer id)
  // route to the right person's WebSocket.
  const rows = [
    { id: 'u-nurse', displayName: 'Elena Papadaki', roles: ['nurse'], rating: 4.8, distanceKm: 3, hourlyRate: 25, availableNow: true },
    { id: 'u-nikos', displayName: 'Nikos Georgiou', roles: ['caregiver'], rating: 4.2, distanceKm: 12, hourlyRate: 15, availableNow: false },
    { id: 'u-physio', displayName: 'Anna Karakosta', roles: ['physio'], rating: 4.9, distanceKm: 5, hourlyRate: 30, availableNow: true },
  ];
  for (const c of rows) {
    await query(
      `INSERT INTO caregivers (id, display_name, roles, rating, distance_km, hourly_rate, available_now)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.displayName, c.roles, c.rating, c.distanceKm, c.hourlyRate, c.availableNow]
    );
  }
}

async function seedProfiles(): Promise<void> {
  const profiles = [
    { userId: 'u-client', phone: '6940000000', amka: '01010112345', afm: '000000000', licenceNumber: '', hourlyRate: null, dateOfBirth: '1968-03-14', sex: 'female' },
    { userId: 'u-nurse', phone: '6950000000', amka: '02020212345', afm: '000000001', licenceNumber: 'ΝΟΣ-2024-Α123', hourlyRate: 25, dateOfBirth: '', sex: '' },
    { userId: 'u-physio', phone: '6960000000', amka: '03030312345', afm: '000000002', licenceNumber: 'ΦΘ-2023-Β456', hourlyRate: 30, dateOfBirth: '', sex: '' },
  ];
  for (const p of profiles) {
    await query(
      `INSERT INTO profiles (user_id, phone, amka, afm, licence_number, hourly_rate, date_of_birth, sex)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         phone = EXCLUDED.phone, amka = EXCLUDED.amka, afm = EXCLUDED.afm,
         licence_number = EXCLUDED.licence_number, hourly_rate = EXCLUDED.hourly_rate,
         date_of_birth = EXCLUDED.date_of_birth, sex = EXCLUDED.sex`,
      [p.userId, p.phone, p.amka, p.afm, p.licenceNumber, p.hourlyRate, p.dateOfBirth, p.sex]
    );
  }
}

async function seedCertifications(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM certifications WHERE id = 'cert-nurse-1'`);
  if (existing) {
    return;
  }
  // §14: u-nurse licence expires in 14 days → certification.expiring push.
  await query(
    `INSERT INTO certifications (id, provider_id, name, licence_number, expires_at_ms, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    ['cert-nurse-1', 'u-nurse', 'Registered Nurse Licence', 'ΝΟΣ-2024-Α123', now() + 14 * 24 * hour, now()]
  );
}

async function seedScreenings(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM screenings WHERE id = 'scr-1'`);
  if (existing) {
    return;
  }
  // §6 mirror of the demo: cardio check done ~14 months ago (12-month
  // interval) → overdue for u-client (DOB 1968-03-14 → in the 40+ range).
  await query(
    `INSERT INTO screenings (id, user_id, type, status, at_ms, reason, snooze_until_ms, scheduled_at_ms, snooze_count, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, '', NULL, NULL, 0, $6)`,
    ['scr-1', 'u-client', 'cardioCheck', 'done', now() - Math.round(14 * 30.44 * 24 * hour), now()]
  );
}

async function seedVetting(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM vetting_submissions WHERE id = 'v-1'`);
  if (existing) {
    return;
  }
  await query(
    `INSERT INTO vetting_submissions
     (id, provider_id, provider_name, licence_number, specialties, status, submitted_at_ms, reviewed_at_ms, reviewed_by, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, '')`,
    ['v-1', 'u-nurse', 'Elena Papadaki', 'ΝΟΣ-2024-Α123', ['Injections', 'Wound care'], 'pending', now() - 2 * 24 * hour]
  );
}

async function seedAvailability(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM availability WHERE id = 'a-1'`);
  if (existing) {
    return;
  }
  await query(
    `INSERT INTO availability (id, provider_id, weekday, start_minutes, end_minutes, on_demand) VALUES ($1, $2, $3, $4, $5, $6)`,
    ['a-1', 'u-nurse', 0, 8 * 60, 12 * 60, true]
  );
  await query(
    `INSERT INTO availability (id, provider_id, weekday, start_minutes, end_minutes, on_demand) VALUES ($1, $2, $3, $4, $5, $6)`,
    ['a-2', 'u-nurse', 2, 12 * 60, 17 * 60, true]
  );
  await query(
    `INSERT INTO shifts (id, provider_id, client_id, client_name, act, scheduled_at_ms, duration_minutes, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['s-1', 'u-nurse', 'u-client', 'Maria Papadopoulou', 'Injection', now() + hour, 45, 'confirmed']
  );
}

async function seedVisitAndEscrow(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM visits WHERE id = 'visit-1'`);
  if (existing) {
    return;
  }
  await query(
    `INSERT INTO visits (id, shift_id, booking_id, provider_id, client_id, client_name, provider_name, act, scheduled_at_ms, status, check_in, check_out)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)`,
    [
      'visit-1',
      's-1',
      'b-1',
      'u-nurse',
      'u-client',
      'Maria Papadopoulou',
      'Elena Papadaki',
      'Injection',
      now() - 30 * 60 * 1000,
      'in-progress',
      JSON.stringify({ lat: 37.9838, lng: 23.7275, accuracyM: 12, atMs: now() - 30 * 60 * 1000 }),
    ]
  );
  await query(
    `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT (id) DO NOTHING`,
    ['e-1', 'b-1', 'u-nurse', 'u-client', 4500, 'held', now() - 3 * 24 * hour]
  );
}

async function seedCarePlan(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM care_plans WHERE id = 'cp-1'`);
  if (existing) {
    return;
  }
  await query(
    `INSERT INTO care_plans (id, client_id, client_name, updated_at_ms, updated_by) VALUES ($1, $2, $3, $4, $5)`,
    ['cp-1', 'u-client', 'Maria Papadopoulou', now() - 2 * 24 * hour, 'Elena Papadaki']
  );
  await query(
    `INSERT INTO care_plan_goals (id, plan_id, text, status) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
    ['g-1', 'cp-1', 'Mobilise shoulder daily', 'in-progress', 'g-2', 'cp-1', 'Stabilise blood pressure', 'open']
  );
  await query(
    `INSERT INTO care_plan_notes (id, plan_id, author_id, author_name, author_role, text, at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    ['n-1', 'cp-1', 'u-nurse', 'Elena Papadaki', 'nurse', 'BP stable at 125/80, continue monitoring.', now() - 2 * 24 * hour]
  );
  await query(
    `INSERT INTO vitals (id, user_id, type, value, value2, measured_at_ms, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, NULL, $12, $13), ($14, $15, $16, $17, NULL, $18, $19)
     ON CONFLICT (id) DO NOTHING`,
    ['vt-1', 'u-client', 'bloodPressure', 132, 86, now() - 26 * hour, 'manual',
     'vt-2', 'u-client', 'heartRate', 74, now() - 26 * hour, 'manual',
     'vt-3', 'u-client', 'spo2', 98, now() - 25 * hour, 'manual']
  );
}

/**
 * Consent ledger for the demo client (FEATURE_PLAN.md §16 subtask 6 + §21
 * subtask 16): family_sharing + data_export pre-granted so the caregiver/nurse
 * family read of the client's history works out of the box; sms/bluetooth
 * start ungranted (opt-in). Mirrors the demo.api.ts seed.
 */
async function seedConsents(): Promise<void> {
  await query(
    `INSERT INTO user_consents (user_id, consents, current_document_version, updated_at_ms)
     VALUES ($1, $2, 'v1.0', $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [
      'u-client',
      JSON.stringify([
        { purpose: 'family_sharing', granted: true, documentVersion: 'v1.0', updatedAtMs: now() - 5 * 24 * hour, updatedBy: 'u-client' },
        { purpose: 'sms_reminders', granted: false, documentVersion: 'v1.0', updatedAtMs: now() - 5 * 24 * hour, updatedBy: 'u-client' },
        { purpose: 'bluetooth', granted: false, documentVersion: 'v1.0', updatedAtMs: now() - 5 * 24 * hour, updatedBy: 'u-client' },
        { purpose: 'data_export', granted: true, documentVersion: 'v1.0', updatedAtMs: now() - 5 * 24 * hour, updatedBy: 'u-client' },
      ]),
      now(),
    ]
  );
}

/**
 * Contact phone manager demo rows: a primary ICE contact (spouse), a secondary
 * ICE contact (daughter) and two care-team entries (GP + pharmacy) — the
 * surface the contacts page, the export and the FHIR Patient.contact mapper
 * render.
 */
async function seedContacts(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM medical_contacts WHERE id = 'contact-ice-1'`);
  if (existing) {
    return;
  }
  const yearMs = 365 * 24 * hour;
  const rows: [string, string, string, string, string, boolean, number][] = [
    ['contact-ice-1', 'emergency', 'Γιώργος Παπαδόπουλος', 'Σύζυγος', '6970000001', true, 10],
    ['contact-ice-2', 'emergency', 'Ελένη Παπαδοπούλου', 'Κόρη', '6970000002', false, 5],
    ['contact-care-1', 'care', 'Δρ. Παπαδόπουλος', 'doctor', '2100000000', true, 10],
    ['contact-care-2', 'care', 'Φαρμακείο Συντάγματος', 'pharmacy', '2100000001', false, 0],
  ];
  for (const [rowId, kind, name, relationship, phone, isPrimary, priority] of rows) {
    await query(
      `INSERT INTO medical_contacts
       (id, user_id, kind, name, relationship, phone, is_primary, priority, archived, created_at_ms)
       VALUES ($1, 'u-client', $2, $3, $4, $5, $6, $7, FALSE, $8)`,
      [rowId, kind, name, relationship, phone, isPrimary, priority, now() - yearMs]
    );
  }
}

/**
 * Medical-history demo rows (FEATURE_PLAN.md §21 subtask 4): one severe drug
 * allergy, one active chronic condition (ICD-11 coded), one immunization, one
 * surgery event, one ongoing symptom and one active prescription — the exact
 * surface the history page and the dashboard allergy banner render.
 */
async function seedHistory(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM medical_conditions WHERE id = 'cond-1'`);
  if (existing) {
    return;
  }
  const yearMs = 365 * 24 * hour;
  await query(
    `INSERT INTO medical_conditions
     (id, user_id, name, icd11_code, status, diagnosed_at_ms, resolved_at_ms, notes, archived, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, FALSE, $8)`,
    ['cond-1', 'u-client', 'Υπέρταση', 'BA00', 'chronic', now() - 8 * yearMs, 'Υπό αγωγή — τακτική παρακολούθηση.', now()]
  );
  await query(
    `INSERT INTO allergies
     (id, user_id, substance, kind, reaction, severity, confirmed_at_ms, notes, archived, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)`,
    ['all-1', 'u-client', 'Πενικιλίνη', 'drug', 'Κνίδωση, κίνδυνος αναφυλαξίας', 'severe', now() - 10 * yearMs, 'Αναγράφεται στο βραχιόλι αλλεργίας.', now()]
  );
  await query(
    `INSERT INTO immunizations
     (id, user_id, vaccine, dose_number, administered_at_ms, source, notes, archived, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, 'manual', '', FALSE, $6)`,
    ['imm-1', 'u-client', 'Γρίπη (εποχικό εμβόλιο)', 1, now() - 6 * 30 * 24 * hour, now()]
  );
  await query(
    `INSERT INTO medical_events
     (id, user_id, kind, name, facility, occurred_at_ms, notes, archived, created_at_ms)
     VALUES ($1, $2, 'surgery', 'Σκωληκοειδεκτομή', 'Γενικό Νοσοκομείο Αθηνών', $3, 'Ομαλή μετεγχειρητική πορεία.', FALSE, $4)`,
    ['ev-1', 'u-client', now() - 6 * yearMs, now()]
  );
  await query(
    `INSERT INTO symptoms
     (id, user_id, name, severity, onset_at_ms, status, notes, archived, created_at_ms)
     VALUES ($1, $2, $3, 'moderate', $4, 'ongoing', '', FALSE, $5)`,
    ['sym-1', 'u-client', 'Πονοκέφαλος', now() - 10 * 24 * hour, now()]
  );
  await query(
    `INSERT INTO prescription_records
     (id, user_id, drug, dose, instructions, prescriber, issued_at_ms, duration_days, status, pharmacy_prescription_id, medication_id, archived, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 90, 'active', NULL, NULL, FALSE, $8)`,
    ['rx-1', 'u-client', 'Ατορβαστατίνη', '20mg ×1', 'Ένα δισκίο το βράδυ.', 'Δρ. Παπαδόπουλος', now() - 30 * 24 * hour, now()]
  );
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}