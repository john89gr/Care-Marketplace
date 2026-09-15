import { query, queryOne, bootstrapDb } from './db';
import { findUserByEmail, hashPassword } from './auth';
import {
  GREEK_USERS,
  GREEK_MEDICATIONS,
  GREEK_CONDITIONS,
  GREEK_ALLERGIES,
  GREEK_IMMUNIZATIONS,
  GREEK_MEDICAL_EVENTS,
  GREEK_SYMPTOMS,
  GREEK_SCREENINGS,
  GREEK_CAREGIVERS,
  GREEK_REVIEWS,
  GREEK_PARTNER_PHARMACIES,
  GREEK_WALLET_DOCUMENTS,
} from './greek-health-data';

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const now = () => Date.now();

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';

/**
 * Seeds the comprehensive Greek Healthcare Dataset for Care-Marketplace.
 * 
 * Features:
 * - 16+ Greek users (clients, nurses, physiotherapists, caregivers, pharmacists, admin)
 * - Complete profiles with realistic AMKA (11 digits, DDMMYYNNNNC), AFM (9 digits), Greek addresses
 * - 34 Greek medications with official EOF registration codes and structured instruction sheets
 * - 32 Medical History items: ICD-11 conditions, severe drug allergies, immunizations, surgeries, symptoms
 * - 16 Preventive Screenings following Greek national screening guidelines
 * - 8 Caregivers with Athens GPS coordinates, specialties, completed visits, ratings, and bios
 * - 25 Authentic Greek Reviews with heartfelt testimonials and completed bookings
 * - 7 Partner Pharmacies across Athens (Syntagma, Kolonaki, Kifisia, Glyfada, Piraeus, Marousi) with stock
 * - 10 Gov.gr Health Wallet documents with official Greek government styling SVG/PDF data URLs and KEPA certificates
 * 
 * Idempotent: Can be run multiple times safely without duplications.
 */
export async function seed(): Promise<void> {
  // Ensure tables and column migrations are applied first
  await bootstrapDb();

  // 1. Users & Accounts
  await seedUsers();

  // 2. Profiles
  await seedProfiles();

  // 3. Caregivers Directory
  await seedCaregivers();

  // 4. Medications & Adherence
  await seedMedications();

  // 5. Medical History Register
  await seedHistory();

  // 6. Preventive Screenings
  await seedScreenings();

  // 7. Marketplace Bookings & Reviews
  await seedMarketplace();

  // 8. Partner Pharmacies & Orders
  await seedPharmacyPartners();

  // 9. Gov.gr Health Wallet Documents
  await seedWallet();

  // 10. Provider Vetting & Certifications
  await seedVetting();
  await seedCertifications();

  // 11. Availability & Shifts
  await seedAvailability();

  // 12. Clinical Visits & Escrow
  await seedVisitAndEscrow();

  // 13. Care Plans & PHR Vitals
  await seedCarePlan();

  // 14. Emergency & Care Contacts
  await seedContacts();

  // 15. Consents Ledger
  await seedConsents();

  // 16. Payments & Notifications
  await seedPaymentsDemo();
  await seedNotifications();
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
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await query(
    `INSERT INTO user_accounts (id, display_name, email, password_hash, roles, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, displayName, email, passwordHash, roles, now()]
  );
}

async function seedUsers(): Promise<void> {
  for (const user of GREEK_USERS) {
    await ensureUser(user.email, user.displayName, user.roles, user.id);
  }
  // Extra demo helper users for test invariants
  await ensureUser('expired@example.com', 'Expired Caregiver', ['caregiver'], 'u-expired');
  await ensureUser('pharmacy@example.com', 'Syntagma Central Pharmacy', ['pharmacy'], 'u-pharmacy');
}

async function seedProfiles(): Promise<void> {
  for (const user of GREEK_USERS) {
    await query(
      `INSERT INTO profiles (user_id, phone, amka, afm, licence_number, hourly_rate, address, date_of_birth, sex)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE SET
         phone = EXCLUDED.phone,
         amka = EXCLUDED.amka,
         afm = EXCLUDED.afm,
         licence_number = EXCLUDED.licence_number,
         hourly_rate = EXCLUDED.hourly_rate,
         address = EXCLUDED.address,
         date_of_birth = EXCLUDED.date_of_birth,
         sex = EXCLUDED.sex`,
      [
        user.id,
        user.phone,
        user.amka,
        user.afm,
        user.licenceNumber ?? '',
        user.hourlyRate ?? null,
        user.address,
        user.dateOfBirth,
        user.sex,
      ]
    );
  }
}

async function seedCaregivers(): Promise<void> {
  for (const c of GREEK_CAREGIVERS) {
    const expiresAt = c.id === 'u-nurse' ? now() + 14 * day : now() + 365 * day;
    await query(
      `INSERT INTO caregivers (id, display_name, roles, rating, distance_km, hourly_rate, available_now, specialties, lat, lng, completed_visits, recent_cancellations, expires_at_ms, bio, languages, gender)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         roles = EXCLUDED.roles,
         rating = EXCLUDED.rating,
         distance_km = EXCLUDED.distance_km,
         hourly_rate = EXCLUDED.hourly_rate,
         available_now = EXCLUDED.available_now,
         specialties = EXCLUDED.specialties,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         completed_visits = EXCLUDED.completed_visits,
         recent_cancellations = EXCLUDED.recent_cancellations,
         expires_at_ms = EXCLUDED.expires_at_ms,
         bio = EXCLUDED.bio,
         languages = EXCLUDED.languages,
         gender = EXCLUDED.gender`,
      [
        c.id,
        c.displayName,
        c.roles,
        c.rating,
        c.distanceKm,
        c.hourlyRate,
        c.availableNow,
        c.specialties,
        c.lat,
        c.lng,
        c.completedVisits,
        c.recentCancellations,
        expiresAt,
        c.bio,
        c.languages,
        c.gender,
      ]
    );
  }

  // Preserve u-expired caregiver for filtering test invariants
  await query(
    `INSERT INTO caregivers (id, display_name, roles, rating, distance_km, hourly_rate, available_now, specialties, lat, lng, completed_visits, recent_cancellations, expires_at_ms, bio, languages, gender)
     VALUES ('u-expired', 'Expired Caregiver', '{"caregiver"}', 4.0, 8, 20, TRUE, '{"Companionship"}', 37.98, 23.73, 5, 0, $1, 'Expired licence caregiver for testing auto-filtering.', '{"Greek"}', 'male')
     ON CONFLICT (id) DO NOTHING`,
    [now() - 10 * day]
  );
}

async function seedMedications(): Promise<void> {
  const nowMs = now();

  for (const m of GREEK_MEDICATIONS) {
    const createdAt = nowMs - (m.durationDays ?? 30) * day;
    await query(
      `INSERT INTO medications (id, user_id, name, dose, schedule, critical, prescriber, instructions, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, FALSE, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         dose = EXCLUDED.dose,
         schedule = EXCLUDED.schedule,
         critical = EXCLUDED.critical,
         prescriber = EXCLUDED.prescriber,
         instructions = EXCLUDED.instructions`,
      [
        m.id,
        m.userId,
        m.name,
        m.dose,
        JSON.stringify(m.schedule),
        m.critical,
        m.prescriber,
        JSON.stringify(m.instructions),
        createdAt,
      ]
    );
  }

  // Mark med-1 as taken for today so it doesn't trigger unexpected missed-dose alerts during push tests
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const med1SlotMs = todayStart + 8 * 60 * 60 * 1000; // 08:00 today
  await query(
    `INSERT INTO medication_logs (id, medication_id, user_id, scheduled_for_ms, action, at_ms)
     VALUES ('ml-seed-med1', 'med-1', 'u-client', $1, 'taken', $2)
     ON CONFLICT (medication_id, scheduled_for_ms) DO NOTHING`,
    [med1SlotMs, med1SlotMs + 10 * 60 * 1000]
  );
}

async function seedHistory(): Promise<void> {
  const nowMs = now();
  const yearMs = 365 * day;
  const monthMs = 30 * day;

  for (const cond of GREEK_CONDITIONS) {
    await query(
      `INSERT INTO medical_conditions (id, user_id, name, icd11_code, status, diagnosed_at_ms, resolved_at_ms, notes, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, FALSE, $8)
       ON CONFLICT (id) DO NOTHING`,
      [cond.id, cond.userId, cond.name, cond.icd11Code, cond.status, nowMs - cond.diagnosedAgoYears * yearMs, cond.notes, nowMs]
    );
  }

  for (const all of GREEK_ALLERGIES) {
    await query(
      `INSERT INTO allergies (id, user_id, substance, kind, reaction, severity, confirmed_at_ms, notes, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       ON CONFLICT (id) DO NOTHING`,
      [all.id, all.userId, all.substance, all.kind, all.reaction, all.severity, nowMs - all.confirmedAgoYears * yearMs, all.notes, nowMs]
    );
  }

  for (const imm of GREEK_IMMUNIZATIONS) {
    await query(
      `INSERT INTO immunizations (id, user_id, vaccine, dose_number, administered_at_ms, source, notes, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
       ON CONFLICT (id) DO NOTHING`,
      [imm.id, imm.userId, imm.vaccine, imm.doseNumber, nowMs - imm.administeredAgoMonths * monthMs, imm.source, imm.notes, nowMs]
    );
  }

  for (const ev of GREEK_MEDICAL_EVENTS) {
    await query(
      `INSERT INTO medical_events (id, user_id, kind, name, facility, occurred_at_ms, notes, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
       ON CONFLICT (id) DO NOTHING`,
      [ev.id, ev.userId, ev.kind, ev.name, ev.facility, nowMs - ev.occurredAgoMonths * monthMs, ev.notes, nowMs]
    );
  }

  for (const sym of GREEK_SYMPTOMS) {
    await query(
      `INSERT INTO symptoms (id, user_id, name, severity, onset_at_ms, status, notes, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
       ON CONFLICT (id) DO NOTHING`,
      [sym.id, sym.userId, sym.name, sym.severity, nowMs - sym.onsetAgoDays * day, sym.status, sym.notes, nowMs]
    );
  }

  // Preserve rx-1 for demo client tests
  await query(
    `INSERT INTO prescription_records (id, user_id, drug, dose, instructions, prescriber, issued_at_ms, duration_days, status, pharmacy_prescription_id, medication_id, archived, created_at_ms)
     VALUES ('rx-1', 'u-client', 'Ατορβαστατίνη', '20mg ×1', 'Ένα δισκίο το βράδυ.', 'Δρ. Παπαδόπουλος', $1, 90, 'active', NULL, 'med-2', FALSE, $2)
     ON CONFLICT (id) DO NOTHING`,
    [nowMs - 30 * day, nowMs]
  );

  // Add matching prescription records for Greek medications
  for (const m of GREEK_MEDICATIONS.slice(0, 10)) {
    const rxId = `rx-seed-${m.id}`;
    await query(
      `INSERT INTO prescription_records (id, user_id, drug, dose, instructions, prescriber, issued_at_ms, duration_days, status, pharmacy_prescription_id, medication_id, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NULL, $9, FALSE, $10)
       ON CONFLICT (id) DO NOTHING`,
      [
        rxId,
        m.userId,
        m.name,
        m.dose,
        m.instructions.specialInstructions || m.instructions.warnings[0] || 'Λήψη κατά τις ιατρικές οδηγίες.',
        m.prescriber,
        nowMs - 15 * day,
        m.durationDays ?? 30,
        m.id,
        nowMs,
      ]
    );
  }
}

async function seedScreenings(): Promise<void> {
  const nowMs = now();

  for (const s of GREEK_SCREENINGS) {
    const atMs = nowMs - Math.round(s.atAgoMonths * 30.44 * day);
    await query(
      `INSERT INTO screenings (id, user_id, type, status, at_ms, reason, snooze_until_ms, scheduled_at_ms, snooze_count, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 0, $7)
       ON CONFLICT (id) DO UPDATE SET
         at_ms = EXCLUDED.at_ms,
         reason = EXCLUDED.reason`,
      [s.id, s.userId, s.type, s.status, atMs, s.reason, nowMs]
    );
  }
}

async function seedMarketplace(): Promise<void> {
  const nowMs = now();

  // Completed booking b-1 and review rv-1 required for demo and test suites
  const existingBooking = await queryOne(`SELECT id FROM bookings WHERE id = 'b-1'`);
  if (!existingBooking) {
    await query(
      `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)`,
      ['b-1', 'u-nurse', 'u-client', nowMs - 9 * day, 'Πρωινή ένεση', 4500, nowMs - 10 * day]
    );
  }

  await query(
    `INSERT INTO reviews (id, caregiver_id, booking_id, author_id, author_name, rating, comment, status, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, 5, $6, 'published', $7)
     ON CONFLICT (booking_id) DO NOTHING`,
    ['rv-1', 'u-nurse', 'b-1', 'u-client', 'Maria Papadopoulou', 'Άψογη φροντίδα, πολύ συνεπής.', nowMs - 8 * day]
  );

  // Saved search and favorite for demo client
  await query(
    `INSERT INTO saved_searches (id, user_id, name, filters, created_at_ms)
     VALUES ($1, 'u-client', $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [
      'ss-1',
      '“elena” · nurse',
      JSON.stringify({ query: 'elena', roles: ['nurse'], maxDistanceKm: null, minRating: null, availableNowOnly: false, sort: 'relevance', maxHourlyRate: null }),
      nowMs - 2 * day,
    ]
  );

  await query(
    `INSERT INTO favorites (user_id, caregiver_id, saved_at_ms)
     VALUES ('u-client', 'u-nurse', $1)
     ON CONFLICT (user_id, caregiver_id) DO NOTHING`,
    [nowMs - 2 * day]
  );

  // Requested booking b-2
  const existingRequested = await queryOne(`SELECT id FROM bookings WHERE id = 'b-2'`);
  if (!existingRequested) {
    await query(
      `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, 'requested', $7)`,
      ['b-2', 'u-nikos', 'u-client', nowMs + 2 * day, 'Απογευματινή επίσκεψη', 3000, nowMs - 1 * day]
    );
    await query(
      `INSERT INTO booking_events (id, booking_id, kind, at_ms, by_user_id, by_name, detail)
       VALUES ($1, 'b-2', 'created', $2, 'u-client', 'Maria Papadopoulou', '')
       ON CONFLICT (id) DO NOTHING`,
      [`be-seed-b2-${nowMs}`, nowMs - 1 * day]
    );
  }

  // Seed events for b-1
  const existingEvents = await queryOne(`SELECT id FROM booking_events WHERE booking_id = 'b-1' LIMIT 1`);
  if (!existingEvents) {
    const seedAt = nowMs - 9 * day;
    for (const [kind, at, by, name] of [
      ['created', seedAt - 2 * day, 'u-client', 'Maria Papadopoulou'],
      ['accepted', seedAt - 2 * day + 3600000, 'u-nurse', 'Elena Papadaki'],
      ['started', seedAt, 'u-nurse', 'Elena Papadaki'],
      ['completed', seedAt + 3600000, 'u-nurse', 'Elena Papadaki'],
    ] as const) {
      await query(
        `INSERT INTO booking_events (id, booking_id, kind, at_ms, by_user_id, by_name, detail)
         VALUES ($1, 'b-1', $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [`be-seed-b1-${kind}`, kind, at, by, name, '']
      );
    }
  }

  // Seed all 25 Greek reviews and their corresponding completed bookings & events
  for (const rev of GREEK_REVIEWS) {
    if (rev.bookingId === 'b-1') {
      continue; // b-1 already handled above
    }
    const schedMs = nowMs - rev.agoDays * day;
    await query(
      `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, 3500, 'completed', $6)
       ON CONFLICT (id) DO NOTHING`,
      [rev.bookingId, rev.caregiverId, rev.authorId, schedMs, "Επίσκεψη κατ οίκον φροντίδας", schedMs - 2 * day]
    );

    const hasEv = await queryOne(`SELECT id FROM booking_events WHERE booking_id = $1 LIMIT 1`, [rev.bookingId]);
    if (!hasEv) {
      for (const [kind, offset] of [
        ['created', -2 * day],
        ['accepted', -2 * day + 3600000],
        ['started', 0],
        ['completed', 3600000],
      ] as const) {
        await query(
          `INSERT INTO booking_events (id, booking_id, kind, at_ms, by_user_id, by_name, detail)
           VALUES ($1, $2, $3, $4, $5, $6, '')
           ON CONFLICT (id) DO NOTHING`,
          [`be-${rev.bookingId}-${kind}`, rev.bookingId, kind, schedMs + offset, rev.authorId, rev.authorName]
        );
      }
    }

    await query(
      `INSERT INTO reviews (id, caregiver_id, booking_id, author_id, author_name, rating, comment, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (booking_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         comment = EXCLUDED.comment,
         status = EXCLUDED.status`,
      [
        rev.id,
        rev.caregiverId,
        rev.bookingId,
        rev.authorId,
        rev.authorName,
        rev.rating,
        rev.comment,
        rev.status,
        schedMs + 4000000,
      ]
    );
  }
}

async function seedPharmacyPartners(): Promise<void> {
  const nowMs = now();

  for (const ph of GREEK_PARTNER_PHARMACIES) {
    const phUserId = ph.id === 'ph-1' ? 'u-pharmacy' : '';
    await query(
      `INSERT INTO partner_pharmacies (id, name, address, lat, lng, in_stock, user_id, phone, working_hours, stock_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         in_stock = EXCLUDED.in_stock,
         user_id = EXCLUDED.user_id,
         phone = EXCLUDED.phone,
         working_hours = EXCLUDED.working_hours,
         stock_items = EXCLUDED.stock_items`,
      [
        ph.id,
        ph.name,
        ph.address,
        ph.lat,
        ph.lng,
        ph.inStock,
        phUserId,
        ph.phone,
        ph.workingHours,
        JSON.stringify(ph.stockItems),
      ]
    );
  }

  // Delivered pharmacy order po-1
  const at = nowMs - 3 * day;
  await query(
    `INSERT INTO pharmacy_orders
       (id, prescription_id, client_id, pharmacy_id, pharmacy_name, meds, prescriber, status, delivery_address, timeline, created_at_ms, updated_at_ms)
     VALUES ($1, $2, 'u-client', 'ph-1', 'Φαρμακείο Συντάγματος', $3, $4, 'delivered', $5, $6, $7, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      'po-1',
      'rx-seed-1',
      JSON.stringify([{ name: 'Ατορβαστατίνη', dose: '20mg ×1', qty: 1 }]),
      'Δρ. Παπαδόπουλος',
      'Λεωφ. Αλεξάνδρας 10, Αθήνα',
      JSON.stringify([
        { status: 'uploaded', atMs: at },
        { status: 'routed', atMs: at, note: 'Routed to Φαρμακείο Συντάγματος.' },
        { status: 'accepted', atMs: at },
        { status: 'preparing', atMs: at },
        { status: 'out_for_delivery', atMs: at },
        { status: 'delivered', atMs: at },
      ]),
      at,
    ]
  );
}

async function seedWallet(): Promise<void> {
  const nowMs = now();

  for (const doc of GREEK_WALLET_DOCUMENTS) {
    const issuedAt = nowMs - doc.issuedAgoDays * day;
    const expiresAt = doc.expiresInDays ? nowMs + doc.expiresInDays * day : null;
    await query(
      `INSERT INTO wallet_documents
         (id, user_id, category, title, issuer, issued_at_ms, expires_at_ms, doc_type, data_url, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         category = EXCLUDED.category,
         title = EXCLUDED.title,
         issuer = EXCLUDED.issuer,
         issued_at_ms = EXCLUDED.issued_at_ms,
         expires_at_ms = EXCLUDED.expires_at_ms,
         doc_type = EXCLUDED.doc_type,
         data_url = EXCLUDED.data_url,
         verified = EXCLUDED.verified`,
      [
        doc.id,
        doc.userId,
        doc.category,
        doc.title,
        doc.issuer,
        issuedAt,
        expiresAt,
        doc.docType,
        doc.dataUrl,
        doc.verified,
      ]
    );
  }
}

async function seedCertifications(): Promise<void> {
  const nowMs = now();

  // u-nurse licence expires in 14 days (asserted by push.spec.ts)
  await query(
    `INSERT INTO certifications (id, provider_id, name, licence_number, expires_at_ms, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET expires_at_ms = EXCLUDED.expires_at_ms`,
    ['cert-nurse-1', 'u-nurse', 'Registered Nurse Licence', 'ΝΟΣ-2024-Α123', nowMs + 14 * day, nowMs]
  );

  // Certifications for other providers
  const certs = [
    { id: 'cert-karras-1', providerId: 'u-nurse-karras', name: 'Άδεια Ασκήσεως Επαγγέλματος Νοσηλευτή', licence: 'ΝΟΣ-2022-Β456', expiresInDays: 180 },
    { id: 'cert-vasilis-1', providerId: 'u-nurse-vasilis', name: 'Άδεια Ασκήσεως Επαγγέλματος Νοσηλευτή', licence: 'ΝΟΣ-2023-Γ789', expiresInDays: 240 },
    { id: 'cert-physio-1', providerId: 'u-physio', name: 'Άδεια Ασκήσεως Επαγγέλματος Φυσικοθεραπευτή', licence: 'ΦΘ-2023-Β456', expiresInDays: 300 },
    { id: 'cert-vlachos-1', providerId: 'u-physio-dimitris', name: 'Άδεια Ασκήσεως Επαγγέλματος Φυσικοθεραπευτή', licence: 'ΦΘ-2021-Α112', expiresInDays: 150 },
  ];

  for (const c of certs) {
    await query(
      `INSERT INTO certifications (id, provider_id, name, licence_number, expires_at_ms, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET expires_at_ms = EXCLUDED.expires_at_ms`,
      [c.id, c.providerId, c.name, c.licence, nowMs + c.expiresInDays * day, nowMs]
    );
  }
}

async function seedVetting(): Promise<void> {
  const nowMs = now();

  const submissions = [
    { id: 'v-1', providerId: 'u-nurse', name: 'Elena Papadaki', licence: 'ΝΟΣ-2024-Α123', specs: ['Injections', 'Wound care'], status: 'pending' },
    { id: 'v-2', providerId: 'u-nurse-karras', name: 'Eleni Karras', licence: 'ΝΟΣ-2022-Β456', specs: ['Διαβητικό πόδι', 'Ενδοφλέβια θεραπεία'], status: 'approved' },
    { id: 'v-3', providerId: 'u-nurse-vasilis', name: 'Vasilis Christopoulos', licence: 'ΝΟΣ-2023-Γ789', specs: ['Τραυματιολογία', 'Περιποίηση τραυμάτων'], status: 'approved' },
    { id: 'v-4', providerId: 'u-physio', name: 'Anna Karakosta', licence: 'ΦΘ-2023-Β456', specs: ['Ορθοπεδική αποκατάσταση', 'Κινησιοθεραπεία'], status: 'approved' },
    { id: 'v-5', providerId: 'u-physio-dimitris', name: 'Dimitris Vlachos', licence: 'ΦΘ-2021-Α112', specs: ['Νευρολογική αποκατάσταση (Bobath)'], status: 'approved' },
  ];

  for (const sub of submissions) {
    await query(
      `INSERT INTO vetting_submissions
       (id, provider_id, provider_name, licence_number, specialties, status, submitted_at_ms, reviewed_at_ms, reviewed_by, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '')
       ON CONFLICT (id) DO NOTHING`,
      [
        sub.id,
        sub.providerId,
        sub.name,
        sub.licence,
        sub.specs,
        sub.status,
        nowMs - 14 * day,
        sub.status === 'approved' ? nowMs - 10 * day : null,
        sub.status === 'approved' ? 'u-admin' : null,
      ]
    );
  }
}

async function seedAvailability(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM availability WHERE id = 'a-1'`);
  if (!existing) {
    await query(
      `INSERT INTO availability (id, provider_id, weekday, start_minutes, end_minutes, on_demand)
       VALUES
         ('a-1', 'u-nurse', 0, 8 * 60, 12 * 60, true),
         ('a-2', 'u-nurse', 2, 12 * 60, 17 * 60, true),
         ('a-3', 'u-physio', 1, 9 * 60, 15 * 60, true),
         ('a-4', 'u-physio', 3, 9 * 60, 15 * 60, true),
         ('a-5', 'u-nikos', 0, 8 * 60, 16 * 60, false),
         ('a-6', 'u-nikos', 4, 8 * 60, 16 * 60, false)
       ON CONFLICT (id) DO NOTHING`
    );
  }

  const existingShift = await queryOne(`SELECT id FROM shifts WHERE id = 's-1'`);
  if (!existingShift) {
    await query(
      `INSERT INTO shifts (id, provider_id, client_id, client_name, act, scheduled_at_ms, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['s-1', 'u-nurse', 'u-client', 'Maria Papadopoulou', 'Injection', now() + hour, 45, 'confirmed']
    );
  }
}

async function seedVisitAndEscrow(): Promise<void> {
  const existing = await queryOne(`SELECT id FROM visits WHERE id = 'visit-1'`);
  if (!existing) {
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
  }

  await query(
    `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     ON CONFLICT (id) DO NOTHING`,
    ['e-1', 'b-1', 'u-nurse', 'u-client', 4500, 'held', now() - 3 * day]
  );
}

async function seedCarePlan(): Promise<void> {
  const nowMs = now();

  const existing = await queryOne(`SELECT id FROM care_plans WHERE id = 'cp-1'`);
  if (!existing) {
    await query(
      `INSERT INTO care_plans (id, client_id, client_name, updated_at_ms, updated_by)
       VALUES ('cp-1', 'u-client', 'Maria Papadopoulou', $1, 'Elena Papadaki')`,
      [nowMs - 2 * day]
    );
    await query(
      `INSERT INTO care_plan_goals (id, plan_id, text, status)
       VALUES ('g-1', 'cp-1', 'Mobilise shoulder daily', 'in-progress'),
              ('g-2', 'cp-1', 'Stabilise blood pressure', 'open')`
    );
    await query(
      `INSERT INTO care_plan_notes (id, plan_id, author_id, author_name, author_role, text, at_ms)
       VALUES ('n-1', 'cp-1', 'u-nurse', 'Elena Papadaki', 'nurse', 'BP stable at 125/80, continue monitoring.', $1)`,
      [nowMs - 2 * day]
    );
  }

  // Care plan for Giorgos Dimitriadis (cardiac care)
  const existingCp2 = await queryOne(`SELECT id FROM care_plans WHERE id = 'cp-2'`);
  if (!existingCp2) {
    await query(
      `INSERT INTO care_plans (id, client_id, client_name, updated_at_ms, updated_by)
       VALUES ('cp-2', 'u-giorgos', 'Giorgos Dimitriadis', $1, 'Elena Papadaki')`,
      [nowMs - 5 * day]
    );
    await query(
      `INSERT INTO care_plan_goals (id, plan_id, text, status)
       VALUES ('g-3', 'cp-2', 'Έλεγχος INR κάθε 30 ημέρες (στόχος 2.0-3.0)', 'in-progress'),
              ('g-4', 'cp-2', 'Καθημερινό περπάτημα 30 λεπτά σε επίπεδο έδαφος', 'open')`
    );
    await query(
      `INSERT INTO care_plan_notes (id, plan_id, author_id, author_name, author_role, text, at_ms)
       VALUES ('n-2', 'cp-2', 'u-nurse', 'Elena Papadaki', 'nurse', 'Τελευταία μέτρηση INR: 2.4. Αγωγή Sintrom σταθερή.', $1)`,
      [nowMs - 5 * day]
    );
  }

  // Vitals for clients
  await query(
    `INSERT INTO vitals (id, user_id, type, value, value2, measured_at_ms, source)
     VALUES
       ('vt-1', 'u-client', 'bloodPressure', 132, 86, $1, 'manual'),
       ('vt-2', 'u-client', 'heartRate', 74, NULL, $1, 'manual'),
       ('vt-3', 'u-client', 'spo2', 98, NULL, $2, 'manual'),
       ('vt-4', 'u-giorgos', 'bloodPressure', 128, 80, $1, 'manual'),
       ('vt-5', 'u-giorgos', 'heartRate', 68, NULL, $1, 'manual'),
       ('vt-6', 'u-giannis', 'spo2', 95, NULL, $1, 'manual'),
       ('vt-7', 'u-sofia', 'bloodPressure', 120, 78, $1, 'manual')
     ON CONFLICT (id) DO NOTHING`,
    [nowMs - 26 * hour, nowMs - 25 * hour]
  );
}

async function seedConsents(): Promise<void> {
  const clients = ['u-client', 'u-giorgos', 'u-sofia', 'u-giannis', 'u-aikaterini'];
  for (const clientId of clients) {
    await query(
      `INSERT INTO user_consents (user_id, consents, current_document_version, updated_at_ms)
       VALUES ($1, $2, 'v1.0', $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        clientId,
        JSON.stringify([
          { purpose: 'family_sharing', granted: true, documentVersion: 'v1.0', updatedAtMs: now() - 5 * day, updatedBy: clientId },
          { purpose: 'sms_reminders', granted: false, documentVersion: 'v1.0', updatedAtMs: now() - 5 * day, updatedBy: clientId },
          { purpose: 'bluetooth', granted: false, documentVersion: 'v1.0', updatedAtMs: now() - 5 * day, updatedBy: clientId },
          { purpose: 'data_export', granted: true, documentVersion: 'v1.0', updatedAtMs: now() - 5 * day, updatedBy: clientId },
        ]),
        now(),
      ]
    );
  }
}

async function seedContacts(): Promise<void> {
  const nowMs = now();
  const yearMs = 365 * day;

  // Contacts for demo client (preserving IDs for tests)
  const clientContacts: [string, string, string, string, string, string, boolean, number][] = [
    ['contact-ice-1', 'u-client', 'emergency', 'Γιώργος Παπαδόπουλος', 'Σύζυγος', '6970000001', true, 10],
    ['contact-ice-2', 'u-client', 'emergency', 'Ελένη Παπαδοπούλου', 'Κόρη', '6970000002', false, 5],
    ['contact-care-1', 'u-client', 'care', 'Δρ. Παπαδόπουλος', 'doctor', '2100000000', true, 10],
    ['contact-care-2', 'u-client', 'care', 'Φαρμακείο Συντάγματος', 'pharmacy', '2100000001', false, 0],

    // Contacts for Giorgos Dimitriadis
    ['contact-ice-giorgos-1', 'u-giorgos', 'emergency', 'Ελένη Δημητριάδη', 'Σύζυγος', '6971234501', true, 10],
    ['contact-ice-giorgos-2', 'u-giorgos', 'emergency', 'Κωνσταντίνος Δημητριάδης', 'Υιός', '6971234502', false, 5],
    ['contact-care-giorgos-1', 'u-giorgos', 'care', 'Δρ. Δημήτριος Σταύρου', 'doctor', '2106811223', true, 10],
    ['contact-care-giorgos-2', 'u-giorgos', 'care', 'Φαρμακείο Αμαρουσίου', 'pharmacy', '2106123400', false, 0],

    // Contacts for Sofia Oikonomou
    ['contact-ice-sofia-1', 'u-sofia', 'emergency', 'Νικόλαος Οικονόμου', 'Σύζυγος', '6972345601', true, 10],
    ['contact-care-sofia-1', 'u-sofia', 'care', 'Δρ. Ευάγγελος Μανώλης', 'doctor', '2104123456', true, 10],
    ['contact-care-sofia-2', 'u-sofia', 'care', 'Φαρμακείο Πειραιά', 'pharmacy', '2104178900', false, 0],

    // Contacts for Giannis Karagiannis
    ['contact-ice-giannis-1', 'u-giannis', 'emergency', 'Αικατερίνη Καραγιάννη', 'Σύζυγος', '6973456701', true, 10],
    ['contact-care-giannis-1', 'u-giannis', 'care', 'Δρ. Κωνσταντίνος Λάμπρου', 'doctor', '2108012345', true, 10],
    ['contact-care-giannis-2', 'u-giannis', 'care', 'Φαρμακείο Κηφισιάς', 'pharmacy', '2108080120', false, 0],

    // Contacts for Aikaterini Alexiou
    ['contact-ice-aikat-1', 'u-aikaterini', 'emergency', 'Σπύρος Αλεξίου', 'Υιός', '6974567801', true, 10],
    ['contact-care-aikat-1', 'u-aikaterini', 'care', 'Δρ. Μιχαήλ Παυλίδης', 'doctor', '2108941234', true, 10],
    ['contact-care-aikat-2', 'u-aikaterini', 'care', 'Φαρμακείο Γλυφάδας', 'pharmacy', '2108945600', false, 0],
  ];

  for (const [rowId, userId, kind, name, relationship, phone, isPrimary, priority] of clientContacts) {
    await query(
      `INSERT INTO medical_contacts
       (id, user_id, kind, name, relationship, phone, is_primary, priority, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       ON CONFLICT (id) DO NOTHING`,
      [rowId, userId, kind, name, relationship, phone, isPrimary, priority, nowMs - yearMs]
    );
  }
}

async function seedPaymentsDemo(): Promise<void> {
  const nowMs = now();

  const existingMethod = await queryOne(`SELECT id FROM payment_methods WHERE id = 'pm-seed-1'`);
  if (!existingMethod) {
    await query(
      `INSERT INTO payment_methods (id, user_id, token, brand, last4, expiry_month, expiry_year, is_default, created_at_ms)
       VALUES ('pm-seed-1', 'u-client', 'tok_seedvisa0001', 'visa', '4242', 12, 2028, TRUE, $1)`,
      [nowMs - 60 * day]
    );
  }

  // Payout accounts for providers
  const providers = [
    { userId: 'u-nurse', accountId: 'acct_seednurse01', last4: '7339' },
    { userId: 'u-physio', accountId: 'acct_seedphysio01', last4: '4182' },
    { userId: 'u-nikos', accountId: 'acct_seednikos01', last4: '9921' },
    { userId: 'u-nurse-karras', accountId: 'acct_seedkarras01', last4: '5512' },
    { userId: 'u-physio-dimitris', accountId: 'acct_seedvlachos01', last4: '8834' },
  ];

  for (const p of providers) {
    await query(
      `INSERT INTO payout_accounts (user_id, status, account_id, account_last4, currency, balance_cents, country, payout_schedule, onboarding_url, updated_at_ms)
       VALUES ($1, 'active', $2, $3, 'EUR', 0, 'GR', 'weekly', NULL, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [p.userId, p.accountId, p.last4, nowMs - 30 * day]
    );
  }
}

async function seedNotifications(): Promise<void> {
  const existing = await queryOne(
    `SELECT id FROM notifications WHERE user_id = 'u-client' AND kind = 'booking.accepted' LIMIT 1`
  );
  if (!existing) {
    await query(
      `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at_ms, read_at_ms)
       VALUES ('nt-seed-1', 'u-client', 'booking.accepted', 'Booking accepted', 'Elena Papadaki accepted your visit request.', '/bookings', $1, NULL)`,
      [now() - 8 * day]
    );
  }
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