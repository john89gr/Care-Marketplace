import { describe, expect, it } from 'vitest';
import {
  CONSENT_PURPOSES,
  consentGranted,
  consentStateFromRow,
  historyAccessFor,
  validateConsentsPut,
  ConsentRecord,
} from '../src/consents';

/**
 * Pure tests for the server-side consent ledger (FEATURE_PLAN.md §16 subtask
 * 6 + §21 subtask 16): grant lookup, the family-read access decision, PUT
 * validation 422 paths and the row mapper. No DB required.
 */

const FAMILY_SHARING: ConsentRecord = {
  purpose: 'family_sharing',
  granted: true,
  documentVersion: 'v1.0',
  updatedAtMs: 1_000,
  updatedBy: 'u-client',
};

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return { ...FAMILY_SHARING, ...overrides };
}

describe('consentGranted', () => {
  it('is true only for an active grant of the purpose', () => {
    expect(consentGranted([consent()], 'family_sharing')).toBe(true);
    expect(consentGranted([consent({ granted: false })], 'family_sharing')).toBe(false);
    expect(consentGranted([], 'family_sharing')).toBe(false);
    expect(consentGranted([consent()], 'data_export')).toBe(false);
  });
});

describe('historyAccessFor (§21 subtask 16 gate)', () => {
  it('always lets the owner read their own record, consent or not', () => {
    expect(historyAccessFor('u-client', 'u-client', [])).toBe('owner');
    expect(historyAccessFor('u-client', 'u-client', [consent({ granted: false })])).toBe('owner');
  });

  it('grants family read only with the target’s family_sharing consent', () => {
    expect(historyAccessFor('u-nurse', 'u-client', [consent()])).toBe('family');
  });

  it('denies non-owners without (or with withdrawn) consent', () => {
    expect(historyAccessFor('u-nurse', 'u-client', [])).toBe('denied');
    expect(historyAccessFor('u-nurse', 'u-client', [consent({ granted: false })])).toBe('denied');
    // A different granted purpose does not unlock history reads.
    expect(
      historyAccessFor('u-nurse', 'u-client', [consent({ purpose: 'data_export' })])
    ).toBe('denied');
  });
});

describe('validateConsentsPut', () => {
  it('accepts a valid full state and normalizes defaults', () => {
    const result = validateConsentsPut({
      userId: 'u-client',
      consents: [
        { purpose: 'family_sharing', granted: true, documentVersion: 'v1.0', updatedAtMs: 1_000, updatedBy: 'u-client' },
        { purpose: 'bluetooth', granted: false },
      ],
      currentDocumentVersion: 'v1.0',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.consents).toHaveLength(2);
      expect(result.state.consents[1]).toMatchObject({ purpose: 'bluetooth', granted: false });
      expect(result.state.currentDocumentVersion).toBe('v1.0');
    }
  });

  it('422s on unknown purposes', () => {
    expect(
      validateConsentsPut({ consents: [{ purpose: 'telepathy', granted: true }] })
    ).toEqual({ ok: false, message: 'Unknown consent purpose: telepathy.' });
  });

  it('422s on a non-boolean grant flag and a missing array', () => {
    expect(validateConsentsPut({ consents: [{ purpose: 'family_sharing', granted: 'yes' }] })).toEqual({
      ok: false,
      message: 'granted must be a boolean.',
    });
    expect(validateConsentsPut({})).toEqual({ ok: false, message: 'consents must be an array.' });
  });

  it('recognises every registered purpose', () => {
    for (const purpose of CONSENT_PURPOSES) {
      const result = validateConsentsPut({ consents: [{ purpose, granted: false }] });
      expect(result.ok).toBe(true);
    }
  });
});

describe('consentStateFromRow', () => {
  it('returns defaults for an absent row', () => {
    const state = consentStateFromRow(null, 'u-client');
    expect(state).toEqual({ userId: 'u-client', consents: [], currentDocumentVersion: 'v1.0' });
  });

  it('maps a JSONB row to the camelCase contract', () => {
    const state = consentStateFromRow(
      {
        user_id: 'u-client',
        consents: [consent()],
        current_document_version: 'v1.0',
        updated_at_ms: 1_000,
      },
      'u-client'
    );
    expect(state.consents[0]).toEqual(FAMILY_SHARING);
    expect(consentGranted(state.consents, 'family_sharing')).toBe(true);
  });
});