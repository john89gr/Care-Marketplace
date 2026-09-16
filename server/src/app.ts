import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import {
  auth,
  AuthedUser,
  clearAuthCookies,
  createUser,
  findUserByEmail,
  findUserById,
  requireAuth,
  requireRole,
  setAuthCookies,
  userFromRequest,
  verifyPassword,
} from './auth';
import { query, queryOne, Row } from './db';
import {
  getSubscription,
  saveSubscription,
  removeSubscription,
  notifyUser,
} from './push';
import { vitalsAlert, computeVitalStats } from './vitals';
import { asBundle, DEFAULT_LANG, Lang, pick, requestLang } from './locale';
import { detectMissedDoses, dateKey, minutesSinceMidnight, validateInstructions } from './medications';
import { checkScreeningDue, ScreeningType } from './screenings';
import { checkCertificationExpiry } from './certifications';
import { historyRouter } from './history';
import { contactsRouter } from './contacts';
import { consentsRouter, consentGranted, loadConsents } from './consents';
import { marketplaceRouter } from './marketplace';
import { notificationsRouter } from './notifications';
import { auditRouter } from './audit';
import { paymentsRouter } from './payments';
import { pharmacyRouter } from './pharmacy';
import { walletRouter } from './wallet';
import { uploadsRouter } from './uploads';
import { chatRouter } from './chat';
import { clinicalRouter } from './clinical';
import { demoRouter } from './demo';
import { disputesRouter } from './disputes';
import { fhirRouter } from './fhir';

const hour = 60 * 60 * 1000;
const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb', strict: false }));

  // ---- Demo sign-in roster (the login page's one-click accounts) ----
  // Mounted first and unauthenticated by design: it exists to hand out the
  // seeded demo logins. Off in production (404) unless explicitly enabled.
  app.use('/api', demoRouter());

  // ---- Auth ----
  app.post('/api/auth/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { displayName, email, password, role } = req.body as {
        displayName?: string;
        email?: string;
        password?: string;
        role?: string;
      };
      if (!email || !password || !displayName) {
        res.status(400).json({ message: 'Name, email and password are required.' });
        return;
      }
      const existing = await findUserByEmail(email);
      if (existing) {
        res.status(409).json({ message: 'An account with that email already exists.' });
        return;
      }
      const roles = [role === 'nurse' || role === 'caregiver' ? role : 'client'];
      const user = await createUser({ displayName, email, password, roles });
      const refreshToken = await auth.createRefreshSession(user.id);
      const accessToken = await auth.tokenFor(auth.toUser(user));
      const payload = auth.sessionPayloadFor(auth.toUser(user));
      setAuthCookies(res, accessToken, refreshToken);
      res.status(201).json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const user = email ? await findUserByEmail(email) : null;
      if (!user || !password || !(await verifyPassword(password, user.password_hash))) {
        res.status(401).json({ message: 'Unknown email or password.' });
        return;
      }
      const refreshToken = await auth.createRefreshSession(user.id);
      const accessToken = await auth.tokenFor(auth.toUser(user));
      setAuthCookies(res, accessToken, refreshToken);
      res.json(auth.sessionPayloadFor(auth.toUser(user)));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.['cm_refresh'] as string | undefined;
      if (!refreshToken) {
        res.status(401).json({ message: 'No refresh token.' });
        return;
      }
      const rotated = await auth.rotateRefreshSession(refreshToken);
      if (!rotated) {
        clearAuthCookies(res);
        res.status(401).json({ message: 'Session expired. Please log in again.' });
        return;
      }
      const accessToken = await auth.tokenFor(rotated.user);
      setAuthCookies(res, accessToken, rotated.refreshToken);
      res.json(auth.sessionPayloadFor(rotated.user));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = req.cookies?.['cm_refresh'] as string | undefined;
      if (refreshToken) {
        await auth.revokeRefreshSession(refreshToken);
      }
      clearAuthCookies(res);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // ---- Gov.gr / Taxisnet OIDC (simulated sandbox, §15) ----
  // Demo parity with the in-memory backend: authorize mints a state-bound
  // single-use code; the callback validates the pair and opens a session
  // (current user, else the demo client) with idVerifiedVia: 'gov_gr'.
  const govGrPending = new Map<string, { code: string; expiresAtMs: number }>();

  app.get('/api/auth/gov-gr/authorize', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const state = randomBytes(16).toString('hex');
      const code = `demo-code-${randomBytes(4).toString('hex')}`;
      govGrPending.set(state, { code, expiresAtMs: now() + 10 * 60 * 1000 });
      if (govGrPending.size > 1000) {
        const oldest = govGrPending.keys().next().value;
        if (oldest) {
          govGrPending.delete(oldest);
        }
      }
      res.json({
        authorizeUrl: 'https://sandbox.gov.gr/authorize',
        state,
        code,
        demo: true,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/gov-gr/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state } = req.body as { code?: unknown; state?: unknown };
      const pending = typeof state === 'string' ? govGrPending.get(state) : undefined;
      if (
        typeof code !== 'string' ||
        !code.startsWith('demo-code-') ||
        !pending ||
        pending.code !== code ||
        pending.expiresAtMs < now()
      ) {
        res.status(400).json({ message: 'Invalid or expired authorization code.' });
        return;
      }
      govGrPending.delete(state as string);
      const sessionUser = userFromRequest(req);
      const row = sessionUser
        ? await findUserById(sessionUser.userId)
        : await findUserByEmail('maria@example.com');
      if (!row) {
        res.status(401).json({ message: 'No account for this identity.' });
        return;
      }
      const user = auth.toUser(row);
      const refreshToken = await auth.createRefreshSession(user.userId);
      const accessToken = await auth.tokenFor(user);
      setAuthCookies(res, accessToken, refreshToken);
      res.json({ ...auth.sessionPayloadFor(user), idVerifiedVia: 'gov_gr' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    res.json(auth.sessionPayloadFor(req.user as AuthedUser));
  });


  // ---- Profiles ----
  app.get('/api/profiles/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const profile = await queryOne<Row>(
        `SELECT phone, amka, afm, licence_number, hourly_rate, date_of_birth, sex FROM profiles WHERE user_id = $1`,
        [me.userId]
      );
      res.json({
        userId: me.userId,
        displayName: me.displayName,
        phone: profile?.phone ?? '',
        amka: profile?.amka ?? '',
        afm: profile?.afm ?? '',
        licenceNumber: profile?.licence_number ?? '',
        hourlyRate: profile?.hourly_rate ?? null,
        dateOfBirth: profile?.date_of_birth ?? '',
        sex: profile?.sex ?? '',
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/profiles/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as {
        phone?: string;
        amka?: string;
        afm?: string;
        licenceNumber?: string;
        hourlyRate?: number | null;
        dateOfBirth?: string;
        sex?: string;
      };
      const current = await queryOne<Row>(`SELECT * FROM profiles WHERE user_id = $1`, [me.userId]);
      const merged = {
        phone: body.phone ?? current?.phone ?? '',
        amka: body.amka ?? current?.amka ?? '',
        afm: body.afm ?? current?.afm ?? '',
        licenceNumber: body.licenceNumber ?? current?.licence_number ?? '',
        hourlyRate: body.hourlyRate !== undefined ? body.hourlyRate : (current?.hourly_rate ?? null),
        dateOfBirth: body.dateOfBirth ?? current?.date_of_birth ?? '',
        sex: body.sex ?? current?.sex ?? '',
      };
      await query(
        `INSERT INTO profiles (user_id, phone, amka, afm, licence_number, hourly_rate, date_of_birth, sex)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO UPDATE SET
           phone = EXCLUDED.phone, amka = EXCLUDED.amka, afm = EXCLUDED.afm,
           licence_number = EXCLUDED.licence_number, hourly_rate = EXCLUDED.hourly_rate,
           date_of_birth = EXCLUDED.date_of_birth, sex = EXCLUDED.sex
        `,
        [me.userId, merged.phone, merged.amka, merged.afm, merged.licenceNumber, merged.hourlyRate, merged.dateOfBirth, merged.sex]
      );
      res.json({ ...merged, userId: me.userId, displayName: me.displayName });
    } catch (error) {
      next(error);
    }
  });

  // ---- Vetting ----
  app.get('/api/vetting/submissions/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Licence-expiry reminders fire on this read (once per cert/kind).
      try {
        await checkCertificationExpiry((req.user as AuthedUser).userId);
      } catch {
        // A push/notice problem never fails the read.
      }
      const row = await queryOne<Row>(
        `SELECT * FROM vetting_submissions WHERE provider_id = $1 ORDER BY submitted_at_ms DESC LIMIT 1`,
        [(req.user as AuthedUser).userId]
      );
      res.json(row ? submissionFromRow(row) : null);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/vetting/submissions', requireAuth, requireRole('admin'), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await query<Row>(`SELECT * FROM vetting_submissions ORDER BY submitted_at_ms DESC`);
      res.json(rows.map(submissionFromRow));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/vetting/submissions', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as { licenceNumber?: string; specialties?: string[]; note?: string };
      const row = {
        id: id('v'),
        provider_id: me.userId,
        provider_name: me.displayName,
        licence_number: body.licenceNumber ?? '',
        specialties: body.specialties ?? [],
        status: 'pending',
        submitted_at_ms: now(),
        reviewed_at_ms: null,
        reviewed_by: null,
        note: body.note ?? '',
      };
      await query(
        `INSERT INTO vetting_submissions
         (id, provider_id, provider_name, licence_number, specialties, status, submitted_at_ms, reviewed_at_ms, reviewed_by, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8)`,
        [row.id, row.provider_id, row.provider_name, row.licence_number, row.specialties, row.status, row.submitted_at_ms, row.note]
      );
      res.status(201).json(submissionFromRow(row));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/vetting/submissions/:id/review', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const decision = req.body?.decision as 'approved' | 'rejected' | undefined;
      const note = (req.body?.note as string | undefined) ?? '';
      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({ message: 'Decision must be approved or rejected.' });
        return;
      }
      const admin = req.user as AuthedUser;
      const result = await query<Row>(
        `UPDATE vetting_submissions
         SET status = $1, reviewed_at_ms = $2, reviewed_by = $3, note = $4
         WHERE id = $5 RETURNING *`,
        [decision, now(), admin.displayName, note, req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Submission not found.' });
        return;
      }
      res.json(submissionFromRow(result[0]));
    } catch (error) {
      next(error);
    }
  });

  // ---- Shifts ----
  app.get('/api/shifts/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const availability = await query<Row>(
        `SELECT id, provider_id, weekday, start_minutes, end_minutes, on_demand
         FROM availability WHERE provider_id = $1`,
        [me.userId]
      );
      const shifts = await query<Row>(
        `SELECT * FROM shifts WHERE provider_id = $1 ORDER BY scheduled_at_ms ASC`,
        [me.userId]
      );
      res.json({
        availability: availability.map((a) => ({
          id: a.id,
          weekday: a.weekday,
          startMinutes: a.start_minutes,
          endMinutes: a.end_minutes,
        })),
        onDemand: availability.some((a) => a.on_demand),
        shifts: shifts.map(shiftFromRow),
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/shifts/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as {
        availability?: { id?: string; weekday: number; startMinutes: number; endMinutes: number }[];
        onDemand?: boolean;
      };
      const slots = body.availability ?? [];
      const onDemand = Boolean(body.onDemand);
      await query(`DELETE FROM availability WHERE provider_id = $1`, [me.userId]);
      for (const slot of slots) {
        await query(
          `INSERT INTO availability (id, provider_id, weekday, start_minutes, end_minutes, on_demand)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [slot.id ?? id('a'), me.userId, slot.weekday, slot.startMinutes, slot.endMinutes, onDemand]
        );
      }
      res.json({ availability: slots, onDemand });
    } catch (error) {
      next(error);
    }
  });

  // ---- Bookings + escrow hold ----
  app.get('/api/bookings', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        `SELECT b.*, c.display_name AS caregiver_name, u.display_name AS client_name
         FROM bookings b
         JOIN caregivers c ON c.id = b.caregiver_id
         JOIN user_accounts u ON u.id = b.client_id
         WHERE b.client_id = $1 OR b.caregiver_id = $1
         ORDER BY b.scheduled_at_ms ASC`,
        [me.userId]
      );
      res.json(rows.map((row) => bookingFromRow(row, requestLang(req))));
    } catch (error) {
      next(error);
    }
  });

  // Provider accepts a requested booking → push the client a real
  // notification when they have a push subscription (FEATURE_PLAN.md §20).
  app.post('/api/bookings/:id/accept', requireAuth, requireRole('nurse', 'caregiver', 'physio'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const result = await query<Row>(
        `UPDATE bookings SET status = 'accepted'
         WHERE id = $1 AND caregiver_id = $2 AND status = 'requested' RETURNING *`,
        [req.params.id, me.userId]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Booking not found or not awaiting acceptance.' });
        return;
      }
      await appendBookingEvent(result[0].id as string, 'accepted', me.userId, me.displayName);
      // Push the client a real notification when they have a subscription.
      // Awaited (and failure-swallowed) so the response reflects completion;
      // a push problem never fails the accept itself.
      try {
        await notifyUser(String(result[0].client_id), {
          kind: 'booking.accepted',
          title: 'Booking accepted',
          body: `${me.displayName} accepted your visit request.`,
          link: '/bookings',
        });
      } catch {
        // Ignore push failures.
      }
      res.json(bookingFromRow(result[0], requestLang(req)));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Guarded lifecycle transitions (§3: start / complete / cancel / dispute).
   * Mirrors the frontend BOOKING_TRANSITIONS matrix: an illegal move is a
   * 409 (concurrent modification or stale UI) so the page reloads the truth.
   */
  async function transitionBooking(
    req: Request,
    res: Response,
    to: string,
    eventKind: string,
    notify: (booking: Row, me: AuthedUser) => Promise<void>
  ): Promise<void> {
    const me = req.user as AuthedUser;
    const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
    if (!booking) {
      res.status(404).json({ message: 'Booking not found.' });
      return;
    }
    const isClient = booking.client_id === me.userId;
    const isProvider = booking.caregiver_id === me.userId;
    if (!isClient && !isProvider) {
      res.status(403).json({ message: 'Only the booking parties can change it.' });
      return;
    }
    // Providers drive start/complete; cancellation is either party.
    if ((to === 'in_progress' || to === 'completed') && !isProvider) {
      res.status(403).json({ message: 'Only the provider can move the visit forward.' });
      return;
    }
    const from = String(booking.status ?? 'requested');
    if (!BOOKING_TRANSITIONS[from]?.includes(to)) {
      res.status(409).json({ message: `Cannot move a ${from} booking to ${to}.` });
      return;
    }
    const updated = await queryOne<Row>(
      `UPDATE bookings SET status = $1 WHERE id = $2 AND status = $3 RETURNING *`,
      [to, req.params.id, from]
    );
    if (!updated) {
      res.status(409).json({ message: 'The booking changed under you. Please reload.' });
      return;
    }
    await appendBookingEvent(updated.id as string, eventKind, me.userId, me.displayName);
    try {
      await notify(updated, me);
    } catch {
      // Ignore push failures.
    }
    res.json(bookingFromRow((await bookingWithNames(updated.id as string)) ?? updated, requestLang(req)));
  }

  app.post('/api/bookings/:id/start', requireAuth, requireRole('nurse', 'caregiver', 'physio'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await transitionBooking(req, res, 'in_progress', 'started', async (booking, me) => {
        await notifyUser(String(booking.client_id), {
          kind: 'booking.started',
          title: 'Visit started',
          body: `${me.displayName} started your visit.`,
          link: '/bookings',
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bookings/:id/complete', requireAuth, requireRole('nurse', 'caregiver', 'physio'), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await transitionBooking(req, res, 'completed', 'completed', async (booking, me) => {
        await notifyUser(String(booking.client_id), {
          kind: 'booking.completed',
          title: 'Visit completed',
          body: `${me.displayName} completed your visit. Please rate it.`,
          link: `/review?booking=${booking.id}`,
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bookings/:id/cancel', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await transitionBooking(req, res, 'cancelled', 'cancelled', async (booking, me) => {
        const otherId = me.userId === booking.client_id ? booking.caregiver_id : booking.client_id;
        await notifyUser(String(otherId), {
          kind: 'booking.cancelled',
          title: 'Booking cancelled',
          body: `${me.displayName} cancelled booking ${booking.id}.`,
          link: '/bookings',
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bookings/:id/dispute', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await transitionBooking(req, res, 'disputed', 'disputed', async (booking, me) => {
        const otherId = me.userId === booking.client_id ? booking.caregiver_id : booking.client_id;
        await notifyUser(String(otherId), {
          kind: 'dispute.opened',
          title: 'Booking disputed',
          body: `${me.displayName} opened a dispute on booking ${booking.id}.`,
          link: '/disputes',
        });
      });
    } catch (error) {
      next(error);
    }
  });

  /** Per-booking event timeline (newest last; the store re-sorts newest-first). */
  app.get('/api/bookings/:id/events', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
      if (!booking) {
        res.status(404).json({ message: 'Booking not found.' });
        return;
      }
      if (booking.client_id !== me.userId && booking.caregiver_id !== me.userId) {
        res.status(403).json({ message: 'Only the booking parties can see its timeline.' });
        return;
      }
      const rows = await query<Row>(
        `SELECT * FROM booking_events WHERE booking_id = $1 ORDER BY at_ms ASC`,
        [req.params.id]
      );
      res.json(rows.map(bookingEventFromRow));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Reschedule proposal (§3 subtask 6): takes effect as the new timeslot
   * immediately; the proposer counts as confirmed and the other party
   * confirms via /reschedule/confirm. Terminal bookings cannot move (409).
   */
  app.post('/api/bookings/:id/reschedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as { scheduledAtMs?: unknown; note?: unknown };
      const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
      if (!booking) {
        res.status(404).json({ message: 'Booking not found.' });
        return;
      }
      const isClient = booking.client_id === me.userId;
      const isProvider = booking.caregiver_id === me.userId;
      if (!isClient && !isProvider) {
        res.status(403).json({ message: 'Only the booking parties can reschedule it.' });
        return;
      }
      const status = String(booking.status ?? 'requested');
      if (status === 'completed' || status === 'cancelled' || status === 'disputed') {
        res.status(409).json({ message: `A ${status} booking cannot be rescheduled.` });
        return;
      }
      if (typeof body.scheduledAtMs !== 'number' || !Number.isFinite(body.scheduledAtMs) || body.scheduledAtMs <= 0) {
        res.status(422).json({ message: 'A new date and time are required.' });
        return;
      }
      const proposal = {
        scheduledAtMs: body.scheduledAtMs,
        note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
        proposedBy: isClient ? 'client' : 'provider',
        clientConfirmed: isClient,
        providerConfirmed: isProvider,
      };
      const updated = await queryOne<Row>(
        `UPDATE bookings SET scheduled_at_ms = $1, pending_reschedule = $2 WHERE id = $3 RETURNING *`,
        [body.scheduledAtMs, JSON.stringify(proposal), req.params.id]
      );
      if (!updated) {
        res.status(404).json({ message: 'Booking not found.' });
        return;
      }
      await appendBookingEvent(updated.id as string, 'rescheduled', me.userId, me.displayName);
      const otherId = isClient ? booking.caregiver_id : booking.client_id;
      try {
        await notifyUser(String(otherId), {
          kind: 'booking.rescheduled',
          title: 'Booking rescheduled',
          body: `${me.displayName} proposed a new time.`,
          link: '/bookings',
        });
      } catch {
        // Ignore push failures.
      }
      res.json(bookingFromRow((await bookingWithNames(updated.id as string)) ?? updated, requestLang(req)));
    } catch (error) {
      next(error);
    }
  });

  /** The other party confirms the pending reschedule proposal. */
  app.post('/api/bookings/:id/reschedule/confirm', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
      if (!booking) {
        res.status(404).json({ message: 'Booking not found.' });
        return;
      }
      const isClient = booking.client_id === me.userId;
      const isProvider = booking.caregiver_id === me.userId;
      if (!isClient && !isProvider) {
        res.status(403).json({ message: 'Only the booking parties can confirm it.' });
        return;
      }
      const raw = booking.pending_reschedule as unknown;
      if (!raw || typeof raw !== 'object') {
        res.status(422).json({ message: 'There is no reschedule proposal to confirm.' });
        return;
      }
      const proposal = raw as Record<string, unknown>;
      if (isClient) {
        proposal.clientConfirmed = true;
      }
      if (isProvider) {
        proposal.providerConfirmed = true;
      }
      const updated = await queryOne<Row>(
        `UPDATE bookings SET pending_reschedule = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(proposal), req.params.id]
      );
      if (!updated) {
        res.status(404).json({ message: 'Booking not found.' });
        return;
      }
      await appendBookingEvent(updated.id as string, 'rescheduled', me.userId, me.displayName, 'Proposal confirmed.');
      res.json(bookingFromRow((await bookingWithNames(updated.id as string)) ?? updated, requestLang(req)));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/bookings', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as { caregiverId?: string; scheduledAtMs?: number; note?: string };
      if (!body.caregiverId || typeof body.scheduledAtMs !== 'number') {
        res.status(400).json({ message: 'Caregiver and date are required.' });
        return;
      }
      const caregiver = await queryOne<Row>(
        `SELECT id, hourly_rate FROM caregivers WHERE id = $1`,
        [body.caregiverId]
      );
      if (!caregiver) {
        res.status(404).json({ message: 'Caregiver not found.' });
        return;
      }
      const bookingId = id('b');
      const amountCents = Math.round((caregiver.hourly_rate as number) * 100 * 2); // 2 hours
      await query(
        `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, created_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [bookingId, body.caregiverId, me.userId, body.scheduledAtMs, body.note ?? '', amountCents, now()]
      );
      await appendBookingEvent(bookingId, 'created', me.userId, me.displayName);
      res.status(201).json({ id: bookingId, caregiverId: body.caregiverId, clientId: me.userId, amountCents });
    } catch (error) {
      next(error);
    }
  });

  // ---- Visits + GPS ----
  app.get('/api/visits/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        `SELECT * FROM visits WHERE provider_id = $1 OR client_id = $1 ORDER BY scheduled_at_ms ASC`,
        [me.userId]
      );
      res.json(rows.map(visitFromRow));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/visits/:id/check-in', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const position = (req.body as { position?: unknown })?.position ?? null;
      const result = await query<Row>(
        `UPDATE visits SET status = 'in-progress', check_in = $1 WHERE id = $2 AND provider_id = $3 RETURNING *`,
        [position ? JSON.stringify(position) : null, req.params.id, (req.user as AuthedUser).userId]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Visit not found.' });
        return;
      }
      const visit = visitFromRow(result[0]);
      broadcast('visits', { type: 'visit.status', payload: { visitId: visit.id, status: visit.status } });
      res.json(visit);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/visits/:id/check-out', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const position = (req.body as { position?: unknown })?.position ?? null;
      const result = await query<Row>(
        `UPDATE visits SET status = 'completed', check_out = $1 WHERE id = $2 AND provider_id = $3 RETURNING *`,
        [position ? JSON.stringify(position) : null, req.params.id, (req.user as AuthedUser).userId]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Visit not found.' });
        return;
      }
      // Escrow auto-release on completed visit (Phase 2 exit criterion).
      await query(
        `UPDATE escrow SET status = 'released', settled_at_ms = $1
         WHERE booking_id = $2 AND status = 'held'`,
        [now(), (result[0] as Row).booking_id]
      );
      // Push the client a real completion notification (FEATURE_PLAN.md §20).
      // Awaited (failure-swallowed) so the response reflects completion.
      try {
        await notifyUser(String((result[0] as Row).client_id), {
          kind: 'booking.completed',
          title: 'Visit completed',
          body: `How was your visit with ${(result[0] as Row).provider_name}? Rate it now.`,
          link: `/review?booking=${(result[0] as Row).booking_id}`,
        });
      } catch {
        // Ignore push failures.
      }
      const visit = visitFromRow(result[0]);
      broadcast('visits', { type: 'visit.status', payload: { visitId: visit.id, status: visit.status } });
      res.json(visit);
    } catch (error) {
      next(error);
    }
  });

  // ---- Payments / escrow ----
  app.get('/api/payments/escrow', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        `SELECT * FROM escrow WHERE client_id = $1 ORDER BY created_at_ms DESC`,
        [me.userId]
      );
      res.json(rows.map(escrowFromRow));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/payments/escrow', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as { bookingId?: string; providerId?: string; amountCents?: number };
      const row = {
        id: id('e'),
        booking_id: body.bookingId ?? '',
        provider_id: body.providerId ?? '',
        client_id: me.userId,
        amount_cents: body.amountCents ?? 0,
        status: 'held',
        created_at_ms: now(),
        settled_at_ms: null,
      };
      await query(
        `INSERT INTO escrow (id, booking_id, provider_id, client_id, amount_cents, status, created_at_ms, settled_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
        [row.id, row.booking_id, row.provider_id, row.client_id, row.amount_cents, row.status, row.created_at_ms]
      );
      res.status(201).json(escrowFromRow(row));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/payments/escrow/:id/release', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query<Row>(
        `UPDATE escrow SET status = 'released', settled_at_ms = $1
          WHERE id = $2 AND status IN ('held', 'frozen') RETURNING *`,
        [now(), req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Open transaction not found.' });
        return;
      }
      res.json(escrowFromRow(result[0]));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/payments/escrow/:id/refund', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query<Row>(
        `UPDATE escrow SET status = 'refunded', settled_at_ms = $1
          WHERE id = $2 AND status IN ('held', 'frozen') RETURNING *`,
        [now(), req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Open transaction not found.' });
        return;
      }
      res.json(escrowFromRow(result[0]));
    } catch (error) {
      next(error);
    }
  });

  /** Freeze a held transaction when a dispute opens (§17). */
  app.post('/api/payments/escrow/:id/freeze', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query<Row>(
        `UPDATE escrow SET status = 'frozen' WHERE id = $1 AND status = 'held' RETURNING *`,
        [req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ message: 'Held transaction not found.' });
        return;
      }
      res.json(escrowFromRow(result[0]));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Partial refund of a held/frozen transaction: `amountCents` returns to the
   * client, the remainder releases to the provider. Cents-safe: the backend
   * enforces 0 < amountCents ≤ amount.
   */
  app.post('/api/payments/escrow/:id/partial-refund', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const amountCents = (req.body as { amountCents?: unknown })?.amountCents;
      const tx = await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [req.params.id]);
      if (!tx || (tx.status !== 'held' && tx.status !== 'frozen')) {
        res.status(404).json({ message: 'Open transaction not found.' });
        return;
      }
      const total = Number(tx.amount_cents);
      if (!Number.isInteger(amountCents) || (amountCents as number) <= 0 || (amountCents as number) > total) {
        res.status(422).json({ message: 'Refund must be between 1 cent and the held amount.' });
        return;
      }
      const result = await query<Row>(
        `UPDATE escrow SET status = 'released', refunded_cents = $1, settled_at_ms = $2
          WHERE id = $3 AND status IN ('held', 'frozen') RETURNING *`,
        [amountCents, now(), req.params.id]
      );
      if (result.length === 0) {
        res.status(409).json({ message: 'The transaction changed under you. Please reload.' });
        return;
      }
      res.json(escrowFromRow(result[0]));
    } catch (error) {
      next(error);
    }
  });

  // ---- Screenings (preventive care, FEATURE_PLAN.md §6/§20) ----
  // Served under both /screenings/me* (legacy) and /me/screenings* (the
  // contract the screening store documents) — same handlers, same shapes.
  async function readScreenings(req: Request, res: Response): Promise<void> {
    const me = req.user as AuthedUser;
    // screening.due pushes fire on this read (once per user/type/due-at).
    try {
      await checkScreeningDue(me.userId);
    } catch {
      // A push/notice problem never fails the read.
    }
    const [profile, rows] = await Promise.all([
      queryOne<Row>(`SELECT date_of_birth, sex FROM profiles WHERE user_id = $1`, [me.userId]),
      query<Row>(`SELECT * FROM screenings WHERE user_id = $1 ORDER BY at_ms DESC`, [me.userId]),
    ]);
    res.json({
      profile: {
        dateOfBirth: profile?.date_of_birth ?? '',
        sex: profile?.sex ?? '',
      },
      records: rows.map(screeningFromRow),
    });
  }

  async function writeScreening(req: Request, res: Response): Promise<void> {
    const me = req.user as AuthedUser;
    const type = req.params.type as ScreeningType;
    const action = req.params.action;
    const body = req.body as {
      reason?: string;
      snoozeUntilMs?: number;
      snoozeCount?: number;
      scheduledAtMs?: number;
    };
    const nowMs = now();
    const existing = await queryOne<Row>(
      `SELECT * FROM screenings WHERE user_id = $1 AND type = $2`,
      [me.userId, type]
    );
    if (action === 'waive' && !body.reason?.trim()) {
      res.status(422).json({ message: 'A reason is required to waive a screening.' });
      return;
    }
    if (action === 'schedule' && typeof body.scheduledAtMs !== 'number') {
      res.status(422).json({ message: 'Choose a valid date to schedule this screening.' });
      return;
    }
    const record = {
      id: existing?.id ?? id('scr'),
      type,
      status: action === 'waive' ? 'waived' : 'done',
      atMs: action === 'done' ? nowMs : Number(existing?.at_ms ?? nowMs),
      reason: action === 'waive' ? body.reason ?? '' : existing?.reason ?? '',
      snooze_until_ms:
        action === 'snooze' ? (body.snoozeUntilMs ?? nowMs + 30 * 24 * hour) : (existing?.snooze_until_ms ?? null),
      scheduled_at_ms:
        action === 'schedule' ? body.scheduledAtMs : (existing?.scheduled_at_ms ?? null),
      snooze_count: action === 'snooze' ? (body.snoozeCount ?? Number(existing?.snooze_count ?? 0)) : Number(existing?.snooze_count ?? 0),
    };
    await query(
      `INSERT INTO screenings
       (id, user_id, type, status, at_ms, reason, snooze_until_ms, scheduled_at_ms, snooze_count, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, type) DO UPDATE SET
         status = EXCLUDED.status, at_ms = EXCLUDED.at_ms, reason = EXCLUDED.reason,
         snooze_until_ms = EXCLUDED.snooze_until_ms, scheduled_at_ms = EXCLUDED.scheduled_at_ms,
         snooze_count = EXCLUDED.snooze_count`,
      [record.id, me.userId, record.type, record.status, record.atMs, record.reason, record.snooze_until_ms, record.scheduled_at_ms, record.snooze_count, nowMs]
    );
    res.status(201).json(screeningFromRow(record));
  }

  app.get('/api/screenings/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await readScreenings(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/me/screenings', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await readScreenings(req, res);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/screenings/me/:type/:action (done | waive | snooze | schedule)
  app.post('/api/screenings/me/:type/:action', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await writeScreening(req, res);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/me/screenings/:type/:action (done | waive | snooze | schedule)
  app.post('/api/me/screenings/:type/:action', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await writeScreening(req, res);
    } catch (error) {
      next(error);
    }
  });

  // ---- Medications + adherence (FEATURE_PLAN.md §7/§20) ----
  app.get('/api/me/medications', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      // Raising missed-dose pushes before returning (idempotent per dose).
      await detectMissedDoses(me.userId);
      const meds = await query<Row>(
        `SELECT * FROM medications WHERE user_id = $1 ORDER BY created_at_ms DESC`,
        [me.userId]
      );
      const logs = await query<Row>(
        `SELECT * FROM medication_logs WHERE user_id = $1 ORDER BY at_ms DESC`,
        [me.userId]
      );
      res.json({ medications: meds.map(medicationFromRow), logs: logs.map(adherenceFromRow) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/me/medications', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as {
        name?: string;
        dose?: string;
        schedule?: unknown;
        critical?: boolean;
        prescriber?: string;
        instructions?: unknown;
        prescriptionId?: string | null;
      };
      if (!body.name || !body.schedule) {
        res.status(422).json({ message: 'Name and schedule are required.' });
        return;
      }
      const instructions =
        body.instructions === undefined || body.instructions === null
          ? null
          : validateInstructions(body.instructions);
      if (instructions && !instructions.ok) {
        res.status(422).json({ message: instructions.message });
        return;
      }
      const row = {
        id: id('med'),
        user_id: me.userId,
        name: body.name,
        dose: body.dose ?? '',
        schedule: JSON.stringify(body.schedule),
        critical: Boolean(body.critical),
        prescriber: body.prescriber ?? '',
        instructions: instructions && instructions.ok ? JSON.stringify(instructions.value) : null,
        prescription_id: body.prescriptionId ?? null,
        created_at_ms: now(),
      };
      await query(
        `INSERT INTO medications (id, user_id, name, dose, schedule, critical, prescriber, instructions, prescription_id, archived, created_at_ms)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, FALSE, $10)`,
        [
          row.id,
          row.user_id,
          row.name,
          row.dose,
          row.schedule,
          row.critical,
          row.prescriber,
          row.instructions,
          row.prescription_id,
          row.created_at_ms,
        ]
      );
      res.status(201).json(medicationFromRow(row));
    } catch (error) {
      next(error);
    }
  });

  // PATCH /api/me/medications/:id — persist the structured instruction sheet
  // (medicine instructions manager). `instructions: null` clears it.
  app.patch('/api/me/medications/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const existing = await queryOne<Row>(
        `SELECT * FROM medications WHERE id = $1 AND user_id = $2`,
        [req.params.id, me.userId]
      );
      if (!existing) {
        res.status(404).json({ message: 'Medication not found.' });
        return;
      }
      const body = req.body as { instructions?: unknown };
      if (!('instructions' in body)) {
        res.json(medicationFromRow(existing));
        return;
      }
      if (body.instructions === null) {
        const cleared = await query<Row>(
          `UPDATE medications SET instructions = NULL WHERE id = $1 RETURNING *`,
          [req.params.id]
        );
        res.json(medicationFromRow(cleared[0]));
        return;
      }
      const validation = validateInstructions(body.instructions);
      if (!validation.ok) {
        res.status(422).json({ message: validation.message });
        return;
      }
      const updated = await query<Row>(
        `UPDATE medications SET instructions = $1::jsonb WHERE id = $2 RETURNING *`,
        [JSON.stringify(validation.value), req.params.id]
      );
      res.json(medicationFromRow(updated[0]));
    } catch (error) {
      next(error);
    }
  });

  /** Soft-archive a medication (history preserved for audit, §16). */
  app.post('/api/medications/:id/archive', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        `UPDATE medications SET archived = TRUE WHERE id = $1 AND user_id = $2 RETURNING *`,
        [req.params.id, me.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: 'Medication not found.' });
        return;
      }
      res.json(medicationFromRow(rows[0]));
    } catch (error) {
      next(error);
    }
  });

  /**
   * Rule-based interaction check (subtask 12): severe drug-allergy substance
   * match → major; polypharmacy (5+ active meds) → minor review prompt;
   * otherwise none. A transparent heuristic, not a drug database.
   */
  app.get('/api/medications/:id/interactions', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const med = await queryOne<Row>(
        `SELECT * FROM medications WHERE id = $1 AND user_id = $2`,
        [req.params.id, me.userId]
      );
      if (!med) {
        res.status(404).json({ message: 'Medication not found.' });
        return;
      }
      const name = String(med.name ?? '').toLowerCase();
      const allergies = await query<Row>(
        `SELECT substance, severity FROM allergies WHERE user_id = $1 AND kind = 'drug' AND archived = FALSE`,
        [me.userId]
      );
      const hit = allergies.find(
        (allergy) =>
          String(allergy.severity) === 'severe' &&
          String(allergy.substance ?? '')
            .toLowerCase()
            .split(/[\s,;]+/)
            .filter((token) => token.length > 3)
            .some((token) => name.includes(token))
      );
      if (hit) {
        res.json({
          medicationId: med.id,
          severity: 'major',
          message: `Severe allergy conflict: ${hit.substance}. Do not take ${med.name} without medical advice.`,
        });
        return;
      }
      const active = await query<Row>(
        `SELECT COUNT(*) AS count FROM medications WHERE user_id = $1 AND archived = FALSE AND id <> $2`,
        [me.userId, req.params.id]
      );
      if (Number(active[0]?.count ?? 0) >= 4) {
        res.json({
          medicationId: med.id,
          severity: 'minor',
          message: 'You take several medications — ask your pharmacist to review combinations.',
        });
        return;
      }
      res.json({
        medicationId: med.id,
        severity: 'none',
        message: 'No known interactions found in your record.',
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/medications/:id/log', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const med = await queryOne<Row>(
        `SELECT * FROM medications WHERE id = $1 AND user_id = $2`,
        [req.params.id, me.userId]
      );
      if (!med) {
        res.status(404).json({ message: 'Medication not found.' });
        return;
      }
      const nowMs = now();
      const slot = new Date(nowMs).setHours(0, 0, 0, 0) + (Number(req.body?.timeMinutes ?? 0) % 1440) * 60_000;
      const log = {
        id: id('ml'),
        medication_id: med.id as string,
        user_id: me.userId,
        scheduled_for_ms: slot,
        action: 'taken',
        at_ms: nowMs,
      };
      await query(
        `INSERT INTO medication_logs (id, medication_id, user_id, scheduled_for_ms, action, at_ms)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (medication_id, scheduled_for_ms) DO UPDATE SET
           action = 'taken', at_ms = EXCLUDED.at_ms`,
        [log.id, log.medication_id, log.user_id, log.scheduled_for_ms, log.action, log.at_ms]
      );
      res.status(201).json(adherenceFromRow(log));
    } catch (error) {
      next(error);
    }
  });

  // ---- Disputes (FEATURE_PLAN.md §17/§20) ----
  app.use('/api', disputesRouter);

  // ---- PWA push subscriptions + Web Push (FEATURE_PLAN.md §20) ----
  app.get('/api/me/push-subscription', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const sub = await getSubscription(me.userId);
      res.json(sub ? { endpoint: sub.endpoint, subscribed: true } : { endpoint: null, subscribed: false });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/me/push-subscription', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (
        typeof body?.endpoint !== 'string' ||
        !body.endpoint ||
        !body.keys?.p256dh ||
        !body.keys?.auth
      ) {
        res.status(422).json({ message: 'Push subscription endpoint and keys are required.' });
        return;
      }
      await saveSubscription(me.userId, {
        endpoint: body.endpoint,
        keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      });
      res.json({ ok: true, endpoint: body.endpoint });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/me/push-subscription', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await removeSubscription((req.user as AuthedUser).userId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // Test send — verifies the whole loop without waiting for a real event.
  app.post('/api/me/push/test', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await notifyUser((req.user as AuthedUser).userId, {
        kind: 'system',
        title: 'Test notification',
        body: 'Push notifications are working!',
        link: '/marketplace',
      });
      if (result === 'no-subscription') {
        res.status(422).json({ message: 'No push subscription for this account.' });
        return;
      }
      if (result === 'failed') {
        res.status(502).json({ message: 'Push service could not deliver the notification.' });
        return;
      }
      res.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  });

  // ---- Medical history + prescriptions register (FEATURE_PLAN.md §21) ----
  app.use('/api', historyRouter);

  // ---- Contact phone manager (ICE + care team) ----
  app.use('/api', contactsRouter);

  // ---- Consent ledger (FEATURE_PLAN.md §16; §21 subtask 16 enforcement) ----
  app.use('/api', consentsRouter);

  // ---- Marketplace: saved searches, favorites, reviews (FEATURE_PLAN.md §1–§2) ----
  app.use('/api', marketplaceRouter);

  // ---- Bell notifications + reminder preferences (§4, §8) ----
  app.use('/api', notificationsRouter);

  // ---- Audit trail + admin consent oversight (§16) ----
  app.use('/api', auditRouter);

  // ---- Payments: methods, payout, tokenize (§13) ----
  app.use('/api', paymentsRouter);

  // ---- Pharmacy: scan + orders (§9) ----
  app.use('/api', pharmacyRouter);

  // ---- Gov.gr health wallet (§15) ----
  app.use('/api', walletRouter);

  // ---- Chat attachment uploads (§18) + static file serving ----
  app.use('/api', uploadsRouter);
  app.use('/api/uploads', express.static(process.env.UPLOAD_DIR ?? '/tmp/uploads'));

  // ---- Realtime Chat v2 ----
  app.use('/api', chatRouter);

  // ---- Clinical documentation & shared care plans ----
  app.use('/api', clinicalRouter);

  // ---- FHIR R4 Health Interoperability & Export ----
  app.use('/api', fhirRouter);

  // ---- Vitals ----
  app.get('/api/vitals/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await query<Row>(
        `SELECT * FROM vitals WHERE user_id = $1 ORDER BY measured_at_ms DESC`,
        [(req.user as AuthedUser).userId]
      );
      res.json(rows.map(vitalFromRow));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/vitals/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as {
        type?: string;
        value?: number;
        value2?: number | null;
        measuredAtMs?: number;
        source?: string;
      };
      const row = {
        id: id('vt'),
        user_id: me.userId,
        type: body.type ?? 'heartRate',
        value: Number(body.value ?? 0),
        value2: body.value2 == null ? null : Number(body.value2),
        measured_at_ms: body.measuredAtMs ?? now(),
        source: body.source ?? 'manual',
      };
      await query(
        `INSERT INTO vitals (id, user_id, type, value, value2, measured_at_ms, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.user_id, row.type, row.value, row.value2, row.measured_at_ms, row.source]
      );
      // Out-of-range reading → real push alert when the user is subscribed
      // (FEATURE_PLAN.md §4/§20; ranges mirror the frontend in vitals.ts).
      // Awaited before responding so tests/clients see the attempt complete;
      // a push problem never fails the vitals write.
      const alert = vitalsAlert(row.type, Number(row.value), row.value2 == null ? null : Number(row.value2));
      if (alert) {
        try {
          await notifyUser(me.userId, {
            kind: 'vitals.alert',
            title: `${alert.label} outside reference range`,
            body: alert.body,
            link: '/vitals',
          });
        } catch {
          // Ignore push failures.
        }
      }
      res.status(201).json(vitalFromRow(row));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/vitals/stats', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const targetUserId =
        typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : me.userId;
      if (targetUserId !== me.userId) {
        const { consents } = await loadConsents(targetUserId);
        if (!consentGranted(consents, 'family_sharing')) {
          res.status(403).json({ message: 'This person has not granted family-sharing consent.' });
          return;
        }
      }
      const rows = await query<Row>(
        `SELECT * FROM vitals WHERE user_id = $1 ORDER BY measured_at_ms DESC`,
        [targetUserId]
      );
      const days =
        typeof req.query.days === 'string' && Number(req.query.days) > 0
          ? Number(req.query.days)
          : 30;
      const stats = computeVitalStats(rows, days);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/vitals/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        `DELETE FROM vitals WHERE id = $1 AND user_id = $2 RETURNING id`,
        [req.params.id, me.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ message: 'Vital measurement not found.' });
        return;
      }
      res.json({ ok: true, id: rows[0].id });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/vitals/:userId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const targetUserId = req.params.userId;
      if (targetUserId !== me.userId) {
        const { consents } = await loadConsents(targetUserId);
        if (!consentGranted(consents, 'family_sharing')) {
          res.status(403).json({ message: 'This person has not granted family-sharing consent.' });
          return;
        }
      }
      const rows = await query<Row>(
        `SELECT * FROM vitals WHERE user_id = $1 AND source IN ('manual', 'bluetooth') ORDER BY measured_at_ms DESC`,
        [targetUserId]
      );
      res.json(rows.map(vitalFromRow));
    } catch (error) {
      next(error);
    }
  });


  // Standard error handler — maps thrown 404s, otherwise 500.
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status ?? 500;
    if (status >= 500) {
      console.error('[api]', error);
    }
    res.status(status).json({ message: status < 500 ? error.message : 'Something went wrong.' });
  });

  return app;
}

// ---- Row mappers (camelCase contract the frontend expects) ----
// Note: pg returns BIGINT (timestamps, amounts) as strings — coerce to
// numbers so the JSON matches the frontend types exactly.
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function submissionFromRow(row: Row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    licenceNumber: row.licence_number,
    specialties: row.specialties ?? [],
    submittedAtMs: num(row.submitted_at_ms),
    status: row.status,
    reviewedAtMs: num(row.reviewed_at_ms),
    reviewedBy: row.reviewed_by,
    note: row.note ?? '',
  };
}

function shiftFromRow(row: Row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    clientId: row.client_id,
    clientName: row.client_name,
    act: row.act,
    scheduledAtMs: num(row.scheduled_at_ms),
    durationMinutes: num(row.duration_minutes),
    status: row.status,
  };
}

function visitFromRow(row: Row) {
  return {
    id: row.id,
    shiftId: row.shift_id ?? '',
    bookingId: row.booking_id,
    providerId: row.provider_id,
    clientId: row.client_id,
    clientName: row.client_name,
    providerName: row.provider_name,
    act: row.act,
    scheduledAtMs: num(row.scheduled_at_ms),
    status: row.status,
    checkIn: row.check_in ?? null,
    checkOut: row.check_out ?? null,
  };
}

function escrowFromRow(row: Row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    providerId: row.provider_id,
    clientId: row.client_id,
    amountCents: num(row.amount_cents),
    status: row.status,
    createdAtMs: num(row.created_at_ms),
    settledAtMs: num(row.settled_at_ms),
    refundedCents: num(row.refunded_cents) ?? 0,
  };
}

function medicationFromRow(row: Row) {
  return {
    id: row.id,
    name: row.name,
    dose: row.dose ?? '',
    schedule:
      typeof row.schedule === 'string'
        ? JSON.parse(row.schedule)
        : (row.schedule ?? { kind: 'daily', timesMinutes: [] }),
    critical: Boolean(row.critical),
    prescriber: row.prescriber ?? '',
    instructions:
      row.instructions == null
        ? undefined
        : typeof row.instructions === 'string'
          ? JSON.parse(row.instructions)
          : row.instructions,
    prescriptionId: row.prescription_id ?? null,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

function screeningFromRow(row: Row) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    atMs: num(row.at_ms),
    reason: row.reason ?? '',
    snoozeUntilMs: row.snooze_until_ms === null || row.snooze_until_ms === undefined ? null : num(row.snooze_until_ms),
    scheduledAtMs: row.scheduled_at_ms === null || row.scheduled_at_ms === undefined ? null : num(row.scheduled_at_ms),
    snoozeCount: Number(row.snooze_count ?? 0),
  };
}

function adherenceFromRow(row: Row) {
  const slotMs = num(row.scheduled_for_ms) ?? 0;
  return {
    id: row.id,
    medicationId: row.medication_id,
    date: dateKey(slotMs),
    timeMinutes: minutesSinceMidnight(slotMs),
    action: row.action ?? 'taken',
    atMs: num(row.at_ms),
    loggedBy: 'client',
  };
}


/**
 * A booking in the requesting language. Seeded bookings carry a `note_i18n`
 * bundle; a note the client typed has none, so `pick()` falls through to the
 * stored text.
 */
function bookingFromRow(row: Row, lang: Lang = DEFAULT_LANG) {
  let pendingReschedule = null;
  const raw = row.pending_reschedule as unknown;
  if (raw && typeof raw === 'object') {
    const proposal = raw as Record<string, unknown>;
    pendingReschedule = {
      scheduledAtMs: Number(proposal.scheduledAtMs),
      note: typeof proposal.note === 'string' ? proposal.note : undefined,
      proposedBy: proposal.proposedBy,
      clientConfirmed: Boolean(proposal.clientConfirmed),
      providerConfirmed: Boolean(proposal.providerConfirmed),
    };
  }
  return {
    id: row.id,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name ?? '',
    clientId: row.client_id,
    clientName: row.client_name ?? '',
    providerUserId: row.caregiver_id,
    scheduledAtMs: num(row.scheduled_at_ms),
    note: pick(asBundle(row.note_i18n), lang) || String(row.note ?? ''),
    status: row.status ?? 'requested',
    createdAtMs: num(row.created_at_ms),
    pendingReschedule,
  };
}

/** Legal booking transitions, mirroring the frontend state machine (§3). */
const BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  cancelled: [],
  disputed: [],
};

function bookingEventFromRow(row: Row) {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    kind: String(row.kind),
    atMs: num(row.at_ms) ?? 0,
    byUserId: String(row.by_user_id),
    byName: String(row.by_name ?? ''),
    detail: String(row.detail ?? ''),
  };
}

async function appendBookingEvent(
  bookingId: string,
  kind: string,
  byUserId: string,
  byName: string,
  detail = ''
): Promise<void> {
  await query(
    `INSERT INTO booking_events (id, booking_id, kind, at_ms, by_user_id, by_name, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id('be'), bookingId, kind, now(), byUserId, byName, detail]
  );
}

/** Hydrate a booking row with joined display names (the GET /bookings shape). */
async function bookingWithNames(bookingId: string): Promise<Row | null> {
  return queryOne<Row>(
    `SELECT b.*, c.display_name AS caregiver_name, u.display_name AS client_name
     FROM bookings b
     JOIN caregivers c ON c.id = b.caregiver_id
     JOIN user_accounts u ON u.id = b.client_id
     WHERE b.id = $1`,
    [bookingId]
  );
}

function vitalFromRow(row: Row) {
  return {
    id: row.id,
    type: row.type,
    value: Number(row.value),
    value2: row.value2 === null || row.value2 === undefined ? null : Number(row.value2),
    measuredAtMs: num(row.measured_at_ms),
    source: row.source ?? 'manual',
  };
}

// ---- WebSocket broadcast registry (chat + visits) ----
type SocketLike = { send(data: string): void; readyState: number };

const channels: Record<string, Set<SocketLike>> = {
  chat: new Set(),
  visits: new Set(),
};

export function socketStore() {
  return {
    join(channel: 'chat' | 'visits', socket: SocketLike): void {
      channels[channel].add(socket);
    },
    leave(channel: 'chat' | 'visits', socket: SocketLike): void {
      channels[channel].delete(socket);
    },
    broadcast(channel: 'chat' | 'visits', envelope: unknown): void {
      const payload = JSON.stringify(envelope);
      for (const socket of channels[channel]) {
        if (socket.readyState === 1) {
          socket.send(payload);
        }
      }
    },
    size(channel: 'chat' | 'visits'): number {
      return channels[channel].size;
    },
  };
}

function broadcast(channel: 'chat' | 'visits', envelope: unknown): void {
  socketStore().broadcast(channel, envelope);
}

export const wsChannels = channels;