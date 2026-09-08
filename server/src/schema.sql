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
  available_now BOOLEAN NOT NULL
);

-- Role-aware profile (AMKA/AFM for clients, licence/hourly rate for providers).
CREATE TABLE IF NOT EXISTS profiles (
  user_id        TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  phone          TEXT NOT NULL DEFAULT '',
  amka           TEXT NOT NULL DEFAULT '',
  afm            TEXT NOT NULL DEFAULT '',
  licence_number TEXT NOT NULL DEFAULT '',
  hourly_rate    DOUBLE PRECISION
);

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
  status        TEXT NOT NULL DEFAULT 'held', -- held | released | refunded
  created_at_ms BIGINT NOT NULL,
  settled_at_ms BIGINT
);

-- Chat messages (Phase 1 + real-time). conversationId = peer user id pair key.
CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_id       TEXT NOT NULL,
  text            TEXT NOT NULL,
  sent_at_ms      BIGINT NOT NULL
);

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
  archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at_ms BIGINT NOT NULL
);

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
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
);
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