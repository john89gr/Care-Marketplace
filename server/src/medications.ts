import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { notifyUser } from './push';

/**
 * Medication schedules + missed-dose detection (FEATURE_PLAN.md §7/§20) —
 * mirrors the pure math in frontend medications.logic.ts so a missed critical
 * dose raises a real push alert even when no tab is open. Keep in sync with
 * the frontend's MedicationSchedule / GRACE_MINUTES.
 */
export type MedicationSchedule =
  | { kind: 'daily'; timesMinutes: number[] }
  | { kind: 'interval'; everyDays: number; timeMinutes: number }
  | { kind: 'weekly'; weekdays: number[]; timeMinutes: number };

/** Grace window (minutes) after the scheduled time before a dose is missed. */
export const GRACE_MINUTES = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local yyyy-mm-dd key for a timestamp. */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Minutes since local midnight for a timestamp. */
export function minutesSinceMidnight(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Scheduled dose times (minutes) for a local date key — port of the frontend
 * `scheduledTimesFor`: no doses before the medication existed, interval meds
 * anchor on the creation day, weekly meds fire on their weekdays (0 = Sunday).
 */
export function scheduledTimesFor(
  schedule: MedicationSchedule,
  date: string,
  createdAtMs: number
): number[] {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) {
    return [];
  }
  const [cy, cm, cd] = dateKey(createdAtMs).split('-').map(Number);
  if (Date.UTC(y, m - 1, d) < Date.UTC(cy, cm - 1, cd)) {
    return [];
  }
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  switch (schedule.kind) {
    case 'daily':
      return [...schedule.timesMinutes].sort((a, b) => a - b);
    case 'interval': {
      const start = Date.UTC(cy, cm - 1, cd);
      const target = Date.UTC(y, m - 1, d);
      const diffDays = Math.round((target - start) / DAY_MS);
      if (diffDays < 0 || diffDays % schedule.everyDays !== 0) {
        return [];
      }
      return [schedule.timeMinutes];
    }
    case 'weekly':
      return schedule.weekdays.includes(weekday) ? [schedule.timeMinutes] : [];
  }
}

/**
 * Absolute timestamps (local ms) of dose slots on `date` that are past due
 * (scheduled time + grace window already passed). Strictly after the grace
 * boundary — exactly on it is still pending, matching the frontend.
 */
export function dueSlotMs(
  schedule: MedicationSchedule,
  date: string,
  createdAtMs: number,
  nowMs: number
): number[] {
  const [y, m, d] = date.split('-').map(Number);
  const dayStartLocal = new Date(y, m - 1, d).getTime();
  const graceMs = GRACE_MINUTES * 60 * 1000;
  return scheduledTimesFor(schedule, date, createdAtMs)
    .map((minutes) => dayStartLocal + minutes * 60 * 1000)
    .filter((slotMs) => nowMs > slotMs + graceMs);
}

export interface MedicationRow extends Row {
  id: string;
  user_id: string;
  name: string;
  critical: boolean;
  schedule: MedicationSchedule;
  created_at_ms: number;
}

/**
 * Insert a missed-dose log for every due, unlogged slot of the user's active
 * medications and push an alert for critical ones. Idempotent per
 * (medication, slot) thanks to the unique index — a dose is alerted once.
 * Returns the number of alerts pushed.
 */
export async function detectMissedDoses(userId: string, nowMs = Date.now()): Promise<number> {
  const meds = await query<MedicationRow>(
    `SELECT * FROM medications WHERE user_id = $1 AND archived = FALSE`,
    [userId]
  );
  const date = dateKey(nowMs);
  let alerts = 0;
  for (const med of meds) {
    const schedule =
      typeof med.schedule === 'string' ? (JSON.parse(med.schedule) as MedicationSchedule) : med.schedule;
    for (const slotMs of dueSlotMs(schedule, date, Number(med.created_at_ms), nowMs)) {
      const inserted = await query<Row>(
        `INSERT INTO medication_logs (id, medication_id, user_id, scheduled_for_ms, action, at_ms)
         VALUES ($1, $2, $3, $4, 'missed', $5)
         ON CONFLICT (medication_id, scheduled_for_ms) DO NOTHING
         RETURNING id`,
        [`ml-${randomBytes(6).toString('hex')}`, med.id, userId, slotMs, nowMs]
      );
      if (inserted.length === 0) {
        continue; // already logged (taken or missed earlier)
      }
      if (med.critical) {
        const result = await notifyUser(userId, {
          kind: 'medication.missed',
          title: `Missed dose: ${med.name}`,
          body: 'A critical medication dose was missed — please check in.',
          link: '/medications',
        });
        if (result === 'sent') {
          alerts += 1;
        }
      }
    }
  }
  return alerts;
}

/** Latest medication row by name (used by the API to confirm creation). */
export async function findMedication(id: string, userId: string): Promise<Row | null> {
  return queryOne<Row>(`SELECT * FROM medications WHERE id = $1 AND user_id = $2`, [id, userId]);
}