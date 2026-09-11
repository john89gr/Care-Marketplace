import { describe, expect, it } from 'vitest';
import { contactFromRow, validateContactDraft, validateContactPatch } from '../src/contacts';

/**
 * Pure validation + row-mapper tests for the contact phone manager: required
 * fields, kind enum 422 path, phone/email validation, partial PATCH
 * whitelisting and the snake_case → camelCase row contract.
 */

const valid = {
  kind: 'emergency',
  name: 'Γιώργος Παπαδόπουλος',
  relationship: 'Σύζυγος',
  phone: '6970000001',
  isPrimary: true,
  priority: 10,
};

describe('validateContactDraft', () => {
  it('accepts a valid draft and normalizes optional fields', () => {
    const result = validateContactDraft(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft).toMatchObject({
        kind: 'emergency',
        name: 'Γιώργος Παπαδόπουλος',
        phone: '6970000001',
        isPrimary: true,
        priority: 10,
        altPhone: '',
        email: '',
      });
    }
  });

  it('rejects an unknown kind', () => {
    expect(validateContactDraft({ ...valid, kind: 'friend' })).toEqual({
      ok: false,
      message: 'Invalid contact kind: friend.',
    });
  });

  it('requires a name', () => {
    expect(validateContactDraft({ ...valid, name: '   ' })).toEqual({
      ok: false,
      message: 'Name is required for a contact.',
    });
  });

  it('requires at least 6 phone digits', () => {
    expect(validateContactDraft({ ...valid, phone: '12345' })).toEqual({
      ok: false,
      message: 'A phone number with at least 6 digits is required.',
    });
  });

  it('rejects a malformed email but allows an empty one', () => {
    expect(validateContactDraft({ ...valid, email: 'nope' })).toEqual({
      ok: false,
      message: 'Invalid email.',
    });
    expect(validateContactDraft({ ...valid, email: '' }).ok).toBe(true);
  });

  it('clamps a negative priority to zero', () => {
    const result = validateContactDraft({ ...valid, priority: -4 });
    expect(result.ok && result.draft.priority).toBe(0);
  });
});

describe('validateContactPatch', () => {
  it('whitelists only supplied fields', () => {
    const result = validateContactPatch({ phone: '2100000000', unknown: 'x' });
    expect(result).toEqual({ ok: true, patch: { phone: '2100000000' } });
  });

  it('maps isPrimary/archived to snake_case columns', () => {
    const result = validateContactPatch({ isPrimary: true, archived: true });
    expect(result).toEqual({ ok: true, patch: { is_primary: true, archived: true } });
  });

  it('422s on a short phone or malformed email', () => {
    expect(validateContactPatch({ phone: '12' })).toEqual({
      ok: false,
      message: 'A phone number with at least 6 digits is required.',
    });
    expect(validateContactPatch({ email: 'bad' })).toEqual({
      ok: false,
      message: 'Invalid email.',
    });
  });
});

describe('contactFromRow', () => {
  it('coerces pg BIGINT/boolean columns to the camelCase API shape', () => {
    expect(
      contactFromRow({
        id: 'contact-1',
        kind: 'care',
        name: 'Δρ. Χ',
        relationship: 'doctor',
        phone: '2100000000',
        alt_phone: '',
        email: '',
        address: '',
        notes: '',
        is_primary: 'true',
        priority: '5',
        archived: 'false',
        created_at_ms: '1700000000000',
      })
    ).toEqual({
      id: 'contact-1',
      kind: 'care',
      name: 'Δρ. Χ',
      relationship: 'doctor',
      phone: '2100000000',
      altPhone: '',
      email: '',
      address: '',
      notes: '',
      isPrimary: true,
      priority: 5,
      archived: false,
      createdAtMs: 1700000000000,
    });
  });
});
