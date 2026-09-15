import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth, requireRole } from './auth';
import { notifyUser } from './push';

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

function parseJsonSafe<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) {
    return fallback;
  }
  if (typeof val === 'object') {
    return val as T;
  }
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
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

export async function disputeWithNames(row: Row) {
  const [client, providerCaregiver, providerUser, openedBy] = await Promise.all([
    queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [row.client_id]),
    queryOne<Row>(`SELECT display_name FROM caregivers WHERE id = $1`, [row.provider_id]),
    queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [row.provider_id]),
    queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [row.opened_by]),
  ]);
  const providerName = providerCaregiver?.display_name ?? providerUser?.display_name ?? '';
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    clientId: String(row.client_id),
    clientName: client?.display_name ? String(client.display_name) : '',
    providerId: String(row.provider_id),
    providerName: providerName ? String(providerName) : '',
    openedBy: String(row.opened_by),
    openedByName: openedBy?.display_name ? String(openedBy.display_name) : '',
    reason: String(row.reason),
    description: String(row.description ?? ''),
    state: String(row.state),
    resolution: row.resolution === null || row.resolution === undefined ? null : String(row.resolution),
    refundCents: num(row.refund_cents),
    escrowTransactionId:
      row.escrow_transaction_id === null || row.escrow_transaction_id === undefined
        ? null
        : String(row.escrow_transaction_id),
    evidence: parseJsonSafe<unknown[]>(row.evidence, []),
    createdAtMs: num(row.created_at_ms),
    updatedAtMs: num(row.updated_at_ms),
  };
}

export const disputesRouter = Router();

/** GET /me/disputes — current user's disputes (as client or provider). */
disputesRouter.get('/me/disputes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `SELECT * FROM disputes WHERE client_id = $1 OR provider_id = $1 ORDER BY created_at_ms DESC`,
      [me.userId]
    );
    res.json(await Promise.all(rows.map(disputeWithNames)));
  } catch (error) {
    next(error);
  }
});

/** GET /disputes — admin queue (all disputes). */
disputesRouter.get('/disputes', requireAuth, requireRole('admin'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await query<Row>(`SELECT * FROM disputes ORDER BY created_at_ms DESC`);
    res.json(await Promise.all(rows.map(disputeWithNames)));
  } catch (error) {
    next(error);
  }
});

/** GET /disputes/:id — single dispute details. */
disputesRouter.get('/disputes/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const dispute = await queryOne<Row>(`SELECT * FROM disputes WHERE id = $1`, [req.params.id]);
    if (!dispute) {
      res.status(404).json({ message: 'Dispute not found.' });
      return;
    }
    const isAdmin = me.roles.includes('admin');
    if (!isAdmin && me.userId !== dispute.client_id && me.userId !== dispute.provider_id) {
      res.status(403).json({ message: 'Forbidden.' });
      return;
    }
    res.json(await disputeWithNames(dispute));
  } catch (error) {
    next(error);
  }
});

/** POST /disputes — open a new dispute (freezes linked escrow). */
disputesRouter.post('/disputes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as { bookingId?: string; reason?: string; description?: string };
    if (!body.bookingId || !body.reason) {
      res.status(422).json({ message: 'Booking id and reason are required.' });
      return;
    }

    const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [body.bookingId]);
    if (!booking) {
      res.status(404).json({ message: 'Booking not found.' });
      return;
    }

    // Validate user is party to booking.
    if (booking.client_id !== me.userId && booking.caregiver_id !== me.userId) {
      res.status(403).json({ message: 'Only the client or provider of the booking can open a dispute.' });
      return;
    }

    // Check no open dispute already exists for this booking (409).
    const existingDispute = await queryOne<Row>(
      `SELECT id FROM disputes WHERE booking_id = $1 AND state IN ('open', 'under_review')`,
      [body.bookingId]
    );
    if (existingDispute) {
      res.status(409).json({ message: 'A dispute is already open for this booking.' });
      return;
    }

    // Find linked escrow transaction for booking: freeze it.
    const frozenEscrow = await query<Row>(
      `UPDATE escrow SET status = 'frozen' WHERE booking_id = $1 AND status = 'held' RETURNING id`,
      [body.bookingId]
    );
    let escrowId = frozenEscrow[0]?.id ? String(frozenEscrow[0].id) : null;
    if (!escrowId) {
      const existingEscrow = await queryOne<Row>(
        `SELECT id FROM escrow WHERE booking_id = $1`,
        [body.bookingId]
      );
      if (existingEscrow) {
        escrowId = String(existingEscrow.id);
      }
    }

    const row = {
      id: id('dp'),
      booking_id: body.bookingId,
      client_id: booking.client_id as string,
      provider_id: booking.caregiver_id as string,
      opened_by: me.userId,
      reason: body.reason,
      description: body.description ?? '',
      state: 'open',
      resolution: null,
      refund_cents: null,
      escrow_transaction_id: escrowId,
      evidence: '[]',
      created_at_ms: now(),
      updated_at_ms: now(),
    };

    await query(
      `INSERT INTO disputes (id, booking_id, client_id, provider_id, opened_by, reason, description, state, resolution, refund_cents, escrow_transaction_id, evidence, created_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        row.id,
        row.booking_id,
        row.client_id,
        row.provider_id,
        row.opened_by,
        row.reason,
        row.description,
        row.state,
        row.resolution,
        row.refund_cents,
        row.escrow_transaction_id,
        row.evidence,
        row.created_at_ms,
        row.updated_at_ms,
      ]
    );

    // Update booking status and append timeline event.
    await query(`UPDATE bookings SET status = 'disputed' WHERE id = $1`, [body.bookingId]);
    await appendBookingEvent(body.bookingId, 'disputed', me.userId, me.displayName, body.reason);

    // Notify the other party.
    const otherId = me.userId === booking.client_id ? booking.caregiver_id : booking.client_id;
    try {
      await notifyUser(String(otherId), {
        kind: 'dispute.opened',
        title: 'Dispute opened',
        body: `A dispute has been opened for booking ${body.bookingId}.`,
        link: '/disputes',
      });
    } catch {
      // Ignore push failures.
    }

    res.status(201).json(await disputeWithNames(row));
  } catch (error) {
    next(error);
  }
});

/** POST /disputes/:id/state — admin resolution. */
disputesRouter.post('/disputes/:id/state', requireAuth, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = req.body?.state as string | undefined;
    const resolution = (req.body?.resolution as string | undefined) ?? null;

    if (!['under_review', 'resolved_client', 'resolved_provider', 'rejected'].includes(state ?? '')) {
      res.status(422).json({ message: 'Invalid dispute state.' });
      return;
    }

    const dispute = await queryOne<Row>(`SELECT * FROM disputes WHERE id = $1`, [req.params.id]);
    if (!dispute) {
      res.status(404).json({ message: 'Dispute not found.' });
      return;
    }

    if (state === 'under_review') {
      const result = await query<Row>(
        `UPDATE disputes SET state = 'under_review', updated_at_ms = $1 WHERE id = $2 RETURNING *`,
        [now(), req.params.id]
      );
      res.json(await disputeWithNames(result[0]));
      return;
    }

    if (!['release', 'full_refund', 'partial_refund'].includes(resolution ?? '')) {
      res.status(422).json({ message: 'Invalid dispute resolution.' });
      return;
    }

    // Locate linked escrow.
    let escrowId = dispute.escrow_transaction_id ? String(dispute.escrow_transaction_id) : null;
    let escrow = escrowId
      ? await queryOne<Row>(`SELECT * FROM escrow WHERE id = $1`, [escrowId])
      : null;
    if (!escrow) {
      escrow = await queryOne<Row>(`SELECT * FROM escrow WHERE booking_id = $1`, [dispute.booking_id]);
      if (escrow) {
        escrowId = String(escrow.id);
      }
    }

    let refundCents: number | null = null;

    if (resolution === 'release') {
      if (escrowId) {
        await query(
          `UPDATE escrow SET status = 'released', settled_at_ms = $1 WHERE id = $2 AND status = 'frozen'`,
          [now(), escrowId]
        );
      }
    } else if (resolution === 'full_refund') {
      if (escrowId) {
        await query(
          `UPDATE escrow SET status = 'refunded', settled_at_ms = $1 WHERE id = $2 AND status = 'frozen'`,
          [now(), escrowId]
        );
      }
    } else if (resolution === 'partial_refund') {
      const rawRefund = req.body?.refundCents;
      const amountCents = escrow ? Number(escrow.amount_cents) : null;
      if (
        !Number.isInteger(rawRefund) ||
        Number(rawRefund) <= 0 ||
        (amountCents !== null && Number(rawRefund) > amountCents)
      ) {
        res.status(422).json({
          message: 'Refund amount must be a positive integer not exceeding the escrow amount.',
        });
        return;
      }
      refundCents = Number(rawRefund);
      if (escrowId) {
        await query(
          `UPDATE escrow SET status = 'released', refunded_cents = $1, settled_at_ms = $2 WHERE id = $3 AND status = 'frozen'`,
          [refundCents, now(), escrowId]
        );
      }
    }

    const updatedResult = await query<Row>(
      `UPDATE disputes
       SET state = $1,
           resolution = $2,
           refund_cents = $3,
           escrow_transaction_id = COALESCE(escrow_transaction_id, $4),
           updated_at_ms = $5
       WHERE id = $6
       RETURNING *`,
      [state, resolution, refundCents, escrowId, now(), req.params.id]
    );
    const updated = updatedResult[0];

    // Push / bell notifications to client and provider with resolution details.
    const kind = state === 'rejected' ? 'dispute.rejected' : 'dispute.resolved';
    const title =
      state === 'rejected'
        ? 'Dispute rejected'
        : state === 'resolved_client'
          ? 'Dispute resolved in favour of client'
          : 'Dispute resolved in favour of provider';
    const bodyText =
      resolution === 'partial_refund'
        ? `Dispute resolved with a partial refund of ${(Number(refundCents) / 100).toFixed(2)}€.`
        : resolution === 'full_refund'
          ? 'Dispute resolved with a full refund to the client.'
          : resolution === 'release'
            ? 'Dispute resolved: escrow released to the provider.'
            : 'A decision has been made on your dispute.';

    for (const partyId of [updated.client_id, updated.provider_id]) {
      try {
        await notifyUser(String(partyId), {
          kind,
          title,
          body: bodyText,
          link: '/disputes',
        });
      } catch {
        // Ignore push failures.
      }
    }

    res.json(await disputeWithNames(updated));
  } catch (error) {
    next(error);
  }
});

/** POST /disputes/:id/evidence — append evidence item (client or provider). */
disputesRouter.post('/disputes/:id/evidence', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = req.user as AuthedUser;
    const dispute = await queryOne<Row>(`SELECT * FROM disputes WHERE id = $1`, [req.params.id]);
    if (!dispute) {
      res.status(404).json({ message: 'Dispute not found.' });
      return;
    }

    const isAdmin = me.roles.includes('admin');
    if (!isAdmin && me.userId !== dispute.client_id && me.userId !== dispute.provider_id) {
      res.status(403).json({ message: 'Only parties to the dispute can submit evidence.' });
      return;
    }

    const body = req.body as {
      id?: string;
      kind?: string;
      body?: string;
      url?: string;
      createdAtMs?: number;
    };

    if (!['message', 'photo', 'visit_gps'].includes(body.kind ?? '')) {
      res.status(422).json({ message: 'Invalid evidence kind. Must be message, photo, or visit_gps.' });
      return;
    }

    const item = {
      id: typeof body.id === 'string' && body.id ? body.id : id('evi'),
      disputeId: String(dispute.id),
      authorId: me.userId,
      authorName: me.displayName,
      kind: body.kind,
      ...(body.body !== undefined ? { body: String(body.body) } : {}),
      ...(body.url !== undefined ? { url: String(body.url) } : {}),
      createdAtMs: Number(body.createdAtMs) || now(),
    };

    const currentEvidence = parseJsonSafe<unknown[]>(dispute.evidence, []);
    const updatedEvidence = [...currentEvidence, item];

    await query(
      `UPDATE disputes SET evidence = $1, updated_at_ms = $2 WHERE id = $3`,
      [JSON.stringify(updatedEvidence), now(), dispute.id]
    );

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});
