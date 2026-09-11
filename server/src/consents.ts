import { Router } from 'express';
import { query, queryOne, Row } from './db';
import { requireAuth, AuthedUser } from './auth';

/**
 * Server-side consent ledger (FEATURE_PLAN.md §16 subtasks 6–7, 15): a
 * versioned per-purpose consent document per user, matching the frontend
 * `ConsentStore` contract (`GET/PUT /me/consents` → ConsentState). The
 * `family_sharing` purpose is the enforcement input for §21 subtask 16 —
 * caregiver/nurse reads of another user's medical history are gated on the
 * target user's consent server-side (`historyAccessFor`), not just in the UI.
 *
 * The demo backend (demo.api.ts) keeps an equivalent in-memory ledger; this
 * module is the Postgres-backed twin so the real server enforces the same
 * rule. Pure helpers are unit-tested in `server/test/consents.spec.ts`.
 */

export const CONSENT_PURPOSES = ['family_sharing', 'sms_reminders', 'bluetooth', 'data_export'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const DEFAULT_DOCUMENT_VERSION = 'v1.0';

/** One purpose's current grant state (camelCase contract the frontend uses). */
export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  documentVersion: string;
  updatedAtMs: number;
  updatedBy: string;
}

/** Full consent state for one user. */
export interface ConsentState {
  userId: string;
  consents: ConsentRecord[];
  currentDocumentVersion: string;
}

/** True when `consents` holds an active grant for `purpose`. */
export function consentGranted(
  consents: readonly ConsentRecord[],
  purpose: ConsentPurpose
): boolean {
  return consents.find((c) => c.purpose === purpose)?.granted ?? false;
}

/**
 * Access decision for reading a user's medical history (FEATURE_PLAN.md §21
 * subtask 16): the owner always sees their own record; anyone else may read
 * it only while the owner's `family_sharing` consent is granted. Mirrors the
 * demo `GET /vitals/:userId` enforcement and the §16 matrix
 * (`vitals.view_family` / `medications.view_family` → family_sharing).
 */
export type HistoryAccess = 'owner' | 'family' | 'denied';

export function historyAccessFor(
  requesterUserId: string,
  targetUserId: string,
  consents: readonly ConsentRecord[]
): HistoryAccess {
  if (requesterUserId === targetUserId) {
    return 'owner';
  }
  return consentGranted(consents, 'family_sharing') ? 'family' : 'denied';
}

type PutResult =
  | { ok: true; state: ConsentState }
  | { ok: false; message: string };

/**
 * Validate a PUT /me/consents body (the frontend ConsentStore contract):
 * a `consents` array of {purpose, granted, …} records with known purposes and
 * boolean grants. Unknown purposes / malformed entries are 422s; the user id
 * is re-pinned to the session server-side so a client can never write
 * another user's ledger.
 */
export function validateConsentsPut(body: unknown): PutResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const list = b.consents;
  if (!Array.isArray(list)) {
    return { ok: false, message: 'consents must be an array.' };
  }
  const consents: ConsentRecord[] = [];
  for (const entry of list) {
    const rec = (entry ?? {}) as Record<string, unknown>;
    const purpose = rec.purpose;
    if (typeof purpose !== 'string' || !(CONSENT_PURPOSES as readonly string[]).includes(purpose)) {
      return { ok: false, message: `Unknown consent purpose: ${String(purpose ?? '')}.` };
    }
    if (typeof rec.granted !== 'boolean') {
      return { ok: false, message: 'granted must be a boolean.' };
    }
    consents.push({
      purpose: purpose as ConsentPurpose,
      granted: rec.granted,
      documentVersion:
        typeof rec.documentVersion === 'string' && rec.documentVersion.trim()
          ? rec.documentVersion.trim()
          : DEFAULT_DOCUMENT_VERSION,
      updatedAtMs: typeof rec.updatedAtMs === 'number' ? rec.updatedAtMs : Date.now(),
      updatedBy: typeof rec.updatedBy === 'string' ? rec.updatedBy : '',
    });
  }
  return {
    ok: true,
    state: {
      userId: typeof b.userId === 'string' ? b.userId : '',
      consents,
      currentDocumentVersion:
        typeof b.currentDocumentVersion === 'string' && b.currentDocumentVersion.trim()
          ? b.currentDocumentVersion.trim()
          : DEFAULT_DOCUMENT_VERSION,
    },
  };
}

/** Map a `user_consents` row to the camelCase contract (absent row → defaults). */
export function consentStateFromRow(row: Row | null, userId: string): ConsentState {
  if (!row) {
    return { userId, consents: [], currentDocumentVersion: DEFAULT_DOCUMENT_VERSION };
  }
  return {
    userId: String(row.user_id ?? userId),
    consents: Array.isArray(row.consents) ? (row.consents as ConsentRecord[]) : [],
    currentDocumentVersion: String(row.current_document_version ?? DEFAULT_DOCUMENT_VERSION),
  };
}

/** Load a user's consent state (used by history.ts family-read enforcement). */
export async function loadConsents(userId: string): Promise<ConsentState> {
  const row = await queryOne<Row>(`SELECT * FROM user_consents WHERE user_id = $1`, [userId]);
  return consentStateFromRow(row, userId);
}

// ---- Router ----

export const consentsRouter = Router();

// Per-route requireAuth so the mounted router never guards unrelated /api paths.
consentsRouter.get('/me/consents', requireAuth, async (req, res, next) => {
  try {
    const me = req.user as AuthedUser;
    res.json(await loadConsents(me.userId));
  } catch (error) {
    next(error);
  }
});

consentsRouter.put('/me/consents', requireAuth, async (req, res, next) => {
  try {
    const me = req.user as AuthedUser;
    const validation = validateConsentsPut(req.body);
    if (!validation.ok) {
      res.status(422).json({ message: validation.message });
      return;
    }
    // Re-pin the owner: the ledger is per-session, never client-chosen.
    const state: ConsentState = {
      ...validation.state,
      userId: me.userId,
    };
    await query(
      `INSERT INTO user_consents (user_id, consents, current_document_version, updated_at_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         consents = EXCLUDED.consents,
         current_document_version = EXCLUDED.current_document_version,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [me.userId, JSON.stringify(state.consents), state.currentDocumentVersion, Date.now()]
    );
    res.json(state);
  } catch (error) {
    next(error);
  }
});