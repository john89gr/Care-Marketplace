# Care-Marketplace — Feature Plan (20 features)

> Companion to [`PLAN.md`](./PLAN.md). PLAN.md defines the phase roadmap;
> this document breaks the **next 20 most valuable features** into 20
> executable subtasks each. Subtasks reference real files/modules in this
> repo. Check subtasks off as they land.

**Status snapshot (Sept 2026):**
- ✅ Phase 1 (marketplace loop) — complete
- ✅ Phase 2 (home health + escrow) — complete
- 🔶 Phase 3 (PHR) — vitals only; screening/medication/pharmacy/export missing
- ⬜ Phase 4 (gov.gr, FHIR, audit console) — stubbed routes only

Priority legend: 🔴 P0 = blocks core trust/loop · 🟡 P1 = completes planned phases · 🟢 P2 = growth & polish

---

## 1. Reviews & Ratings System 🔴
Caregiver cards expose `rating` (`marketplace.store.ts`) but nothing ever writes one. Reviews are the trust backbone of a marketplace.

**Area:** `src/app/features/marketplace/` + demo backend.

1. Design API contract: `GET/POST /caregivers/:id/reviews` (author, bookingId, rating 1–5, comment, createdAtMs).
2. Add `Review` interface + types in a new `reviews.store.ts`.
3. Store: `load(caregiverId)`, `submit(review)`, signals `reviews/loading/error/submitted`.
4. Enforce "one review per completed booking" rule in store + backend contract.
5. Add `POST /bookings/:id/complete` state to `booking.store.ts` (review only after completion).
6. Demo backend (`demo.api.ts`): in-memory review list per caregiver + seeded data.
7. Backend computes aggregate rating; demo computes client-side mean.
8. `review.page.ts` — star picker + comment form (typed reactive form, maxlength validator).
9. Restrict route to CLIENT role via `roleGuard([ROLES.CLIENT])` in `app.routes.ts`.
10. Show "Rate this visit" CTA on completed bookings in `booking.page.ts`.
11. Caregiver profile view: reviews list with date + visit context.
12. Marketplace card: show rating + review count badge.
13. Admin moderation: flag/report review action in `admin.page.ts`.
14. Prevent caregivers reviewing themselves (guard in store).
15. Unit tests for `reviews.store` (submit success/failure, duplicate prevention) — follow `escrow.store.spec.ts` style.
16. Unit test aggregate-rating computation edge cases (0 reviews, rounding).
17. Wire demo.socket.ts chat → "visit completed" → prompt to review.
18. E2E (Playwright): complete booking → leave review → rating visible in search.
19. i18n/a11y pass: labels, `aria-live` on submit status, keyboard-operable star picker.
20. Update README feature status + PLAN.md phase table.

## 2. Saved Searches & Favorite Caregivers 🔴
Families repeat the same searches weekly; nothing persists today (`marketplace.store.ts` filters reset on reload).

**Area:** `src/app/features/marketplace/` + `core/api`.

1. API contract: `GET/POST/DELETE /me/saved-searches`, `/me/favorites`.
2. `saved-search.store.ts` with signals for both collections.
3. Persist `SearchFilters` shape verbatim so re-running a search is lossless.
4. Demo backend: seed 2 saved searches + 1 favorite for demo client account.
5. "Save this search" button in `marketplace.page.ts` (auto-name from active filters).
6. Saved-searches dropdown: apply filter → triggers `search()`.
7. Delete + rename saved search (inline edit).
8. Heart icon on caregiver cards → add/remove favorite (optimistic update + rollback on error).
9. "Favorites" filter toggle in the search panel.
10. Favorite availability watcher: on load, flag favorites now `availableNow`.
11. Route guard: saved searches are per-user (client role).
12. Debounce filter changes and sync to URL query params (deep-linkable searches).
13. Restore filters from URL params on page init (parse + validate shape).
14. Empty states: no saved searches / no favorites, with CTA copy.
15. Unit tests: save/apply/delete round-trip, URL param encode/decode.
16. Unit tests: optimistic favorite toggle rollback on API failure.
17. E2E: save search → reload → search restored → apply → results match.
18. A11y: favorite button `aria-pressed`, dropdown keyboard nav.
19. Add search analytics event hook (searches run, filters used) via `core/services`.
20. README + PLAN.md status update.

## 3. Booking Lifecycle Completion 🔴
Bookings today jump from "requested" to escrow release; no explicit cancel/reschedule/complete states, and `escrow.refund` is never triggered by UI.

**Area:** `src/app/features/marketplace/booking.*` + `payments/`.

1. Define `BookingStatus` union: `requested | accepted | in_progress | completed | cancelled | disputed`.
2. Add `status` to booking API contract + demo backend records.
3. Extend `booking.store.ts`: `accept`, `complete`, `cancel`, `reschedule` actions.
4. State-machine guard: illegal transitions rejected in store (unit-testable pure function).
5. Escrow integration: `cancel` → `EscrowStore.refund(txId)`, `complete` → `release(txId)` (already exists in `escrow.store.ts`).
6. Reschedule: new timeslot payload, requires both parties' confirmation flag.
7. UI: status chips + allowed-action buttons per role (client vs provider views).
8. Cancellation policy hook: deadline before visit start (config constant), free vs fee cancellation.
9. Timeline view: booking history events (status changes with timestamps).
10. Notification hooks on every transition (see feature 12 store).
11. Visit auto-transition: check-in (`visit.store.ts`) moves booking to `in_progress`.
12. Demo backend: stateful booking records (not static responses).
13. Handle concurrent actions gracefully (409 → friendly message, state reload).
14. Role guards: only provider accepts, only involved parties cancel.
15. Unit tests for the full transition matrix.
16. Unit tests: cancel-with-fee escrow math.
17. E2E: book → accept → check-in → complete → escrow released (extends existing E2E).
18. E2E: cancel before deadline → refund visible in payments ledger.
19. A11y: status announced via `aria-live`, focus management on dialog actions.
20. README + PLAN.md status update.

## 4. Notification Center & Unread Badges 🟡
Chat unread state exists; nothing else notifies. Status changes, alerts, vetting decisions all need a single inbox.

**Area:** new `src/app/core/services/notifications/` + app shell.

1. Define `Notification` type: id, kind, payload, readAtMs, createdAtMs.
2. `notifications.store.ts`: load, markRead, markAllRead, unread count signal.
3. API: `GET /me/notifications`, `POST /me/notifications/:id/read`.
4. Real-time: reuse `websocket.client.ts` with a `notifications` channel/subject.
5. Demo socket: emit fake notifications (booking accepted, message, alert).
6. Bell icon in `app.ts` shell with unread badge (computed count).
7. Dropdown panel: grouped by day, "mark all read", infinite scroll or "load more".
8. Click-through routing: notification → target route (booking/chat/vitals) via kind map.
9. Emit notifications from booking transitions (feature 3), vetting decisions, vitals alerts (existing `alerts` computed).
10. Persist read state across sessions (backend, not localStorage).
11. Badge sync on window focus (poll fallback when WS disconnected).
12. Browser push permission prompt opt-in (prerequisite for feature 20).
13. Mute preferences per kind (stored on profile).
14. Unit tests: unread counting, markRead idempotency, kind→route mapping.
15. Unit tests: WS message → store update integration.
16. A11y: badge count in accessible name, panel focus trap, Esc to close.
17. Empty state + error state UI.
18. E2E: receive notification while on another page → badge → open → read.
19. Performance: cap panel DOM to last 50, virtualize if needed.
20. README + PLAN.md status update.

## 5. Search Matching v2 (Real Geo + Scoring) 🟡
v1 matcher is `matching.ts` (geo/availability/rating) — upgrade to weighted scoring with real distance and speciality matching.

**Area:** `src/app/features/marketplace/matching.ts`.

1. Add speciality/role-relevance weights to `SearchFilters` (e.g. `sort: relevance|distance|rating|price`).
2. Replace haversine stub with real user geolocation via `core/services/geo/geolocation.service.ts`.
3. Distance bands instead of raw km for ranking (0–2, 2–5, 5–10, >10).
4. Weighted composite score: distance (w1) + rating (w2) + availability (w3) + price fit (w4) + speciality match (w5).
5. Make weights injectable (`MATCHING_WEIGHTS` InjectionToken) for tuning/testing.
6. Explainable results: attach `scoreBreakdown` per candidate (dev/debug panel).
7. Price-fit scoring vs client's budget filter (add `maxHourlyRate` filter).
8. Speciality taxonomy: shared constants for nurse acts / physio programmes.
9. Boost providers with completed-visit history (needs feature 3 data).
10. Penalty for recent cancellations.
11. Tie-breaker determinism (stable sort by id).
12. Pure-function refactor so scoring is 100% unit-testable without DI.
13. Unit tests per factor + composite (golden scores fixture).
14. Property test: score never NaN/out-of-range across random inputs.
15. URL-persist sort + new filters (with feature 2).
16. UI: sort dropdown, budget input, "why these results" explainer tooltip.
17. Perf: score ≤ 500 candidates < 16 ms (benchmark test).
18. Update demo backend seed so ranking differences are visible.
19. E2E: change sort → order changes predictably.
20. README + PLAN.md status update.

## 6. Screening & Preventive-Care Reminder Engine 🟡 (Phase 3)
Planned in PLAN.md §3.C, not started. Age/gender-based preventive check reminders.

**Area:** new `src/app/features/health-record/screening.*`.

1. Encode rule set: type, min/max age, gender applicability, interval months (mammography, cardio, vaccinations per PLAN.md).
2. `screening.rules.ts` as pure data + pure `dueScreenings(profile)` function.
3. API: `GET /me/screenings` (status: `due | scheduled | done | waived`).
4. `screening.store.ts`: load, markDone, schedule, waive (with reason).
5. Hook profile data (DOB, sex from `profile.store.ts`) into rule evaluation.
6. Demo backend: seed a due mammography + overdue cardio check for demo client.
7. `screening.page.ts`: due list, upcoming, history tabs.
8. Route in `app.routes.ts` under existing PHR guards.
9. "Book visit" deep link: screening → marketplace filtered by speciality.
10. Family visibility: caregiver/nurse can view (read-only) per RBAC matrix.
11. Surface due screenings as notifications (feature 4) + PHR dashboard badge.
12. Snooze with max-snooze limit.
13. Waive requires reason + audit log entry (feeds feature 17).
14. Date math edge cases: unborn/infant schedules, boundary ages (unit tests).
15. Unit tests: rule engine matrix (age × gender × interval).
16. Unit tests: store actions incl. waive validation.
17. E2E: due screening shows → mark done → moves to history.
18. A11y + i18n of medical labels (careful, neutral copy).
19. Medical disclaimer + "not medical advice" note reviewed into UI.
20. README + PLAN.md status update.

## 7. Medication Calendar & Adherence Tracking 🟡 (Phase 3)
PLAN.md §3.B. Missed critical medication must alert family (phase exit criterion).

**Area:** new `src/app/features/health-record/medications.*`.

1. Data model: `Medication` (name, dose, schedule, critical flag, prescriber) + `AdherenceLog` (takenAtMs | missed).
2. API contract: `GET/POST /me/medications`, `POST /medications/:id/log`.
3. `medications.store.ts` with today's schedule computed from schedule + logs.
4. Schedule model: daily times, interval days, or weekly days-of-week.
5. Adherence rate computation per med + overall (7/30-day windows).
6. Demo backend: seed meds incl. one critical with a missed dose.
7. `medications.page.ts`: today timeline, mark taken/skip buttons, adherence strip.
8. Missed-dose detection: schedule time + grace window → status flips to missed.
9. Family alert: missed **critical** med → notification (feature 4) + WS event.
10. Escalation rule config: alert again after 2nd consecutive miss.
11. Caregiver can log on behalf of client (RBAC: existing PHR guard list).
12. Interaction-check placeholder API call + warning display (server-side later).
13. Soft-delete/archive meds (history preserved for audit).
14. Low-refill tracking: days-remaining estimate + reminder.
15. Unit tests: schedule expansion for each schedule type.
16. Unit tests: adherence math + missed-dose boundary (grace window).
17. Unit tests: critical-miss alert emission exactly once.
18. E2E: log dose → adherence updates; skip critical → family alert appears.
19. A11y: large tap targets (elderly users), high-contrast icons.
20. README + PLAN.md status update.

## 8. Smart Reminders (Push / SMS / Voice) 🟡 (Phase 3)
PLAN.md §3.B "push + SMS/voice reminders" — frontend channel layer over feature 7 schedules.

**Area:** `core/services/notifications/` + medication feature.

1. `ReminderChannel` type: `push | sms | voice | inapp`.
2. Per-reminder channel preferences UI on each medication.
3. API: `PUT /me/reminders/preferences` (demo persists in-memory).
4. Push: integrate browser Notification API when tab closed (PWA, feature 20).
5. SMS/voice: settings page stub + "configured server-side" contract; UI states pending/configured.
6. Reminder preview: "next reminder fires Tue 08:00 via push" computed text.
7. Quiet hours: no reminders between user-defined hours except critical meds.
8. Escalation ladder: inapp → push → sms for critical meds.
9. Test mode: "send test reminder now" button (demo socket emits).
10. Timezone handling: store IANA tz per user; schedule in user tz.
11. DST edge-case unit tests (reminder at 02:30 on spring-forward day).
12. Caregiver copies: family member can receive duplicate reminder (opt-in per relationship).
13. Notifications store integration: reminders appear in inbox (feature 4).
14. Reminder history log (sent/failed per channel) for support debugging.
15. Consent capture for SMS/voice (GDPR, feeds feature 17 consent ledger).
16. Unit tests: quiet-hours suppression, escalation ladder, tz conversion.
17. E2E: enable push test reminder → notification visible.
18. Docs: README section on channel config contract.
19. A11y: settings form labels/errors, `aria-describedby` help text.
20. README + PLAN.md status update.

## 9. e-Prescription & Pharmacy Order Routing 🟡 (Phase 3)
PLAN.md §3.B: barcode upload → route to nearest partner pharmacy.

**Area:** new `src/app/features/pharmacy/`.

1. Data model: `Prescription` (barcode payload, meds[], prescriber, state) + `PharmacyOrder`.
2. Order state machine: `uploaded | routed | accepted | preparing | out_for_delivery | delivered | failed`.
3. API contract: `POST /prescriptions/scan`, `GET /me/pharmacy-orders`.
4. `prescriptions.store.ts` + `orders.store.ts` (one feature folder, two stores).
5. Barcode/QR scan UI: camera scan (`BarcodeDetector` API with manual-entry fallback).
6. Demo backend: seeded partner pharmacies + auto-routing logic.
7. Routing: pick nearest pharmacy with stock (mock stock flags) — reuse geo service.
8. `prescriptions.page.ts`: scan → confirm parsed meds → submit.
9. `orders.page.ts`: live status timeline per order.
10. Link filled order → medication list (feature 7) auto-creates med + refill date.
11. WS updates: order status pushes to open clients (demo socket).
12. Pharmacy partner view stub (read-only order list, PHARMACY role — role exists in PLAN.md RBAC; add to `roles.ts`).
13. Error handling: unreadable barcode, routing failure → retry UI.
14. Delivery address from profile with per-order override.
15. Unit tests: state machine transitions, routing choice logic.
16. Unit tests: barcode parse fallback flow.
17. E2E: scan (mocked) → order routed → status advances → delivered.
18. A11y: manual entry fully keyboard operable (camera is progressive enhancement).
19. Add PHARMACY role guard + nav visibility rules in shell.
20. README + PLAN.md status update.

## 10. PDF Health Summary Export 🟡 (Phase 3)
PLAN.md §3.C "exportable health summary" for the treating physician.

**Area:** `features/health-record/export.*` (new) + shared utils.

1. Decide generation strategy: client-side (jsPDF/pdfmake) vs server endpoint; default client-side for demo.
2. Add dependency pin + license check (bundle budget impact in `angular.json`).
3. Compose summary payload: profile basics + vitals trends + meds + screenings + care-plan snapshot.
4. Lazy-load generator behind `@defer` / dynamic import (keep initial JS ≤ 300 KB budget).
5. `export.service.ts`: build → generate → trigger download, with loading/error signals.
6. PDF layout: header (patient, generated-at, range), per-section tables, page numbers.
7. Include the vitals trend sparkline as chart image (canvas → PNG).
8. Range selector: last 30 / 90 / 365 days / all.
9. Greek + English labels in the PDF (i18n-aware).
10. Filename convention: `health-summary-<date>.pdf`.
11. Consent + audit: log every export (who/when) — feeds features 16/17.
12. "Share with physician" flow stub: generate download link (server-side later).
13. Demo mode: works fully offline from demo backend data.
14. Unit tests: payload composition (range filter, empty sections).
15. Unit tests: filename/date formatting.
16. E2E: export click → download event fires (Playwright download API).
17. Perf test: 1,000 readings export < 3 s.
18. Error state: generation failure → retry, no silent failure.
19. A11y: button labels, progress announced (`aria-busy`).
20. README + PLAN.md status update.

## 11. FHIR Export & Resource Mapping 🟡 (Phase 4)
PLAN.md §4: map to `Patient`, `Observation`, `MedicationRequest`, `CarePlan`.

**Area:** new `src/app/shared/fhir/` + health-record feature.

1. Add minimal FHIR R4 TS types for the 4 resources (no SDK; keep bundle small).
2. `patient.mapper.ts`: profile → `Patient` resource.
3. `observation.mapper.ts`: `VitalReading` → `Observation` (LOINC codes per vital type).
4. Unit-test LOINC mapping table completeness vs `VitalType` union (compile-time exhaustiveness).
5. `medication.mapper.ts`: `Medication` → `MedicationRequest`.
6. `care-plan.mapper.ts`: care plan entity → `CarePlan`.
7. `fhir.bundle.ts`: wrap resources in a `Bundle` (type `collection`).
8. Validation: basic structural validator function (required fields, reference integrity).
9. Export endpoint contract: `GET /me/fhir/bundle` (server path) + client fallback export.
10. UI: "Download FHIR bundle" on health-record page (JSON download).
11. Audit log every FHIR export (feature 16).
12. Version + `meta.lastUpdated` stamps.
13. Demo backend: return a valid sample bundle for E2E.
14. Reference determinism: stable Patient id (`uuid` v5 from AMKA hash — never raw AMKA in identifiers).
15. Unit tests per mapper with golden JSON fixtures.
16. Unit test: invalid reading → mapper throws with clear error.
17. E2E: export bundle → parse JSON → assert resource counts.
18. Docs: mapping table (field → FHIR path → code system) in module README.
19. Bundle size check after addition (budgets in `angular.json`).
20. README + PLAN.md status update.

## 12. Web Bluetooth Device Pairing 🟢 (Phase 3)
`vitals.store.ts` has a `source: 'bluetooth'` flag only — make real device ingestion work.

**Area:** `core/services/bluetooth/` (new) + vitals feature.

1. Feature-detect `navigator.bluetooth`; graceful "unsupported browser" UI (Safari/Firefox).
2. `bluetooth.service.ts`: requestDevice, connect, GATT subscribe, disconnect.
3. Profile-to-UUID map for first 2 device classes per PLAN.md open question: BP monitor + glucometer.
4. GATT notification parser per device class → `VitalReading` values (BP: systolic/diastolic/map).
5. Pairing UI: device picker, connection state chip, instructions for elderly users.
6. Parse failures → raw-frame debug log (dev mode only) + user-facing error.
7. Auto-fill vitals entry form from reading → user confirms → `VitalsStore.add` with `source: 'bluetooth'`.
8. Reconnect flow: remembered device (`getDevices()`), auto-reconnect on signal loss (≤ 3 retries).
9. Battery level read (standard GATT characteristic) + low-battery warning.
10. Secure permission guidance: explain browser pairing dialog (i18n copy).
11. HTTPS-only enforcement check (Web Bluetooth requires secure context) with helpful error.
12. Unit tests: parsers fed with recorded GATT frame fixtures (pure functions, no hardware).
13. Unit tests: value sanitization (implausible readings flagged, not stored silently).
14. Demo mode: simulated device stream (emits plausible readings on interval).
15. E2E: mock `navigator.bluetooth` → pair → reading lands in vitals with bluetooth source.
16. Docs: supported device matrix + how to capture GATT fixtures.
17. A11y: pairing status announced, no color-only state.
18. Perf: no polling loops; only GATT notifications + cleanup on route leave.
19. Consent prompt before first pairing (health data, feeds feature 17).
20. README + PLAN.md status update.

## 13. Payment Methods & Payout Accounts 🟡 (Phase 2 hardening)
Escrow exists; clients have no saved cards, providers have no payout account — needed before real PSP.

**Area:** `features/payments/` + `profiles/`.

1. Choose PSP via research (Stripe Connect vs local PSP — PLAN.md open question #2); document decision.
2. API contract: `GET/POST /me/payment-methods`, `GET/PUT /me/payout-account`.
3. `payment-methods.store.ts` (client side): list, add, set default, remove.
4. `payout.store.ts` (provider side): onboarding state (`not_started | pending | active`), account details.
5. Demo backend: fake tokenization, seeded default card + active payout account.
6. UI: payments page tabs — Wallet (client) / Earnings & payouts (provider).
7. Card form: typed form + Luhn client check; **never store PAN** — token only (contract enforced).
8. Booking flow integration: select payment method at booking confirm (feature 3).
9. Payout schedule display: weekly ledger of releases (from escrow transactions).
10. Fees line: platform commission constant shown on escrow release math.
11. Currency: EUR-only for now, amounts remain integer cents everywhere.
12. Invoice/receipt download per settled transaction (PDF service from feature 10).
13. Webhook contract stub: refund/release server events → store refresh.
14. RBAC: payout tab only for provider roles, wallet only CLIENT.
15. Unit tests: store actions, fee math, Luhn validator.
16. Unit tests: demo tokenization error paths (declined card).
17. E2E: add card → book → escrow hold references method → complete → release.
18. Security review checklist in PR template (no PAN in logs/state/network).
19. A11y + i18n of payment forms; error messages don't leak internals.
20. README + PLAN.md status update.

## 14. Certification & Licence Expiry Tracking 🟡 (Phase 4)
Vetting approves once (`vetting.store.ts`) — nothing tracks expiry; a lapse must suspend marketplace visibility.

**Area:** `features/vetting/` + `admin/`.

1. Add `expiresAtMs` + `certifications[]` to `LicenceSubmission` contract.
2. Migration: demo backend seeds expiries (one expiring in 14 days, one lapsed).
3. `certification-status` computed: `valid | expiring_soon (≤30d) | expired`.
4. Daily check job (client-side interval for demo; server cron contract documented).
5. Expired licence → provider auto-hidden from marketplace search results.
6. Banner in onboarding page for the provider: "licence expires in N days".
7. Admin console: expiry dashboard (sorted by soonest), filter by status.
8. Re-submission flow: expired provider re-enters vetting queue (reuse existing review action).
9. Reminder notifications at T-30/T-14/T-7/T-1 (feature 4).
10. Audit trail entries for every expiry-suspension + re-approval.
11. Certificates beyond licence: CPR cert, insurance — same status machinery.
12. Document upload UI stub (file input + type/size validation; storage server-side later).
13. Admin can override/suspend manually with reason (audit-logged).
14. Guard: blocked providers attempting shift/visit actions get explanation page.
15. Unit tests: status computation date boundaries (exactly 30d, exactly 0d).
16. Unit tests: marketplace filtering excludes expired providers.
17. E2E: admin sees expiring cert → provider gets reminder → renews → visible again.
18. Data model docs + state diagram.
19. A11y: dashboard tables with proper `scope`/captions.
20. README + PLAN.md status update.

## 15. Gov.gr OIDC Integration & Health Wallet 🟢 (Phase 4)
Button exists in login; real integration + wallet storage per PLAN.md §3.D.

**Area:** `core/auth/` + new `features/integrations/`.

1. Request Gov.gr sandbox credentials (lead time — start now; PLAN.md open question #3).
2. Auth API contract: `/auth/gov-gr/authorize` + `/callback` (PKCE flow).
3. `session.ts`: add `idVerifiedVia: 'email' | 'gov_gr'` to session state.
4. Login page: Gov.gr button → real authorize redirect (demo mode: simulated callback).
5. Professional onboarding: require gov_gr identity before vetting approval is possible (config flag).
6. Wallet data model: vaccinations, virtual prescriptions, exams, KEPA certificate entries.
7. API: `GET /me/wallet` + per-category refresh endpoints (sync contract).
8. `wallet.store.ts`: grouped documents, sync status, last-synced timestamps.
9. `wallet.page.ts`: document cards, category tabs, viewer (PDF/image via object URL).
10. Sync engine: pull → diff → store, idempotent by document id.
11. Storage: encrypted-at-rest contract note; client never caches health docs in localStorage.
12. Demo backend: seeded vaccination + KEPA certificate for demo accounts.
13. Route + guards: wallet for CLIENT role; professional sees own verification state.
14. Deep-link from wallet → related features (prescription → pharmacy order).
15. Unit tests: session extension, sync diff/idempotency.
16. E2E (demo): login via simulated gov-gr → identity chip visible → wallet shows seeded doc.
17. Failure modes: callback error → user-friendly page, retry without loops.
18. Security checklist: no tokens in URL after callback, state param validated.
19. Docs: sequence diagram of the OIDC flow + sandbox checklist.
20. README + PLAN.md status update.

## 16. Audit Trail Viewer & Consent Management 🟡 (Phase 4)
PLAN.md §4 requires "who viewed which medical measurement, when" — nothing logs today.

**Area:** `core/services/audit/` (new) + `admin/`.

1. `AuditEvent` type: actorId, action, resourceType, resourceId, atMs, meta.
2. `audit.service.ts`: fire-and-forget `log(event)` via `POST /audit`.
3. Instrument reads: vitals load, health-record view, medication view, FHIR export, PDF export.
4. Instrument writes: already implicit (server-side), but add client correlation ids.
5. Demo backend: append-only in-memory audit list (never mutable).
6. `consent.store.ts`: consents per purpose (family sharing, SMS reminders, bluetooth, export).
7. API: `GET/PUT /me/consents` with versioned consent documents.
8. `consents.page.ts`: toggle per purpose with effective-date display + withdrawal.
9. Consent enforcement points: vitals sharing to caregiver requires active consent — enforce in demo backend responses.
10. Re-consent flow: consent document version bump → prompt on next login.
11. Admin audit viewer: filter by actor/action/resource/date, paginated table.
12. Export audit CSV (admin, itself audit-logged).
13. Tamper-evidence contract: server-side hash chain note (client displays chain status).
14. Unit tests: instrumentation points fire exactly once per action.
15. Unit tests: consent enforcement matrix (view vs share vs export).
16. E2E: nurse views vitals → admin audit shows the access entry.
17. E2E: withdraw consent → caregiver loses visibility.
18. A11y: data tables, date-range inputs labelled.
19. Performance: audit logging never blocks UI (async, buffered batch of 10).
20. README + PLAN.md status update.

## 17. Dispute Resolution Console 🟡 (Phase 4)
Escrow has no dispute path; PLAN.md Phase 4 requires a dispute workflow.

**Area:** `features/payments/` + `admin/`.

1. `Dispute` model: bookingId, openedBy, reason enum, description, state, resolution.
2. State machine: `open | under_review | resolved_client | resolved_provider | rejected`.
3. API contract: `POST /disputes`, `GET /me/disputes`, `POST /disputes/:id/state`.
4. Escrow integration: opening dispute freezes the transaction (new escrow status `frozen` — extend `EscrowStatus` union).
5. `disputes.store.ts` + client-side dispute form on a booking (feature 3 timeline).
6. Booking lifecycle hook: dispute blocks completion/refund transitions (feature 3 state machine).
7. Admin console: dispute queue with evidence attachments viewer (stub upload).
8. Evidence model: messages, photos (URL refs), visit GPS records referenced read-only.
9. Resolution actions: release / partial refund (amount input) / full refund — each updates escrow via existing endpoints + new `partial` path contract.
10. Notifications to both parties on every state change (feature 4).
11. SLA timer display: open > 48 h flagged in admin queue.
12. Role guard: only involved parties + ADMIN can view a dispute.
13. Demo backend: seeded dispute for demo client + admin.
14. Timeline UI: full dispute history with actor names + timestamps.
15. Unit tests: dispute state machine + escrow freeze interaction.
16. Unit tests: partial refund math (cents-safe, no floats).
17. E2E: open dispute → escrow frozen → admin resolves refund → ledger + notifications correct.
18. Legal copy placeholders: terms link + arbitration note (i18n).
19. A11y: form errors, timeline as accessible list.
20. README + PLAN.md status update.

## 18. Chat v2 — Attachments, Voice Notes, Booking Context 🟢
Chat works (WS, unread, persistence); marketplaces need file sharing and context cards.

**Area:** `features/marketplace/chat.*`.

1. Message model v2: `attachment?: { kind: image|pdf|voice, url, name, sizeMs }`.
2. API contract: `POST /uploads` (multipart) returning URL; demo: object-URL + size/type validation.
3. Upload UI: attach button, progress, cancel, retry; 10 MB limit; type allowlist.
4. Image thumbnails + lightbox viewer.
5. Voice notes: MediaRecorder capture → webm upload, duration cap 60 s, playback UI.
6. Booking context cards: messages referencing a booking render status + actions inline (needs feature 3).
7. Typing indicators via WS presence channel (demo socket support).
8. Read receipts per message (delivered/read at).
9. Message reactions (emoji) with count aggregation.
10. Search within conversation (client-side filter MVP).
11. Report/block user flow → routes to admin moderation (feature 1 moderation).
12. Virtual scrolling for long threads (`@for` + `cdk-virtual-scroll-viewport`).
13. Optimistic send with failure state + manual retry.
14. Unread separator line ("new messages" marker).
15. Unit tests: attachment validation, optimistic rollback, reactions aggregation.
16. Unit tests: booking-context card resolution from message payload.
17. E2E: send image → thumbnail renders; voice note → plays.
18. E2E: receive message while scrolled up → unread separator + badge.
19. Perf: thread with 1,000 messages — scroll stays ≥ 55 fps (test with profiler).
20. README + PLAN.md status update.

## 19. Accessibility, High-Contrast Mode & i18n (el/en) 🟢
PLAN.md §1 requires WCAG 2.1 AA + dark/high-contrast; app has dark/light only, no language support.

**Area:** `styles.css`, app shell, all feature pages.

1. Third theme: `high-contrast` (theme service extension in `app.ts`).
2. Persist theme choice + respect `prefers-contrast: more` default.
3. Focus-visible policy: consistent ring token in CSS variables.
4. Audit all interactive elements: minimum 44×44 px tap targets (elderly-first).
5. Skip-to-content link in shell.
6. Landmarks + heading hierarchy fix across pages (single h1 per view).
7. `LiveAnnouncer` for async status changes (search results, saves, errors).
8. Full el/en translation setup: `@angular/localize` or lightweight `Transloco` — document choice.
9. Extract all user-facing strings from pages into translation resources.
10. Greek date/number formatting via `LOCALE_ID` registration.
11. Language switcher in shell + persisted preference.
12. `lang` attribute updates on switch; fonts supporting Greek subset.
13. axe CI job: run axe-core in Playwright E2E, fail on critical violations.
14. Manual screen-reader pass checklist (VoiceOver/NVDA) for booking + vitals flows.
15. Contrast verification: all theme pairs ≥ 4.5:1 body, ≥ 3:1 large text (scripted token test).
16. Unit tests: theme service (persist, system preference fallback).
17. E2E: keyboard-only booking completion (no mouse events).
18. E2E: language switch → key screens render translated.
19. Docs: a11y contribution guidelines in README.
20. README + PLAN.md status update.

## 20. PWA, Offline Support & Push Notifications 🟢
Elderly users on flaky home connections; PLAN.md mentions WebSockets but no offline story.

**Area:** `angular.json` PWA config + core services.

1. Add `@angular/pwa` (manifest, icon set, theme colors).
2. `ngsw-config.json`: app shell precache, API cache strategies (network-first for user data, cache-first for assets).
3. Installable criteria pass: manifest fields, maskable icons.
4. Offline detection service + global offline banner.
5. Offline queue: chat messages + vitals entries queued (IndexedDB) and flushed on reconnect.
6. Conflict policy on flush: server timestamps win; local entry marked `synced/failed` states.
7. Push: VAPID key env config + service-worker push handler.
8. Push → notification click routes to the right feature (reuse feature 4 kind map).
9. Opt-in prompt UX (after first successful booking — not on load).
10. Update flow: new version available toast → reload prompt.
11. Cache versioning + safe upgrade testing procedure.
12. Demo-mode compatibility: demo socket works offline (already local).
13. Unit tests: queue enqueue/flush/conflict logic with fake timers.
14. Unit tests: offline banner + detection service.
15. E2E: go offline (Playwright context offline) → vitals entry queued → back online → synced.
16. E2E: manifest valid + installable (lighthouse-ci optional).
17. Perf: initial JS budget still ≤ 300 KB gzipped after SW addition.
18. Security: no health data in SW cache beyond session scope (review ngsw patterns).
19. Docs: README "install on phone" section for families.
20. README + PLAN.md status update.

---

## Suggested execution order

| Wave | Features | Why |
|---|---|---|
| 1 (trust loop) | 1, 3, 2 | Ratings + booking lifecycle unlock reviews, disputes, matching v2 |
| 2 (Phase 3 completion) | 6, 7, 8, 9 | Finishes the PHR/pharmacy scope already promised in PLAN.md |
| 3 (records out) | 10, 11, 12 | Exports + devices; independent, can parallelize |
| 4 (money & compliance) | 13, 14, 15, 16, 17 | PSP decision (open question #2) gates 13 |
| 5 (platform) | 4, 18, 19, 20 | Notifications benefit from landing before reminders/disputes use them |

> Cross-cutting: features 4 (notifications), 16 (audit), 17 (consents) are
> dependencies for several later features — land them early in their wave.
