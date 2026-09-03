/**
 * Screening & preventive-care rule engine (FEATURE_PLAN.md §6 subtasks 1–2).
 * Pure data + pure functions: given a profile snapshot (date of birth, sex)
 * and the current time, compute which screenings are due. No DI, no Angular —
 * 100% unit-testable (subtask 12).
 */

export type ScreeningSex = 'female' | 'male' | 'other';

export type ScreeningType =
  | 'mammography'
  | 'cardioCheck'
  | 'cervicalSmear'
  | 'colorectalScreening'
  | 'fluVaccine'
  | 'boneDensity';

export interface ScreeningRule {
  type: ScreeningType;
  label: string;
  /** Inclusive age bounds; outside them the rule does not apply. */
  minAge: number;
  maxAge: number;
  /** Which recorded sex the rule applies to. */
  sex: ScreeningSex[];
  /** Months between screenings once one is done. */
  intervalMonths: number;
  /** Marketplace speciality used for the "Book visit" deep link. */
  speciality: string;
}

/**
 * Rule set per PLAN.md §3.C: mammography, cardio check, vaccinations.
 * Ages are inclusive; intervals in months.
 */
export const SCREENING_RULES: readonly ScreeningRule[] = [
  {
    type: 'mammography',
    label: 'Mammography',
    minAge: 50,
    maxAge: 74,
    sex: ['female'],
    intervalMonths: 24,
    speciality: 'nurse',
  },
  {
    type: 'cardioCheck',
    label: 'Cardiovascular check',
    minAge: 40,
    maxAge: 120,
    sex: ['female', 'male', 'other'],
    intervalMonths: 12,
    speciality: 'nurse',
  },
  {
    type: 'cervicalSmear',
    label: 'Cervical screening',
    minAge: 25,
    maxAge: 64,
    sex: ['female'],
    intervalMonths: 36,
    speciality: 'nurse',
  },
  {
    type: 'colorectalScreening',
    label: 'Colorectal screening (FIT test)',
    minAge: 45,
    maxAge: 80,
    sex: ['female', 'male', 'other'],
    intervalMonths: 24,
    speciality: 'nurse',
  },
  {
    type: 'fluVaccine',
    label: 'Seasonal flu vaccination',
    minAge: 60,
    maxAge: 120,
    sex: ['female', 'male', 'other'],
    intervalMonths: 12,
    speciality: 'nurse',
  },
  {
    type: 'boneDensity',
    label: 'Bone density scan',
    minAge: 65,
    maxAge: 120,
    sex: ['female'],
    intervalMonths: 24,
    speciality: 'nurse',
  },
];

/** Inputs the engine needs from the profile (DOB + sex, subtask 5). */
export interface ScreeningProfile {
  /** ISO date of birth (yyyy-mm-dd); empty = unknown age → no rules apply. */
  dateOfBirth: string;
  sex: ScreeningSex | '';
}

/** The engine's verdict for one rule. */
export interface ScreeningStatus {
  rule: ScreeningRule;
  /** `due` when no record exists and the age/sex matrix applies. */
  state: 'due' | 'not_due' | 'not_applicable';
  /** Age in whole years at `nowMs` (null when DOB unknown). */
  age: number | null;
  /** Next/last completion or waive — surfaced for UI. */
  lastCompletedAtMs: number | null;
  /** When the next screening becomes due (ms) once one is done. */
  dueAtMs: number | null;
  /** True when the computed due date is in the past and not done. */
  overdue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const avgMonthMs = 30.44 * DAY_MS;

/** Whole years between an ISO DOB and `nowMs` (boundary-exact). */
export function ageAt(dateOfBirth: string, nowMs: number): number | null {
  if (!dateOfBirth) {
    return null;
  }
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/** True when the age/sex matrix selects this rule for the profile. */
export function ruleApplies(rule: ScreeningRule, profile: ScreeningProfile, nowMs: number): boolean {
  const age = ageAt(profile.dateOfBirth, nowMs);
  if (age === null) {
    return false;
  }
  if (age < rule.minAge || age > rule.maxAge) {
    return false;
  }
  if (profile.sex && !rule.sex.includes(profile.sex)) {
    return false;
  }
  if (!profile.sex && rule.sex.length < 3) {
    // Unknown sex: only gender-neutral rules can apply.
    return false;
  }
  return true;
}

export interface ScreeningRecord {
  type: ScreeningType;
  /** `done | waived` — snoozed stays `due` until done/waived. */
  status: 'done' | 'waived';
  atMs: number;
  /** Required reason for waivers (subtask 13). */
  reason?: string;
  /** Snooze until timestamp (subtask 12); snooze count tracked by store. */
  snoozeUntilMs?: number | null;
  /** Scheduled appointment timestamp (subtask 4 `schedule`); future dates keep the rule out of due. */
  scheduledAtMs?: number | null;
}

/**
 * Core engine (subtask 2): evaluate every rule for a profile, joining any
 * persisted records. Sorted: overdue first, then due, then not-applicable.
 */
export function evaluateScreenings(
  profile: ScreeningProfile,
  records: readonly ScreeningRecord[],
  nowMs: number
): ScreeningStatus[] {
  const byType = new Map(records.map((r) => [r.type, r]));
  const results: ScreeningStatus[] = [];

  for (const rule of SCREENING_RULES) {
    if (!ruleApplies(rule, profile, nowMs)) {
      continue;
    }
    const record = byType.get(rule.type);
    const lastCompletedAtMs = record?.status === 'done' ? record.atMs : null;
    let state: ScreeningStatus['state'] = 'due';
    let dueAtMs: number | null = null;
    if (record) {
      if (record.status === 'done') {
        dueAtMs = record.atMs + rule.intervalMonths * avgMonthMs;
        state = dueAtMs > nowMs ? 'not_due' : 'due';
      } else {
        // Waived: never surfaces as due again.
        state = 'not_due';
        dueAtMs = null;
      }
      // A snooze pushes the effective due date out.
      if (record.snoozeUntilMs && record.snoozeUntilMs > nowMs) {
        dueAtMs = record.snoozeUntilMs;
        state = 'not_due';
      }
      // A scheduled appointment also keeps the rule out of due until it passes.
      if (record.scheduledAtMs && record.scheduledAtMs > nowMs) {
        dueAtMs = record.scheduledAtMs;
        state = 'not_due';
      }
    }
    results.push({
      rule,
      state,
      age: ageAt(profile.dateOfBirth, nowMs),
      lastCompletedAtMs,
      dueAtMs,
      overdue: state === 'due' && (dueAtMs === null || dueAtMs <= nowMs),
    });
  }
  return results.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.state !== b.state) return a.state === 'due' ? -1 : 1;
    return a.rule.label.localeCompare(b.rule.label);
  });
}

/**
 * Convenience wrapper (subtask 2 alias): due screenings only for a profile.
 * Pure — same inputs as {@link evaluateScreenings}, filtered to `due`.
 */
export function dueScreenings(
  profile: ScreeningProfile,
  records: readonly ScreeningRecord[] = [],
  nowMs: number = Date.now()
): ScreeningStatus[] {
  return evaluateScreenings(profile, records, nowMs).filter((s) => s.state === 'due');
}
