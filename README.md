# CareMarketplace

Health & Care marketplace and management ecosystem — Angular 22 frontend. See
[`PLAN.md`](./PLAN.md) for the full architecture brief and roadmap.

## Development server

```bash
ng serve
```

Then open `http://localhost:4200/`.

> **Node version:** this project targets Angular CLI 22, which requires
> Node.js `^22.22.3`, `^24.15.0`, or `>=26.0.0` (check with `node --version`).

## Demo mode (no backend needed)

The backend API does not exist yet, so the app ships with an in-memory demo
backend that answers every `/api/**` call — including auth, marketplace
search, booking + escrow, licence vetting, shifts, visits/GPS and payments.
It is **off by default** so real backends and the Playwright E2E network mocks
are unaffected.

Enable it by opening the app with a `demo` query parameter:

```
http://localhost:4200/?demo=1
```

The flag is persisted in `localStorage` (`cm.demo.v1`), so it stays enabled
across navigation. To disable, remove that key from storage (e.g. DevTools →
Application → Local Storage, or `localStorage.removeItem('cm.demo.v1')` in the
console).

Demo accounts (any password works):

| Email                 | Role      |
| --------------------- | --------- |
| `maria@example.com`   | Client    |
| `elena@example.com`   | Nurse     |
| `admin@example.com`   | Admin     |

Demo mode also fakes the chat/visits WebSocket: chat messages get an automatic
peer reply and visit positions are broadcast back to listeners.

**Where it lives:** `src/app/core/api/demo.api.ts` (HTTP interceptor),
`src/app/core/api/demo.socket.ts` (WebSocket), `src/app/core/api/demo.mode.ts`
(enable flag).

## Feature status

Phase 1 — Core Marketplace (**complete**): app shell (role-aware nav,
dark/light theme), email registration + login (+ Gov.gr/Taxisnet button),
RBAC guards/interceptor, role-aware profiles with AMKA/AFM/licence validators,
marketplace search with v1 matching engine (geo/availability/rating), booking
requests, WebSocket chat with unread state and persistence.

Phase 2 — Home Health & Bookings (**complete**): provider onboarding with
licence vetting (admin approve/reject queue), weekly shift availability
calendar + on-demand toggle, GPS-stamped check-in/out with live visit
streaming to the family, clinical log with per-specialty forms + digital
signature capture, the shared nurse ↔ physio care plan, and the escrow flow
(hold on booking → automatic release on completed visit).

Reviews & ratings (FEATURE_PLAN.md §1 — **complete**): completed bookings
show a "Rate this visit" CTA, clients submit one 1–5-star review per
completed booking, ratings with review counts show on marketplace cards
(expandable review lists with report/moderation), and admins moderate
flagged reviews from the admin console.

Saved searches & favorites (FEATURE_PLAN.md §2 — **complete**): searches are
deep-linkable (filters sync to URL params and are restored on reload), the
current filters can be saved under an auto-generated or custom name and
re-applied, renamed or deleted, and caregivers can be favorited with an
optimistic heart toggle plus a session-scoped "Favorites only" filter.

Booking lifecycle (FEATURE_PLAN.md §3 — **complete**): bookings follow a
guarded state machine (`requested → accepted → in_progress → completed`,
plus `cancelled`/`disputed`), enforced client-side (pure functions) and by
the demo backend (409 on races). Providers accept/start/complete; clients
cancel with a policy preview (free ≥24h before start, fee after) and
reschedule; every transition appends to a per-booking event timeline,
notifies the other party and settles escrow (release on completion, refund
on cancellation).

Notification center (FEATURE_PLAN.md §4 — **complete**): shell bell with a
live unread badge, day-grouped panel ("load more" windowing), click-through
that marks read and routes by notification kind, mark-all-read, per-kind
mutes (persisted), browser-push opt-in stub, badge resync on window focus,
and live pushes over the shared WebSocket (booking transitions, vitals
threshold alerts, vetting decisions).

Phase 3 — Personal Health Record (**in progress**): vitals logging with
per-type reference ranges, threshold alerts, and trend views (manual + Web
Bluetooth source flag). Screening alerts, medications and pharmacy remain —
see `PLAN.md §5`.

Phase 4 (pharmacy, gov.gr/FHIR integrations, audit console) is stubbed
routes — see `PLAN.md §5`.

## Building

```bash
ng build
```

Compiles the project into `dist/`. By default uses the production
configuration (optimized, budget-checked).

## Running unit tests

[Vitest](https://vitest.dev/) unit tests for stores and validators:

```bash
ng test
```

## Running end-to-end tests

[Playwright](https://playwright.dev/) covers the phase exit criteria (register
→ find a caregiver → chat, plus Phase 2 onboarding/vetting and shift
calendar). The backend is mocked at the network layer inside the specs:

```bash
npm run e2e   # builds the app, then runs playwright test
```

Or run Playwright alone against a pre-built `dist/`:

```bash
npx playwright test
```

## Structure

```
src/app/
  core/        # auth, api client, demo backend, WebSocket, geolocation
  shared/      # validators, pipes, directives
  features/
    auth/      # login, register, forbidden
    marketplace/# search, matching, bookings, chat
    profiles/  # role-aware profile forms
    vetting/   # licence submission + admin review queue
    home-health/# shifts, visits, live tracking, clinical log, care plan
    payments/  # escrow ledger
    shared/    # validators, signature pad
    health-record/, pharmacy/, integrations/, admin/   # later phases
```

## Additional Resources

- [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
- [`PLAN.md`](./PLAN.md) — architecture brief and implementation plan