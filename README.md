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

**The real Express/Postgres API in `server/` is the default path** — the app
talks to it unless you explicitly opt in to the demo backend.

The in-memory demo backend answers every `/api/**` call — auth, marketplace
search, booking + escrow, licence vetting, shifts, visits/GPS, payments and
the personal health record (vitals, medications, medical history, contacts,
consents) — so you can explore the app with no server and no database. It is
**off by default** so the real backend and the Playwright E2E network mocks are
unaffected, and it is never a silent fallback: while it is active the shell
shows a **Demo mode** banner so a demo session is never mistaken for real data.

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

## Languages (Ελληνικά / English)

The UI is bilingual via a **runtime** switcher: one build serves both locales,
so there is no locale-prefixed routing and no build per language.

- **Switching.** The `EN | ΕΛ` control in the topbar. The choice is persisted in
  `localStorage` (`cm.lang.v1`) and mirrored onto `<html lang>`.
- **First visit.** A stored choice wins; otherwise the browser language is
  matched on its primary subtag (`el-GR` → Greek), falling back to English.
  This is why the Playwright suite still sees English labels — its locale is
  `en-US`.
- **Translating a template.** `{{ i18n.t('nav.vitals') }}`. `t()` reads a
  signal, so only the views that read it re-render on a language switch.
- **Adding a string.** Add the key to *both* `en` and `el` in
  `src/app/core/i18n/translations.ts`. A key missing from `el` falls back to
  English and an unknown key renders as the key itself, so a gap degrades
  readably instead of blanking out.
- **Plurals.** Pass `count` and define `<key>.one` / `<key>.other` — see
  `offline.pending.one` / `offline.pending.other`.

`src/app/core/i18n/i18n.service.spec.ts` enforces dictionary parity: adding a
key to `en` without `el` fails the unit suite.

### Messages authored by stores

A store cannot inject `I18n` (unit tests construct stores directly, so an
`inject()` in the constructor would throw outside an injection context). Instead
of hard-coding English, a store holds a `LocalizedMessage`
(`src/app/core/i18n/localized-message.ts`) — the *source* of the message:

- **App-authored** → `message.set({ key: 'booking.error.notFound' })`. The page
  renders it with `i18n.message(store.errorSource(), store.error())`, so it
  follows the active language.
- **Server-provided** →
  `message.setFromServer(error?.error?.message, { key: '…' })`. The server's own
  copy passes through verbatim; the key applies only when it sent none.

`message.value()` is the English rendering, so existing behaviour and the specs
that read the plain string are unchanged. Pure helpers that reject
(`canSubmitReview`, `validateAttachment`) return a `reasonKey` / `errorKey`
next to the English text for the same reason. `translateStatic()` is the
no-DI translation entry point.

`localized-message.spec.ts` scans every store that owns a slot for its
`key: '…'` literals and requires each to exist — and to actually be translated —
in both dictionaries, so a typo cannot silently render the key itself. A second
test walks `src/app/{core/services,features}` and fails if a file gains a
`LocalizedMessage` without being added to that scanned list.

**Store slots are converted app-wide** — pharmacy orders and prescriptions,
payments (methods, escrow, payouts, disputes), the health-record stores
(vitals, medications, history, contacts, screening, reminders, export),
home-health (visits, shifts, clinical log, care plan), consents, profiles,
vetting, the integrations wallet and the Bluetooth service. Notification copy
follows the same rule: `notify()` / `toast()` accept a `TranslatableMessage`, and
server-pushed or server-authored text stays verbatim.

**Persistence caveat.** `autoSearchName()` builds a saved search's default name
once, in the language active at save time, and the name is then user data — a
later language switch does not rewrite it.

**Converted so far** (shell + 6 pages + 3 components): the app chrome, vitals,
preventive care, medications, the medical-history register, contacts & phone
numbers, consent settings, the medicine-instructions sheet, the
reminder channel/settings component and prescription reminder wizard, and the
care/visits batch — marketplace search, booking lifecycle, chat and reviews.
The remaining feature *pages* are still English-only (their store messages are
not) and are converted in themed batches.

Some pages were Greek-first (the history register, contacts, the reminder
wizard), so their Playwright specs run under `test.use({ locale: 'el-GR' })`.
That keeps their original assertions intact *and* gives the runtime detection
real coverage, while the other specs exercise the English branch.

**Server-driven tokens.** Statuses and event kinds arrive from the API as
machine identifiers (`in_progress`, `rescheduled`). Their English translation
is deliberately the raw token, so the specs, the export payload and any URL or
API contract keep working unchanged, while Greek gets a real label. Enum labels
that are *not* contractual (roles, sort options, reminder channels) read
normally in English.

## Design system

`src/styles.css` is the single source of truth — design tokens (colour,
spacing, radius, elevation, type scale) plus reusable component classes
(`.btn`, `.card`, `.badge`, `.table`, `.tabs`, `.field`, `.empty-state`, …).

- **Tokens first.** Reference `var(--…)` rather than hard-coded values so light
  and dark themes stay in step. Both themes are declared up top, as `:root` and
  `:root[data-theme='dark']`.
- **Shell layout.** A sidebar dashboard: grouped, role-filtered navigation, a
  topbar carrying the language switch, theme toggle and notification bell, and
  an off-canvas drawer below 60 rem.
- **Migration state.** The shell and the six health-record pages below are on
  the new system. The legacy page classes (`.filters`, `.results`, `.error`,
  the offline/sync banners) are kept deliberately in a section at the bottom of
  the stylesheet, because the ~31 not-yet-migrated feature pages still use
  them. They are removed as each page moves over.

Converted: shell, vitals, preventive care, medications, medical history,
contacts & phone numbers, consent settings.

## Real API server + Postgres

`server/` is an Express API backed by Postgres: auth/session, marketplace,
bookings + escrow, vitals, medications + adherence logging, the medical-history
register and prescriptions, contacts, reminder preferences, consents, audit
events and push subscriptions. Compose provides the database:

```bash
npm run db:up      # docker compose up -d db
npm run server     # tsx watch server/src/index.ts → http://localhost:3000
npm run db:reset   # recreate the schema + seed the demo data
```

To run the API *and* the built app *and* the database together in containers,
see the **Docker** section below.

Server specs run against Postgres (Vitest):

```bash
npm --prefix server test
```

## Docker (app + API + Postgres)

`docker-compose.yml` builds and runs the whole stack in containers:

| Service | Built from | Host | Role |
| --- | --- | --- | --- |
| `app` | root `Dockerfile` (Node build → nginx) | http://localhost:8080 | production SPA bundle + reverse proxy for `/api` |
| `server` | `server/Dockerfile` (Express on tsx) | http://localhost:3000 | REST + WebSocket API; applies `schema.sql` and seeds on boot |
| `db` | `postgres:16-alpine` | 5432 | database (named volume `care-db-data`) |

```bash
docker compose up -d --build   # build the images and start the stack
docker compose up --wait       # same, and block until every healthcheck passes
docker compose logs -f server  # watch the schema/bootstrap + seed + requests
docker compose down            # stop everything, keep the database volume
docker compose down -v         # stop and delete the database volume
```

Then open http://localhost:8080 and log in with a seeded account — e.g.
`maria@example.com` / `demo1234` (`DEMO_PASSWORD` in `server/src/seed.ts`; the
"any password" rule in the demo table above applies to **demo mode**, not the
real API).

The `app` container is the only public entry point: nginx serves the compiled
bundle and proxies `/api/**` — including the `/api/ws/chat` and
`/api/ws/visits` WebSocket upgrades — to `server:3000`, so the browser stays on
a single origin and the httpOnly session cookies work without CORS. The API
container ships no SPA bundle, so an image built from `server/` alone still
answers `GET /api/health` and the REST routes.

`npm run db:up` / `npm run db:reset` are unchanged — they start just the `db`
service for host-run development (`npm run server` + `ng serve`).

### Deployment notes

- **TLS and cookies.** `server/src/auth.ts` marks the session cookies `Secure`
  when `NODE_ENV=production`, and browsers reject `Secure` cookies over plain
  HTTP (except on `localhost`). The compose file therefore leaves `NODE_ENV`
  unset so the stack works out of the box; set `NODE_ENV=production` once TLS
  terminates in front of it.
- **Secrets.** Override `JWT_SECRET` (and `DEMO_PASSWORD`) from your
  environment or a `.env` file — the committed fallbacks are demo-only.
- **Web Push.** The API falls back to a committed demo VAPID pair, so
  notifications do not actually deliver until you supply your own keys.
  Uncomment `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in `docker-compose.yml`
  and set them; the public key must match the one in
  `src/app/core/services/push/push.config.ts`. (Leave them commented to keep
  the demo pair — an empty value would override it rather than fall back.)
- **Health.** The API exposes `GET /api/health`; both images declare a
  `HEALTHCHECK` and compose gates startup on it, so `app` only starts once the
  API can answer.
- **Caching.** Fingerprinted bundles are served `immutable` for a year, while
  `index.html`, `ngsw-worker.js`, `ngsw.json` and the web manifest are sent
  `no-cache` so a deployed app update is picked up on the next load.

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

Medical-history register (FEATURE_PLAN.md §21 — **complete**): a `/history`
register for conditions (curated ICD-11 catalog with Greek labels + search),
allergies (kind/severity, feeding the drug-allergy safety banner),
immunizations, medical events, symptoms and prescriptions, with inline add
forms, soft-archive, a filterable chronological timeline, family read-only
recipient views, server CRUD and demo parity. Delivered pharmacy orders can be
staged into the prescriptions register.

Health-record extensions (HEALTH_RECORDS_PLAN.md — **complete**): a contact
phone manager (`/contacts`) with emergency/ICE and care-team groups, one-tap
`tel:` calling, a single primary per group, and ICE contacts printed on the
health-summary PDF and exported as FHIR `Patient.contact`; structured per-pill
medicine instructions (dose form, route, food relation, max daily doses,
warnings, side effects, storage) printed on the PDF medication rows and
surfaced on the FHIR `MedicationRequest` dosage (`text`, `route`,
`additionalInstruction`) and `note` fields, with a curated Greek-first catalog
that auto-fills only after confirmation; and pill reminders derived from a
prescription's free-text frequency (Greek + English), confirmed in a
adjust-schedule wizard that creates the linked medication and persists the
reminder channels.

Phase 4 — Integrations & compliance (**complete**): Gov.gr OIDC identity
verification + Health Wallet (vaccinations, KEPA certificates), FHIR R4
resource mapping + export, certification expiry tracking with auto-suspend
from search, immutable audit trail + consent management, dispute resolution
console (escrow freeze, partial refunds), payment methods & payout accounts,
chat v2 (attachments, voice notes, reactions), and the PWA/offline/push
story above.

## Test suites

- **Frontend unit** — 712 Vitest tests across 55 files (`npm run unit`).
- **Server** — Vitest specs against Postgres (`npm --prefix server test`);
  start the database with `npm run db:up` first.
- **E2E** — 51 Playwright tests across 21 specs (`npm run e2e`), driving the
  real UI; most run fully against the in-memory demo backend, the rest mock
  `/api/**` at the network layer.
- **Fullstack push** — `npm run e2e:fullstack` proves a real Web Push is
  delivered against the seeded Postgres server.

## Building

```bash
ng build
```

Compiles the project into `dist/`. By default uses the production
configuration (optimized, budget-checked).

## Running unit tests

[Vitest](https://vitest.dev/) unit tests for stores, pure logic, FHIR mappers
and validators:

```bash
npm run unit   # single non-watch run
ng test        # Angular CLI test runner
```

## Running end-to-end tests

[Playwright](https://playwright.dev/) covers the phase exit criteria through
the real UI: register → find a caregiver → chat, Phase 2 onboarding/vetting
and the shift calendar, Phase 3 vitals and the PHR (history, screenings,
medications, export, pharmacy) and the `phase6-*` contacts,
medicine-instructions and prescription-reminder flows. Most specs run against
the in-memory demo backend; the network-mocked ones intercept `/api/**`:

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
  core/          # auth, api client, demo backend, WebSocket, geolocation, i18n
  shared/        # FHIR R4 mappers + bundle/validator, validators, signature pad, utils
  features/
    auth/        # login, register, forbidden
    marketplace/ # search, matching, bookings, chat
    profiles/    # role-aware profile forms
    vetting/     # licence submission + admin review queue
    home-health/ # shifts, visits, live tracking, clinical log, care plan
    payments/    # escrow ledger
    health-record/ # PHR: vitals, screenings, medications, history, contacts, export
    pharmacy/    # e-prescription scan + order routing/console
    integrations/# Gov.gr wallet, certification status
    consents/    # consent ledger views
    admin/       # vetting / audit / consent administration
```

## Additional Resources

- [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
- [`PLAN.md`](./PLAN.md) — architecture brief and implementation plan