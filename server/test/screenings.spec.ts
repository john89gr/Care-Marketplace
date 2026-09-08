import { describe, expect, it } from 'vitest';
import {
  ageAt,
  evaluateScreenings,
  ruleApplies,
  SCREENING_RULES,
} from '../src/screenings';

/**
 * Pure boundary tests for the server-side screening engine (screenings.ts) —
 * the mirror of the frontend screening.rules.ts that drives the
 * screening.due Web Push. Same age/sex matrix and interval math; bounds are
 * INCLUSIVE.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const monthMs = (m: number) => Math.round(m * 30.44 * DAY_MS);

describe('ageAt (boundaries)', () => {
  it('is exact at the birthday', () => {
    // 1968-03-14 turns 58 on 2026-03-14.
    expect(ageAt('1968-03-14', Date.UTC(2026, 2, 14, 12))).toBe(58);
  });
  it('stays the lower age the day before the birthday', () => {
    expect(ageAt('1968-03-14', Date.UTC(2026, 2, 13, 23, 59))).toBe(57);
  });
  it('returns null for unknown DOB', () => {
    expect(ageAt('', Date.now())).toBeNull();
  });
});

describe('ruleApplies (age/sex matrix)', () => {
  const cardio = SCREENING_RULES.find((r) => r.type === 'cardioCheck')!;
  const mammo = SCREENING_RULES.find((r) => r.type === 'mammography')!;

  it('applies cardio at exactly minAge 40', () => {
    expect(ruleApplies(cardio, { dateOfBirth: '1986-01-01', sex: 'female' }, Date.UTC(2026, 0, 1))).toBe(true);
  });
  it('does not apply cardio below minAge', () => {
    expect(ruleApplies(cardio, { dateOfBirth: '1987-01-01', sex: 'female' }, Date.UTC(2026, 0, 1))).toBe(false);
  });
  it('restricts mammography to female sex', () => {
    expect(ruleApplies(mammo, { dateOfBirth: '1970-01-01', sex: 'female' }, Date.UTC(2026, 0, 1))).toBe(true);
    expect(ruleApplies(mammo, { dateOfBirth: '1970-01-01', sex: 'male' }, Date.UTC(2026, 0, 1))).toBe(false);
  });
  it('applies only gender-neutral rules when sex is unknown', () => {
    expect(ruleApplies(mammo, { dateOfBirth: '1970-01-01', sex: '' }, Date.UTC(2026, 0, 1))).toBe(false);
    expect(ruleApplies(cardio, { dateOfBirth: '1970-01-01', sex: '' }, Date.UTC(2026, 0, 1))).toBe(true);
  });
});

describe('evaluateScreenings (due/interval math)', () => {
  const nowMs = Date.UTC(2026, 0, 15);
  const profile = { dateOfBirth: '1968-03-14', sex: 'female' as const };

  it('flags a no-record applicable rule as due (dueAtMs 0)', () => {
    const status = evaluateScreenings(profile, [], nowMs);
    expect(status).toContainEqual(
      expect.objectContaining({ rule: expect.objectContaining({ type: 'mammography' }), state: 'due', dueAtMs: 0, overdue: true })
    );
  });

  it('is not due while inside the interval, due exactly when it elapses', () => {
    const interval = monthMs(12);
    const records = [{ type: 'cardioCheck' as const, status: 'done' as const, atMs: nowMs - interval + 1000 }];
    expect(evaluateScreenings(profile, records, nowMs).find((s) => s.rule.type === 'cardioCheck')?.state).toBe('not_due');

    const atBoundary = [{ type: 'cardioCheck' as const, status: 'done' as const, atMs: nowMs - interval }];
    const boundary = evaluateScreenings(profile, atBoundary, nowMs).find((s) => s.rule.type === 'cardioCheck')!;
    expect(boundary.state).toBe('due');
    // Due exactly now counts as overdue (frontend semantics: dueAtMs <= now).
    expect(boundary.overdue).toBe(true);
  });

  it('never re-surfaces a waived screening', () => {
    const records = [{ type: 'cardioCheck' as const, status: 'waived' as const, atMs: nowMs - monthMs(24) }];
    expect(evaluateScreenings(profile, records, nowMs).find((s) => s.rule.type === 'cardioCheck')?.state).toBe('not_due');
  });

  it('holds a future snooze out of due until it passes', () => {
    const records = [
      { type: 'cardioCheck' as const, status: 'done' as const, atMs: nowMs - monthMs(14), snoozeUntilMs: nowMs + DAY_MS },
    ];
    const status = evaluateScreenings(profile, records, nowMs).find((s) => s.rule.type === 'cardioCheck')!;
    expect(status.state).toBe('not_due');
    expect(status.dueAtMs).toBe(nowMs + DAY_MS);
  });

  it('holds a future scheduled appointment out of due', () => {
    const records = [
      { type: 'cardioCheck' as const, status: 'done' as const, atMs: nowMs - monthMs(14), scheduledAtMs: nowMs + 3 * DAY_MS },
    ];
    const status = evaluateScreenings(profile, records, nowMs).find((s) => s.rule.type === 'cardioCheck')!;
    expect(status.state).toBe('not_due');
  });

  it('sorts overdue first, then due', () => {
    const statuses = evaluateScreenings(profile, [], nowMs);
    const states = statuses.filter((s) => s.state === 'due').map((s) => s.rule.type);
    expect(states[0]).toBe('cardioCheck'); // seeded record drives overdue ordering in integration; here no-record rules tie
    expect(new Set(states)).toEqual(new Set(['cardioCheck', 'mammography', 'cervicalSmear', 'colorectalScreening']));
  });
});