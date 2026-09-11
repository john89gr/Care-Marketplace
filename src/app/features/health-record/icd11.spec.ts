import { describe, expect, it } from 'vitest';
import {
  ICD11_CATALOG,
  ICD11_CODE_PATTERN,
  icd11ByCode,
  icd11Label,
  isIcd11Code,
  searchIcd11,
} from './icd11';
import { safetyAllergies } from './history.models';

/**
 * ICD-11 Greek catalog tests (FEATURE_PLAN.md §21 extension): the curated
 * subset must be internally consistent (unique codes, Greek labels present),
 * code validation must accept real MMS shapes, and search must work across
 * code / Greek / English.
 */

describe('ICD11_CATALOG sanity', () => {
  it('has unique codes and non-empty Greek labels', () => {
    const codes = new Set<string>();
    for (const entry of ICD11_CATALOG) {
      expect(entry.code).toMatch(ICD11_CODE_PATTERN);
      expect(entry.labelEl.trim().length).toBeGreaterThan(0);
      expect(entry.labelEn.trim().length).toBeGreaterThan(0);
      expect(codes.has(entry.code)).toBe(false);
      codes.add(entry.code);
    }
  });

  it('includes the verified core cardiovascular codes', () => {
    expect(icd11ByCode('BA00')?.labelEl).toBe('Ιδιοπαθής υπέρταση');
    expect(icd11ByCode('BD10')?.labelEl).toBe('Συμφορητική καρδιακή ανεπάρκεια');
    expect(icd11ByCode('BC81')?.labelEn).toBe('Atrial fibrillation');
  });

  it('resolves codes case-insensitively', () => {
    expect(icd11ByCode('ca23')).toEqual(icd11ByCode('CA23'));
  });
});

describe('isIcd11Code / icd11ByCode', () => {
  it('accepts real ICD-11 MMS shapes (stem + postcoordinated)', () => {
    expect(isIcd11Code('5A10')).toBe(true);
    expect(isIcd11Code('BA00')).toBe(true);
    expect(isIcd11Code('CA23.01')).toBe(true);
    expect(isIcd11Code('GB61.Z')).toBe(true);
  });

  it('rejects non-ICD-11 shapes', () => {
    expect(isIcd11Code('E11')).toBe(false); // ICD-10 style
    expect(isIcd11Code('123')).toBe(false);
    expect(isIcd11Code('')).toBe(false);
    expect(isIcd11Code('BA00!')).toBe(false);
  });

  it('returns null for codes outside the curated subset', () => {
    expect(icd11ByCode('ZZ99')).toBeNull();
  });
});

describe('icd11Label / searchIcd11', () => {
  it('labels curated codes in Greek by default', () => {
    expect(icd11Label('BA00')).toContain('Ιδιοπαθής υπέρταση');
    expect(icd11Label('BA00')).toContain('BA00');
  });

  it('falls back to the raw code for free-form entries', () => {
    expect(icd11Label('ZZ99')).toBe('ZZ99');
  });

  it('searches across code, Greek and English', () => {
    expect(searchIcd11('5a11').some((e) => e.code === '5A11')).toBe(true);
    expect(searchIcd11('διαβήτης').some((e) => e.code === '5A11')).toBe(true);
    expect(searchIcd11('asthma').some((e) => e.code === 'CA23')).toBe(true);
  });
});

describe('safetyAllergies (dashboard banner source)', () => {
  it('flags drug or severe allergies regardless of other fields', () => {
    const allergies = [
      { id: 'a1', substance: 'Penicillin', kind: 'drug', severity: 'moderate', confirmedAtMs: 1, createdAtMs: 1 },
      { id: 'a2', substance: 'Peanuts', kind: 'food', severity: 'severe', confirmedAtMs: 1, createdAtMs: 1 },
      { id: 'a3', substance: 'Pollen', kind: 'environmental', severity: 'mild', confirmedAtMs: 1, createdAtMs: 1 },
      { id: 'a4', substance: 'Old', kind: 'drug', severity: 'severe', confirmedAtMs: 1, createdAtMs: 1, archived: true },
    ] as const;
    expect(safetyAllergies(allergies as never[]).map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});