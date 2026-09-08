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

## PWA & offline (FEATURE_PLAN.md §20)

The app is a Progressive Web App: a service worker precaches the shell, so it
loads and keeps working on flaky or missing connections.

- **Offline queue:** mutating API calls (vitals entries, chat messages,
  prescriptions, …) that fail with a network error are written to an
  IndexedDB outbox and replayed on boot and on reconnect. The server's
  timestamp wins on conflict; entries are marked `pending → syncing →
  synced/failed`. A global banner shows offline/queued/failed state with a
  "Retry now" action.
- **Push notifications:** opt in after your first completed booking (or from
  the bell panel's Mutes). The service worker displays notifications and
  navigates on click to the related feature. The VAPID **public** key lives
  in `src/app/core/services/push/push.config.ts`; the private key belongs
  server-side (env `VAPID_PRIVATE_KEY`) and must never ship in the bundle.
- **Updates:** when a new build is ready, a "Reload" prompt appears instead
  of a silent swap.
- **API cache strategies** (`ngsw-config.json` dataGroups): the marketplace
  catalog is served cache-first (`performance`, 10 min), user data
  (profile/shifts/bookings/visits/notifications) is network-first
  (`freshness`) so it falls back to the cached copy offline. Health data
  (vitals, medications, screenings, prescriptions, consents) is deliberately
  **never** cached (subtask 18: no health data in the SW cache).

  Note: the app tags every API request with the `ngsw-bypass` header so
  Playwright's `page.route` mocks see them (Angular's SW otherwise
  `respondWith()`s every same-origin fetch, hiding requests from
  network-layer interception). The dataGroups above are the declared
  production strategy and take effect when the bypass is removed or scoped in
  a deployment that doesn't run the mock-based E2E suite.

### Sending pushes from the server

The Express server (`server/`) stores push subscriptions and delivers Web
Push through the browser's push service:

- `POST /api/me/push-subscription` / `GET` / `DELETE` — save, read and remove
  the current user's subscription (`push_subscriptions` table).
- `POST /api/me/push/test` — send a test notification to the current user.
- Real events push automatically when a subscription exists:
  - **booking accepted** → client (`booking.accepted` → `/bookings`)
  - **visit completed** → client review prompt (`booking.completed` →
    `/review?booking=…`)
  - **out-of-range vitals reading** → user (`vitals.alert` → `/vitals`)
  - **missed critical medication dose** → user (`medication.missed` →
    `/medications`; idempotent per dose)
  - **screening due** → user (`screening.due` → `/screenings`; once per
    user/type/due-cycle, driven by the server-side mirror of the frontend
    age/sex rule engine in `server/src/screenings.ts`)
  - **certification expiring / expired** → provider
    (`certification.expiring` / `certification.expired` → `/onboarding`;
    once per certificate, `server/src/certifications.ts`, 30-day window)
  - **dispute opened** → other party; **dispute resolved/rejected** → both
    parties (`dispute.opened` / `dispute.resolved` / `dispute.rejected` →
    `/disputes`)

  The minimal models behind those events (bookings status, medications +
  adherence logs with server-side missed-dose detection, disputes,
  screenings + certification expiry) live in `server/src/` so the real
  backend can drive them end to end. Reminder pushes are raised on the
  feature reads (medications, screenings, vetting) and are idempotent, so
  they fire exactly once per due cycle.

VAPID keys are read from env (`VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`) with a committed demo pair as fallback so
`npm run server` works out of the box. Override them in production — the
public key must match the one in
`src/app/core/services/push/push.config.ts`:

```bash
VAPID_SUBJECT=mailto:care@example.com \
VAPID_PUBLIC_KEY=<public-key> \
VAPID_PRIVATE_KEY=<private-key> npm run server
```

Regenerate keys with `npx web-push generate-vapid-keys --json`. End-to-end
check: log in on a PWA install with push enabled, then
`curl -X POST -b <cookies> http://localhost:3000/api/me/push/test`.

### Fullstack E2E: a push really delivered

`npm run e2e:fullstack` runs the compiled app against the real API server
(Postgres, seeded — not demo mode) and proves a Web Push is actually
delivered: `playwright.fullstack.config.ts` boots the server plus a local
HTTPS stand-in push service (`e2e-fullstack/push-receiver.mjs`), the spec
logs in via the UI, registers a subscription pointing at the stand-in, posts
an out-of-range heart rate, and asserts the stand-in received and decrypted
the `vitals.alert` payload (same aes128gcm/click-routing shape the ngsw
worker shows). Requires `docker compose up -d db` and a built `dist/`.

### Install on a phone

1. Build and serve over HTTPS (the service worker and push API require a
   secure context — `localhost` works for local testing):

   ```bash
   ng build
   npx http-server dist/care-marketplace/browser -p 443 -S -C cert.pem -K key.pem
   ```

2. Open the site in Chrome/Edge/Safari on the phone and use the browser
   menu → **Add to Home screen** (Android) / **Add to Home Screen** (iOS).
3. Launch from the home screen: the app opens full-screen, offline-first,
   and queues actions when the connection drops.

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

Phase 3 — Personal Health Record (**complete**): vitals logging with
per-type reference ranges, threshold alerts and trend views, preventive
screening reminders, medication calendar + adherence alerts (missed critical
doses notify the family), e-prescription scan + pharmacy order routing, and
PDF/FHIR health-summary export.

Phase 4 — Integrations & compliance (**complete**): Gov.gr OIDC identity
verification + Health Wallet (vaccinations, KEPA certificates), FHIR R4
resource mapping + export, certification expiry tracking with auto-suspend
from search, immutable audit trail + consent management, dispute resolution
console (escrow freeze, partial refunds), payment methods & payout accounts,
chat v2 (attachments, voice notes, reactions), and the PWA/offline/push
story above. 516 unit tests across 39 files plus Playwright E2E per phase.

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