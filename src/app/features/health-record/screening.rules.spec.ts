import { describe, it, expect } from 'vitest';
import {
  ageAt,
  ruleApplies,
  evaluateScreenings,
  SCREENING_RULES,
  ScreeningProfile,
  ScreeningRecord,
} from './screening.rules';

// Stable "now": 2026-09-02T12:00:00Z.
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);

const female58: ScreeningProfile = { dateOfBirth: '1968-03-14', sex: 'female' };
const male58: ScreeningProfile = { dateOfBirth: '1968-03-14', sex: 'male' };

describe('ageAt (subtask 14 boundary tests)', () => {
  it('computes whole years', () => {
    expect(ageAt('1968-03-14', NOW)).toBe(58);
  });

  it('handles the birthday boundary exactly', () => {
    // 50th birthday is today (2026-09-02, fake DOB 1976-09-02).
    expect(ageAt('1976-09-02', NOW)).toBe(50);
    // Birthday tomorrow → still 49.
    expect(ageAt('1976-09-03', NOW)).toBe(49);
  });

  it('returns null for unknown or malformed DOB', () => {
    expect(ageAt('', NOW)).toBeNull();
    expect(ageAt('not-a-date', NOW)).toBeNull();
  });
});

describe('ruleApplies (age × gender × interval matrix, subtask 15)', () => {
  const mammography = SCREENING_RULES.find((r) => r.type === 'mammography')!;
  const cardio = SCREENING_RULES.find((r) => r.type === 'cardioCheck')!;

  it('applies mammography to women 50–74 only', () => {
    expect(ruleApplies(mammography, female58, NOW)).toBe(true);
    expect(ruleApplies(mammography, male58, NOW)).toBe(false);
    expect(ruleApplies(mammography, { dateOfBirth: '1977-01-01', sex: 'female' }, NOW)).toBe(false);
    // Boundary: 74 applies, 75 does not.
    expect(ruleApplies(mammography, { dateOfBirth: '1952-01-01', sex: 'female' }, NOW)).toBe(true);
    expect(ruleApplies(mammography, { dateOfBirth: '1951-01-01', sex: 'female' }, NOW)).toBe(false);
  });

  it('applies the cardio check to all sexes from 40', () => {
    expect(ruleApplies(cardio, female58, NOW)).toBe(true);
    expect(ruleApplies(cardio, male58, NOW)).toBe(true);
    expect(ruleApplies(cardio, { dateOfBirth: '1990-01-01', sex: 'male' }, NOW)).toBe(false);
  });

  it('does not apply gender-specific rules when sex is unknown', () => {
    expect(ruleApplies(mammography, { dateOfBirth: '1968-03-14', sex: '' }, NOW)).toBe(false);
    expect(ruleApplies(cardio, { dateOfBirth: '1968-03-14', sex: '' }, NOW)).toBe(true);
  });
});

describe('evaluateScreenings (subtask 2 engine)', () => {
  it('marks no records → everything due, overdue first', () => {
    const results = evaluateScreenings(female58, [], NOW);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.state === 'due')).toBe(true);
    expect(results.every((r) => r.overdue)).toBe(true);
    // All rules that apply to a 58-year-old woman.
    expect(results.map((r) => r.rule.type)).toContain('mammography');
    expect(results.map((r) => r.rule.type)).toContain('cardioCheck');
    expect(results.map((r) => r.rule.type)).toContain('cervicalSmear');
    // Not applicable to a 58-year-old woman.
    expect(results.map((r) => r.rule.type)).not.toContain('fluVaccine');
  });

  it('a recent completion moves the rule to not_due until the interval passes', () => {
    const done = (monthsAgo: number): ScreeningRecord => ({
      type: 'cardioCheck',
      status: 'done',
      atMs: NOW - monthsAgo * 30.44 * 24 * 60 * 60 * 1000,
    });
    const recent = evaluateScreenings(female58, [done(6)], NOW);
    expect(recent.find((r) => r.rule.type === 'cardioCheck')!.state).toBe('not_due');
    const stale = evaluateScreenings(female58, [done(13)], NOW);
    expect(stale.find((r) => r.rule.type === 'cardioCheck')!.state).toBe('due');
  });

  it('a waiver never surfaces as due again', () => {
    const waived: ScreeningRecord = {
      type: 'mammography',
      status: 'waived',
      atMs: NOW - 5 * 365 * 24 * 60 * 60 * 1000,
      reason: 'Patient declined',
    };
    const results = evaluateScreenings(female58, [waived], NOW);
    expect(results.find((r) => r.rule.type === 'mammography')!.state).toBe('not_due');
  });

  it('an active snooze keeps the rule out of the due list', () => {
    const snoozed: ScreeningRecord = {
      type: 'cardioCheck',
      status: 'done',
      atMs: NOW - 24 * 30.44 * 24 * 60 * 60 * 1000,
      snoozeUntilMs: NOW + 10 * 24 * 60 * 60 * 1000,
    };
    const results = evaluateScreenings(female58, [snoozed], NOW);
    expect(results.find((r) => r.rule.type === 'cardioCheck')!.state).toBe('not_due');
  });

  it('an expired snooze returns the rule to due', () => {
    const snoozed: ScreeningRecord = {
      type: 'cardioCheck',
      status: 'done',
      atMs: NOW - 24 * 30.44 * 24 * 60 * 60 * 1000,
      snoozeUntilMs: NOW - 1000,
    };
    const results = evaluateScreenings(female58, [snoozed], NOW);
    expect(results.find((r) => r.rule.type === 'cardioCheck')!.state).toBe('due');
  });

  it('unknown DOB → no rules apply', () => {
    expect(evaluateScreenings({ dateOfBirth: '', sex: 'female' }, [], NOW)).toEqual([]);
  });
});
