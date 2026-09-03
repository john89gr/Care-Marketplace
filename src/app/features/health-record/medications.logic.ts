/**
 * Medication schedule + adherence math (FEATURE_PLAN.md §7 subtasks 1, 4, 5,
 * 8, 10, 14). Pure functions only: schedule expansion, missed-dose detection
 * with a grace window, adherence over sliding windows, and refill tracking.
 */

/** Daily fixed times (minutes from midnight)… */
export type MedicationSchedule =
  | { kind: 'daily'; timesMinutes: number[] }
  /** …every N days… */
  | { kind: 'interval'; everyDays: number; timeMinutes: number }
  /** …or specific weekdays (0 = Sunday). */
  | { kind: 'weekly'; weekdays: number[]; timeMinutes: number };

export interface Medication {
  id: string;
  name: string;
  dose: string;
  schedule: MedicationSchedule;
  /** Critical meds alert the family when a dose is missed (subtask 9). */
  critical: boolean;
  prescriber?: string;
  /** ISO date the supply runs out; enables refill tracking (subtask 14). */
  refillDueDate?: string | null;
  /** Days of supply per fill, for the days-remaining estimate. */
  supplyDays?: number | null;
  /** Soft-delete (subtask 13); archived meds keep their logs for audit. */
  archived?: boolean;
  createdAtMs: number;
}

export type DoseAction = 'taken' | 'skipped';

export interface AdherenceLog {
  id: string;
  medicationId: string;
  /** Date key (yyyy-mm-dd, user-local) of the scheduled dose. */
  date: string;
  timeMinutes: number;
  action: DoseAction;
  atMs: number;
  /** Who logged it — client or caregiver on behalf (subtask 11). */
  loggedBy: string;
}

/** Grace window (minutes) after the scheduled time before a dose is "missed". */
export const GRACE_MINUTES = 60;
/** Alert again after N consecutive misses of a critical med (subtask 10). */
export const ESCALATION_AFTER_MISSES = 2;

// ---- Schedule expansion (subtask 15) ----

/** Local date key for a timestamp. */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** All scheduled dose times (minutes) for a local date key. */
export function scheduledTimesFor(med: Medication, date: string): number[] {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) {
    return [];
  }
  // A medication cannot have scheduled doses before it existed — otherwise a
  // newly added med would instantly inherit 0% adherence for all past days.
  const [cy, cm, cd] = dateKey(med.createdAtMs).split('-').map(Number);
  if (Date.UTC(y, m - 1, d) < Date.UTC(cy, cm - 1, cd)) {
    return [];
  }
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  switch (med.schedule.kind) {
    case 'daily':
      return [...med.schedule.timesMinutes].sort((a, b) => a - b);
    case 'interval': {
      // Anchor on the medication's creation day; every N days from there.
      const dayMs = 24 * 60 * 60 * 1000;
      const start = Date.UTC(cy, cm - 1, cd);
      const target = Date.UTC(y, m - 1, d);
      const diffDays = Math.round((target - start) / dayMs);
      if (diffDays < 0 || diffDays % med.schedule.everyDays !== 0) {
        return [];
      }
      return [med.schedule.timeMinutes];
    }
    case 'weekly':
      return med.schedule.weekdays.includes(weekday) ? [med.schedule.timeMinutes] : [];
  }
}

export interface DoseSlot {
  timeMinutes: number;
  /** Scheduled timestamp for that day (user-local approximated as local ms). */
  scheduledAtMs: number;
  state: 'taken' | 'skipped' | 'pending' | 'missed';
  log?: AdherenceLog;
}

/**
 * Today's timeline for one medication (subtask 3): each scheduled slot with
 * taken/skipped from the logs, `missed` when past scheduled + grace, else
 * `pending` (subtask 8).
 */
export function doseSlotsFor(
  med: Medication,
  date: string,
  logs: readonly AdherenceLog[],
  nowMs: number
): DoseSlot[] {
  const [y, m, d] = date.split('-').map(Number);
  const dayStartLocal = new Date(y, m - 1, d).getTime();
  const dayLogs = logs.filter((l) => l.medicationId === med.id && l.date === date);
  return scheduledTimesFor(med, date).map((timeMinutes) => {
    const log = dayLogs.find((l) => l.timeMinutes === timeMinutes);
    const scheduledAtMs = dayStartLocal + timeMinutes * 60 * 1000;
    let state: DoseSlot['state'];
    if (log) {
      state = log.action;
    } else if (nowMs > scheduledAtMs + GRACE_MINUTES * 60 * 1000) {
      state = 'missed';
    } else {
      state = 'pending';
    }
    return { timeMinutes, scheduledAtMs, state, log };
  });
}

// ---- Adherence math (subtask 5) ----

export interface AdherenceStats {
  /** Fraction of scheduled doses actually taken (0–1); null when none. */
  rate: number | null;
  taken: number;
  scheduled: number;
}

/** Adherence over the last `days` days (inclusive of today). */
export function adherenceFor(
  med: Medication,
  logs: readonly AdherenceLog[],
  nowMs: number,
  days: number
): AdherenceStats {
  let taken = 0;
  let scheduled = 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const dayMsTs = today.getTime() - i * dayMs;
    const date = dateKey(dayMsTs);
    // Count every scheduled slot; grace applies only to today's tail — past
    // days without logs are missed (not scheduled) only if the med existed.
    const slots = scheduledTimesFor(med, date);
    for (const time of slots) {
      const log = logs.find(
        (l) => l.medicationId === med.id && l.date === date && l.timeMinutes === time
      );
      scheduled += 1;
      if (log?.action === 'taken') {
        taken += 1;
      }
    }
  }
  return {
    rate: scheduled === 0 ? null : Math.round((taken / scheduled) * 100) / 100,
    taken,
    scheduled,
  };
}

/** Consecutive missed doses (newest first) for escalation (subtask 10). */
export function consecutiveMisses(
  med: Medication,
  logs: readonly AdherenceLog[],
  nowMs: number
): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  let misses = 0;
  for (let i = 0; i < 60; i++) {
    const ts = today.getTime() - i * dayMs;
    const date = dateKey(ts);
    const slots = doseSlotsFor(med, date, logs, nowMs);
    for (const slot of [...slots].reverse()) {
      if (slot.state === 'missed') {
        misses += 1;
      } else if (slot.state === 'taken' || slot.state === 'skipped') {
        return misses;
      }
      // pending slots (today, within grace) don't break the streak but
      // shouldn't count either — keep scanning older slots.
    }
  }
  return misses;
}

// ---- Refill tracking (subtask 14) ----

/** Days until the supply runs out (negative = overdue), or null. */
export function daysSupplyRemaining(med: Medication, nowMs: number): number | null {
  if (!med.refillDueDate) {
    return null;
  }
  const [y, m, d] = med.refillDueDate.split('-').map(Number);
  if (!y || !m || !d) {
    return null;
  }
  const refill = new Date(y, m - 1, d).getTime();
  const now = new Date(nowMs);
  now.setHours(0, 0, 0, 0);
  return Math.round((refill - now.getTime()) / (24 * 60 * 60 * 1000));
}

export const REFILL_WARNING_DAYS = 5;

export function needsRefill(med: Medication, nowMs: number): boolean {
  const days = daysSupplyRemaining(med, nowMs);
  return days !== null && days <= REFILL_WARNING_DAYS;
}
