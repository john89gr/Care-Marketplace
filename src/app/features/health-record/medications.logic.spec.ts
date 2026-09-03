import { describe, it, expect } from 'vitest';
import {
  Medication,
  AdherenceLog,
  scheduledTimesFor,
  doseSlotsFor,
  adherenceFor,
  consecutiveMisses,
  daysSupplyRemaining,
  needsRefill,
  dateKey,
  GRACE_MINUTES,
} from './medications.logic';

// Stable local "now": 2026-09-02 12:00 local time.
const NOW = new Date(2026, 8, 2, 12, 0).getTime();

function dailyMed(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'Insulin',
    dose: '10 units',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    critical: true,
    createdAtMs: NOW - 30 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function log(overrides: Partial<AdherenceLog> = {}): AdherenceLog {
  return {
    id: 'ml-1',
    medicationId: 'med-1',
    date: '2026-09-02',
    timeMinutes: 8 * 60,
    action: 'taken',
    atMs: NOW,
    loggedBy: 'me',
    ...overrides,
  };
}

describe('schedule expansion (subtask 15)', () => {
  it('expands daily schedules sorted', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [20 * 60, 8 * 60] } });
    expect(scheduledTimesFor(med, '2026-09-02')).toEqual([480, 1200]);
  });

  it('expands interval schedules from the creation anchor', () => {
    const med = dailyMed({ schedule: { kind: 'interval', everyDays: 3, timeMinutes: 9 * 60 } });
    // Creation day (Aug 3) + multiples of 3 → Sep 2 is day 30 → due.
    expect(scheduledTimesFor(med, '2026-09-02')).toEqual([540]);
    // Sep 1 is day 29 → not due.
    expect(scheduledTimesFor(med, '2026-09-01')).toEqual([]);
  });

  it('expands weekly schedules by weekday', () => {
    // 2026-09-02 is a Wednesday (3).
    const med = dailyMed({ schedule: { kind: 'weekly', weekdays: [3], timeMinutes: 10 * 60 } });
    expect(scheduledTimesFor(med, '2026-09-02')).toEqual([600]);
    expect(scheduledTimesFor(med, '2026-09-03')).toEqual([]);
  });

  it('returns nothing for malformed dates', () => {
    expect(scheduledTimesFor(dailyMed(), 'garbage')).toEqual([]);
  });
});

describe('dose slots + missed detection (subtask 8 boundary)', () => {
  it('pending before the scheduled time', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [20 * 60] } }); // 20:00 today
    const slots = doseSlotsFor(med, '2026-09-02', [], NOW); // now 12:00
    expect(slots[0].state).toBe('pending');
  });

  it('pending within the grace window after the scheduled time', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [11 * 60] } }); // 11:00
    const justAfter = new Date(2026, 8, 2, 11, 30).getTime();
    const slots = doseSlotsFor(med, '2026-09-02', [], justAfter);
    expect(slots[0].state).toBe('pending');
  });

  it('missed exactly when scheduled + grace passes', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [11 * 60] } }); // 11:00
    const atGrace = new Date(2026, 8, 2, 11, GRACE_MINUTES).getTime();
    const justAfter = atGrace + 60_000;
    expect(doseSlotsFor(med, '2026-09-02', [], atGrace)[0].state).toBe('pending');
    expect(doseSlotsFor(med, '2026-09-02', [], justAfter)[0].state).toBe('missed');
  });

  it('taken/skipped come from the logs', () => {
    const med = dailyMed();
    const slots = doseSlotsFor(med, '2026-09-02', [
      log({ timeMinutes: 480, action: 'taken' }),
      log({ timeMinutes: 1200, action: 'skipped' }),
    ], NOW);
    expect(slots.map((s) => s.state)).toEqual(['taken', 'skipped']);
  });
});

describe('adherence (subtask 5)', () => {
  it('counts taken of scheduled over the window', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [8 * 60] } });
    const logs = [
      log({ id: 'a', date: '2026-09-02', timeMinutes: 480, action: 'taken' }),
      log({ id: 'b', date: '2026-09-01', timeMinutes: 480, action: 'taken' }),
      // Aug 31 missed (no log).
    ];
    const stats = adherenceFor(med, logs, NOW, 3);
    expect(stats.scheduled).toBe(3);
    expect(stats.taken).toBe(2);
    expect(stats.rate).toBeCloseTo(0.67, 2);
  });

  it('returns null rate when nothing is scheduled', () => {
    // Monday-only med created today: the past 6 days had no schedule, and
    // today (Wednesday) has none either → nothing scheduled in the window.
    const med = dailyMed({ schedule: { kind: 'weekly', weekdays: [1], timeMinutes: 480 }, createdAtMs: NOW });
    const stats = adherenceFor(med, [], NOW, 7);
    expect(stats.rate).toBeNull();
  });
});

describe('consecutive misses (subtask 10)', () => {
  it('counts the current streak of missed slots', () => {
    // Med created today: only today's slot can be scheduled.
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [8 * 60] }, createdAtMs: NOW });
    const logs = [log({ id: 'a', date: '2026-09-02', timeMinutes: 480, action: 'taken' })];
    // Today taken → streak 0.
    expect(consecutiveMisses(med, logs, NOW)).toBe(0);
    // Remove the log → today's slot is missed (8:00 + grace < 12:00) → 1.
    expect(consecutiveMisses(med, [], NOW)).toBe(1);
  });

  it('a taken slot breaks the streak', () => {
    const med = dailyMed({ schedule: { kind: 'daily', timesMinutes: [8 * 60] } });
    const logs = [log({ id: 'b', date: '2026-09-01', timeMinutes: 480, action: 'taken' })];
    // Yesterday taken; today missed → streak = 1.
    expect(consecutiveMisses(med, logs, NOW)).toBe(1);
  });
});

describe('refill tracking (subtask 14)', () => {
  it('computes days remaining and flags low supply', () => {
    const soon = dailyMed({ refillDueDate: '2026-09-05', supplyDays: 30 });
    expect(daysSupplyRemaining(soon, NOW)).toBe(3);
    expect(needsRefill(soon, NOW)).toBe(true);

    const later = dailyMed({ refillDueDate: '2026-09-20', supplyDays: 30 });
    expect(daysSupplyRemaining(later, NOW)).toBe(18);
    expect(needsRefill(later, NOW)).toBe(false);

    const none = dailyMed();
    expect(daysSupplyRemaining(none, NOW)).toBeNull();
    expect(needsRefill(none, NOW)).toBe(false);
  });

  it('dateKey formats local dates consistently', () => {
    expect(dateKey(new Date(2026, 8, 2).getTime())).toBe('2026-09-02');
  });
});
