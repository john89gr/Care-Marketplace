import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, Row } from './db';
import { AuthedUser, requireAuth } from './auth';

/**
 * Bell-panel notifications (§4) + reminder preferences (§8). Notifications
 * are written by notifyUser() (push.ts) on every server event; the panel
 * reads them here with or without a push subscription. Reminder preferences
 * are one opaque JSON blob per user (PUT upsert, validated as an object).
 */

const now = () => Date.now();

function notificationFromRow(row: Row) {
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body ?? ''),
    link: row.link === null || row.link === undefined ? undefined : String(row.link),
    createdAtMs: Number(row.created_at_ms),
    readAtMs: row.read_at_ms === null || row.read_at_ms === undefined ? null : Number(row.read_at_ms),
  };
}

export const notificationsRouter = Router();

notificationsRouter.get('/me/notifications', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at_ms DESC LIMIT 200`,
      [me.userId]
    );
    const items = rows.map(notificationFromRow);
    res.json({ items, unread: items.filter((n) => n.readAtMs === null).length });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/me/notifications/:id/read', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `UPDATE notifications SET read_at_ms = $1
        WHERE id = $2 AND user_id = $3 AND read_at_ms IS NULL
        RETURNING *`,
      [now(), req.params.id, me.userId]
    );
    if (rows.length === 0) {
      const existing = await query<Row>(
        `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
        [req.params.id, me.userId]
      );
      if (existing.length === 0) {
        res.status(404).json({ message: 'Notification not found.' });
        return;
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.post('/me/notifications/read-all', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    await query(
      `UPDATE notifications SET read_at_ms = $1 WHERE user_id = $2 AND read_at_ms IS NULL`,
      [now(), me.userId]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ---- Reminder preferences (§8) ----

notificationsRouter.get('/me/reminders/preferences', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(`SELECT prefs FROM reminder_preferences WHERE user_id = $1`, [
      me.userId,
    ]);
    if (rows.length === 0) {
      // No saved prefs: the client keeps its local defaults (of(false)).
      res.status(404).json({ message: 'No reminder preferences saved yet.' });
      return;
    }
    res.json(rows[0].prefs);
  } catch (error) {
    next(error);
  }
});

notificationsRouter.put('/me/reminders/preferences', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const prefs = req.body as unknown;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      res.status(422).json({ message: 'Reminder preferences must be an object.' });
      return;
    }
    await query(
      `INSERT INTO reminder_preferences (user_id, prefs)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
      [me.userId, JSON.stringify(prefs)]
    );
    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch('/me/reminders/preferences', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const patch = req.body as unknown;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      res.status(422).json({ message: 'Reminder preferences must be an object.' });
      return;
    }
    const rows = await query<Row>(`SELECT prefs FROM reminder_preferences WHERE user_id = $1`, [
      me.userId,
    ]);
    const existing =
      rows.length > 0 && rows[0].prefs && typeof rows[0].prefs === 'object' && !Array.isArray(rows[0].prefs)
        ? (rows[0].prefs as Record<string, unknown>)
        : {};
    const merged = { ...existing, ...(patch as Record<string, unknown>) };
    await query(
      `INSERT INTO reminder_preferences (user_id, prefs)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs`,
      [me.userId, JSON.stringify(merged)]
    );
    res.json(merged);
  } catch (error) {
    next(error);
  }
});

/** Test-only helper: seed one notification row (exported for specs). */
export async function insertNotification(
  userId: string,
  n: { kind: string; title: string; body?: string; link?: string; atMs?: number }
): Promise<string> {
  const notificationId = `nt-${randomBytes(6).toString('hex')}`;
  await query(
    `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at_ms, read_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
    [notificationId, userId, n.kind, n.title, n.body ?? '', n.link ?? null, n.atMs ?? now()]
  );
  return notificationId;
}
