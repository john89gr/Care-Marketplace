import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import {
  auth,
  AuthedUser,
  clearAuthCookies,
  createUser,
  findUserByEmail,
  requireAuth,
  requireRole,
  setAuthCookies,
  verifyPassword,
} from './auth';
import { query, queryOne, Row } from './db';

const hour = 60 * 60 * 1000;
const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

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

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    res.json(auth.sessionPayloadFor(req.user as AuthedUser));
  });

  // ---- Marketplace ----
  app.get('/api/caregivers/search', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await query<Row>(
        `SELECT id, display_name, roles, rating, distance_km, hourly_rate, available_now
         FROM caregivers ORDER BY rating DESC`
      );
      res.json(rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        roles: r.roles ?? [],
        rating: r.rating,
        distanceKm: r.distance_km,
        hourlyRate: r.hourly_rate,
        availableNow: r.available_now,
      })));
    } catch (error) {
      next(error);
    }
  });

  // ---- Profiles ----
  app.get('/api/profiles/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const profile = await queryOne<Row>(
        `SELECT phone, amka, afm, licence_number, hourly_rate FROM profiles WHERE user_id = $1`,
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
      };
      const current = await queryOne<Row>(`SELECT * FROM profiles WHERE user_id = $1`, [me.userId]);
      const merged = {
        phone: body.phone ?? current?.phone ?? '',
        amka: body.amka ?? current?.amka ?? '',
        afm: body.afm ?? current?.afm ?? '',
        licenceNumber: body.licenceNumber ?? current?.licence_number ?? '',
        hourlyRate: body.hourlyRate !== undefined ? body.hourlyRate : (current?.hourly_rate ?? null),
      };
      await query(
        `INSERT INTO profiles (user_id, phone, amka, afm, licence_number, hourly_rate)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           phone = EXCLUDED.phone, amka = EXCLUDED.amka, afm = EXCLUDED.afm,
           licence_number = EXCLUDED.licence_number, hourly_rate = EXCLUDED.hourly_rate
        `,
        [me.userId, merged.phone, merged.amka, merged.afm, merged.licenceNumber, merged.hourlyRate]
      );
      res.json({ ...merged, userId: me.userId, displayName: me.displayName });
    } catch (error) {
      next(error);
    }
  });

  // ---- Vetting ----
  app.get('/api/vetting/submissions/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
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
      const visit = visitFromRow(result[0]);
      broadcast('visits', { type: 'visit.status', payload: { visitId: visit.id, status: visit.status } });
      res.json(visit);
    } catch (error) {
      next(error);
    }
  });

  // ---- Clinical log ----
  app.get('/api/clinical-log', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await query<Row>(`SELECT * FROM clinical_log ORDER BY signed_at_ms DESC NULLS LAST`);
      res.json(rows.map(clinicalFromRow));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/clinical-log', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const body = req.body as {
        visitId?: string;
        observations?: string;
        specialties?: unknown;
        vitals?: unknown;
        rehab?: unknown;
        signatureDataUrl?: string | null;
      };
      const row = {
        id: id('cl'),
        visit_id: body.visitId ?? '',
        author_id: me.userId,
        author_name: me.displayName,
        specialty: body.specialties ? JSON.stringify(body.specialties) : 'nurse',
        observations: body.observations ?? '',
        vitals: body.vitals ? JSON.stringify(body.vitals) : null,
        rehab: body.rehab ? JSON.stringify(body.rehab) : null,
        signature_data_url: typeof body.signatureDataUrl === 'string' ? body.signatureDataUrl : null,
        signed_at_ms: typeof body.signatureDataUrl === 'string' ? now() : null,
      };
      await query(
        `INSERT INTO clinical_log
         (id, visit_id, author_id, author_name, specialty, observations, vitals, rehab, signature_data_url, signed_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [row.id, row.visit_id, row.author_id, row.author_name, row.specialty, row.observations, row.vitals, row.rehab, row.signature_data_url, row.signed_at_ms]
      );
      res.status(201).json(clinicalFromRow(row));
    } catch (error) {
      next(error);
    }
  });

  // ---- Care plans ----
  async function carePlanWithChildren(plan: Row) {
    const goals = await query<Row>(`SELECT * FROM care_plan_goals WHERE plan_id = $1`, [plan.id as string]);
    const notes = await query<Row>(`SELECT * FROM care_plan_notes WHERE plan_id = $1 ORDER BY at_ms DESC`, [plan.id as string]);
    return {
      id: plan.id,
      clientId: plan.client_id,
      clientName: plan.client_name,
      goals: goals.map((g) => ({ id: g.id, text: g.text, status: g.status })),
      notes: notes.map((n) => ({
        id: n.id,
        authorId: n.author_id,
        authorName: n.author_name,
        authorRole: n.author_role,
        text: n.text,
        atMs: n.at_ms,
      })),
      updatedAtMs: plan.updated_at_ms,
      updatedBy: plan.updated_by,
    };
  }

  app.get('/api/care-plans', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = req.user as AuthedUser;
      const rows = await query<Row>(
        me.roles.includes('client')
          ? `SELECT * FROM care_plans WHERE client_id = $1`
          : `SELECT * FROM care_plans`,
        [me.userId]
      );
      res.json(await Promise.all(rows.map(carePlanWithChildren)));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/care-plans/:id/goals', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await touchPlan(req.params.id, req);
      await query(
        `INSERT INTO care_plan_goals (id, plan_id, text, status) VALUES ($1, $2, $3, 'open')`,
        [id('g'), plan.id, String(req.body?.text ?? '')]
      );
      res.json(await carePlanWithChildren(plan));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/care-plans/:id/goals/:goalId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await touchPlan(req.params.id, req);
      const status = req.body?.status;
      if (!['open', 'in-progress', 'done'].includes(status)) {
        res.status(400).json({ message: 'Invalid goal status.' });
        return;
      }
      await query(`UPDATE care_plan_goals SET status = $1 WHERE plan_id = $2 AND id = $3`, [
        status,
        plan.id,
        req.params.goalId,
      ]);
      res.json(await carePlanWithChildren(plan));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/care-plans/:id/notes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plan = await touchPlan(req.params.id, req);
      const me = req.user as AuthedUser;
      const body = req.body as { text?: string };
      await query(
        `INSERT INTO care_plan_notes (id, plan_id, author_id, author_name, author_role, text, at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id('n'), plan.id, me.userId, me.displayName, me.roles[0] ?? '', body.text ?? '', now()]
      );
      res.json(await carePlanWithChildren(plan));
    } catch (error) {
      next(error);
    }
  });

  async function touchPlan(planId: string, req: Request): Promise<Row> {
    const plan = await queryOne<Row>(`SELECT * FROM care_plans WHERE id = $1`, [planId]);
    if (!plan) {
      const err = new Error('Care plan not found.') as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    await query(`UPDATE care_plans SET updated_at_ms = $1, updated_by = $2 WHERE id = $3`, [
      now(),
      (req.user as AuthedUser).displayName,
      planId,
    ]);
    return plan;
  }

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
        `UPDATE escrow SET status = 'released', settled_at_ms = $1 WHERE id = $2 AND status = 'held' RETURNING *`,
        [now(), req.params.id]
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

  app.post('/api/payments/escrow/:id/refund', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await query<Row>(
        `UPDATE escrow SET status = 'refunded', settled_at_ms = $1 WHERE id = $2 AND status = 'held' RETURNING *`,
        [now(), req.params.id]
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
      res.status(201).json(vitalFromRow(row));
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

function clinicalFromRow(row: Row) {
  return {
    id: row.id,
    visitId: row.visit_id,
    authorId: row.author_id,
    authorName: row.author_name,
    specialty: row.specialty,
    observations: row.observations,
    vitals: row.vitals ?? null,
    rehab: row.rehab ?? null,
    signatureDataUrl: row.signature_data_url ?? null,
    signedAtMs: num(row.signed_at_ms),
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
  };
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