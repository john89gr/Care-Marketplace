import { describe, expect, it } from 'vitest';
import {
  ContactDraft,
  MedicalContact,
  contactSummary,
  contactsOfKind,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  primaryEmergency,
  sortContacts,
  telHref,
  validateContactDraft,
  withSinglePrimary,
} from './contacts.models';

/**
 * Pure-helper tests for the contact phone manager: phone normalization,
 * ordering (primary → priority → name), single-primary enforcement,
 * emergency selection and draft validation.
 */

const contact = (over: Partial<MedicalContact>): MedicalContact => ({
  id: 'c',
  kind: 'emergency',
  name: 'Α',
  relationship: '',
  phone: '6970000000',
  isPrimary: false,
  priority: 0,
  createdAtMs: 1,
  ...over,
});

describe('normalizePhone / isValidPhone / telHref', () => {
  it('strips formatting and keeps a single leading +', () => {
    expect(normalizePhone('  +30 210-000 0000 ')).toBe('+302100000000');
    expect(normalizePhone('(210) 000.0000')).toBe('2100000000');
  });

  it('rejects numbers with fewer than 6 digits', () => {
    expect(normalizePhone('12345')).toBe('');
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('6970000000')).toBe(true);
  });

  it('builds a tel: href only for valid numbers', () => {
    expect(telHref('697 000 0000')).toBe('tel:6970000000');
    expect(telHref('12')).toBe('');
  });
});

describe('isValidEmail', () => {
  it('allows empty (not provided) and rejects malformed values', () => {
    expect(isValidEmail('')).toBe(true);
    expect(isValidEmail('a@b.gr')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
  });
});

describe('sortContacts', () => {
  const list = [
    contact({ id: 'low', name: 'Βήτα', priority: 0 }),
    contact({ id: 'high', name: 'Άλφα', priority: 5 }),
    contact({ id: 'primary', name: 'Ζήτα', priority: 0, isPrimary: true }),
    contact({ id: 'archived', name: 'Ω', archived: true, isPrimary: true }),
  ];

  it('puts the primary first, then priority, then name, dropping archived', () => {
    expect(sortContacts(list).map((c) => c.id)).toEqual(['primary', 'high', 'low']);
  });

  it('never mutates the input', () => {
    const before = list.map((c) => c.id);
    sortContacts(list);
    expect(list.map((c) => c.id)).toEqual(before);
  });
});

describe('contactsOfKind / primaryEmergency', () => {
  const list = [
    contact({ id: 'care', kind: 'care', isPrimary: true }),
    contact({ id: 'ice-hi', priority: 5 }),
    contact({ id: 'ice-primary', isPrimary: true }),
  ];

  it('filters by kind', () => {
    expect(contactsOfKind(list, 'care').map((c) => c.id)).toEqual(['care']);
  });

  it('prefers the flagged primary, else the highest priority', () => {
    expect(primaryEmergency(list)?.id).toBe('ice-primary');
    expect(primaryEmergency([contact({ id: 'x' })])?.id).toBe('x');
    expect(primaryEmergency([])).toBeNull();
  });
});

describe('withSinglePrimary', () => {
  it('marks the chosen contact primary and demotes siblings of the same kind', () => {
    const list = [
      contact({ id: 'a', isPrimary: true }),
      contact({ id: 'b' }),
      contact({ id: 'care', kind: 'care', isPrimary: true }),
    ];
    const next = withSinglePrimary(list, 'emergency', 'b');
    expect(next.find((c) => c.id === 'a')?.isPrimary).toBe(false);
    expect(next.find((c) => c.id === 'b')?.isPrimary).toBe(true);
    // Other kinds are untouched.
    expect(next.find((c) => c.id === 'care')?.isPrimary).toBe(true);
  });
});

describe('validateContactDraft', () => {
  const base: ContactDraft = {
    kind: 'emergency',
    name: 'Γιώργος',
    relationship: 'Σύζυγος',
    phone: '6970000001',
    isPrimary: true,
    priority: 0,
  };

  it('accepts a valid draft', () => {
    expect(validateContactDraft(base)).toBeNull();
  });

  it('rejects unknown kinds, missing names, bad phones and bad emails', () => {
    expect(validateContactDraft({ ...base, kind: 'nope' as never })).toBe('unknown_kind');
    expect(validateContactDraft({ ...base, name: '   ' })).toBe('name_required');
    expect(validateContactDraft({ ...base, phone: '123' })).toBe('phone_invalid');
    expect(validateContactDraft({ ...base, email: 'bad' })).toBe('email_invalid');
  });
});

describe('contactSummary', () => {
  it('appends the role when present', () => {
    expect(contactSummary(contact({ name: 'Δρ. Χ', relationship: 'doctor' }))).toBe(
      'Δρ. Χ — doctor'
    );
    expect(contactSummary(contact({ name: 'Μόνο όνομα', relationship: '' }))).toBe('Μόνο όνομα');
  });
});
