import { describe, expect, it } from 'vitest';
import {
  MEDICINE_CATALOG,
  applyCatalog,
  findMedicineInfo,
  instructionsForMed,
  normalizeDrugName,
} from './medicine.catalog';
import { emptyInstructions } from './medicine.info';
import type { Medication } from './medications.logic';

/**
 * Catalog tests: diacritic/case-insensitive lookup by generic, Greek and brand
 * aliases, the miss case, and the `instructionsForMed` fallback rule (saved
 * sheet wins; catalog suggests only when the sheet is empty).
 */

describe('normalizeDrugName', () => {
  it('strips case, diacritics and punctuation', () => {
    expect(normalizeDrugName('Παρακεταμόλη')).toBe('παρακεταμολη');
    expect(normalizeDrugName('  Atorva-statin 20mg ')).toBe('atorvastatin20mg');
  });
});

describe('findMedicineInfo', () => {
  it('matches the generic name, Greek name and brand aliases', () => {
    expect(findMedicineInfo('Paracetamol')?.name).toBe('Paracetamol');
    expect(findMedicineInfo('παρακεταμόλη')?.name).toBe('Paracetamol');
    expect(findMedicineInfo('Depon')?.name).toBe('Paracetamol');
    expect(findMedicineInfo('Glucophage')?.name).toBe('Metformin');
    expect(findMedicineInfo('Sintrom')?.name).toBe('Warfarin');
  });

  it('matches on a diacritic-free Greek name', () => {
    expect(findMedicineInfo('ιβουπροφαινη')?.name).toBe('Ibuprofen');
  });

  it('returns null for unknown or too-short names', () => {
    expect(findMedicineInfo('XyzzyUnknownDrug')).toBeNull();
    expect(findMedicineInfo('ab')).toBeNull();
  });

  it('covers the documented catalog size', () => {
    expect(MEDICINE_CATALOG.length).toBeGreaterThanOrEqual(12);
  });
});

describe('applyCatalog', () => {
  it('returns a normalized suggestion with warnings', () => {
    const suggestion = applyCatalog('Atorvastatin');
    expect(suggestion?.route).toBe('oral');
    expect(suggestion?.maxDailyDoses).toBe(1);
    expect(suggestion?.warnings.length).toBeGreaterThan(0);
  });

  it('returns null for an unknown drug', () => {
    expect(applyCatalog('Nonexistentium')).toBeNull();
  });
});

describe('instructionsForMed', () => {
  const med = (over: Partial<Medication>): Medication => ({
    id: 'm1',
    name: 'Atorvastatin',
    dose: '20mg',
    schedule: { kind: 'daily', timesMinutes: [480] },
    critical: false,
    createdAtMs: 1,
    ...over,
  });

  it('prefers the saved sheet when it carries information', () => {
    const saved = { ...emptyInstructions(), foodRelation: 'after' as const };
    expect(instructionsForMed(med({ instructions: saved }))?.foodRelation).toBe('after');
  });

  it('falls back to the catalog when the sheet is empty', () => {
    expect(instructionsForMed(med({ instructions: emptyInstructions() }))?.maxDailyDoses).toBe(1);
    expect(instructionsForMed(med({}))?.warnings.length).toBeGreaterThan(0);
  });

  it('returns null when neither the sheet nor the catalog has anything', () => {
    expect(instructionsForMed(med({ name: 'Mystery pill' }))).toBeNull();
  });
});
