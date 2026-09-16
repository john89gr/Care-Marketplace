-- CareMarketplace schema (PLAN.md §3/§4 — health-data model aligned with
-- FHIR Observation / CarePlan / MedicationRequest shapes).
-- Executed idempotently at server boot (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS user_accounts (
  id          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  roles       TEXT[] NOT NULL DEFAULT '{client}',
  created_at_ms BIGINT NOT NULL
);

-- Revocable refresh-token sessions (PLAN.md §1 Security & Auth).
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  refresh_hash  TEXT NOT NULL UNIQUE,
  created_at_ms BIGINT NOT NULL,
  expires_at_ms BIGINT NOT NULL,
  revoked_at_ms BIGINT
);

-- Marketplace search index (rating/geo/availability per planner).
CREATE TABLE IF NOT EXISTS caregivers (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  roles         TEXT[] NOT NULL,
  rating        DOUBLE PRECISION NOT NULL,
  distance_km   DOUBLE PRECISION NOT NULL,
  hourly_rate   DOUBLE PRECISION NOT NULL,
  available_now BOOLEAN NOT NULL,
  specialties   TEXT[] NOT NULL DEFAULT '{}',
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  completed_visits INTEGER NOT NULL DEFAULT 0,
  recent_cancellations INTEGER NOT NULL DEFAULT 0,
  expires_at_ms BIGINT,
  bio           TEXT NOT NULL DEFAULT '',
  languages     TEXT[] NOT NULL DEFAULT '{"Greek"}',
  gender        TEXT NOT NULL DEFAULT ''
);

ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS completed_visits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS recent_cancellations INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS expires_at_ms BIGINT;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{"Greek"}';
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';

-- Role-aware profile (AMKA/AFM for clients, licence/hourly rate for providers).
CREATE TABLE IF NOT EXISTS profiles (
  user_id        TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  phone          TEXT NOT NULL DEFAULT '',
  amka           TEXT NOT NULL DEFAULT '',
  afm            TEXT NOT NULL DEFAULT '',
  licence_number TEXT NOT NULL DEFAULT '',
  hourly_rate    DOUBLE PRECISION,
  address        TEXT NOT NULL DEFAULT ''
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

-- Licence vetting (Phase 2): provider submits, admin approves/rejects.
CREATE TABLE IF NOT EXISTS vetting_submissions (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  provider_name  TEXT NOT NULL,
  licence_number TEXT NOT NULL,
  specialties    TEXT[] NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  submitted_at_ms BIGINT NOT NULL,
  reviewed_at_ms BIGINT,
  reviewed_by    TEXT,
  note           TEXT NOT NULL DEFAULT ''
);

-- Weekly availability grid (Phase 2 — shift calendar).
CREATE TABLE IF NOT EXISTS availability (
  id            TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  weekday       INTEGER NOT NULL, -- 0 = Monday … 6 = Sunday
  start_minutes INTEGER NOT NULL,
  end_minutes   INTEGER NOT NULL,
  on_demand     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS shifts (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  client_name     TEXT NOT NULL,
  act             TEXT NOT NULL,
  scheduled_at_ms BIGINT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'requested' -- requested | confirmed | completed | cancelled
);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  caregiver_id   TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  scheduled_at_ms BIGINT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  amount_cents   INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'requested', -- requested | accepted | in_progress | completed | cancelled | disputed (FEATURE_PLAN.md §3)
  created_at_ms  BIGINT NOT NULL
);

-- Booking lifecycle status for existing databases (idempotent).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'requested';

-- Dual-confirmation reschedule proposal (JSON) for existing databases.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pending_reschedule JSONB;

-- Booking event timeline (§3): every transition appends one row.
CREATE TABLE IF NOT EXISTS booking_events (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  kind          TEXT NOT NULL, -- created | accepted | started | completed | cancelled | rescheduled | disputed
  at_ms         BIGINT NOT NULL,
  by_user_id    TEXT NOT NULL,
  by_name       TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_booking_events_booking ON booking_events(booking_id);

-- Visits with GPS stamps (Phase 2 — check-in/out).
CREATE TABLE IF NOT EXISTS visits (
  id             TEXT PRIMARY KEY,
  shift_id       TEXT NOT NULL DEFAULT '',
  booking_id     TEXT NOT NULL,
  provider_id    TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  client_name    TEXT NOT NULL,
  provider_name  TEXT NOT NULL,
  act            TEXT NOT NULL,
  scheduled_at_ms BIGINT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | in-progress | completed | cancelled
  check_in       JSONB,
  check_out      JSONB
);

-- Escrow ledger (Phase 2 — payments): hold → release on completed visit.
CREATE TABLE IF NOT EXISTS escrow (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'held', -- held | released | refunded | frozen
  created_at_ms BIGINT NOT NULL,
  settled_at_ms BIGINT
);
-- Partial-refund accounting for existing databases (idempotent).
ALTER TABLE escrow ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0;

-- Payment methods (§13): token + display metadata only — the PAN is
-- never sent here (the tokenize route rejects cardNumber outright).
CREATE TABLE IF NOT EXISTS payment_methods (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  token         TEXT NOT NULL,
  brand         TEXT NOT NULL,
  last4         TEXT NOT NULL,
  expiry_month  INTEGER NOT NULL,
  expiry_year   INTEGER NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- Provider payout accounts (§13): one row per provider (PUT upsert).
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id         TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'not_started', -- not_started | pending | active
  account_id      TEXT,
  account_last4   TEXT,
  currency        TEXT NOT NULL DEFAULT 'EUR',
  balance_cents   INTEGER NOT NULL DEFAULT 0,
  country         TEXT,
  payout_schedule TEXT NOT NULL DEFAULT 'weekly', -- weekly | manual
  onboarding_url  TEXT,
  updated_at_ms   BIGINT NOT NULL
);

-- e-Prescriptions & pharmacy orders (§9).
CREATE TABLE IF NOT EXISTS prescriptions_scanned (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  barcode_payload TEXT NOT NULL DEFAULT '',
  meds            JSONB NOT NULL,
  prescriber      TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL DEFAULT 'parsed', -- parsed | confirmed | failed
  created_at_ms   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_scanned_user ON prescriptions_scanned(user_id);

CREATE TABLE IF NOT EXISTS pharmacy_orders (
  id               TEXT PRIMARY KEY,
  prescription_id  TEXT NOT NULL,
  client_id        TEXT NOT NULL,
  pharmacy_id      TEXT,
  pharmacy_name    TEXT,
  meds             JSONB NOT NULL,
  prescriber       TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'uploaded', -- uploaded | routed | accepted | preparing | out_for_delivery | delivered | failed
  delivery_address TEXT NOT NULL DEFAULT '',
  timeline         JSONB NOT NULL,
  created_at_ms    BIGINT NOT NULL,
  updated_at_ms    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_orders_client ON pharmacy_orders(client_id);
ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS origin JSONB;

-- Partner pharmacies for scan auto-routing (nearest in-stock wins).
CREATE TABLE IF NOT EXISTS partner_pharmacies (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lat     DOUBLE PRECISION NOT NULL,
  lng     DOUBLE PRECISION NOT NULL,
  in_stock BOOLEAN NOT NULL DEFAULT TRUE,
  phone   TEXT NOT NULL DEFAULT '',
  working_hours TEXT NOT NULL DEFAULT '',
  stock_items JSONB NOT NULL DEFAULT '[]',
  user_id TEXT
);
ALTER TABLE partner_pharmacies ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_pharmacies ADD COLUMN IF NOT EXISTS working_hours TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_pharmacies ADD COLUMN IF NOT EXISTS stock_items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE partner_pharmacies ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Gov.gr health wallet documents (§15): per-user verified records.
CREATE TABLE IF NOT EXISTS wallet_documents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  category      TEXT NOT NULL, -- vaccinations | prescriptions | exams | kepa_certificates
  title         TEXT NOT NULL,
  issuer        TEXT NOT NULL DEFAULT '',
  issued_at_ms  BIGINT NOT NULL,
  expires_at_ms BIGINT,
  doc_type      TEXT NOT NULL DEFAULT 'pdf', -- pdf | image
  data_url      TEXT NOT NULL DEFAULT '',
  verified      BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE wallet_documents ADD COLUMN IF NOT EXISTS signature_metadata JSONB;
CREATE INDEX IF NOT EXISTS idx_wallet_documents_user ON wallet_documents(user_id);

-- Chat messages (Phase 1 + real-time). conversationId = peer user id pair key.
CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  text            TEXT NOT NULL,
  sent_at_ms      BIGINT NOT NULL,
  attachment      JSONB,
  delivered_at_ms BIGINT,
  read_at_ms      BIGINT,
  reactions       JSONB NOT NULL DEFAULT '{}',
  booking_id      TEXT
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachment JSONB;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delivered_at_ms BIGINT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS read_at_ms BIGINT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS booking_id TEXT;
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id);

-- Clinical log with digital signature (Phase 2).
CREATE TABLE IF NOT EXISTS clinical_log (
  id                TEXT PRIMARY KEY,
  visit_id          TEXT NOT NULL,
  author_id         TEXT NOT NULL,
  author_name       TEXT NOT NULL,
  specialty         TEXT NOT NULL, -- nurse | physio
  observations      TEXT NOT NULL,
  vitals            JSONB,
  rehab             JSONB,
  signature_data_url TEXT,
  signed_at_ms      BIGINT
);

-- Shared care plan (Phase 2 — nurse ↔ physio cross-updates).
CREATE TABLE IF NOT EXISTS care_plans (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL,
  client_name   TEXT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  updated_by    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS care_plan_goals (
  id      TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  text    TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'open' -- open | in-progress | done
);

CREATE TABLE IF NOT EXISTS care_plan_notes (
  id          TEXT PRIMARY KEY,
  plan_id     TEXT NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  text        TEXT NOT NULL,
  at_ms       BIGINT NOT NULL
);

-- PWA push subscriptions (FEATURE_PLAN.md §20 subtask 7): one per user.
-- The VAPID keys live server-side (env); endpoint/keys here let the server
-- send Web Push to the browser's push service.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id       TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);

-- Provider licence/certificate expiry (FEATURE_PLAN.md §14/§20): one row per
-- certificate; expiry drives certification.expiring / certification.expired
-- Web Push reminders to the provider.
CREATE TABLE IF NOT EXISTS certifications (
  id             TEXT PRIMARY KEY,
  provider_id    TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  licence_number TEXT NOT NULL DEFAULT '',
  expires_at_ms  BIGINT NOT NULL,
  created_at_ms  BIGINT NOT NULL
);

-- Once-only expiry notices per (certificate, kind): a renewed certificate gets
-- a new id, so a fresh expiring/expired push can fire for it.
CREATE TABLE IF NOT EXISTS certification_notices (
  cert_id        TEXT NOT NULL REFERENCES certifications(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL, -- expiring | expired
  notified_at_ms BIGINT NOT NULL,
  PRIMARY KEY (cert_id, kind)
);

-- Preventive-care screenings (FEATURE_PLAN.md §6): one record per type
-- (done/waived + snooze/schedule state), mirroring the demo contract.
CREATE TABLE IF NOT EXISTS screenings (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  status           TEXT NOT NULL, -- done | waived
  at_ms            BIGINT NOT NULL,
  reason           TEXT NOT NULL DEFAULT '',
  snooze_until_ms  BIGINT,
  scheduled_at_ms  BIGINT,
  snooze_count     INTEGER NOT NULL DEFAULT 0,
  created_at_ms    BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_screenings_user_type ON screenings(user_id, type);

-- Once-only screening.due push per (user, type, due-at): a done record moves
-- the due date forward, so the next due cycle can notify again.
CREATE TABLE IF NOT EXISTS screening_notices (
  user_id        TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  due_at_ms      BIGINT NOT NULL, -- 0 when the rule applies with no record
  notified_at_ms BIGINT NOT NULL,
  PRIMARY KEY (user_id, type, due_at_ms)
);

-- Client screening profile (age/sex drives the §6 rule engine).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT '';

-- Medical history register (FEATURE_PLAN.md §21 + extension): conditions
-- (ICD-11 coded), allergies, immunizations, medical events, symptoms and a
-- prescriptions register. All rows are soft-archived (`archived`) so history
-- is never hard-deleted (audit-friendly, mirrors the §7 medication archive).
CREATE TABLE IF NOT EXISTS medical_conditions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  icd11_code      TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active', -- active | chronic | resolved
  diagnosed_at_ms BIGINT NOT NULL,
  resolved_at_ms  BIGINT,
  notes           TEXT NOT NULL DEFAULT '',
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conditions_user ON medical_conditions(user_id);

CREATE TABLE IF NOT EXISTS allergies (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  substance       TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'drug', -- drug | food | environmental
  reaction        TEXT NOT NULL DEFAULT '',
  severity        TEXT NOT NULL DEFAULT 'moderate', -- mild | moderate | severe
  confirmed_at_ms BIGINT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  archived        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_allergies_user ON allergies(user_id);

CREATE TABLE IF NOT EXISTS immunizations (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  vaccine          TEXT NOT NULL,
  dose_number      INTEGER,
  administered_at_ms BIGINT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'manual', -- manual | wallet
  notes            TEXT NOT NULL DEFAULT '',
  archived         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms    BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_immunizations_user ON immunizations(user_id);

CREATE TABLE IF NOT EXISTS medical_events (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'other', -- procedure | hospitalization | surgery | other
  name           TEXT NOT NULL,
  facility       TEXT NOT NULL DEFAULT '',
  occurred_at_ms BIGINT NOT NULL,
  notes          TEXT NOT NULL DEFAULT '',
  archived       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_medical_events_user ON medical_events(user_id);

CREATE TABLE IF NOT EXISTS symptoms (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'moderate', -- mild | moderate | severe
  onset_at_ms   BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ongoing', -- ongoing | resolved
  notes         TEXT NOT NULL DEFAULT '',
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_symptoms_user ON symptoms(user_id);

-- Prescriptions register: the lasting record behind a scanned e-prescription
-- (§9) or a manually entered one; `medication_id` links to the §7 medication
-- created by the register (POST /me/prescriptions/:id/to-medication).
CREATE TABLE IF NOT EXISTS prescription_records (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  drug                     TEXT NOT NULL,
  dose                     TEXT NOT NULL DEFAULT '',
  instructions             TEXT NOT NULL DEFAULT '',
  prescriber               TEXT NOT NULL DEFAULT '',
  issued_at_ms             BIGINT NOT NULL,
  duration_days            INTEGER,
  status                   TEXT NOT NULL DEFAULT 'active', -- active | completed | cancelled
  pharmacy_prescription_id TEXT,
  medication_id            TEXT,
  archived                 BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms            BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prescription_records_user ON prescription_records(user_id);

-- Contact phone manager: ICE (emergency) + care-team contacts per user.
-- At most one `is_primary` per (user_id, kind) is enforced on write in
-- server/src/contacts.ts; rows are soft-archived, never hard-deleted.
CREATE TABLE IF NOT EXISTS medical_contacts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'emergency', -- emergency | care
  name          TEXT NOT NULL,
  relationship  TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL,
  alt_phone     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  priority      INTEGER NOT NULL DEFAULT 0,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_medical_contacts_user ON medical_contacts(user_id);

-- Versioned consent ledger (FEATURE_PLAN.md §16 subtask 6). One JSONB
-- document per user holding per-purpose ConsentRecord[] ({purpose, granted,
-- documentVersion, updatedAtMs, updatedBy}) matching the frontend contract.
-- `family_sharing` gates caregiver/nurse reads of another user's health data
-- (enforced server-side in history.ts, §21 subtask 16).
CREATE TABLE IF NOT EXISTS user_consents (
  user_id                  TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  consents                 JSONB NOT NULL DEFAULT '[]',
  current_document_version TEXT NOT NULL DEFAULT 'v1.0',
  updated_at_ms            BIGINT NOT NULL
);

-- Medication calendar + adherence (FEATURE_PLAN.md §7). Schedule is the
-- frontend MedicationSchedule JSON ({kind, timesMinutes|everyDays|weekdays}).
CREATE TABLE IF NOT EXISTS medications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  dose          TEXT NOT NULL DEFAULT '',
  schedule      JSONB NOT NULL,
  critical      BOOLEAN NOT NULL DEFAULT FALSE,
  prescriber    TEXT NOT NULL DEFAULT '',
  -- Medicine instructions manager: structured "how to take it" sheet.
  instructions  JSONB,
  -- §21 prescription that created this medication, when bridged.
  prescription_id TEXT,
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms BIGINT NOT NULL
);

-- Existing databases (idempotent migrations for the instruction columns).
ALTER TABLE medications ADD COLUMN IF NOT EXISTS instructions JSONB;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS prescription_id TEXT;

-- One log per dose slot (taken by the user, or auto-inserted missed by the
-- server's missed-dose detection). Unique per (medication, slot) so a dose is
-- alerted/recorded exactly once.
CREATE TABLE IF NOT EXISTS medication_logs (
  id               TEXT PRIMARY KEY,
  medication_id    TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  scheduled_for_ms BIGINT NOT NULL,
  action           TEXT NOT NULL DEFAULT 'taken', -- taken | missed
  at_ms            BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_medication_logs_slot
  ON medication_logs(medication_id, scheduled_for_ms);

-- Dispute resolution (FEATURE_PLAN.md §17).
CREATE TABLE IF NOT EXISTS disputes (
  id            TEXT PRIMARY KEY,
  booking_id    TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  opened_by     TEXT NOT NULL,
  reason        TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  state         TEXT NOT NULL DEFAULT 'open', -- open | under_review | resolved_client | resolved_provider | rejected
  resolution    TEXT,
  refund_cents  INTEGER,
  escrow_transaction_id TEXT,
  evidence      JSONB NOT NULL DEFAULT '[]',
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS refund_cents INTEGER;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS escrow_transaction_id TEXT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_disputes_client ON disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_disputes_provider ON disputes(provider_id);

-- PHR vitals (Phase 3).
CREATE TABLE IF NOT EXISTS vitals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL, -- bloodPressure | glucose | spo2 | weight | temperature | heartRate
  value         DOUBLE PRECISION NOT NULL,
  value2        DOUBLE PRECISION,
  measured_at_ms BIGINT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'manual' -- manual | bluetooth
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_vitals_user ON vitals(user_id);
CREATE INDEX IF NOT EXISTS idx_visits_provider ON visits(provider_id);
CREATE INDEX IF NOT EXISTS idx_escrow_client ON escrow(client_id);

-- Marketplace saved searches + favorites (FEATURE_PLAN.md §2). Filters are
-- an opaque JSON snapshot of the frontend SearchFilters at save time.
CREATE TABLE IF NOT EXISTS saved_searches (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  filters       JSONB NOT NULL,
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id       TEXT NOT NULL,
  caregiver_id  TEXT NOT NULL,
  saved_at_ms   BIGINT NOT NULL,
  PRIMARY KEY (user_id, caregiver_id)
);

-- Reviews & ratings (FEATURE_PLAN.md §1): one review per completed booking
-- (booking_id UNIQUE; duplicates surface as 409). Status: published |
-- flagged | removed. Removed reviews stay for audit but never list publicly.
CREATE TABLE IF NOT EXISTS reviews (
  id            TEXT PRIMARY KEY,
  caregiver_id  TEXT NOT NULL,
  booking_id    TEXT NOT NULL UNIQUE,
  author_id     TEXT NOT NULL,
  author_name   TEXT NOT NULL DEFAULT '',
  rating        INTEGER NOT NULL,
  comment       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'published',
  created_at_ms BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_caregiver ON reviews(caregiver_id);

-- Bell-panel notifications (§4): every notifyUser() call persists a row so
-- the panel works with or without a push subscription. Reads are per-user.
CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  link          TEXT,
  created_at_ms BIGINT NOT NULL,
  read_at_ms    BIGINT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Reminder preferences (§8): one opaque JSON blob per user (PUT upsert).
CREATE TABLE IF NOT EXISTS reminder_preferences (
  user_id TEXT PRIMARY KEY,
  prefs   JSONB NOT NULL
);

-- Server-side audit trail (§16): append-only, batched upload from clients.
CREATE TABLE IF NOT EXISTS audit_events (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id   TEXT NOT NULL DEFAULT '',
  at_ms         BIGINT NOT NULL,
  meta          JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id);
-- --------------------------------------------------------------------------
-- Localised content (server/src/locale.ts)
--
-- Editorial content — provider bios/specialities/service names, seeded review
-- copy, booking and care-plan notes, seeded chat — is authored in both locales
-- and served per request language via `?lang=en|el`, so responses stay plain
-- strings and no existing contract changes shape.
--
-- The plain columns above remain the single-language value (what a user typed,
-- or a legacy row); these bundles carry the translated copy. `pick()` prefers
-- the requested locale and falls back to the other one, then to the plain
-- column, so a half-translated row still renders something sensible.
-- --------------------------------------------------------------------------

ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment_i18n JSONB NOT NULL DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS note_i18n JSONB NOT NULL DEFAULT '{}';
ALTER TABLE care_plan_goals ADD COLUMN IF NOT EXISTS text_i18n JSONB NOT NULL DEFAULT '{}';
ALTER TABLE care_plan_notes ADD COLUMN IF NOT EXISTS text_i18n JSONB NOT NULL DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS text_i18n JSONB NOT NULL DEFAULT '{}';
