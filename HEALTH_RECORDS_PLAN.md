# Health Records — Contact Directory, Medicine Instructions & Prescription Reminders

> Execution plan for the next health-record increment. Companion to
> [`PLAN.md`](./PLAN.md) and [`FEATURE_PLAN.md`](./FEATURE_PLAN.md).
> Written to be split across **3 parallel subagents**, one per workstream.
> Each track below is self-contained: file ownership, contract, tasks, tests,
> acceptance criteria.

**Status snapshot (Sept 2026):**

| Capability | State |
|---|---|
| Medical history (conditions, allergies, immunizations, events, symptoms) | ✅ shipped — FEATURE_PLAN.md §21 |
| Prescriptions register + → medications bridge | ✅ shipped — §21 subtasks 6, 12 |
| Medications + adherence logging | ✅ shipped — §7 |
| Smart reminder channels (push/SMS/voice, quiet hours, escalation) | ✅ shipped — §8 |
| Allergy safety banner + PDF/FHIR export | ✅ shipped — §21 subtasks 9, 13, 14 |
| **Contact phone manager (ICE + care team)** | ✅ shipped — Track 1 (`/contacts`, server router, PDF + FHIR `Patient.contact`) |
| **Medicine instructions manager (sheet + catalog)** | ✅ shipped — Track 2 (`medicine.info.ts`, `medicine.catalog.ts`, structured editor, `PATCH /me/medications/:id`) |
| **Pill reminders derived from prescriptions** | ✅ shipped — Track 3 (`prescription.schedule.ts` parser + wizard, extended `to-medication` bridge) |

**Do not rebuild §7/§8/§21.** These tracks extend those modules. Reuse
`HistoryStore`, `RemindersStore`, `medications.logic.ts`,
`RemindersSettingsComponent`, the audit service, the export payload and the
FHIR mappers.

---

## Track 0 — Frozen shared contract (owner: lead, land before parallel work)

The three tracks touch one shared surface (`Medication`, `schema.sql`,
`app.routes.ts`, the PHR dashboard). Freeze these before any subagent starts so
tracks never need to edit each other's files.

### 0.1 Schema (all in `server/src/schema.sql`, idempotent)

```sql
-- Track 1: contacts directory (ICE + care team).
CREATE TABLE IF NOT EXISTS medical_contacts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,              -- emergency | care
  name          TEXT NOT NULL,
  relationship  TEXT NOT NULL DEFAULT '',   -- ICE: daughter/spouse… ; care: doctor/pharmacy…
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
CREATE INDEX IF NOT EXISTS medical_contacts_user_idx ON medical_contacts (user_id);

-- Track 2/3: structured instructions + provenance on the medication row.
ALTER TABLE medications ADD COLUMN IF NOT EXISTS instructions JSONB;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS prescription_id TEXT;
```

### 0.2 Shared TypeScript types

Track 1 owns `MedicalContact` in `src/app/features/health-record/contacts.models.ts`.
Track 2 owns `MedicineInstructions` in `src/app/features/health-record/medicine.info.ts`.
Track 3 owns `PrescriptionReminderPlan` in `src/app/features/health-record/prescription.schedule.ts`.
The frozen shapes:

```ts
// Track 1
type ContactKind = 'emergency' | 'care';
interface MedicalContact {
  id: string; kind: ContactKind; name: string; relationship: string;
  phone: string; altPhone?: string; email?: string; address?: string;
  notes?: string; isPrimary: boolean; priority: number;
  archived?: boolean; createdAtMs: number;
}

// Track 2
type FoodRelation = 'before' | 'with' | 'after' | 'any';
interface MedicineInstructions {
  doseForm?: string;            // tablet / syrup / injection …
  route?: 'oral' | 'topical' | 'inhalation' | 'injection' | 'other';
  foodRelation: FoodRelation;
  maxDailyDoses?: number | null;
  warnings: string[];           // free text + catalog warnings
  sideEffects?: string;
  storage?: string;
  specialInstructions?: string;
}

// Track 3 (amended during implementation: PRN prescriptions have no fixed
// schedule, so `schedule` is nullable and `isPrn`/`note` were added).
interface PrescriptionReminderPlan {
  schedule: MedicationSchedule | null;  // null = PRN; wizard requires times
  channels: ReminderChannel[];          // from reminders.logic.ts
  instructions: MedicineInstructions;   // pre-filled from Rx text
  confidence: 'parsed' | 'defaulted';
  isPrn: boolean;                       // SOS / as-needed
  parsedFrom: string;                   // raw Rx instructions
  note: string;                         // human explanation shown in the wizard
}
```

### 0.3 Extended `Medication` (Edit in `medications.logic.ts` — **Track 2 only**)

```ts
interface Medication {
  /* …existing… */
  instructions?: MedicineInstructions;
  /** §21 prescription that created this med, when bridged. */
  prescriptionId?: string | null;
}
```

### 0.4 API surface (all under the existing `/api` mount)

| Method | Path | Track | Notes |
|---|---|---|---|
| GET/POST/PATCH | `/api/me/contacts` | 1 | soft-archive via PATCH `archived:true`; 422 on unknown kind/missing name+phone |
| POST | `/api/me/medications` | 2 | accepts `instructions`, `prescriptionId` |
| PATCH | `/api/me/medications/:id` | 2 | accepts `instructions` |
| POST | `/api/me/prescriptions/:id/to-medication` | 3 | body extended: `{ schedule?, channels?, instructions? }`; omitted = current default-morning behaviour |

### 0.5 Cross-cutting rules (every track)

- **RBAC:** route guards `[ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE]`; family roles read-only via `setReadOnly()`; writes CLIENT-only. Family reads on `/api/history/:userId/...` stay consent-gated (`family_sharing`).
- **Audit:** every read/write goes through `AuditService.log(...)` with a `correlationId`, exactly once per action.
- **Offline/PWA:** never add the new endpoints to any `ngsw-config.json` dataGroup (health data is never SW-cached, §20 subtask 18).
- **a11y/i18n:** bilingual labels (`BilingualLabel` convention), labelled forms, `aria-live` on save status, ≥44px tap targets, never colour-only state.
- **Demo parity:** every server route has an in-memory `demo.api.ts` equivalent with seeded rows.

---

## Track 1 — Contact Phone Manager (ICE + care team) 🅰️

**Subagent 1 · new feature surface · no dependency on tracks 2/3.**

**Status: ✅ shipped.** `contacts.models.ts` (types, phone normalize/validate,
ordering, single-primary), `contacts.store.ts` (optimistic CRUD, soft-archive,
rollback, read-only RBAC), `contacts.page.ts` + `/contacts` route + PHR
dashboard ICE chip, demo + Postgres parity with `server/src/contacts.ts`,
health-summary PDF ICE block and FHIR `Patient.contact`, plus a profile-page
hint that links the user's own phone to the directory (no duplicate storage).
E2E landed as `e2e/phase6-contacts.spec.ts`: adding a primary ICE contact
demotes the seeded one, a care contact keeps its `tel:` link and archives, and
the export preview reports the directory's ICE contacts.

### Goal
A `/contacts` directory with two groups — **Emergency / ICE** (callable in one
tap, printed on the health-summary PDF, exported as FHIR `Patient.contact`) and
**Care team** (doctor, pharmacy, caregiver, hospital) — plus the user's own
primary phone surfaced from their profile.

### Files owned (create ★, edit ✎)

| File | Work |
|---|---|
| ★ `src/app/features/health-record/contacts.models.ts` | `MedicalContact`, `ContactKind`, `CareRole`, bilingual labels, `normalizePhone`, `sortContacts`, `primaryEmergency`, `safetyContacts` (ICE subset for export/alerting) |
| ★ `contacts.store.ts` | signals `contacts/loading/actingKey/error/readOnly`; `load()`, `add(draft)`, `update(id, patch)`, `archive(id)`, `setPrimary(id)`, `setReadOnly()`; optimistic add + rollback; audit per action |
| ★ `contacts.page.ts` | two grouped sections + add/edit typed reactive forms, tap-to-call `tel:` links, copy-to-clipboard, primary badge, empty/error states, read-only mode |
| ★ `contacts.models.spec.ts`, `contacts.store.spec.ts` | sort/primary/normalize + CRUD + optimistic rollback + read-only rejection |
| ✎ `src/app/core/api/demo.api.ts` | in-memory `medical_contacts` per user + seed (1 ICE daughter, 1 primary GP, 1 pharmacy) + GET/POST/PATCH handlers |
| ★ `server/src/contacts.ts` | `contactsRouter` mirroring `history.ts`: `requireAuth`, per-user scoping, pure `validateContactDraft`, 422 enums, `num()` BIGINT coercion, soft-archive |
| ✎ `server/src/app.ts` | `import { contactsRouter }` + `app.use('/api', contactsRouter)` |
| ✎ `server/src/schema.sql` | `medical_contacts` table (Track 0.1) + index |
| ✎ `server/src/seed.ts` | demo contacts for `u-client` |
| ★ `server/test/contacts.spec.ts` | auth, CRUD round-trip on Postgres, 422 paths, soft-archive |
| ✎ `src/app/app.routes.ts` | `/contacts` guarded like the other PHR routes |
| ✎ `src/app/features/health-record/health-record.page.ts` | dashboard link + emergency-contact chip when an ICE contact exists |
| ✎ `src/app/features/profiles/profile.page.ts` | "Own phone" hint linking to `/contacts` (no duplicate storage) |
| ✎ `src/app/features/health-record/export.payload.ts` | `emergencyContacts` section + `emptySections` key |
| ✎ `src/app/features/health-record/export.pdf.ts` | ICE block in the header box (name · relationship · phone) |
| ✎ `src/app/features/health-record/export.payload.spec.ts` | section populated + empty-section key |
| ✎ `src/app/shared/fhir/patient.mapper.ts` | map `emergencyContacts` → `Patient.contact[]` (name, relationship, telecom phone) |
| ✎ `src/app/shared/fhir/patient.mapper.spec.ts` | golden fixture with one ICE contact |
| ✎ `e2e/` new `phase6-contacts.spec.ts` | add ICE + care contact → primary badge → appears on health-summary export |
| ✎ `README.md`, `FEATURE_PLAN.md` | status paragraph + §21 follow-up note |

### Tasks
1. Contracts + pure helpers (sort: primary → priority → name; phone normalize to `+30…`/digits, reject <6 digits).
2. Store with optimistic CRUD and `setPrimary` (only one primary per kind, enforced client + server).
3. Page: Emergency section (role `alert`-adjacent styling, large tap targets, `tel:` links) + Care team table; typed reactive forms with validators; read-only mode for family roles.
4. Server route + validation (`kind ∈ emergency|care`, name & phone required, email shape if present, `priority` integer).
5. Demo backend parity + seed.
6. Export (payload + PDF) and FHIR `Patient.contact`.
7. Route, dashboard link, docs.
8. Tests: unit (models/store/payload/mapper), server spec, E2E.

### Acceptance criteria
- CRUD round-trips on the real Postgres schema and in demo mode.
- Exactly one `isPrimary` per kind, enforced server-side (409/422 on conflict or silent demotion — document the choice).
- Health-summary PDF shows the ICE contact(s); FHIR bundle `Patient.contact` present and validator-clean.
- Family roles can read, cannot write; every read/write audit-logged.
- 0 new lint/type errors; new endpoints absent from `ngsw-config.json`.

---

## Track 2 — Medicine Instructions Manager (structured sheet + curated catalog) 🅱️

**Subagent 2 · extends medications · consumes Track 0.2/0.3 · independent of tracks 1/3.**

**Status: ✅ shipped.** `medicine.info.ts` (types, total normalizer, summary),
`medicine.catalog.ts` (12-drug Greek-first catalog, diacritic-insensitive
lookup), `medicine-instructions.component.ts` (structured editor + auto-fill),
`medications.store.saveInstructions` (optimistic + rollback), server
`validateInstructions` + `PATCH /api/me/medications/:id`, schema
`instructions JSONB` / `prescription_id`, demo + Postgres seed rows.
Health-summary PDF medication rows now print the **saved** sheet (how-to-take
summary, warnings, special instructions, side effects, storage); the curated
catalog suggestion is deliberately never printed as if it were the record.
Catalog auto-fill refuses to replace a saved or edited sheet without an
explicit confirmation. E2E landed as `e2e/phase6-instructions.spec.ts`:
opening a pill loads its saved sheet, auto-fill arms a confirmation before
replacing it, edits save and survive a store reload, and clearing a sheet
persists. Follow-up landed: the saved sheet is also surfaced on the FHIR
`MedicationRequest` — `dosageInstruction[0]` gains `route` (route label) and
`additionalInstruction` (food relation, max daily doses) plus a "how to take"
suffix on `text`, and the free-text `note` carries warnings, side effects,
storage and special instructions alongside the prescriber note
(`medication.mapper.ts`, covered by `medication.mapper.spec.ts`). As with the
PDF, the catalog suggestion is never exported — only the user-saved sheet.

### Goal
Every pill gets a structured "how to take it" sheet — dose form, route, food
relation, max daily doses, warnings, side effects, storage, special
instructions — editable by the user and auto-fillable from a curated
Greek-first drug catalog.

### Files owned (create ★, edit ✎)

| File | Work |
|---|---|
| ★ `src/app/features/health-record/medicine.info.ts` | `MedicineInstructions`, `FoodRelation`, `MEDICINE_ROUTE_LABELS`, `FOOD_RELATION_LABELS`, `emptyInstructions()`, `normalizeInstructions(unknown)`, `instructionsSummary(instr)` (one-line "Take with food · max 3/day") |
| ★ `src/app/features/health-record/medicine.info.spec.ts` | normalize defaults/edge cases + summary text |
| ★ `src/app/features/health-record/medicine.catalog.ts` | curated `MedicineInfoEntry[]` (name + el/en aliases + default instructions + standard warnings): paracetamol, ibuprofen, amoxicillin, metformin, atorvastatin, ramipril, omeprazole, salbutamol, warfarin, furosemide, levothyroxine, clopidogrel; `findMedicineInfo(name)` (case/diacritic-insensitive, alias match), `applyCatalog(name)` |
| ★ `src/app/features/health-record/medicine.catalog.spec.ts` | lookup by brand/generic/Greek alias, miss → null |
| ★ `src/app/features/health-record/medicine-instructions.component.ts` | structured editor (reactive form) + catalog autofill + warning chips; `aria-live` save status; embeds in medications page |
| ✎ `src/app/features/health-record/medications.logic.ts` | add `instructions?`, `prescriptionId?`; `instructionsFor(med)` fallback (`fromPrescription` → catalog → em-dash) |
| ✎ `src/app/features/health-record/medications.store.ts` | carry `instructions`/`prescriptionId` through load/add/update; `saveInstructions(id, instr)` |
| ✎ `src/app/features/health-record/medications.page.ts` | "How to take" per pill (summary line, expandable sheet, catalog autofill button) |
| ✎ `src/app/features/health-record/medications.store.spec.ts` | instructions round-trip + rollback |
| ✎ `server/src/medications.ts` | accept/validate/persist `instructions` (JSONB) + `prescription_id`; pure `validateInstructions` |
| ✎ `server/src/schema.sql` | `ALTER TABLE medications ADD COLUMN IF NOT EXISTS …` (Track 0.1) |
| ✎ `server/src/seed.ts` | seed instructions on 2 demo meds |
| ✎ `server/src/app.ts` | no new mount needed if `medications.ts` is already wired; otherwise extend the existing medication routes |
| ✎ `e2e/` new `phase6-instructions.spec.ts` | open med → autofill from catalog → edit warning → reload → persisted |
| ✎ `FEATURE_PLAN.md`, `README.md` | §7 status note |

### Tasks
1. Types + normalize + summary pure module.
2. Curated catalog (≥12 drugs, Greek-first labels, diacritic-insensitive match); document that it is **not medical advice** and is user-editable.
3. Structured editor component reusing the codebase form conventions.
4. Wire into `medications.store`/`medications.page` with optimistic save + rollback.
5. Server validation/persistence + schema + seed.
6. Surface the summary line in reminders/preview text and the PDF med rows (read-only consumption).
7. Tests + docs.

### Acceptance criteria
- A pill's instructions survive create/edit/reload in demo **and** Postgres mode.
- Catalog autofill is case/diacritic-insensitive and never overwrites user-edited fields without confirmation.
- `normalizeInstructions` is total (never throws on unknown payload) and unit-tested.
- Instructions appear in the medications list summary and the health-summary PDF rows.

---

## Track 3 — Pill Reminders from Prescriptions (auto-derive + wizard) 🅲

**Subagent 3 · extends §21 bridge + §8 reminders · consumes Track 0.2/0.3/0.4 · depends on Track 2's `MedicineInstructions` type only (compile-time, same frozen contract).**

**Status: ✅ shipped.** `prescription.schedule.ts` (Greek + English frequency
parser, food-relation detection, plan builder, 32 tests),
`prescription-reminder.component.ts` (confirm/adjust wizard for
daily/interval/weekly schedules + channel gating), `HistoryStore.setPillReminder`
returning the new medication id, server `validateSchedule` + extended
`POST /me/prescriptions/:id/to-medication`, demo parity, and the
"+ Υπενθύμιση από συνταγή" action on the history page. E2E landed as
`e2e/phase6-rx-reminders.spec.ts`: a `1x3` prescription pre-fills
08:00/14:00/20:00 and confirming creates the medication + reminders, while an
`SOS` prescription has no fixed schedule and demands explicit times. The
wizard's schedule assembly is factored into the pure `scheduleFromEditor`
(tested in `prescription.schedule.spec.ts`) and its confirm payload through
`toMedicationBody`; the repo has no TestBed component-test harness, so the
wizard's DOM flow is covered by the E2E instead of `prescription-reminder.spec.ts`.

### Goal
Turn an active prescription into a real medication schedule and reminder set:
parse the Rx text/duration into a suggested `MedicationSchedule`, let the user
confirm/adjust times and channels in a wizard, create the medication (linked by
`prescriptionId`) and persist the reminder channels.

### Files owned (create ★, edit ✎)

| File | Work |
|---|---|
| ★ `src/app/features/health-record/prescription.schedule.ts` | pure parser: `parseFrequency(raw, locale)` (el + en phrases: `1x3`, `3 φορές την ημέρα`, `κάθε 8 ώρες`, `πρωί/μεσημέρι/βράδυ`, `μία φορά την εβδομάδα`, `SOS`/PRN → no fixed schedule), `scheduleFromPrescription(rx)`, `planFromPrescription(rx)` → `PrescriptionReminderPlan` |
| ★ `prescription.schedule.spec.ts` | table-driven: each phrase → expected times/schedule; PRN → `defaulted`; unknown → default daily-morning with `confidence:'defaulted'` |
| ★ `src/app/features/health-record/prescription-reminder.component.ts` | wizard: parsed-schedule preview, editable dose times, channel checkboxes (reuses `RemindersSettingsComponent` gating), duration/end date, confirm |
| ★ `prescription-reminder.spec.ts` | wizard plan → create payload |
| ✎ `src/app/features/health-record/history.store.ts` | `addPrescriptionToMedications(id, plan?)` forwards `schedule/channels/instructions`; expose `suggestedPlan(rx)` via the pure module (no state) |
| ✎ `src/app/features/health-record/history.page.ts` | "Set pill reminder" button on active prescriptions → wizard → success state showing next reminder |
| ✎ `src/app/features/health-record/history.store.spec.ts` | bridge forwards the plan and stores `medicationId` |
| ✎ `server/src/history.ts` | `to-medication` accepts `{ schedule?, channels?, instructions? }`, validates schedule shape + channel enums (422), persists `prescription_id` + `instructions`; omitted body keeps current default-morning behaviour |
| ✎ `server/test/history.spec.ts` | new body paths + 422 invalid schedule/channel |
| ✎ `src/app/core/api/demo.api.ts` | same extended `to-medication` behaviour in-memory |
| ✎ `src/app/features/health-record/reminders.store.ts` | (integration only) persist chosen channels through existing `setChannels`; no new endpoint |
| ✎ `e2e/` new `phase6-rx-reminders.spec.ts` | add prescription `1x3` → wizard pre-fills 08:00/14:00/20:00 → confirm → medication appears → reminders settings show 3 daily times |
| ✎ `FEATURE_PLAN.md`, `README.md` | §8/§21 status note (closes the "reminders from prescriptions" gap) |

### Tasks
1. Pure parser for Greek + English frequency phrasing, dose form, duration; PRN detection.
2. Wizard component with editable schedule + channel gating (reuse reminder consent/phone gating).
3. Extend the bridge to send the plan; server validation + persistence.
4. Persist channels via the existing reminder prefs store; show next-reminder preview.
5. Tests (parser table, store, server, E2E) + docs.

### Acceptance criteria
- `1x3` / `κάθε 8 ώρες` / `πρωί-βράδυ` produce sensible schedules; unknown/PRN text degrades to a clearly-flagged default, never a silent wrong schedule.
- Created medication carries `prescriptionId` and structured `instructions`; the register entry shows the linked medication.
- Reminder channels chosen in the wizard are persisted and visible on `/reminders`.
- Invalid schedule/channel payloads 422 server-side; omitted body preserves today's behaviour (backwards compatible).

---

## Dependency graph & merge order

```
Track 0 (contract freeze, lead)
   ├── Track 1  contacts ............ independent ──┐
   ├── Track 2  instructions ........ first of {2,3} ├── merge 1, 2, 3
   └── Track 3  rx reminders ........ needs 2's types┘
```

- **Wave 1 (parallel):** Track 0 → Tracks 1 & 2.
- **Wave 2 (parallel):** Track 3 once `medicine.info.ts` exists (frozen type, not the implementation).
- **Merge conflict hotspots (resolve by ownership):** `schema.sql` (T0 blocks; T1/T2 only append their own DDL), `app.routes.ts` (T1 appends `/contacts`), `demo.api.ts` (T1 + T3 append separate handlers), `FEATURE_PLAN.md`/`README.md` (append-only, one status line each).

## Verification (per track, before merge)

```bash
npm test -- --run <track specs>          # frontend unit (Vitest)
npm run build                            # typecheck + bundle budget
cd server && npm test                    # server specs (Vitest + Postgres)
npm run e2e -- e2e/phase6-<track>.spec.ts
```

All three tracks must keep the current suites green (≈588 frontend, ≈108
server) and add no `ngsw-config.json` health-data cache entries.

## Suggested subtask count

- Track 1: 18 subtasks · Track 2: 14 · Track 3: 16 — land each as its own
  commit so a regression isolates to one track.
