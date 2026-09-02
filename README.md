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