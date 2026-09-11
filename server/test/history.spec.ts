import { describe, expect, it } from 'vitest';
import {
  conditionFromRow,
  prescriptionFromRow,
  validateHistoryDraft,
  validateHistoryPatch,
  validatePrescriptionDraft,
  validatePrescriptionPatch,
  validateSchedule,
} from '../src/history';
import { historyAccessFor, ConsentRecord } from '../src/consents';

/**
 * Pure validation + row-mapper tests for the medical-history register
 * (FEATURE_PLAN.md §21 subtasks 1, 3, 17–18): required fields, enum 422
 * paths, partial PATCH whitelisting, archive, and the camelCase↔snake_case
 * row contract.
 */

const validCondition = {
  name: 'Υπέρταση',
  icd11Code: 'BA00',
  status: 'chronic',
  diagnosedAtMs: 1_600_000_000_000,
  notes: '',
};

describe('validateHistoryDraft', () => {
  it('accepts a valid condition with an ICD-11 code', () => {
    const result = validateHistoryDraft('conditions', validCondition);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft).toMatchObject({
        name: 'Υπέρταση',
        icd11_code: 'BA00',
        status: 'chronic',
        diagnosed_at_ms: 1_600_000_000_000,
      });
    }
  });

  it('422s on missing required fields', () => {
    const result = validateHistoryDraft('conditions', { status: 'active', diagnosedAtMs: 1 });
    expect(result).toEqual({ ok: false, message: 'Name is required for a condition.' });
  });

  it.each([
    ['conditions', { ...validCondition, status: 'unknown' }, 'Invalid condition status: unknown.'],
    ['allergies', { substance: 'Πενικιλίνη', kind: 'drug', severity: 'extreme', confirmedAtMs: 1 }, 'Invalid allergy severity: extreme.'],
    ['events', { name: 'X', kind: 'transplant', occurredAtMs: 1 }, 'Invalid event kind: transplant.'],
    ['symptoms', { name: 'Πόνος', severity: 'severe', onsetAtMs: 1, status: 'weird' }, 'Invalid symptom status: weird.'],
  ])('%s rejects unknown enum values', (_kind, body, message) => {
    expect(validateHistoryDraft(_kind as never, body)).toEqual({ ok: false, message });
  });

  it('422s on invalid dates', () => {
    expect(validateHistoryDraft('allergies', { substance: 'X', kind: 'food', severity: 'mild', confirmedAtMs: 'yesterday' })).toEqual({
      ok: false,
      message: 'A valid confirmation date is required.',
    });
  });

  it('validates immunization dose numbers', () => {
    expect(validateHistoryDraft('immunizations', { vaccine: 'Γρίπη', doseNumber: 0, administeredAtMs: 1 })).toEqual({
      ok: false,
      message: 'Dose number must be a positive integer.',
    });
  });
});

describe('validateHistoryPatch', () => {
  it('accepts a partial status-only patch (status changes)', () => {
    const result = validateHistoryPatch('conditions', { status: 'resolved' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toEqual({ status: 'resolved' });
  });

  it('maps camelCase keys to snake_case columns', () => {
    const result = validateHistoryPatch('conditions', { icd11Code: 'BD10' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).toEqual({ icd11_code: 'BD10' });
  });

  it('archives via the archived flag', () => {
    expect(validateHistoryPatch('allergies', { archived: true })).toEqual({ ok: true, draft: { archived: true } });
  });

  it('422s on unknown fields and bad enums', () => {
    expect(validateHistoryPatch('symptoms', { severity: 'huge' })).toEqual({
      ok: false,
      message: 'Invalid symptom severity.',
    });
    expect(validateHistoryPatch('events', { deleteMe: true })).toEqual({
      ok: false,
      message: 'Unknown field: deleteMe.',
    });
  });
});

describe('validatePrescriptionDraft / validatePrescriptionPatch', () => {
  const validRx = { drug: 'Ατορβαστατίνη', dose: '20mg', issuedAtMs: 1_700_000_000_000, status: 'active' };

  it('accepts a valid prescription draft', () => {
    const result = validatePrescriptionDraft(validRx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft).toMatchObject({ drug: 'Ατορβαστατίνη', status: 'active', issued_at_ms: 1_700_000_000_000 });
    }
  });

  it('defaults status to active and 422s on invalid status', () => {
    expect(validatePrescriptionDraft({ drug: 'X', issuedAtMs: 1 }).ok).toBe(true);
    expect(validatePrescriptionDraft({ ...validRx, status: 'expired' })).toEqual({
      ok: false,
      message: 'Invalid prescription status: expired.',
    });
  });

  it('supports status transitions via PATCH (complete/cancel)', () => {
    expect(validatePrescriptionPatch({ status: 'completed' })).toEqual({ ok: true, draft: { status: 'completed' } });
    expect(validatePrescriptionPatch({ status: 'cancelled' })).toEqual({ ok: true, draft: { status: 'cancelled' } });
  });

  it('accepts an optional scanned-pharmacy-prescription link', () => {
    const result = validatePrescriptionDraft({ ...validRx, pharmacyPrescriptionId: 'rx-ph-7' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.pharmacy_prescription_id).toBe('rx-ph-7');
    // PATCH can attach the link after the fact.
    expect(validatePrescriptionPatch({ pharmacyPrescriptionId: 'rx-ph-7' })).toEqual({
      ok: true,
      draft: { pharmacy_prescription_id: 'rx-ph-7' },
    });
    // Absent → null (no link).
    const noLink = validatePrescriptionDraft(validRx);
    expect(noLink.ok && (noLink as never)['draft']).toBeTruthy();
    if (noLink.ok) expect(noLink.draft.pharmacy_prescription_id).toBeNull();
  });

  it('422s when duration is not a positive integer', () => {
    expect(validatePrescriptionDraft({ drug: 'X', issuedAtMs: 1, durationDays: -3 })).toEqual({
      ok: false,
      message: 'Duration must be a positive number of days.',
    });
  });
});

describe('family-sharing consent gate (§21 subtask 16)', () => {
  const familySharing: ConsentRecord = {
    purpose: 'family_sharing',
    granted: true,
    documentVersion: 'v1.0',
    updatedAtMs: 1_000,
    updatedBy: 'u-client',
  };

  it('protects every history kind the same way (owner / family / denied)', () => {
    for (const kind of ['conditions', 'allergies', 'immunizations', 'events', 'symptoms', 'prescriptions']) {
      // Owner reads their own record regardless of consent.
      expect(historyAccessFor('u-client', 'u-client', [])).toBe('owner');
      // Caregiver/nurse read requires the target's family_sharing consent.
      expect(historyAccessFor('u-nurse', 'u-client', [familySharing])).toBe('family');
      expect(historyAccessFor('u-nurse', 'u-client', [])).toBe('denied');
    }
  });

  it('withdrawing family_sharing locks family reads back down', () => {
    const withdrawn = { ...familySharing, granted: false };
    expect(historyAccessFor('u-nurse', 'u-client', [withdrawn])).toBe('denied');
  });
});

describe('row mappers', () => {
  it('coerces BIGINT ms strings to numbers (pg convention)', () => {
    const condition = conditionFromRow({
      id: 'cond-1',
      name: 'Υπέρταση',
      icd11_code: 'BA00',
      status: 'chronic',
      diagnosed_at_ms: '1600000000000',
      resolved_at_ms: null,
      notes: '',
      archived: false,
      created_at_ms: '1600000000100',
    });
    expect(condition.diagnosedAtMs).toBe(1_600_000_000_000);
    expect(condition.createdAtMs).toBe(1_600_000_000_100);
    expect(condition.icd11Code).toBe('BA00');
    expect(condition.archived).toBe(false);
  });

  it('maps optional prescription fields to undefined and links', () => {
    const rx = prescriptionFromRow({
      id: 'rx-1',
      drug: 'Ατορβαστατίνη',
      dose: '',
      instructions: '',
      prescriber: 'Δρ. Παπαδόπουλος',
      issued_at_ms: '1700000000000',
      duration_days: null,
      status: 'active',
      pharmacy_prescription_id: null,
      medication_id: 'med-9',
      archived: false,
      created_at_ms: '1700000000100',
    });
    expect(rx.dose).toBeUndefined();
    expect(rx.durationDays).toBeUndefined();
    expect(rx.medicationId).toBe('med-9');
    expect(rx.prescriber).toBe('Δρ. Παπαδόπουλος');
  });

  it('maps the pharmacy link id onto the register contract', () => {
    const rx = prescriptionFromRow({
      id: 'rx-2',
      drug: 'Ατορβαστατίνη',
      dose: '20mg',
      instructions: '',
      prescriber: '',
      issued_at_ms: '1700000000000',
      duration_days: null,
      status: 'active',
      pharmacy_prescription_id: 'rx-ph-7',
      medication_id: null,
      archived: false,
      created_at_ms: '1700000000100',
    });
    expect(rx.pharmacyPrescriptionId).toBe('rx-ph-7');
  });
});

describe('validateSchedule (Track 3 reminder wizard)', () => {
  it('accepts and normalizes a daily schedule', () => {
    const result = validateSchedule({ kind: 'daily', timesMinutes: [1200, 480, 840] });
    expect(result).toEqual({ ok: true, value: { kind: 'daily', timesMinutes: [480, 840, 1200] } });
  });

  it('accepts interval and weekly schedules', () => {
    expect(validateSchedule({ kind: 'interval', everyDays: 2, timeMinutes: 480 })).toEqual({
      ok: true,
      value: { kind: 'interval', everyDays: 2, timeMinutes: 480 },
    });
    expect(validateSchedule({ kind: 'weekly', weekdays: [5, 1, 1], timeMinutes: 60 })).toEqual({
      ok: true,
      value: { kind: 'weekly', weekdays: [1, 5], timeMinutes: 60 },
    });
  });

  it.each([
    [null, 'Schedule must be an object.'],
    [[1, 2], 'Schedule must be an object.'],
    [{ kind: 'hourly' }, 'Invalid schedule kind: hourly.'],
    [{ kind: 'daily', timesMinutes: [] }, 'A daily schedule needs at least one dose time.'],
    [{ kind: 'daily', timesMinutes: [1500] }, 'Invalid dose time.'],
    [{ kind: 'interval', everyDays: 0, timeMinutes: 480 }, 'Interval days must be between 1 and 90.'],
    [{ kind: 'weekly', weekdays: [], timeMinutes: 480 }, 'A weekly schedule needs at least one weekday.'],
    [{ kind: 'weekly', weekdays: [9], timeMinutes: 480 }, 'Invalid weekday.'],
  ])('422s on %j', (input, message) => {
    expect(validateSchedule(input)).toEqual({ ok: false, message });
  });
});