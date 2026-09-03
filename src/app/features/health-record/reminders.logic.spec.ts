import { describe, it, expect } from 'vitest';
import type { Medication } from './medications.logic';
import {
  ReminderPreferences,
  DEFAULT_PREFERENCES,
  normalizeChannels,
  channelsForMed,
  primaryChannel,
  isInQuietHours,
  isSuppressed,
  escalationLadder,
  escalationStep,
  smsVoiceStatus,
  canUseChannel,
  isValidTimeZone,
  safeTimeZone,
  tzOffsetMinutes,
  minutesInTimeZone,
  dateKeyInTimeZone,
  weekdayInTimeZone,
  timeStringInTimeZone,
  wallTimeToUtcMs,
  scheduledTimesForInTimeZone,
  nextDose,
  reminderPreview,
  minutesToClock,
  clockToMinutes,
  describeQuietHours,
  normalizePreferences,
} from './reminders.logic';

/**
 * Smart-reminders channel logic tests (FEATURE_PLAN.md §8 subtask 16):
 * quiet-hours suppression, the escalation ladder, and timezone/DST handling.
 */

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'Insulin glargine',
    dose: '10 units',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    critical: true,
    createdAtMs: Date.UTC(2026, 0, 1),
    ...overrides,
  };
}

function prefs(overrides: Partial<ReminderPreferences> = {}): ReminderPreferences {
  return structuredClone({ ...DEFAULT_PREFERENCES, ...overrides });
}

describe('channel normalization', () => {
  it('drops unknown channels, dedupes, keeps order', () => {
    expect(normalizeChannels(['sms', 'bogus', 'sms', 'push'])).toEqual(['sms', 'push']);
  });

  it('falls back to the default pair for empty/non-array input', () => {
    expect(normalizeChannels([])).toEqual(['inapp', 'push']);
    expect(normalizeChannels(undefined)).toEqual(['inapp', 'push']);
  });

  it('resolves per-medication channels with fallback', () => {
    const p = prefs({ channelsByMedication: { 'med-1': ['voice'] } });
    expect(channelsForMed(p, 'med-1')).toEqual(['voice']);
    expect(channelsForMed(p, 'other')).toEqual(['inapp', 'push']);
  });

  it('primaryChannel picks the first entry', () => {
    expect(primaryChannel(['sms', 'push'])).toBe('sms');
    expect(primaryChannel([])).toBe('inapp');
  });
});

describe('quiet hours (subtask 7)', () => {
  const overnight = { startMinutes: 22 * 60, endMinutes: 7 * 60 };

  it('suppresses inside a same-day window', () => {
    const day = { startMinutes: 13 * 60, endMinutes: 14 * 60 };
    expect(isInQuietHours(13 * 60, day)).toBe(true);
    expect(isInQuietHours(14 * 60, day)).toBe(false); // end is exclusive
    expect(isInQuietHours(12 * 60 + 59, day)).toBe(false);
  });

  it('handles the overnight wrap', () => {
    expect(isInQuietHours(23 * 60, overnight)).toBe(true);
    expect(isInQuietHours(3 * 60, overnight)).toBe(true);
    expect(isInQuietHours(7 * 60, overnight)).toBe(false);
    expect(isInQuietHours(21 * 60 + 59, overnight)).toBe(false);
    expect(isInQuietHours(12 * 60, overnight)).toBe(false);
  });

  it('is disabled for null or degenerate windows', () => {
    expect(isInQuietHours(3 * 60, null)).toBe(false);
    expect(isInQuietHours(3 * 60, { startMinutes: 420, endMinutes: 420 })).toBe(false);
  });

  it('critical meds bypass suppression', () => {
    expect(isSuppressed(true, 3 * 60, overnight)).toBe(false);
    expect(isSuppressed(false, 3 * 60, overnight)).toBe(true);
    expect(isSuppressed(false, 12 * 60, overnight)).toBe(false);
  });
});

describe('escalation ladder (subtask 8)', () => {
  it('walks inapp → push → sms for critical meds', () => {
    expect(escalationLadder(true)).toEqual(['inapp', 'push', 'sms']);
  });

  it('walks inapp → push for non-critical meds', () => {
    expect(escalationLadder(false)).toEqual(['inapp', 'push']);
  });

  it('clamps the attempt index to the ladder', () => {
    expect(escalationStep(['inapp', 'push'], 0)).toBe('inapp');
    expect(escalationStep(['inapp', 'push'], 7)).toBe('push');
    expect(escalationStep([], 3)).toBe('inapp');
  });
});

describe('SMS/voice stub state + consent gating (subtasks 5, 15)', () => {
  it('reports pending until phone + consent are both present', () => {
    expect(smsVoiceStatus(prefs())).toEqual({ sms: 'pending', voice: 'pending' });
    expect(
      smsVoiceStatus(prefs({ phone: '6940000000' }))
    ).toEqual({ sms: 'pending', voice: 'pending' });
    const full = prefs({ phone: '6940000000', consents: { sms: true, voice: true, consentedAtMs: 1 } });
    expect(smsVoiceStatus(full)).toEqual({ sms: 'configured', voice: 'configured' });
  });

  it('gates channels: inapp always ok, push needs the grant, telephony needs phone + consent', () => {
    const p = prefs();
    expect(canUseChannel('inapp', p).ok).toBe(true);
    expect(canUseChannel('push', p).ok).toBe(false);
    expect(canUseChannel('sms', p).ok).toBe(false);
    const ok = prefs({ pushEnabled: true, phone: '6940000000', consents: { sms: true, voice: false, consentedAtMs: 1 } });
    expect(canUseChannel('push', ok).ok).toBe(true);
    expect(canUseChannel('sms', ok).ok).toBe(true);
    expect(canUseChannel('voice', ok).ok).toBe(false);
  });
});

describe('timezone helpers (subtask 10)', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Europe/Athens')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
  });

  it('reads wall minutes/date/weekday in the user zone', () => {
    // 2026-09-02 05:00Z = 08:00 in Athens (UTC+3 in September).
    const ms = Date.UTC(2026, 8, 2, 5, 0);
    expect(minutesInTimeZone(ms, 'Europe/Athens')).toBe(480);
    expect(dateKeyInTimeZone(ms, 'Europe/Athens')).toBe('2026-09-02');
    expect(weekdayInTimeZone(ms, 'Europe/Athens')).toBe(3); // Wednesday
    expect(timeStringInTimeZone(ms, 'Europe/Athens')).toBe('08:00');
  });

  it('rolls the date back across the midnight boundary', () => {
    // 2026-09-02 00:30 Athens = 2026-09-01 21:30Z.
    const ms = Date.UTC(2026, 8, 1, 21, 30);
    expect(dateKeyInTimeZone(ms, 'Europe/Athens')).toBe('2026-09-02');
    expect(minutesInTimeZone(ms, 'Europe/Athens')).toBe(30);
  });

  it('exposes DST offsets from the platform tz database', () => {
    // New York: EST (UTC-5) in January, EDT (UTC-4) in July.
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15, 12, 0), 'America/New_York')).toBe(-300);
    expect(tzOffsetMinutes(Date.UTC(2026, 6, 15, 12, 0), 'America/New_York')).toBe(-240);
  });
});

describe('DST edge cases (subtask 11)', () => {
  const NY = 'America/New_York';

  it('shifts a nonexistent spring-forward wall time forward by the gap', () => {
    // 2026-03-08 02:30 does not exist in New York (02:00 → 03:00).
    const utc = wallTimeToUtcMs(2026, 3, 8, 2 * 60 + 30, NY);
    expect(Number.isFinite(utc)).toBe(true);
    expect(timeStringInTimeZone(utc, NY)).toBe('03:30');
    expect(dateKeyInTimeZone(utc, NY)).toBe('2026-03-08');
  });

  it('leaves existing times around the transition untouched', () => {
    expect(timeStringInTimeZone(wallTimeToUtcMs(2026, 3, 8, 90, NY), NY)).toBe('01:30');
    expect(timeStringInTimeZone(wallTimeToUtcMs(2026, 3, 8, 210, NY), NY)).toBe('03:30');
  });

  it('resolves an ambiguous fall-back wall time to a valid instant', () => {
    // 2026-11-01 01:30 happens twice; either occurrence is a valid answer.
    const utc = wallTimeToUtcMs(2026, 11, 1, 90, NY);
    expect(Number.isFinite(utc)).toBe(true);
    expect(timeStringInTimeZone(utc, NY)).toBe('01:30');
    expect(dateKeyInTimeZone(utc, NY)).toBe('2026-11-01');
  });

  it('keeps the next-dose preview on an existing time across the transition', () => {
    const m = med({ schedule: { kind: 'daily', timesMinutes: [8 * 60] } });
    // Just before the spring-forward Sunday, 08:00 that day still exists.
    const nowMs = wallTimeToUtcMs(2026, 3, 7, 12 * 60, NY);
    const next = nextDose(m, nowMs, NY);
    expect(next).not.toBeNull();
    expect(timeStringInTimeZone(next!.atMs, NY)).toBe('08:00');
  });
});

describe('schedule lookup in the user timezone', () => {
  it('evaluates weekly schedules by the user-zone weekday', () => {
    // 2026-09-02 05:00Z is Wednesday in Athens but Tuesday in New York.
    const wednesdayAthens = med({ schedule: { kind: 'weekly', weekdays: [3], timeMinutes: 480 } });
    expect(scheduledTimesForInTimeZone(wednesdayAthens, '2026-09-02', 3, 'Europe/Athens')).toEqual([480]);
    expect(scheduledTimesForInTimeZone(wednesdayAthens, '2026-09-02', 2, 'America/New_York')).toEqual([]);
  });

  it('expands interval schedules from the creation calendar day', () => {
    const m = med({
      schedule: { kind: 'interval', everyDays: 2, timeMinutes: 540 },
      createdAtMs: Date.UTC(2026, 7, 31, 12, 0),
    });
    expect(scheduledTimesForInTimeZone(m, '2026-09-02', 3, 'UTC')).toEqual([]);
    expect(scheduledTimesForInTimeZone(m, '2026-09-01', 2, 'UTC')).toEqual([540]);
  });

  it('hides doses before the medication existed', () => {
    const fresh = med({ createdAtMs: Date.UTC(2026, 8, 2, 12, 0) });
    expect(scheduledTimesForInTimeZone(fresh, '2026-09-01', 2, 'UTC')).toEqual([]);
    expect(scheduledTimesForInTimeZone(fresh, '2026-09-02', 3, 'UTC')).toEqual([480]);
  });
});

describe('preview text (subtask 6)', () => {
  it('renders "next reminder fires Tue 08:00 via push"', () => {
    // Monday 2026-08-31 12:00Z; daily 08:00 Athens → next is Tue 08:00.
    const m = med();
    const nowMs = Date.UTC(2026, 7, 31, 12, 0);
    expect(reminderPreview(m, nowMs, 'Europe/Athens', ['push', 'sms'])).toBe(
      'next reminder fires Tue 08:00 via push'
    );
  });

  it('names the primary channel and handles an empty schedule', () => {
    const m = med({ schedule: { kind: 'weekly', weekdays: [], timeMinutes: 480 } });
    expect(reminderPreview(m, Date.UTC(2026, 8, 2), 'UTC', ['sms'])).toContain('no upcoming doses');
  });
});

describe('clock + preference helpers', () => {
  it('round-trips minutes through HH:MM', () => {
    expect(minutesToClock(22 * 60)).toBe('22:00');
    expect(minutesToClock(7 * 60 + 5)).toBe('07:05');
    expect(clockToMinutes('22:00')).toBe(1320);
    expect(clockToMinutes('7:05')).toBe(425);
    expect(clockToMinutes('24:00')).toBeNull();
    expect(clockToMinutes('nope')).toBeNull();
  });

  it('describes quiet hours, including off', () => {
    expect(describeQuietHours({ startMinutes: 1320, endMinutes: 420 })).toBe('22:00–07:00');
    expect(describeQuietHours(null)).toBe('off');
  });

  it('normalizes unknown payloads to safe defaults', () => {
    const p = normalizePreferences({ timezone: 'Not/AZone', quietHours: null });
    expect(p.timezone).toBe('Europe/Athens');
    expect(p.quietHours).toBeNull();
    expect(p.pushEnabled).toBe(false);
    expect(normalizePreferences(null).timezone).toBe('Europe/Athens');
    const channels = normalizePreferences({ channelsByMedication: { a: ['sms', 'nope'] } });
    expect(channels.channelsByMedication['a']).toEqual(['sms']);
  });
});
