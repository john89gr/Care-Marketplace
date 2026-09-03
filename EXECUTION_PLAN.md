# Care-Marketplace — Execution Plan (10 Subagents)

## Status snapshot
- ✅ Phase 1 (marketplace loop) — complete, tested, E2E passing
- ✅ Phase 2 (home health + escrow) — complete, tested, E2E passing
- 🔶 Phase 3 (PHR) — vitals, screening, medications, pharmacy mostly complete; **Smart Reminders (§8) has 5 failing tests**
- ⬜ Phase 4 (gov.gr, FHIR, audit, disputes, payments methods, pwa, a11y, i18n, chat v2, bluetooth) — not started or stubbed

## Workstream assignments (10 parallel worktree sessions)

| # | Workstream | Subagent | Scope | Key files |
|---|---|---|---|---|
| 1 | **Reminders Bug Fix** | Worktree-1 | Fix 5 failing tests in `reminders.logic.spec.ts` + `reminders.store.spec.ts` | `reminders.logic.ts`, `reminders.store.ts` |
| 2 | **Dispute Resolution** | Worktree-2 | §17: Dispute model, state machine, store, escrow freeze, admin console, notifications, E2E | `disputes.store.ts`, `admin.page.ts`, `demo.api.ts` |
| 3 | **Payment Methods & Payout** | Worktree-3 | §13: PSP research doc, payment-method store, payout store, card form, Luhn, fee math, E2E | `payments/` feature, `demo.api.ts` |
| 4 | **Gov.gr OIDC & Health Wallet** | Worktree-4 | §15: OIDC flow, session extension, wallet models/store/page, demo seeding, E2E | `core/auth/`, `features/integrations/` |
| 5 | **Certification Expiry** | Worktree-5 | §14: expiresAtMs tracking, daily check, auto-suspend from search, admin dashboard, E2E | `vetting/`, `marketplace.store.ts`, `demo.api.ts` |
| 6 | **Audit Trail & Consent** | Worktree-6 | §16: AuditEvent, instrumentation, consent store, consents page, admin viewer, enforcement, E2E | `core/services/audit/`, `core/services/` |
| 7 | **FHIR Export** | Worktree-7 | §11: FHIR R4 types, 4 mappers, bundle wrapper, validator, JSON download, E2E | `shared/fhir/` |
| 8 | **Web Bluetooth Pairing** | Worktree-8 | §12: Bluetooth service, BP monitor + glucometer UUIDs, GATT parsers, pairing UI, demo, E2E | `core/services/bluetooth/` |
| 9 | **Chat v2** | Worktree-9 | §18: Attachments, voice notes, booking context cards, typing, read receipts, reactions, virtual scroll, E2E | `features/marketplace/chat.*` |
| 10 | **PWA + Offline + A11y + i18n** | Worktree-10 | §20 + §19: PWA manifest/SW, offline queue, push, high-contrast theme, WCAG, i18n (Transloco), Greek translations, E2E | `angular.json`, `src/manifest/`, `src/styles/` |

## Cross-cutting dependencies
- Feature 4 (Notifications) — already implemented, used by §3, §8, §12, §14, §17
- Feature 16 (Audit/Consent) — partially implemented (audit.service.ts), extended by §6, §8, §15
- Demo backend (`demo.api.ts`) — all stores depend on it; extend per feature
- Each worktree: implement store + pure logic + unit tests + demo backend + E2E per the 20-subtask spec in FEATURE_PLAN.md §[N]

## Verification
- Run `npx vitest run` after each workstream
- Run `npx playwright test e2e/phase5-*.spec.ts` for E2E coverage
- Update FEATURE_PLAN.md status + README after each feature lands
