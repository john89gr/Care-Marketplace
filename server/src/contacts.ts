import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { requireAuth } from './auth';

/**
 * Contact phone manager (FEATURE_PLAN.md — contact phone manager): ICE and
 * care-team contacts under `/api/me/contacts`, per-user scoped, soft-archived
 * (`archived`) and never hard-deleted. At most one primary per kind is enforced
 * on write. Validation mirrors the demo backend contract: 422 on unknown kind /
 * missing name / malformed phone or email. Pure helpers are unit-tested in
 * `server/test/contacts.spec.ts`.
 */

export const CONTACT_KINDS = ['emergency', 'care'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** BIGINT-ms `num()` coercion convention (pg returns BIGINT as strings). */
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const phoneDigits = (value: string): string => value.replace(/\D/g, '');

export interface ContactDraft {
  kind: ContactKind;
  name: string;
  relationship: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  notes: string;
  isPrimary: boolean;
  priority: number;
}

type DraftResult =
  | { ok: true; draft: ContactDraft }
  | { ok: false; message: string };

/** Validate a POST body (422 contract); the demo backend mirrors this. */
export function validateContactDraft(body: unknown): DraftResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = str(b.kind);
  if (!CONTACT_KINDS.includes(kind as never)) {
    return { ok: false, message: `Invalid contact kind: ${kind}.` };
  }
  const name = str(b.name);
  if (!name) {
    return { ok: false, message: 'Name is required for a contact.' };
  }
  const phone = str(b.phone);
  if (phoneDigits(phone).length < 6) {
    return { ok: false, message: 'A phone number with at least 6 digits is required.' };
  }
  const email = str(b.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: 'Invalid email.' };
  }
  const priority = b.priority === undefined ? 0 : Number(b.priority);
  if (!Number.isFinite(priority)) {
    return { ok: false, message: 'Invalid priority.' };
  }
  return {
    ok: true,
    draft: {
      kind: kind as ContactKind,
      name,
      relationship: str(b.relationship),
      phone,
      altPhone: str(b.altPhone),
      email,
      address: str(b.address),
      notes: str(b.notes),
      isPrimary: b.isPrimary === true,
      priority: Math.max(0, Math.round(priority)),
    },
  };
}

type PatchResult = { ok: true; patch: Record<string, unknown> } | { ok: false; message: string };

const PATCH_STRING_FIELDS = [
  'name',
  'relationship',
  'phone',
  'altPhone',
  'email',
  'address',
  'notes',
] as const;

/** Validate a PATCH body; only supplied fields are carried through. */
export function validateContactPatch(body: unknown): PatchResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of PATCH_STRING_FIELDS) {
    if (b[field] !== undefined) {
      patch[field] = str(b[field]);
    }
  }
  if (patch.phone !== undefined && phoneDigits(String(patch.phone)).length < 6) {
    return { ok: false, message: 'A phone number with at least 6 digits is required.' };
  }
  if (patch.email !== undefined && String(patch.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch.email))) {
    return { ok: false, message: 'Invalid email.' };
  }
  if (b.isPrimary !== undefined) {
    patch.is_primary = b.isPrimary === true;
  }
  if (b.priority !== undefined) {
    const priority = Number(b.priority);
    if (!Number.isFinite(priority)) {
      return { ok: false, message: 'Invalid priority.' };
    }
    patch.priority = Math.max(0, Math.round(priority));
  }
  if (b.archived !== undefined) {
    patch.archived = b.archived === true;
  }
  return { ok: true, patch };
}

/** Row → camelCase API shape (mirrors contacts.models.ts). */
export function contactFromRow(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    relationship: row.relationship ?? '',
    phone: row.phone,
    altPhone: row.alt_phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    notes: row.notes ?? '',
    isPrimary: row.is_primary === true || row.is_primary === 'true',
    priority: num(row.priority) ?? 0,
    archived: row.archived === true || row.archived === 'true',
    createdAtMs: num(row.created_at_ms),
  };
}

/** Demote every other primary of the same kind so only `id` stays primary. */
async function demoteSiblings(userId: string, kind: string, keepId: string): Promise<void> {
  await query(
    `UPDATE medical_contacts SET is_primary = FALSE WHERE user_id = $1 AND kind = $2 AND id <> $3`,
    [userId, kind, keepId]
  );
}

export const contactsRouter = Router();

contactsRouter.get('/me/contacts', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(
      `SELECT * FROM medical_contacts WHERE user_id = $1 ORDER BY priority DESC, name ASC`,
      [(req.user as { userId: string }).userId]
    );
    res.json(rows.map(contactFromRow));
  } catch (error) {
    next(error);
  }
});

contactsRouter.post('/me/contacts', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const validation = validateContactDraft(req.body);
    if (!validation.ok) {
      res.status(422).json({ message: validation.message });
      return;
    }
    const draft = validation.draft;
    const userId = (req.user as { userId: string }).userId;
    const row: Record<string, unknown> = {
      id: id('contact'),
      user_id: userId,
      kind: draft.kind,
      name: draft.name,
      relationship: draft.relationship,
      phone: draft.phone,
      alt_phone: draft.altPhone,
      email: draft.email,
      address: draft.address,
      notes: draft.notes,
      is_primary: draft.isPrimary,
      priority: draft.priority,
      archived: false,
      created_at_ms: Date.now(),
    };
    const columns = Object.keys(row);
    await query(
      `INSERT INTO medical_contacts (${columns.join(', ')}) VALUES (${columns
        .map((_, i) => `$${i + 1}`)
        .join(', ')})`,
      columns.map((c) => row[c])
    );
    if (draft.isPrimary) {
      await demoteSiblings(userId, draft.kind, row.id as string);
    }
    res.status(201).json(contactFromRow(row));
  } catch (error) {
    next(error);
  }
});

contactsRouter.patch('/me/contacts/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const existing = await queryOne<Row>(
      `SELECT * FROM medical_contacts WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!existing) {
      res.status(404).json({ message: 'Contact not found.' });
      return;
    }
    const validation = validateContactPatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ message: validation.message });
      return;
    }
    const patch = validation.patch;
    const columns = Object.keys(patch);
    if (columns.length === 0) {
      res.json(contactFromRow(existing));
      return;
    }
    const result = await query<Row>(
      `UPDATE medical_contacts SET ${columns
        .map((c, i) => `${c} = $${i + 1}`)
        .join(', ')} WHERE id = $${columns.length + 1} RETURNING *`,
      [...columns.map((c) => patch[c]), req.params.id]
    );
    if (patch.is_primary === true) {
      await demoteSiblings(userId, existing.kind as string, req.params.id);
    }
    res.json(contactFromRow(result[0]));
  } catch (error) {
    next(error);
  }
});
