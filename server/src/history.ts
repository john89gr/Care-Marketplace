import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth } from './auth';
import { consentGranted, loadConsents } from './consents';
import type { MedicationSchedule } from './medications';
import { validateInstructions } from './medications';

/** Reminder channels the Track 3 wizard may send (validated, not persisted here). */
export const REMINDER_CHANNELS = ['inapp', 'push', 'sms', 'voice'] as const;

/**
 * Medical-history + prescriptions register (FEATURE_PLAN.md §21): CRUD per
 * category (conditions / allergies / immunizations / events / symptoms) under
 * `/api/me/history/:kind`, a prescriptions register under `/api/me/prescriptions`
 * and a prescription → §7 medication bridge. Every record is soft-archived
 * (`archived`) — history is never hard-deleted. Validation is 422 on unknown
 * enums / missing required fields, mirroring the screening waive/schedule 422s;
 * pure helpers are unit-tested in `server/test/history.spec.ts`.
 */

export type HistoryKind = 'conditions' | 'allergies' | 'immunizations' | 'events' | 'symptoms';

export const HISTORY_KINDS: readonly HistoryKind[] = [
  'conditions',
  'allergies',
  'immunizations',
  'events',
  'symptoms',
];

export const CONDITION_STATUSES = ['active', 'chronic', 'resolved'] as const;
export const ALLERGY_KINDS = ['drug', 'food', 'environmental'] as const;
export const ALLERGY_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export const EVENT_KINDS = ['procedure', 'hospitalization', 'surgery', 'other'] as const;
export const SYMPTOM_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export const SYMPTOM_STATUSES = ['ongoing', 'resolved'] as const;
export const PRESCRIPTION_STATUSES = ['active', 'completed', 'cancelled'] as const;

/** BIGINT-ms `num()` coercion convention (pg returns BIGINT as strings). */
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;

// ---- Pure validation (unit-testable, no DB) ----

type DraftResult =
  | { ok: true; draft: Record<string, unknown> }
  | { ok: false; message: string };

const isMs = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Validate a POST body for one history kind. Required fields per kind; enum
 * values validated server-side (422 contract). Optional fields are carried
 * through only when present and trimmed/undefined-cleaned.
 */
export function validateHistoryDraft(kind: HistoryKind, body: unknown): DraftResult {
  const b = (body ?? {}) as Record<string, unknown>;
  switch (kind) {
    case 'conditions': {
      const name = str(b.name);
      if (!name) return err('Name is required for a condition.');
      const status = str(b.status) || 'active';
      if (!CONDITION_STATUSES.includes(status as never)) return err(`Invalid condition status: ${status}.`);
      if (!isMs(b.diagnosedAtMs)) return err('A valid diagnosis date is required.');
      const resolvedAtMs = b.resolvedAtMs == null ? null : Number(b.resolvedAtMs);
      return ok({
        name,
        icd11_code: str(b.icd11Code),
        status,
        diagnosed_at_ms: b.diagnosedAtMs,
        resolved_at_ms: Number.isFinite(resolvedAtMs) ? resolvedAtMs : null,
        notes: str(b.notes),
      });
    }
    case 'allergies': {
      const substance = str(b.substance);
      if (!substance) return err('Substance is required for an allergy.');
      const kind2 = str(b.kind) || 'drug';
      if (!ALLERGY_KINDS.includes(kind2 as never)) return err(`Invalid allergy kind: ${kind2}.`);
      const severity = str(b.severity) || 'moderate';
      if (!ALLERGY_SEVERITIES.includes(severity as never)) return err(`Invalid allergy severity: ${severity}.`);
      if (!isMs(b.confirmedAtMs)) return err('A valid confirmation date is required.');
      return ok({
        substance,
        kind: kind2,
        reaction: str(b.reaction),
        severity,
        confirmed_at_ms: b.confirmedAtMs,
        notes: str(b.notes),
      });
    }
    case 'immunizations': {
      const vaccine = str(b.vaccine);
      if (!vaccine) return err('Vaccine name is required.');
      if (!isMs(b.administeredAtMs)) return err('A valid administration date is required.');
      const source = str(b.source) || 'manual';
      if (source !== 'manual' && source !== 'wallet') return err(`Invalid source: ${source}.`);
      const doseNumber = b.doseNumber == null ? null : Number(b.doseNumber);
      if (doseNumber !== null && (!Number.isInteger(doseNumber) || doseNumber < 1)) {
        return err('Dose number must be a positive integer.');
      }
      return ok({
        vaccine,
        dose_number: doseNumber,
        administered_at_ms: b.administeredAtMs,
        source,
        notes: str(b.notes),
      });
    }
    case 'events': {
      const name = str(b.name);
      if (!name) return err('Name is required for a medical event.');
      const kind2 = str(b.kind) || 'other';
      if (!EVENT_KINDS.includes(kind2 as never)) return err(`Invalid event kind: ${kind2}.`);
      if (!isMs(b.occurredAtMs)) return err('A valid date is required.');
      return ok({
        kind: kind2,
        name,
        facility: str(b.facility),
        occurred_at_ms: b.occurredAtMs,
        notes: str(b.notes),
      });
    }
    case 'symptoms': {
      const name = str(b.name);
      if (!name) return err('Symptom name is required.');
      const severity = str(b.severity) || 'moderate';
      if (!SYMPTOM_SEVERITIES.includes(severity as never)) return err(`Invalid symptom severity: ${severity}.`);
      if (!isMs(b.onsetAtMs)) return err('A valid onset date is required.');
      const status = str(b.status) || 'ongoing';
      if (!SYMPTOM_STATUSES.includes(status as never)) return err(`Invalid symptom status: ${status}.`);
      return ok({
        name,
        severity,
        onset_at_ms: b.onsetAtMs,
        status,
        notes: str(b.notes),
      });
    }
  }
}

/** Validate a prescriptions-register POST body. */
export function validatePrescriptionDraft(body: unknown): DraftResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const drug = str(b.drug);
  if (!drug) return err('Drug name is required.');
  if (!isMs(b.issuedAtMs)) return err('A valid issue date is required.');
  const status = str(b.status) || 'active';
  if (!PRESCRIPTION_STATUSES.includes(status as never)) return err(`Invalid prescription status: ${status}.`);
  const durationDays = b.durationDays == null ? null : Number(b.durationDays);
  if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1)) {
    return err('Duration must be a positive number of days.');
  }
  // Optional link to a scanned pharmacy prescription (§9): a plain reference
  // id — the scanned record lives in the pharmacy feature, not in this DB.
  const pharmacyPrescriptionId =
    b.pharmacyPrescriptionId == null ? null : str(b.pharmacyPrescriptionId);
  return ok({
    drug,
    dose: str(b.dose),
    instructions: str(b.instructions),
    prescriber: str(b.prescriber),
    issued_at_ms: b.issuedAtMs,
    duration_days: durationDays,
    status,
    pharmacy_prescription_id: pharmacyPrescriptionId,
  });
}

const err = (message: string): DraftResult => ({ ok: false, message });
const ok = (draft: Record<string, unknown>): DraftResult => ({ ok: true, draft });

/**
 * Whitelist a PATCH body against an existing record: only the same fields the
 * POST validator accepts may change (enums re-validated, dates re-checked).
 * Body keys arrive camelCase (frontend contract) and map to snake_case
 * columns. `archived: true` is the soft-delete — history is never hard-deleted.
 */

type FieldValidator = (value: unknown) => string | null;

const requiredStr = (message: string): FieldValidator => (v) => (str(v) ? null : message);
const anyStr = (): FieldValidator => () => null;
const enumOf = (values: readonly string[], message: string): FieldValidator => (v) =>
  values.includes(str(v) as never) ? null : message;
const dateMs = (message: string): FieldValidator => (v) => (isMs(v) ? null : message);
const optionalMs = (message: string): FieldValidator => (v) =>
  v == null ? null : isMs(v) ? null : message;
const optionalInt = (message: string): FieldValidator => (v) => {
  if (v == null || str(v) === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? null : message;
};

interface PatchField {
  column: string;
  validate: FieldValidator;
}

const PATCH_FIELDS: Record<HistoryKind, Record<string, PatchField>> = {
  conditions: {
    name: { column: 'name', validate: requiredStr('Name cannot be empty.') },
    icd11Code: { column: 'icd11_code', validate: anyStr() },
    status: { column: 'status', validate: enumOf(CONDITION_STATUSES, `Invalid condition status.`) },
    diagnosedAtMs: { column: 'diagnosed_at_ms', validate: dateMs('Invalid diagnosis date.') },
    resolvedAtMs: { column: 'resolved_at_ms', validate: optionalMs('Invalid resolved date.') },
    notes: { column: 'notes', validate: anyStr() },
  },
  allergies: {
    substance: { column: 'substance', validate: requiredStr('Substance cannot be empty.') },
    kind: { column: 'kind', validate: enumOf(ALLERGY_KINDS, 'Invalid allergy kind.') },
    reaction: { column: 'reaction', validate: anyStr() },
    severity: { column: 'severity', validate: enumOf(ALLERGY_SEVERITIES, 'Invalid allergy severity.') },
    confirmedAtMs: { column: 'confirmed_at_ms', validate: dateMs('Invalid confirmation date.') },
    notes: { column: 'notes', validate: anyStr() },
  },
  immunizations: {
    vaccine: { column: 'vaccine', validate: requiredStr('Vaccine name cannot be empty.') },
    doseNumber: { column: 'dose_number', validate: optionalInt('Dose number must be a positive integer.') },
    administeredAtMs: { column: 'administered_at_ms', validate: dateMs('Invalid administration date.') },
    source: { column: 'source', validate: enumOf(['manual', 'wallet'], 'Invalid source.') },
    notes: { column: 'notes', validate: anyStr() },
  },
  events: {
    kind: { column: 'kind', validate: enumOf(EVENT_KINDS, 'Invalid event kind.') },
    name: { column: 'name', validate: requiredStr('Name cannot be empty.') },
    facility: { column: 'facility', validate: anyStr() },
    occurredAtMs: { column: 'occurred_at_ms', validate: dateMs('Invalid date.') },
    notes: { column: 'notes', validate: anyStr() },
  },
  symptoms: {
    name: { column: 'name', validate: requiredStr('Symptom name cannot be empty.') },
    severity: { column: 'severity', validate: enumOf(SYMPTOM_SEVERITIES, 'Invalid symptom severity.') },
    onsetAtMs: { column: 'onset_at_ms', validate: dateMs('Invalid onset date.') },
    status: { column: 'status', validate: enumOf(SYMPTOM_STATUSES, 'Invalid symptom status.') },
    notes: { column: 'notes', validate: anyStr() },
  },
};

const PRESCRIPTION_PATCH_FIELDS: Record<string, PatchField> = {
  drug: { column: 'drug', validate: requiredStr('Drug name cannot be empty.') },
  dose: { column: 'dose', validate: anyStr() },
  instructions: { column: 'instructions', validate: anyStr() },
  prescriber: { column: 'prescriber', validate: anyStr() },
  issuedAtMs: { column: 'issued_at_ms', validate: dateMs('Invalid issue date.') },
  durationDays: { column: 'duration_days', validate: optionalInt('Duration must be a positive number of days.') },
  status: { column: 'status', validate: enumOf(PRESCRIPTION_STATUSES, 'Invalid prescription status.') },
  pharmacyPrescriptionId: { column: 'pharmacy_prescription_id', validate: anyStr() },
};

export function validateHistoryPatch(kind: HistoryKind, body: unknown): DraftResult {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.archived !== undefined) {
    if (b.archived !== true && b.archived !== false) return err('archived must be a boolean.');
    return ok({ archived: b.archived });
  }
  const fields = PATCH_FIELDS[kind];
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined || value === '') continue;
    const field = fields[key];
    if (!field) return err(`Unknown field: ${key}.`);
    const problem = field.validate(value);
    if (problem) return err(problem);
    patch[field.column] = value;
  }
  return ok(patch);
}

export function validatePrescriptionPatch(body: unknown): DraftResult {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.archived !== undefined) {
    if (b.archived !== true && b.archived !== false) return err('archived must be a boolean.');
    return ok({ archived: b.archived });
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(b)) {
    if (value === undefined || value === '') continue;
    const field = PRESCRIPTION_PATCH_FIELDS[key];
    if (!field) return err(`Unknown field: ${key}.`);
    const problem = field.validate(value);
    if (problem) return err(problem);
    patch[field.column] = value;
  }
  return ok(patch);
}

// ---- Row mappers (camelCase contract the frontend expects) ----

export function conditionFromRow(row: Row) {
  return {
    id: row.id,
    name: row.name,
    icd11Code: row.icd11_code || undefined,
    status: row.status,
    diagnosedAtMs: num(row.diagnosed_at_ms),
    resolvedAtMs: row.resolved_at_ms === null || row.resolved_at_ms === undefined ? null : num(row.resolved_at_ms),
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

export function allergyFromRow(row: Row) {
  return {
    id: row.id,
    substance: row.substance,
    kind: row.kind,
    reaction: row.reaction || undefined,
    severity: row.severity,
    confirmedAtMs: num(row.confirmed_at_ms),
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

export function immunizationFromRow(row: Row) {
  return {
    id: row.id,
    vaccine: row.vaccine,
    doseNumber: row.dose_number === null || row.dose_number === undefined ? undefined : Number(row.dose_number),
    administeredAtMs: num(row.administered_at_ms),
    source: row.source ?? 'manual',
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

export function eventFromRow(row: Row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    facility: row.facility || undefined,
    occurredAtMs: num(row.occurred_at_ms),
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

export function symptomFromRow(row: Row) {
  return {
    id: row.id,
    name: row.name,
    severity: row.severity,
    onsetAtMs: num(row.onset_at_ms),
    status: row.status ?? 'ongoing',
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

export function prescriptionFromRow(row: Row) {
  return {
    id: row.id,
    drug: row.drug,
    dose: row.dose || undefined,
    instructions: row.instructions || undefined,
    prescriber: row.prescriber || undefined,
    issuedAtMs: num(row.issued_at_ms),
    durationDays: row.duration_days === null || row.duration_days === undefined ? undefined : Number(row.duration_days),
    status: row.status ?? 'active',
    pharmacyPrescriptionId: row.pharmacy_prescription_id || undefined,
    medicationId: row.medication_id || null,
    archived: Boolean(row.archived),
    createdAtMs: num(row.created_at_ms),
  };
}

const TABLE_BY_KIND: Record<HistoryKind, { table: string; orderBy: string }> = {
  conditions: { table: 'medical_conditions', orderBy: 'diagnosed_at_ms' },
  allergies: { table: 'allergies', orderBy: 'confirmed_at_ms' },
  immunizations: { table: 'immunizations', orderBy: 'administered_at_ms' },
  events: { table: 'medical_events', orderBy: 'occurred_at_ms' },
  symptoms: { table: 'symptoms', orderBy: 'onset_at_ms' },
};

const MAPPER_BY_KIND: Record<HistoryKind, (row: Row) => Row> = {
  conditions: conditionFromRow,
  allergies: allergyFromRow,
  immunizations: immunizationFromRow,
  events: eventFromRow,
  symptoms: symptomFromRow,
};

/**
 * Family-read gate (FEATURE_PLAN.md §21 subtask 16): a non-owner may read a
 * user's history only while that user has granted the `family_sharing`
 * consent — the §16 enforcement matrix (family_sharing → view_family actions)
 * mirrored server-side, with the same 403 copy as the demo vitals family view.
 * Family responses are read-only: POST/PATCH stay owner-scoped.
 */
async function familyReadTarget(req: Request, res: Response): Promise<string | null> {
  const me = req.user as AuthedUser;
  const targetUserId = req.params.userId;
  if (targetUserId === me.userId) {
    return targetUserId;
  }
  const { consents } = await loadConsents(targetUserId);
  if (!consentGranted(consents, 'family_sharing')) {
    res.status(403).json({ message: 'This person has not granted family-sharing consent.' });
    return null;
  }
  return targetUserId;
}

// ---- Router ----

export const historyRouter = Router();

// Every history route requires a session (per-route requireAuth so the
// mounted router never guards unrelated /api paths like /api/health).
for (const kind of HISTORY_KINDS) {
  const { table, orderBy } = TABLE_BY_KIND[kind];
  const mapper = MAPPER_BY_KIND[kind];

  historyRouter.get(`/me/history/${kind}`, requireAuth, async (req, res, next) => {
    try {
      const rows = await query<Row>(
        `SELECT * FROM ${table} WHERE user_id = $1 ORDER BY ${orderBy} DESC`,
        [(req.user as { userId: string }).userId]
      );
      res.json(rows.map(mapper));
    } catch (error) {
      next(error);
    }
  });

  // Family read (§21 subtask 16): consent-gated, read-only.
  historyRouter.get(`/history/:userId/${kind}`, requireAuth, async (req, res, next) => {
    try {
      const target = await familyReadTarget(req, res);
      if (!target) {
        return;
      }
      const rows = await query<Row>(
        `SELECT * FROM ${table} WHERE user_id = $1 ORDER BY ${orderBy} DESC`,
        [target]
      );
      res.json(rows.map(mapper));
    } catch (error) {
      next(error);
    }
  });

  historyRouter.post(`/me/history/${kind}`, requireAuth, async (req, res, next) => {
    try {
      const validation = validateHistoryDraft(kind, req.body);
      if (!validation.ok) {
        res.status(422).json({ message: validation.message });
        return;
      }
      const draft = validation.draft;
      const row: Record<string, unknown> = {
        id: id(kind === 'conditions' ? 'cond' : kind === 'allergies' ? 'all' : kind === 'immunizations' ? 'imm' : kind === 'events' ? 'ev' : 'sym'),
        user_id: (req.user as { userId: string }).userId,
        ...draft,
        archived: false,
        created_at_ms: Date.now(),
      };
      const columns = Object.keys(row);
      await query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
        columns.map((c) => row[c])
      );
      res.status(201).json(mapper(row));
    } catch (error) {
      next(error);
    }
  });

  historyRouter.patch(`/me/history/${kind}/:id`, requireAuth, async (req, res, next) => {
    try {
      const userId = (req.user as { userId: string }).userId;
      const existing = await queryOne<Row>(`SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`, [
        req.params.id,
        userId,
      ]);
      if (!existing) {
        res.status(404).json({ message: 'Record not found.' });
        return;
      }
      const validation = validateHistoryPatch(kind, req.body);
      if (!validation.ok) {
        res.status(422).json({ message: validation.message });
        return;
      }
      const patch = validation.draft;
      const columns = Object.keys(patch);
      if (columns.length === 0) {
        res.json(mapper(existing));
        return;
      }
      const result = await query<Row>(
        `UPDATE ${table} SET ${columns.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${columns.length + 1} RETURNING *`,
        [...columns.map((c) => patch[c]), req.params.id]
      );
      res.json(mapper(result[0]));
    } catch (error) {
      next(error);
    }
  });
}

// ---- Prescriptions register ----

historyRouter.get('/me/prescriptions', requireAuth, async (req, res, next) => {
  try {
    const rows = await query<Row>(
      `SELECT * FROM prescription_records WHERE user_id = $1 ORDER BY issued_at_ms DESC`,
      [(req.user as { userId: string }).userId]
    );
    res.json(rows.map(prescriptionFromRow));
  } catch (error) {
    next(error);
  }
});

// Family read for the prescriptions register (§21 subtask 16): same
// family_sharing gate, read-only.
historyRouter.get('/history/:userId/prescriptions', requireAuth, async (req, res, next) => {
  try {
    const target = await familyReadTarget(req, res);
    if (!target) {
      return;
    }
    const rows = await query<Row>(
      `SELECT * FROM prescription_records WHERE user_id = $1 ORDER BY issued_at_ms DESC`,
      [target]
    );
    res.json(rows.map(prescriptionFromRow));
  } catch (error) {
    next(error);
  }
});

historyRouter.post('/me/prescriptions', requireAuth, async (req, res, next) => {
  try {
    const validation = validatePrescriptionDraft(req.body);
    if (!validation.ok) {
      res.status(422).json({ message: validation.message });
      return;
    }
    const draft = validation.draft;
    const row: Record<string, unknown> = {
      id: id('rx'),
      user_id: (req.user as { userId: string }).userId,
      ...draft,
      pharmacy_prescription_id: (draft.pharmacy_prescription_id as string | null) ?? null,
      medication_id: null,
      archived: false,
      created_at_ms: Date.now(),
    };
    const columns = Object.keys(row);
    await query(
      `INSERT INTO prescription_records (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      columns.map((c) => row[c])
    );
    res.status(201).json(prescriptionFromRow(row));
  } catch (error) {
    next(error);
  }
});

historyRouter.patch('/me/prescriptions/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const existing = await queryOne<Row>(
      `SELECT * FROM prescription_records WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!existing) {
      res.status(404).json({ message: 'Prescription not found.' });
      return;
    }
    const validation = validatePrescriptionPatch(req.body);
    if (!validation.ok) {
      res.status(422).json({ message: validation.message });
      return;
    }
    const patch = validation.draft;
    const columns = Object.keys(patch);
    if (columns.length === 0) {
      res.json(prescriptionFromRow(existing));
      return;
    }
    const result = await query<Row>(
      `UPDATE prescription_records SET ${columns
        .map((c, i) => `${c} = $${i + 1}`)
        .join(', ')} WHERE id = $${columns.length + 1} RETURNING *`,
      [...columns.map((c) => patch[c]), req.params.id]
    );
    res.json(prescriptionFromRow(result[0]));
  } catch (error) {
    next(error);
  }
});

type ScheduleResult =
  | { ok: true; value: MedicationSchedule }
  | { ok: false; message: string };

/**
 * Validate a schedule body from the Track 3 reminder wizard. An omitted body
 * keeps the legacy default-morning behaviour (backwards compatible); an
 * invalid shape is a 422.
 */
export function validateSchedule(input: unknown): ScheduleResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Schedule must be an object.' };
  }
  const raw = input as Record<string, unknown>;
  const minutes = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 1439 ? n : null;
  };
  switch (raw.kind) {
    case 'daily': {
      if (!Array.isArray(raw.timesMinutes) || raw.timesMinutes.length === 0) {
        return { ok: false, message: 'A daily schedule needs at least one dose time.' };
      }
      const times = raw.timesMinutes.map(minutes);
      if (times.some((t) => t === null)) {
        return { ok: false, message: 'Invalid dose time.' };
      }
      return {
        ok: true,
        value: { kind: 'daily', timesMinutes: (times as number[]).sort((a, b) => a - b) },
      };
    }
    case 'interval': {
      const everyDays = Number(raw.everyDays);
      if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 90) {
        return { ok: false, message: 'Interval days must be between 1 and 90.' };
      }
      const timeMinutes = minutes(raw.timeMinutes);
      if (timeMinutes === null) {
        return { ok: false, message: 'Invalid dose time.' };
      }
      return { ok: true, value: { kind: 'interval', everyDays, timeMinutes } };
    }
    case 'weekly': {
      if (!Array.isArray(raw.weekdays) || raw.weekdays.length === 0) {
        return { ok: false, message: 'A weekly schedule needs at least one weekday.' };
      }
      const days = raw.weekdays.map((d) => Number(d));
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        return { ok: false, message: 'Invalid weekday.' };
      }
      const timeMinutes = minutes(raw.timeMinutes);
      if (timeMinutes === null) {
        return { ok: false, message: 'Invalid dose time.' };
      }
      return {
        ok: true,
        value: { kind: 'weekly', weekdays: [...new Set(days)].sort((a, b) => a - b), timeMinutes },
      };
    }
    default:
      return { ok: false, message: `Invalid schedule kind: ${String(raw.kind)}.` };
  }
}

/**
 * Prescription → medication bridge (§21 subtask 6, extended by Track 3):
 * create a §7 medication from the register entry and link them. Without a body
 * the legacy default daily-morning schedule is used; the reminder wizard can
 * supply a parsed `schedule` and a structured `instructions` sheet. Reminder
 * `channels` are validated here but persisted client-side (reminder prefs are
 * not a Postgres resource).
 */
historyRouter.post('/me/prescriptions/:id/to-medication', requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as { userId: string }).userId;
    const rx = await queryOne<Row>(
      `SELECT * FROM prescription_records WHERE id = $1 AND user_id = $2 AND archived = FALSE`,
      [req.params.id, userId]
    );
    if (!rx) {
      res.status(404).json({ message: 'Prescription not found.' });
      return;
    }
    if (rx.medication_id) {
      res.status(409).json({ message: 'This prescription is already linked to a medication.' });
      return;
    }
    const body = (req.body ?? {}) as {
      schedule?: unknown;
      instructions?: unknown;
      channels?: unknown;
    };
    // Default daily 08:00 schedule — mirrors the pharmacy order import
    // (medicationDraftsFor): scan data carries no schedule information.
    let schedule: MedicationSchedule = { kind: 'daily', timesMinutes: [480] };
    if (body.schedule !== undefined) {
      const validated = validateSchedule(body.schedule);
      if (!validated.ok) {
        res.status(422).json({ message: validated.message });
        return;
      }
      schedule = validated.value;
    }
    let instructions: string | null = null;
    if (body.instructions !== undefined && body.instructions !== null) {
      const validated = validateInstructions(body.instructions);
      if (!validated.ok) {
        res.status(422).json({ message: validated.message });
        return;
      }
      instructions = JSON.stringify(validated.value);
    }
    // Channels are persisted through the client reminder-prefs store; reject an
    // unknown enum for forward compatibility.
    if (body.channels !== undefined) {
      if (
        !Array.isArray(body.channels) ||
        body.channels.some((c) => !REMINDER_CHANNELS.includes(c as never))
      ) {
        res.status(422).json({ message: 'Invalid reminder channel.' });
        return;
      }
    }
    const medicationId = id('med');
    const nowMs = Date.now();
    await query(
      `INSERT INTO medications (id, user_id, name, dose, schedule, critical, prescriber, instructions, prescription_id, archived, created_at_ms)
       VALUES ($1, $2, $3, $4, $5::jsonb, FALSE, $6, $7::jsonb, $8, FALSE, $9)`,
      [
        medicationId,
        userId,
        rx.drug,
        rx.dose ?? '',
        JSON.stringify(schedule),
        rx.prescriber ?? '',
        instructions,
        req.params.id,
        nowMs,
      ]
    );
    const updated = await queryOne<Row>(
      `UPDATE prescription_records SET medication_id = $1 WHERE id = $2 RETURNING *`,
      [medicationId, req.params.id]
    );
    res.status(201).json({
      prescription: prescriptionFromRow(updated ?? rx),
      medicationId,
    });
  } catch (error) {
    next(error);
  }
});