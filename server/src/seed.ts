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

  await seedCaregivers();
  await seedProfiles();
  await seedVetting();
  await seedAvailability();
  await seedVisitAndEscrow();
  await seedCarePlan();
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
    { userId: 'u-client', phone: '6940000000', amka: '01010112345', afm: '000000000', licenceNumber: '', hourlyRate: null },
    { userId: 'u-nurse', phone: '6950000000', amka: '02020212345', afm: '000000001', licenceNumber: 'ΝΟΣ-2024-Α123', hourlyRate: 25 },
    { userId: 'u-physio', phone: '6960000000', amka: '03030312345', afm: '000000002', licenceNumber: 'ΦΘ-2023-Β456', hourlyRate: 30 },
  ];
  for (const p of profiles) {
    await query(
      `INSERT INTO profiles (user_id, phone, amka, afm, licence_number, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO NOTHING`,
      [p.userId, p.phone, p.amka, p.afm, p.licenceNumber, p.hourlyRate]
    );
  }
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