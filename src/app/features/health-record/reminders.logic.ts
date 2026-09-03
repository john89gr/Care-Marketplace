/**
 * Smart Reminders channel layer (FEATURE_PLAN.md §8) — pure functions over the
 * feature 7 medication schedules. No Angular dependencies: every rule here is
 * unit-testable without DI.
 *
 * Channel config contract (subtask 5, "configured server-side"):
 * - The client persists the full {@link ReminderPreferences} resource with
 *   `PUT /me/reminders/preferences` (demo backend keeps it in memory).
 * - `push` delivery is client-side via the browser Notification API once the
 *   user grants permission (`pushEnabled` mirrors the permission grant).
 * - `sms` / `voice` delivery is server-side (provider stub): the client only
 *   records the phone number + GDPR consent; `smsVoiceStatus` reports
 *   `pending` until phone + consent are both present, then `configured`.
 * - `inapp` delivery is always available (notification center, feature 4).
 *
 * Quiet hours (subtask 7): wall-clock minutes in the user's IANA timezone.
 * Non-critical reminders inside the window are suppressed (logged as
 * `suppressed-quiet-hours`); critical meds bypass suppression.
 *
 * Escalation ladder (subtask 8): non-critical `inapp → push`, critical
 * `inapp → push → sms`. `voice` is opt-in only and never auto-escalated.
 */

import type { Medication } from './medications.logic';

/** Delivery channel for a medication reminder (subtask 1). */
export type ReminderChannel = 'push' | 'sms' | 'voice' | 'inapp';

/** All channels, in canonical display order. */
export const ALL_CHANNELS: readonly ReminderChannel[] = ['inapp', 'push', 'sms', 'voice'];

/** Server-side provisioning state for the SMS/voice stubs (subtask 5). */
export type SmsVoiceState = 'pending' | 'configured';

/** Quiet-hours window as wall-clock minutes in the user's timezone. */
export interface QuietHours {
  /** Inclusive start, minutes from midnight (0–1439). */
  startMinutes: number;
  /** Exclusive end, minutes from midnight (0–1439); may wrap past midnight. */
  endMinutes: number;
}

export interface ReminderPreferences {
  /** Per-medication enabled channels, keyed by medication id. */
  channelsByMedication: Record<string, ReminderChannel[]>;
  /** Null disables quiet hours entirely. */
  quietHours: QuietHours | null;
  /** IANA timezone the schedule is interpreted in (subtask 10). */
  timezone: string;
  /** E.164-ish phone number used for the SMS/voice stubs. */
  phone: string;
  /** GDPR consent capture for telephony channels (subtask 15). */
  consents: {
    sms: boolean;
    voice: boolean;
    consentedAtMs: number | null;
  };
  /** Family member duplicate copy for critical meds (subtask 12). */
  caregiverCopy: {
    enabled: boolean;
    relationship: string;
  };
  /** Mirrors the browser Notification permission grant. */
  pushEnabled: boolean;
}

/** Default channels for a medication with no saved preference. */
export const DEFAULT_CHANNELS: readonly ReminderChannel[] = ['inapp', 'push'];

/** Default quiet hours: 22:00–07:00 user-local (subtask 7). */
export const DEFAULT_QUIET_HOURS: QuietHours = { startMinutes: 22 * 60, endMinutes: 7 * 60 };

/** Default timezone for new users (Athens — the primary user base). */
export const DEFAULT_TIMEZONE = 'Europe/Athens';

export const DEFAULT_PREFERENCES: ReminderPreferences = {
  channelsByMedication: {},
  quietHours: { ...DEFAULT_QUIET_HOURS },
  timezone: DEFAULT_TIMEZONE,
  phone: '',
  consents: { sms: false, voice: false, consentedAtMs: null },
  caregiverCopy: { enabled: false, relationship: '' },
  pushEnabled: false,
};

// ---- Channel helpers ----

function isChannel(value: unknown): value is ReminderChannel {
  return value === 'push' || value === 'sms' || value === 'voice' || value === 'inapp';
}

/** Normalize a stored channel list: drop unknowns, dedupe, keep order. */
export function normalizeChannels(input: unknown): ReminderChannel[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_CHANNELS];
  }
  const seen = new Set<ReminderChannel>();
  for (const entry of input) {
    if (isChannel(entry) && !seen.has(entry)) {
      seen.add(entry);
    }
  }
  return seen.size === 0 ? [...DEFAULT_CHANNELS] : [...seen];
}

/** Enabled channels for one medication (falls back to the default pair). */
export function channelsForMed(
  prefs: ReminderPreferences,
  medicationId: string
): ReminderChannel[] {
  return normalizeChannels(prefs.channelsByMedication[medicationId] ?? [...DEFAULT_CHANNELS]);
}

/** First enabled channel — used for the "via X" preview text. */
export function primaryChannel(channels: readonly ReminderChannel[]): ReminderChannel {
  return channels[0] ?? 'inapp';
}

// ---- Quiet hours (subtask 7) ----

/**
 * True when wall-clock `nowMinutes` falls inside the window. Handles the
 * overnight wrap (e.g. 22:00–07:00). A null window disables quiet hours.
 */
export function isInQuietHours(nowMinutes: number, quiet: QuietHours | null): boolean {
  if (!quiet) {
    return false;
  }
  const { startMinutes, endMinutes } = quiet;
  if (startMinutes === endMinutes) {
    return false; // Degenerate window suppresses nothing.
  }
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * Suppression rule: non-critical reminders are held during quiet hours;
 * critical meds always bypass (subtask 7 "except critical").
 */
export function isSuppressed(
  isCritical: boolean,
  nowMinutes: number,
  quiet: QuietHours | null
): boolean {
  return !isCritical && isInQuietHours(nowMinutes, quiet);
}

// ---- Escalation ladder (subtask 8) ----

/**
 * Delivery order per severity. `voice` is intentionally excluded: it is
 * opt-in per reminder and never part of the automatic escalation.
 */
export function escalationLadder(isCritical: boolean): ReminderChannel[] {
  return isCritical ? ['inapp', 'push', 'sms'] : ['inapp', 'push'];
}

/** Channel attempted at a 0-based escalation attempt (clamped to the last). */
export function escalationStep(
  ladder: readonly ReminderChannel[],
  attemptIndex: number
): ReminderChannel {
  if (ladder.length === 0) {
    return 'inapp';
  }
  return ladder[Math.min(Math.max(attemptIndex, 0), ladder.length - 1)];
}

// ---- SMS/voice stub state + consent (subtasks 5, 15) ----

/** `configured` once a phone number and the matching consent are recorded. */
export function smsVoiceStatus(prefs: ReminderPreferences): {
  sms: SmsVoiceState;
  voice: SmsVoiceState;
} {
  const hasPhone = prefs.phone.trim().length >= 6;
  return {
    sms: hasPhone && prefs.consents.sms ? 'configured' : 'pending',
    voice: hasPhone && prefs.consents.voice ? 'configured' : 'pending',
  };
}

export interface ChannelGate {
  ok: boolean;
  reason: string;
}

/**
 * Whether a channel can be used right now (consent/permission gating).
 * Inapp is always available; telephony needs phone + consent (GDPR hook,
 * subtask 15 — the consent record also feeds the feature 16/17 ledger).
 */
export function canUseChannel(
  channel: ReminderChannel,
  prefs: ReminderPreferences
): ChannelGate {
  switch (channel) {
    case 'inapp':
      return { ok: true, reason: '' };
    case 'push':
      return prefs.pushEnabled
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Browser push is not enabled.' };
    case 'sms': {
      const status = smsVoiceStatus(prefs);
      return status.sms === 'configured'
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'SMS needs a phone number and consent.' };
    }
    case 'voice': {
      const status = smsVoiceStatus(prefs);
      return status.voice === 'configured'
        ? { ok: true, reason: '' }
        : { ok: false, reason: 'Voice calls need a phone number and consent.' };
    }
  }
}

// ---- Timezone helpers (subtask 10) ----

/** True for IANA names accepted by the platform (DST rules included). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fall back to UTC for unknown zone names (never throws). */
export function safeTimeZone(tz: string): string {
  return isValidTimeZone(tz) ? tz : 'UTC';
}

/**
 * UTC offset of `timeZone` at instant `ms`, in minutes. Derived from Intl
 * parts so DST transitions are honoured by the platform tz database.
 */
export function tzOffsetMinutes(ms: number, tz: string): number {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUTC - ms) / 60000);
}

/** Wall-clock minutes from midnight in `tz` (used for quiet-hours checks). */
export function minutesInTimeZone(ms: number, tz: string): number {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ms);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

/** Local date key (yyyy-mm-dd) of an instant in `tz`. */
export function dateKeyInTimeZone(ms: number, tz: string): string {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ms);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Weekday of an instant in `tz` (0 = Sunday, matching medications.logic). */
export function weekdayInTimeZone(ms: number, tz: string): number {
  const key = dateKeyInTimeZone(ms, tz);
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Short weekday label in `tz` (e.g. "Tue") for the preview text. */
export function weekdayShortInTimeZone(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: safeTimeZone(tz), weekday: 'short' }).format(ms);
}

/** HH:MM wall time of an instant in `tz`. */
export function timeStringInTimeZone(ms: number, tz: string): string {
  const zone = safeTimeZone(tz);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ms);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/**
 * Convert a wall time in `tz` to UTC milliseconds. The offset is refined once
 * so times adjacent to a DST transition resolve correctly, then the result is
 * verified with a round trip: a nonexistent wall time (spring-forward gap,
 * e.g. 02:30 on 2026-03-08 in America/New_York) shifts forward by the gap to
 * the first valid instant (03:30) — callers surface the resolved wall time
 * via {@link timeStringInTimeZone} so the preview never promises a time that
 * does not exist (subtask 11). An ambiguous fall-back time resolves to its
 * first occurrence.
 */
export function wallTimeToUtcMs(
  y: number,
  m: number,
  d: number,
  timeMinutes: number,
  tz: string
): number {
  const zone = safeTimeZone(tz);
  const h = Math.floor(timeMinutes / 60);
  const mi = timeMinutes % 60;
  const wallUTC = Date.UTC(y, m - 1, d, h, mi);
  const first = tzOffsetMinutes(wallUTC, zone);
  let utc = wallUTC - first * 60000;
  const second = tzOffsetMinutes(utc, zone);
  if (second !== first) {
    utc = wallUTC - second * 60000;
  }
  const targetDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const gotDate = dateKeyInTimeZone(utc, zone);
  const gotMinutes = minutesInTimeZone(utc, zone);
  if (gotDate !== targetDate || gotMinutes !== timeMinutes) {
    const [gy, gm, gd] = gotDate.split('-').map(Number);
    const diff = wallUTC - (Date.UTC(gy, gm - 1, gd) + gotMinutes * 60000);
    // Only auto-correct small DST gaps (the observed transitions are 1h).
    if (Math.abs(diff) > 0 && Math.abs(diff) <= 2 * 60 * 60000) {
      utc += diff;
    }
  }
  return utc;
}

// ---- Schedule lookup in the user's timezone ----

/**
 * Timezone-aware mirror of `scheduledTimesFor` (medications.logic): daily and
 * interval expansion are calendar-based so they are DST-safe; the weekday for
 * weekly schedules is evaluated in the user's timezone. `createdAtMs` is
 * compared as a calendar day in `tz` so a new med never inherits past doses.
 */
export function scheduledTimesForInTimeZone(
  med: Medication,
  date: string,
  weekday: number,
  tz: string
): number[] {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) {
    return [];
  }
  const createdKey = dateKeyInTimeZone(med.createdAtMs, tz);
  if (date < createdKey) {
    return [];
  }
  switch (med.schedule.kind) {
    case 'daily':
      return [...med.schedule.timesMinutes].sort((a, b) => a - b);
    case 'interval': {
      const dayMs = 24 * 60 * 60 * 1000;
      const [cy, cm, cd] = createdKey.split('-').map(Number);
      const diffDays = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(cy, cm - 1, cd)) / dayMs);
      if (diffDays < 0 || (diffDays - 1) % med.schedule.everyDays !== 0) {
        return [];
      }
      return [med.schedule.timeMinutes];
    }
    case 'weekly':
      return med.schedule.weekdays.includes(weekday) ? [med.schedule.timeMinutes] : [];
  }
}

export interface NextDose {
  atMs: number;
  date: string;
  timeMinutes: number;
}

/** Next scheduled dose strictly after `nowMs`, scanning up to 60 days out. */
export function nextDose(med: Medication, nowMs: number, tz: string): NextDose | null {
  const zone = safeTimeZone(tz);
  const todayKey = dateKeyInTimeZone(nowMs, zone);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const dayMs = 24 * 60 * 60 * 1000;
  const base = Date.UTC(ty, tm - 1, td);
  for (let offset = 0; offset < 60; offset++) {
    const dayUTC = base + offset * dayMs;
    const day = new Date(dayUTC);
    const date = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
    const weekday = day.getUTCDay();
    const times = scheduledTimesForInTimeZone(med, date, weekday, zone);
    for (const timeMinutes of times) {
      const atMs = wallTimeToUtcMs(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        timeMinutes,
        zone
      );
      if (atMs > nowMs) {
        return { atMs, date, timeMinutes };
      }
    }
  }
  return null;
}

/**
 * Preview line for the prefs UI (subtask 6):
 * "next reminder fires Tue 08:00 via push". Times render in the user's
 * timezone; nonexistent DST wall times show the resolved time.
 */
export function reminderPreview(
  med: Medication,
  nowMs: number,
  tz: string,
  channels: readonly ReminderChannel[]
): string {
  const next = nextDose(med, nowMs, tz);
  const via = primaryChannel(channels);
  if (!next) {
    return `no upcoming doses for ${med.name}`;
  }
  const zone = safeTimeZone(tz);
  const label = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(next.atMs)
    .replace(',', '');
  return `next reminder fires ${label} via ${via}`;
}

// ---- Clock + preference normalization helpers ----

/** Minutes → "HH:MM" for `<input type="time">` bindings. */
export function minutesToClock(minutes: number): string {
  const clamped = Math.min(1439, Math.max(0, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** "HH:MM" → minutes, or null when the input is not a valid 24h time. */
export function clockToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const h = Number(match[1]);
  const mi = Number(match[2]);
  if (h > 23 || mi > 59) {
    return null;
  }
  return h * 60 + mi;
}

/** "22:00–07:00" style summary for the settings UI. */
export function describeQuietHours(quiet: QuietHours | null): string {
  if (!quiet) {
    return 'off';
  }
  return `${minutesToClock(quiet.startMinutes)}–${minutesToClock(quiet.endMinutes)}`;
}

function normalizeQuietHours(input: unknown): QuietHours | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input !== 'object') {
    return { ...DEFAULT_QUIET_HOURS };
  }
  const { startMinutes, endMinutes } = input as Partial<QuietHours>;
  const start = typeof startMinutes === 'number' && Number.isFinite(startMinutes) ? Math.min(1439, Math.max(0, Math.round(startMinutes))) : DEFAULT_QUIET_HOURS.startMinutes;
  const end = typeof endMinutes === 'number' && Number.isFinite(endMinutes) ? Math.min(1439, Math.max(0, Math.round(endMinutes))) : DEFAULT_QUIET_HOURS.endMinutes;
  return { startMinutes: start, endMinutes: end };
}

/**
 * Merge an unknown server payload over the defaults (forward-compatible:
 * unknown fields are ignored, missing fields fall back to defaults).
 */
export function normalizePreferences(input: unknown): ReminderPreferences {
  if (typeof input !== 'object' || input === null) {
    return structuredClone(DEFAULT_PREFERENCES);
  }
  const raw = input as Partial<ReminderPreferences>;
  const channelsByMedication: Record<string, ReminderChannel[]> = {};
  if (raw.channelsByMedication && typeof raw.channelsByMedication === 'object') {
    for (const [medId, channels] of Object.entries(raw.channelsByMedication)) {
      channelsByMedication[medId] = normalizeChannels(channels);
    }
  }
  const consents = (raw.consents ?? {}) as Partial<ReminderPreferences['consents']>;
  const caregiverCopy = (raw.caregiverCopy ?? {}) as Partial<ReminderPreferences['caregiverCopy']>;
  return {
    channelsByMedication,
    quietHours: raw.quietHours === null ? null : normalizeQuietHours(raw.quietHours ?? { ...DEFAULT_QUIET_HOURS }),
    timezone: typeof raw.timezone === 'string' && isValidTimeZone(raw.timezone) ? raw.timezone : DEFAULT_TIMEZONE,
    phone: typeof raw.phone === 'string' ? raw.phone.slice(0, 32) : '',
    consents: {
      sms: consents.sms === true,
      voice: consents.voice === true,
      consentedAtMs: typeof consents.consentedAtMs === 'number' ? consents.consentedAtMs : null,
    },
    caregiverCopy: {
      enabled: caregiverCopy.enabled === true,
      relationship: typeof caregiverCopy.relationship === 'string' ? caregiverCopy.relationship.slice(0, 80) : '',
    },
    pushEnabled: raw.pushEnabled === true,
  };
}
