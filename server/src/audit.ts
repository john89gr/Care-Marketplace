import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, Row } from './db';
import { AuthedUser, requireAuth, requireRole } from './auth';

/**
 * Audit trail (§16): clients upload batches of immutable events; admins read
 * the append-only list. Plus the admin consent-oversight read
 * (GET /admin/consents) over the same user_consents table the consents
 * router serves per-user.
 */

interface AuditDraft {
  id?: unknown;
  actorId?: unknown;
  action?: unknown;
  resourceType?: unknown;
  resourceId?: unknown;
  atMs?: unknown;
  meta?: unknown;
}

function auditFromRow(row: Row) {
  return {
    id: String(row.id),
    actorId: String(row.actor_id),
    action: String(row.action),
    resourceType: String(row.resource_type ?? ''),
    resourceId: String(row.resource_id ?? ''),
    atMs: Number(row.at_ms),
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
  };
}

/** Calculate tamper-evident cryptographic chain hash over audit events. */
export function computeAuditChainHash(
  events: Array<{
    id: unknown;
    action: unknown;
    resource_type?: unknown;
    resourceType?: unknown;
    resource_id?: unknown;
    resourceId?: unknown;
    at_ms?: unknown;
    atMs?: unknown;
  }>
): string {
  let hash = 'init';
  for (const e of events) {
    const id = e.id ?? '';
    const action = e.action ?? '';
    const resourceType = e.resource_type !== undefined ? e.resource_type : (e.resourceType ?? '');
    const resourceId = e.resource_id !== undefined ? e.resource_id : (e.resourceId ?? '');
    const atMs = e.at_ms !== undefined ? e.at_ms : (e.atMs ?? '');
    hash = Buffer.from(`${hash}|${id}|${action}|${resourceType}|${resourceId}|${atMs}`).toString('base64');
  }
  return hash;
}

/** Server-side helper: automatically record an immutable audit event. */
export async function logAuditEvent(
  actorId: string,
  action: string,
  resourceType: string = '',
  resourceId: string = '',
  meta?: Record<string, unknown> | null
): Promise<string> {
  const eventId = `au-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await query(
    `INSERT INTO audit_events (id, actor_id, action, resource_type, resource_id, at_ms, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      actorId,
      action,
      resourceType,
      resourceId,
      Date.now(),
      meta && typeof meta === 'object' ? JSON.stringify(meta) : null,
    ]
  );
  return eventId;
}

export const auditRouter = Router();

/** Single event ingestion: POST /api/audit */
auditRouter.post('/audit', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as AuditDraft;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(422).json({ message: 'Audit event must be an object.' });
      return;
    }

    const isAdmin = (me.roles ?? []).includes('admin');
    const rawActorId = body.actorId;
    if (rawActorId !== undefined && (typeof rawActorId !== 'string' || !rawActorId.trim())) {
      res.status(422).json({ message: 'Actor ID must be a non-empty string.' });
      return;
    }
    const actorId = rawActorId ? rawActorId.trim() : me.userId;
    if (actorId !== me.userId && !isAdmin) {
      res.status(403).json({ message: 'Events must be authored by the session user.' });
      return;
    }

    if (typeof body.action !== 'string' || !body.action.trim()) {
      res.status(422).json({ message: 'Action is required.' });
      return;
    }

    if (
      body.atMs === undefined ||
      body.atMs === null ||
      typeof body.atMs !== 'number' ||
      !Number.isFinite(body.atMs) ||
      body.atMs <= 0
    ) {
      res.status(422).json({ message: 'A valid atMs timestamp is required.' });
      return;
    }

    const eventId =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : `au-${Date.now()}-${randomBytes(4).toString('hex')}`;

    const resourceType = typeof body.resourceType === 'string' ? body.resourceType : '';
    const resourceId = typeof body.resourceId === 'string' ? body.resourceId : '';
    const meta = body.meta && typeof body.meta === 'object' ? JSON.stringify(body.meta) : null;

    await query(
      `INSERT INTO audit_events (id, actor_id, action, resource_type, resource_id, at_ms, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [eventId, actorId, body.action.trim(), resourceType, resourceId, body.atMs, meta]
    );

    res.json({ ok: true, id: eventId });
  } catch (error) {
    next(error);
  }
});

/** Batched upload (subtask 19): one POST per batch of ≤ 10 client events. */
auditRouter.post('/audit/batch', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const events = req.body as unknown;
    if (!Array.isArray(events)) {
      res.status(422).json({ message: 'Audit batch must be an array of events.' });
      return;
    }
    if (events.length > 100) {
      res.status(422).json({ message: 'Audit batch is too large.' });
      return;
    }
    const isAdmin = (me.roles ?? []).includes('admin');
    let stored = 0;
    for (const raw of events) {
      const event = raw as AuditDraft;
      if (!event || typeof event !== 'object') {
        continue;
      }
      const actorId = typeof event.actorId === 'string' ? event.actorId : '';
      if (!actorId || typeof event.action !== 'string' || !event.action) {
        continue;
      }
      if (actorId !== me.userId && !isAdmin) {
        res.status(403).json({ message: 'Events must be authored by the session user.' });
        return;
      }
      const atMs = typeof event.atMs === 'number' && Number.isFinite(event.atMs) ? event.atMs : Date.now();
      await query(
        `INSERT INTO audit_events (id, actor_id, action, resource_type, resource_id, at_ms, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          typeof event.id === 'string' && event.id ? event.id : `au-${Date.now()}-${stored}`,
          actorId,
          event.action,
          typeof event.resourceType === 'string' ? event.resourceType : '',
          typeof event.resourceId === 'string' ? event.resourceId : '',
          atMs,
          event.meta && typeof event.meta === 'object' ? JSON.stringify(event.meta) : null,
        ]
      );
      stored += 1;
    }
    res.json({ ok: true, stored });
  } catch (error) {
    next(error);
  }
});

/** Admin viewer: the full append-only list, newest first, with tamper-evident chain hash. */
auditRouter.get('/audit/all', requireAuth, requireRole('admin'), async (_req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(`SELECT * FROM audit_events ORDER BY at_ms DESC LIMIT 1000`);
    const chainHash = computeAuditChainHash(rows);
    const items = rows.map(auditFromRow);
    res.json({ items, total: items.length, chainHash });
  } catch (error) {
    next(error);
  }
});

/** Admin consent oversight: every user's consent ledger row. */
auditRouter.get('/admin/consents', requireAuth, requireRole('admin'), async (_req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(
      `SELECT user_id, consents, current_document_version FROM user_consents ORDER BY user_id ASC`
    );
    res.json({
      items: rows.map((row) => ({
        userId: String(row.user_id),
        consents: (row.consents ?? []) as unknown[],
        currentDocumentVersion: String(row.current_document_version ?? ''),
      })),
    });
  } catch (error) {
    next(error);
  }
});
