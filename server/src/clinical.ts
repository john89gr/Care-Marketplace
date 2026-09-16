import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth } from './auth';
import { asBundle, DEFAULT_LANG, Lang, pick, requestLang } from './locale';

/**
 * Clinical Documentation & Shared Care Plans (PLAN.md §4, FEATURE_PLAN.md).
 * - Clinical logs with digital signatures and role-based privacy filters.
 * - Visit detail retrieval with check-in/out GPS data and timestamps.
 * - Multi-disciplinary care plan collaboration (goals and notes with nurse/physio/doctor roles).
 *
 * Shared-care-plan goals and notes are shown to the whole care team, so their
 * copy is served in the requesting language (`?lang=en|el`): the seeded lines
 * carry a `text_i18n` bundle and anything a user typed falls through to the
 * plain `text` column.
 */

export const clinicalRouter = Router();

const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const now = () => Date.now();
const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

export const ALLOWED_NOTE_ROLES = ['nurse', 'physio', 'doctor'] as const;
export type AllowedNoteRole = (typeof ALLOWED_NOTE_ROLES)[number];

export const GOAL_STATUSES = ['open', 'in-progress', 'done'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export function clinicalFromRow(row: Row) {
  return {
    id: row.id,
    visitId: row.visit_id,
    authorId: row.author_id,
    authorName: row.author_name,
    specialty: row.specialty,
    observations: row.observations,
    vitals: typeof row.vitals === 'string' ? JSON.parse(row.vitals) : (row.vitals ?? null),
    rehab: typeof row.rehab === 'string' ? JSON.parse(row.rehab) : (row.rehab ?? null),
    signatureDataUrl: row.signature_data_url ?? null,
    signedAtMs: num(row.signed_at_ms),
  };
}

export function visitFromRow(row: Row) {
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
    checkIn: typeof row.check_in === 'string' ? JSON.parse(row.check_in) : (row.check_in ?? null),
    checkOut: typeof row.check_out === 'string' ? JSON.parse(row.check_out) : (row.check_out ?? null),
  };
}

/** The visible text of a care-plan line in one language. */
function planText(row: Row, lang: Lang): string {
  return pick(asBundle(row.text_i18n), lang) || String(row.text ?? '');
}

export async function carePlanWithChildren(
  plan: Row,
  lang: Lang = DEFAULT_LANG
) {
  const goals = await query<Row>(`SELECT * FROM care_plan_goals WHERE plan_id = $1 ORDER BY id ASC`, [plan.id as string]);
  const notes = await query<Row>(`SELECT * FROM care_plan_notes WHERE plan_id = $1 ORDER BY at_ms DESC`, [plan.id as string]);
  return {
    id: plan.id,
    clientId: plan.client_id,
    clientName: plan.client_name,
    goals: goals.map((g) => ({ id: g.id, text: planText(g, lang), status: g.status })),
    notes: notes.map((n) => ({
      id: n.id,
      authorId: n.author_id,
      authorName: n.author_name,
      authorRole: n.author_role,
      text: planText(n, lang),
      atMs: num(n.at_ms),
    })),
    updatedAtMs: num(plan.updated_at_ms),
    updatedBy: plan.updated_by,
  };
}

export async function touchPlan(planId: string, req: Request): Promise<Row> {
  const plan = await queryOne<Row>(`SELECT * FROM care_plans WHERE id = $1`, [planId]);
  if (!plan) {
    const err = new Error('Care plan not found.') as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  const timestamp = now();
  const updater = (req.user as AuthedUser)?.displayName ?? 'Care team';
  await query(`UPDATE care_plans SET updated_at_ms = $1, updated_by = $2 WHERE id = $3`, [
    timestamp,
    updater,
    planId,
  ]);
  plan.updated_at_ms = timestamp;
  plan.updated_by = updater;
  return plan;
}

// ============================================================================
// Clinical Log Endpoints
// ============================================================================

/**
 * GET /api/clinical-log
 * Role-based access control / privacy filter:
 * - Super admin sees all logs.
 * - Providers (nurse, physio) see logs where they are the author or for visits with active clients.
 * - Clients only see clinical logs for visits where they are the client.
 */
clinicalRouter.get('/clinical-log', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const roles = me.roles ?? [];
    const isSuperAdmin = roles.some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    const isProvider = roles.some((r) => ['nurse', 'physio', 'doctor', 'caregiver'].includes(r));
    const isClient = roles.includes('client');

    let rows: Row[] = [];

    if (isSuperAdmin) {
      rows = await query<Row>(
        `SELECT cl.* FROM clinical_log cl ORDER BY cl.signed_at_ms DESC NULLS LAST`
      );
    } else if (isProvider) {
      rows = await query<Row>(
        `SELECT DISTINCT cl.*
         FROM clinical_log cl
         LEFT JOIN visits v ON cl.visit_id = v.id
         WHERE cl.author_id = $1
            OR (
              v.client_id IS NOT NULL AND v.client_id IN (
                SELECT client_id FROM visits WHERE provider_id = $1 AND status != 'cancelled'
                UNION
                SELECT client_id FROM bookings WHERE caregiver_id = $1 AND status != 'cancelled'
              )
            )
         ORDER BY cl.signed_at_ms DESC NULLS LAST`,
        [me.userId]
      );
    } else if (isClient) {
      rows = await query<Row>(
        `SELECT cl.*
         FROM clinical_log cl
         JOIN visits v ON cl.visit_id = v.id
         WHERE v.client_id = $1
         ORDER BY cl.signed_at_ms DESC NULLS LAST`,
        [me.userId]
      );
    } else {
      rows = [];
    }

    res.json(rows.map(clinicalFromRow));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clinical-log
 * Creates a new clinical log entry. If signatureDataUrl is provided, signs it immediately.
 */
clinicalRouter.post('/clinical-log', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as {
      visitId?: string;
      observations?: string;
      specialty?: string;
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
      specialty: body.specialty ?? (body.specialties ? JSON.stringify(body.specialties) : (me.roles.find((r) => ['nurse', 'physio', 'doctor'].includes(r)) ?? me.roles[0] ?? 'nurse')),
      observations: body.observations ?? '',
      vitals: body.vitals ? (typeof body.vitals === 'string' ? body.vitals : JSON.stringify(body.vitals)) : null,
      rehab: body.rehab ? (typeof body.rehab === 'string' ? body.rehab : JSON.stringify(body.rehab)) : null,
      signature_data_url: typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.length > 0 ? body.signatureDataUrl : null,
      signed_at_ms: typeof body.signatureDataUrl === 'string' && body.signatureDataUrl.length > 0 ? now() : null,
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

/**
 * POST /api/clinical-log/:id/sign
 * Digital signature endpoint for signing an existing clinical log.
 */
clinicalRouter.post('/clinical-log/:id/sign', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const { signatureDataUrl } = req.body as { signatureDataUrl?: string };
    if (!signatureDataUrl || typeof signatureDataUrl !== 'string') {
      res.status(400).json({ message: 'Signature data URL is required.' });
      return;
    }
    const existing = await queryOne<Row>(`SELECT * FROM clinical_log WHERE id = $1`, [req.params.id]);
    if (!existing) {
      res.status(404).json({ message: 'Clinical log not found.' });
      return;
    }
    const isSuperAdmin = (me.roles ?? []).some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    if (existing.author_id !== me.userId && !isSuperAdmin) {
      res.status(403).json({ message: 'Only the author or admin can sign this log.' });
      return;
    }
    const signedAt = now();
    const updated = await queryOne<Row>(
      `UPDATE clinical_log SET signature_data_url = $1, signed_at_ms = $2 WHERE id = $3 RETURNING *`,
      [signatureDataUrl, signedAt, req.params.id]
    );
    res.json(clinicalFromRow(updated!));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clinical-log/:id
 * Returns individual clinical log with digital signature data URL, author name, observations, vitals, rehab metrics.
 */
clinicalRouter.get('/clinical-log/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const log = await queryOne<Row>(`SELECT * FROM clinical_log WHERE id = $1`, [req.params.id]);
    if (!log) {
      res.status(404).json({ message: 'Clinical log not found.' });
      return;
    }

    const roles = me.roles ?? [];
    const isSuperAdmin = roles.some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    if (isSuperAdmin || log.author_id === me.userId) {
      res.json(clinicalFromRow(log));
      return;
    }

    const visit = log.visit_id
      ? await queryOne<Row>(`SELECT * FROM visits WHERE id = $1`, [log.visit_id])
      : null;

    const isClient = roles.includes('client');
    if (isClient && visit && visit.client_id === me.userId) {
      res.json(clinicalFromRow(log));
      return;
    }

    const isProvider = roles.some((r) => ['nurse', 'physio', 'doctor', 'caregiver'].includes(r));
    if (isProvider && visit && visit.client_id) {
      const activeRel = await queryOne<Row>(
        `SELECT 1 FROM visits WHERE provider_id = $1 AND client_id = $2 AND status != 'cancelled'
         UNION
         SELECT 1 FROM bookings WHERE caregiver_id = $1 AND client_id = $2 AND status != 'cancelled'
         LIMIT 1`,
        [me.userId, visit.client_id]
      );
      if (activeRel) {
        res.json(clinicalFromRow(log));
        return;
      }
    }

    res.status(403).json({ message: 'Access denied to this clinical log.' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Visits Endpoints
// ============================================================================

/**
 * GET /api/visits/:id
 * Returns visit details with check-in and check-out GPS data and timestamps.
 */
clinicalRouter.get('/visits/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === 'me') {
      return next();
    }
    const me = req.user as AuthedUser;
    const visit = await queryOne<Row>(`SELECT * FROM visits WHERE id = $1`, [req.params.id]);
    if (!visit) {
      res.status(404).json({ message: 'Visit not found.' });
      return;
    }

    const roles = me.roles ?? [];
    const isSuperAdmin = roles.some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    const isParty = visit.client_id === me.userId || visit.provider_id === me.userId;

    let hasProviderAccess = isParty;
    if (!hasProviderAccess && roles.some((r) => ['nurse', 'physio', 'doctor', 'caregiver'].includes(r))) {
      const activeRel = await queryOne<Row>(
        `SELECT 1 FROM visits WHERE provider_id = $1 AND client_id = $2 AND status != 'cancelled'
         UNION
         SELECT 1 FROM bookings WHERE caregiver_id = $1 AND client_id = $2 AND status != 'cancelled'
         LIMIT 1`,
        [me.userId, visit.client_id]
      );
      if (activeRel) {
        hasProviderAccess = true;
      }
    }

    if (!isSuperAdmin && !isParty && !hasProviderAccess) {
      res.status(403).json({ message: 'Access denied to this visit.' });
      return;
    }

    res.json(visitFromRow(visit));
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Care Plans Endpoints
// ============================================================================

/**
 * GET /api/care-plans
 * Returns care plans (for clients, scoped to their own plans; for providers/admins, all plans).
 */
clinicalRouter.get('/care-plans', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const isClient = (me.roles ?? []).includes('client') && !(me.roles ?? []).some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    const rows = await query<Row>(
      isClient
        ? `SELECT * FROM care_plans WHERE client_id = $1 ORDER BY updated_at_ms DESC`
        : `SELECT * FROM care_plans ORDER BY updated_at_ms DESC`,
      isClient ? [me.userId] : []
    );
    res.json(await Promise.all(rows.map((plan) => carePlanWithChildren(plan, requestLang(req)))));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/care-plans
 * Creates a new care plan for a client.
 */
clinicalRouter.post('/care-plans', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as { clientId?: string; clientName?: string };
    const clientId = body.clientId ?? (me.roles.includes('client') ? me.userId : null);
    if (!clientId) {
      res.status(400).json({ message: 'Client ID is required.' });
      return;
    }
    const targetUser = await queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [clientId]);
    const clientName = body.clientName ?? targetUser?.display_name ?? me.displayName;
    const planId = id('cp');
    await query(
      `INSERT INTO care_plans (id, client_id, client_name, updated_at_ms, updated_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [planId, clientId, clientName, now(), me.displayName]
    );
    const plan = await queryOne<Row>(`SELECT * FROM care_plans WHERE id = $1`, [planId]);
    res.status(201).json(await carePlanWithChildren(plan!, requestLang(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/care-plans/:id
 * Returns single care plan with goals and notes.
 */
clinicalRouter.get('/care-plans/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const plan = await queryOne<Row>(`SELECT * FROM care_plans WHERE id = $1`, [req.params.id]);
    if (!plan) {
      res.status(404).json({ message: 'Care plan not found.' });
      return;
    }
    const roles = me.roles ?? [];
    const isSuperAdmin = roles.some((r) => ['admin', 'super_admin', 'superadmin'].includes(r));
    const isProvider = roles.some((r) => ['nurse', 'physio', 'doctor', 'caregiver'].includes(r));
    const isClient = roles.includes('client');
    if (isClient && !isSuperAdmin && !isProvider && plan.client_id !== me.userId) {
      res.status(403).json({ message: 'Access denied to this care plan.' });
      return;
    }
    res.json(await carePlanWithChildren(plan, requestLang(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/care-plans/:id/goals
 * Adds a new goal to the care plan.
 */
clinicalRouter.post('/care-plans/:id/goals', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await touchPlan(req.params.id, req);
    const body = req.body as { text?: string; status?: string };
    const text = String(body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ message: 'Goal text is required.' });
      return;
    }
    const status = body?.status && GOAL_STATUSES.includes(body.status as GoalStatus)
      ? body.status
      : 'open';
    await query(
      `INSERT INTO care_plan_goals (id, plan_id, text, status) VALUES ($1, $2, $3, $4)`,
      [id('g'), plan.id, text, status]
    );
    res.json(await carePlanWithChildren(plan, requestLang(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/care-plans/:id/goals/:goalId
 * Updates goal status ('open', 'in-progress', 'done') and/or text.
 */
clinicalRouter.patch('/care-plans/:id/goals/:goalId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await touchPlan(req.params.id, req);
    const body = req.body as { status?: string; text?: string };
    const status = body?.status;
    if (status !== undefined && !GOAL_STATUSES.includes(status as GoalStatus)) {
      res.status(400).json({ message: 'Invalid goal status.' });
      return;
    }
    const text = body?.text !== undefined ? String(body.text).trim() : undefined;
    if (status === undefined && text === undefined) {
      res.status(400).json({ message: 'No fields to update.' });
      return;
    }
    const existing = await queryOne<Row>(
      `SELECT * FROM care_plan_goals WHERE plan_id = $1 AND id = $2`,
      [plan.id, req.params.goalId]
    );
    if (!existing) {
      res.status(404).json({ message: 'Goal not found.' });
      return;
    }
    const newStatus = status ?? existing.status;
    const newText = text ?? existing.text;
    await query(
      `UPDATE care_plan_goals SET status = $1, text = $2 WHERE plan_id = $3 AND id = $4`,
      [newStatus, newText, plan.id, req.params.goalId]
    );
    res.json(await carePlanWithChildren(plan, requestLang(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/care-plans/:id/goals/:goalId
 * Deletes a goal from the care plan.
 */
clinicalRouter.delete('/care-plans/:id/goals/:goalId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await touchPlan(req.params.id, req);
    const result = await query<Row>(
      `DELETE FROM care_plan_goals WHERE plan_id = $1 AND id = $2 RETURNING id`,
      [plan.id, req.params.goalId]
    );
    if (result.length === 0) {
      res.status(404).json({ message: 'Goal not found.' });
      return;
    }
    res.json(await carePlanWithChildren(plan, requestLang(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/care-plans/:id/notes
 * Adds a multi-disciplinary care note with author roles ('nurse', 'physio', 'doctor').
 */
clinicalRouter.post('/care-plans/:id/notes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const plan = await touchPlan(req.params.id, req);
    const me = req.user as AuthedUser;
    const body = req.body as {
      text?: string;
      authorRole?: string;
      role?: string;
      authorName?: string;
    };
    const text = String(body?.text ?? '').trim();
    if (!text) {
      res.status(400).json({ message: 'Note text is required.' });
      return;
    }

    let authorRole = body.authorRole ?? body.role;
    if (authorRole) {
      if (!ALLOWED_NOTE_ROLES.includes(authorRole as AllowedNoteRole)) {
        res.status(400).json({ message: `Invalid author role. Allowed roles are: ${ALLOWED_NOTE_ROLES.join(', ')}.` });
        return;
      }
    } else {
      authorRole = (me.roles ?? []).find((r) => ALLOWED_NOTE_ROLES.includes(r as AllowedNoteRole)) ?? (me.roles?.includes('admin') ? 'doctor' : (me.roles?.[0] ?? 'nurse'));
    }

    const authorName = body.authorName ?? me.displayName;
    await query(
      `INSERT INTO care_plan_notes (id, plan_id, author_id, author_name, author_role, text, at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id('n'), plan.id, me.userId, authorName, authorRole, text, now()]
    );
    res.json(await carePlanWithChildren(plan, requestLang(req)));
  } catch (error) {
    next(error);
  }
});
