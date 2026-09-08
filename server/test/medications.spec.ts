import { describe, expect, it } from 'vitest';
import { scheduledTimesFor, dueSlotMs, dateKey } from '../src/medications';

/**
 * Pure boundary tests for the schedule expansion + missed-dose grace logic
 * (medications.ts) — the server mirror of frontend medications.logic.ts that
 * drives the medication.missed push. Local-time based; bounds are strict:
 * a slot is due only after scheduled time + 60 min grace has fully passed.
 */

const CREATED = new Date(2026, 8, 1, 8, 0, 0).getTime(); // Sep 1 2026, 08:00 local

describe('scheduledTimesFor', () => {
  it('expands daily schedules, sorted ascending', () => {
    const schedule = { kind: 'daily', timesMinutes: [720, 480] } as const;
    expect(scheduledTimesFor(schedule, '2026-09-08', CREATED)).toEqual([480, 720]);
  });

  it('returns no doses before the medication existed', () => {
    const schedule = { kind: 'daily', timesMinutes: [480] } as const;
    expect(scheduledTimesFor(schedule, '2026-08-30', CREATED)).toEqual([]);
    expect(scheduledTimesFor(schedule, '2026-09-01', CREATED)).toEqual([480]); // same day OK
  });

  it('anchors interval schedules on the creation day', () => {
    const schedule = { kind: 'interval', everyDays: 2, timeMinutes: 480 } as const;
    expect(scheduledTimesFor(schedule, '2026-09-01', CREATED)).toEqual([480]);
    expect(scheduledTimesFor(schedule, '2026-09-02', CREATED)).toEqual([]);
    expect(scheduledTimesFor(schedule, '2026-09-03', CREATED)).toEqual([480]);
  });

  it('fires weekly schedules only on their weekdays (0 = Sunday)', () => {
    const schedule = { kind: 'weekly', weekdays: [2], timeMinutes: 600 } as const; // Tuesdays
    // 2026-09-08 is a Tuesday.
    expect(scheduledTimesFor(schedule, '2026-09-08', CREATED)).toEqual([600]);
    // 2026-09-09 is a Wednesday.
    expect(scheduledTimesFor(schedule, '2026-09-09', CREATED)).toEqual([]);
  });
});

describe('dueSlotMs grace boundary', () => {
  const schedule = { kind: 'daily', timesMinutes: [0] } as const; // midnight dose
  const date = '2026-09-08';
  const midnight = new Date(2026, 8, 8, 0, 0, 0).getTime();

  it('flags a slot once the grace window has fully passed', () => {
    const now = new Date(2026, 8, 8, 1, 0, 1).getTime(); // 1s past the 60-min grace
    expect(dueSlotMs(schedule, date, CREATED, now)).toEqual([midnight]);
  });

  it('keeps a slot pending exactly on the grace boundary', () => {
    const now = new Date(2026, 8, 8, 1, 0, 0).getTime();
    expect(dueSlotMs(schedule, date, CREATED, now)).toEqual([]);
  });

  it('keeps future and near-future slots pending', () => {
    const beforeGrace = new Date(2026, 8, 8, 0, 45).getTime();
    expect(dueSlotMs(schedule, date, CREATED, beforeGrace)).toEqual([]);
    const nextDay = new Date(2026, 8, 9, 2, 0).getTime();
    expect(dueSlotMs(schedule, '2026-09-09', CREATED, nextDay)).toEqual([
      new Date(2026, 8, 9, 0, 0).getTime(),
    ]);
  });

  it('never flags a slot on a day before the medication existed', () => {
    const now = new Date(2026, 8, 8, 2, 0).getTime();
    const createdLater = new Date(2026, 8, 10).getTime();
    expect(dueSlotMs(schedule, '2026-09-08', createdLater, now)).toEqual([]);
  });
});

describe('dateKey', () => {
  it('produces a local yyyy-mm-dd key', () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(dateKey(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31');
  });
});