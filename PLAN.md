# Care-Marketplace — Implementation Plan
**Health & Care Marketplace & Management ecosystem — Angular 22 frontend**

> Source: architecture brief (v1). This document turns the brief into an executable plan:
> phases → workstreams → deliverables → acceptance criteria.

---

## 1. Architecture Overview (Frontend — Angular 22)

| Concern | Choice |
|---|---|
| State management | Angular Signals + NgRx SignalStore (fine-grained reactivity, low overhead) |
| Component model | 100% Standalone Components/Directives, control-flow syntax (`@if`, `@for`, `@switch`), `@defer` views for fast initial load |
| Forms & validation | Typed Reactive Forms + custom async validators (ΑΜΚΑ/ΑΦΜ check, professional licence-number check) |
| Security & auth | OAuth2 / OpenID Connect, RBAC Guards, Interceptors for token rotation + audit logging |
| UI/UX | Angular Material / Tailwind CSS, WCAG 2.1 AA, Dark + High-Contrast mode (elderly / low-vision users) |
| Real-time | WebSockets / RxJS Subjects — live chat, GPS visit tracking, SOS alerts |

### Proposed folder structure (feature-based)

```
src/
  app/
    core/                    # auth, interceptors, signals store, api clients, config
      auth/                  # OIDC, guards, roles
      store/                 # SignalStore feature stores
      services/              # api/, ws/, audit/
    shared/                  # UI kit, pipes, directives, validators
    features/
      marketplace/           # search, matching, bookings, chat        (Phase 1)
      caregivers/            # shifts, logs, check-in/out, GPS        (Phase 2)
      home-health/           # nurses, physio, clinical forms         (Phase 2)
      payments/              # escrow, payouts                        (Phase 2)
      health-record/         # PHR, vitals, screening alerts          (Phase 3)
      pharmacy/              # e-prescription, delivery, reminders    (Phase 3)
      integrations/          # gov.gr wallet, FHIR export             (Phase 4)
      admin/                 # vetting, compliance, disputes, audit   (Phase 4)
```

---

## 2. User Roles (RBAC matrix)

| # | Role | Key capabilities |
|---|---|---|
| 1 | **Client / Family member** | Search, bookings, health-metric tracking, prescriptions, expense management |
| 2 | **Caregiver / Babysitter** | Shift management, daily care log, check-in/out |
| 3 | **Home Nurse** | At-home nursing acts (blood draw, dressing, IV), clinical log |
| 4 | **Physiotherapist** | Rehab session scheduling, exercise programme + mobility progress |
| 5 | **Pharmacy Partner** | Receive orders / dispense e-prescriptions, home delivery management |
| 6 | **Super Admin / Compliance Officer** | Licence verification, certifications, dispute resolution, auditing |

RBAC is enforced at three layers: route guards → feature-store selectors → API scopes.

---

## 3. Module Breakdown

### A. Home Health Services (Nurses & Physiotherapists) — Phase 2
- **On-demand & scheduled medical visits** — bookable specialised acts (injections, pressure-ulcer care, post-stroke rehab, respiratory physio).
- **Clinical documentation** — standardised per-specialty clinical forms with therapist digital signature.
- **Care-plan collaboration** — shared care plan; nurse and physio cross-update patient status.

### B. Pharmacies & Medication Management — Phase 3
- **e-Prescription & pharmacy sync** — barcode upload of the virtual prescription, auto-routing to nearest partner pharmacy, home delivery.
- **Smart pillbox & reminders** — medication calendar, push + SMS/voice reminders to patient or caregiver.
- **Interaction & adherence tracking** — log taken/not-taken; alert family on missed critical medication.

### C. Personal Health Record (PHR) — Phase 3
- **Vitals logging** — blood pressure, glucose, SpO2, weight, temperature, heart rate; Web Bluetooth API support for BT medical devices.
- **Preventive screening alerts** — age/gender-based reminders (mammography, cardio check-up, infant/adult vaccinations).
- **Exportable health summary** — PDF / HL7 FHIR export for the treating physician.

### D. Gov.gr / Health Wallet Integration — Phase 4
- **Taxisnet / Gov.gr authentication** — OAuth2 / Gov.gr OIDC for user and professional identity verification.
- **Gov Health Wallet** — sync vaccination history, virtual prescriptions, diagnostic exams; secure storage/viewing of medical certificates and KEPA disability certificates.

---

## 4. Security & Compliance (cross-cutting, starts Phase 1)

- **GDPR — special-category (health) data**
  - AES-256 encryption at rest, TLS 1.3 in transit.
  - Explicit consent management for data sharing (family ↔ therapists).
  - Full audit trails: who viewed which medical measurement, and when.
- **HL7 / FHIR compatibility** — data model aligned with `Patient`, `Observation`, `MedicationRequest`, `CarePlan` resources for future hospital-system integration.

---

## 5. Delivery Roadmap

### Phase 1 — Core Marketplace
**Goal:** working marketplace loop (search → match → chat).

| Workstream | Deliverables |
|---|---|
| Foundation | Angular 22 workspace, standalone shell, `@defer` boot, Tailwind/Material theme, WCAG + contrast mode |
| Auth | Email + Taxisnet OIDC login, session store, RBAC guards, token-rotation interceptor |
| Profiles | Client & Caregiver profiles, async validators (ΑΜΚΑ/ΑΦΜ, licence number) |
| Marketplace | Search + filters, matching engine (v1: geo + availability + rating), booking request |
| Chat | WebSocket real-time chat, unread state, SignalStore persistence |

**Exit criteria:** a family can register (email or Taxisnet), find a caregiver, and exchange messages in real time.

### Phase 2 — Home Health & Bookings
**Goal:** professional home-health visits with trust & payments.

| Workstream | Deliverables |
|---|---|
| Nurse/Physio onboarding | Professional profiles, licence vetting workflow (admin review queue) |
| Shift calendar | Availability grid, booking of scheduled acts, on-demand requests |
| Check-in / GPS | Visit check-in/out with GPS stamp, live visit tracking for family |
| Clinical log | Per-specialty clinical forms, digital signature capture |
| Care plan | Shared care-plan entity (nurse ↔ physio updates) |
| Payments | Escrow flow: hold on booking → release on completed visit |

**Exit criteria:** a nurse completes a GPS-verified home visit with a signed clinical log; escrow releases automatically.

### Phase 3 — Health Tracking & Pharmacy
**Goal:** the family manages ongoing care, not just one-off visits.

| Workstream | Deliverables |
|---|---|
| PHR | Vitals entry (manual + Web Bluetooth), trends view, threshold alerts |
| Screening | Age/gender preventive-check reminder engine |
| Medication | Medication calendar, smart reminders (push/SMS/voice), adherence log |
| Pharmacy | e-Prescription barcode upload, pharmacy routing, delivery status tracking |
| Export | PDF + FHIR health summary export |

**Exit criteria:** a missed critical medication triggers a family alert; a prescription reaches a partner pharmacy and delivery is tracked in-app.

### Phase 4 — Integrations & Compliance
**Goal:** national integration + audit-grade compliance.

| Workstream | Deliverables |
|---|---|
| Gov.gr | OIDC integration, identity verification for professionals |
| Health Wallet | Vaccination/prescription/exam sync, KEPA certificate storage |
| FHIR | `Patient`/`Observation`/`MedicationRequest`/`CarePlan` resource mapping, export endpoint |
| Vetting automation | Licence verification workflow, certification expiry tracking |
| Admin & audit | Dispute resolution console, immutable audit trail viewer, consent management UI |

**Exit criteria:** a professional's identity is verified via Gov.gr; every access to a health record appears in the audit viewer.

---

## 6. Cross-Phase Engineering Practices

- **Testing:** unit (Vitest/Jest) for stores & validators; component tests for clinical forms; E2E (Playwright) per phase exit criteria.
- **Type safety:** strict TypeScript; typed Forms everywhere; generated API types (OpenAPI) once the backend contract exists.
- **Accessibility:** axe checks in CI; contrast mode validated against WCAG 2.1 AA.
- **Performance budget:** initial JS ≤ 300 KB gzipped; route-level `@defer` for below-the-fold panels.
- **Secrets/config:** environment files per stage; no secrets in repo.

---

## 7. Open Questions (decide before Phase 1 build)

1. **Backend:** is there an existing API, or does Phase 1 include backend scaffolding (NestJS/Firebase)? This gates auth, chat and escrow.
2. **Payments provider:** escrow requires a PSP that supports holds (Stripe Connect / local PSP). Choice affects Phase 2 design.
3. **Gov.gr integration:** official sandbox access + API credentials are needed early — lead time is usually long, start the request during Phase 1.
4. **Web Bluetooth scope:** which device models must be supported first (BP monitor, glucometer)?
5. **Design system:** Material vs Tailwind-only — pick one to avoid mixed conventions.
