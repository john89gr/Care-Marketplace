import { describe, expect, it } from 'vitest';
import {
  emptyInstructions,
  hasInstructions,
  instructionsSummary,
  normalizeInstructions,
  warningsText,
} from './medicine.info';

/**
 * Pure-helper tests for the medicine instructions manager: total
 * normalization, "has any information" detection and the one-line summary.
 */

describe('normalizeInstructions', () => {
  it('falls back to the defaults for non-objects', () => {
    expect(normalizeInstructions(null)).toEqual(emptyInstructions());
    expect(normalizeInstructions(undefined)).toEqual(emptyInstructions());
    expect(normalizeInstructions('nope')).toEqual(emptyInstructions());
  });

  it('keeps valid fields and clamps numeric/text values', () => {
    const result = normalizeInstructions({
      doseForm: '  Δισκίο  ',
      route: 'inhalation',
      foodRelation: 'after',
      maxDailyDoses: 4.6,
      warnings: ['  Μην πίνετε αλκοόλ. ', ''],
      sideEffects: 'x'.repeat(500),
      storage: 'Ψυγείο',
      specialInstructions: 'Πρωί',
    });
    expect(result.doseForm).toBe('Δισκίο');
    expect(result.route).toBe('inhalation');
    expect(result.foodRelation).toBe('after');
    expect(result.maxDailyDoses).toBe(5);
    expect(result.warnings).toEqual(['Μην πίνετε αλκοόλ.']);
    expect(result.sideEffects?.length).toBe(400);
  });

  it('rejects unknown enums and non-positive max doses', () => {
    const result = normalizeInstructions({ route: 'witchcraft', foodRelation: 'sometime', maxDailyDoses: -2 });
    expect(result.route).toBe('oral');
    expect(result.foodRelation).toBe('any');
    expect(result.maxDailyDoses).toBeNull();
  });
});

describe('hasInstructions', () => {
  it('is false for missing, null or default-only sheets', () => {
    expect(hasInstructions(undefined)).toBe(false);
    expect(hasInstructions(emptyInstructions())).toBe(false);
  });

  it('is true once any meaningful field is set', () => {
    expect(hasInstructions({ ...emptyInstructions(), foodRelation: 'with' })).toBe(true);
    expect(hasInstructions({ ...emptyInstructions(), warnings: ['x'] })).toBe(true);
    expect(hasInstructions({ ...emptyInstructions(), route: 'injection' })).toBe(true);
    expect(hasInstructions({ ...emptyInstructions(), maxDailyDoses: 3 })).toBe(true);
  });
});

describe('instructionsSummary', () => {
  it('joins the route, food relation, max doses and warning count', () => {
    const summary = instructionsSummary({
      doseForm: 'Δισκίο',
      route: 'injection',
      foodRelation: 'with',
      maxDailyDoses: 3,
      warnings: ['a', 'b'],
    });
    expect(summary).toContain('Ένεση');
    expect(summary).toContain('Με το φαγητό');
    expect(summary).toContain('έως 3/ημέρα');
    expect(summary).toContain('2 προειδοποιήσεις');
  });

  it('omits the default route/food relation and returns empty for a blank sheet', () => {
    expect(instructionsSummary(emptyInstructions())).toBe('');
    expect(instructionsSummary({ ...emptyInstructions(), route: 'oral' })).toBe('');
  });

  it('renders English when asked', () => {
    const summary = instructionsSummary(
      { ...emptyInstructions(), route: 'inhalation', maxDailyDoses: 4 },
      'en'
    );
    expect(summary).toContain('Inhalation');
    expect(summary).toContain('up to 4/day');
  });
});

describe('warningsText', () => {
  it('joins warnings into one line', () => {
    expect(warningsText({ ...emptyInstructions(), warnings: ['a', 'b'] })).toBe('a; b');
  });
});
