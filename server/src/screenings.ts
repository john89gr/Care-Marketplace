import { query, queryOne } from './db';
import { notifyUser } from './push';

/**
 * Preventive-care screening engine (FEATURE_PLAN.md §6/§20). A faithful
 * mirror of the frontend rule set in
 * `src/app/features/health-record/screening.rules.ts` — same age/sex matrix,
 * same intervals, same due/not-due semantics — so server-side
 * `screening.due` Web Push matches what the UI shows. Pure functions here are
 * unit-tested against the boundary matrix; `checkScreeningDue` persists a
 * once-only notice per (user, type, due-at) and pushes when new.
 */

export type ScreeningSex = 'female' | 'male' | 'other';

export type ScreeningType =
  | 'mammography'
  | 'cardioCheck'
  | 'cervicalSmear'
  | 'colorectalScreening'
  | 'fluVaccine'
  | 'boneDensity'
  | 'colonoscopy'
  | 'papTest'
  | 'psaCheck';

export interface ScreeningRule {
  type: ScreeningType;
  label: string;
  minAge: number;
  maxAge: number;
  sex: ScreeningSex[];
  intervalMonths: number;
  maleMinAge?: number;
  aliases?: readonly ScreeningType[];
}

export const SCREENING_RULES: readonly ScreeningRule[] = [
  { type: 'mammography', label: 'Mammography', minAge: 50, maxAge: 74, sex: ['female'], intervalMonths: 24 },
  { type: 'cardioCheck', label: 'Cardiovascular check', minAge: 40, maxAge: 120, sex: ['female', 'male', 'other'], intervalMonths: 12 },
  { type: 'cervicalSmear', label: 'Cervical screening', minAge: 25, maxAge: 64, sex: ['female'], intervalMonths: 36, aliases: ['papTest'] },
  { type: 'colorectalScreening', label: 'Colorectal screening (FIT test)', minAge: 45, maxAge: 80, sex: ['female', 'male', 'other'], intervalMonths: 24, aliases: ['colonoscopy'] },
  { type: 'fluVaccine', label: 'Seasonal flu vaccination', minAge: 60, maxAge: 120, sex: ['female', 'male', 'other'], intervalMonths: 12 },
  { type: 'boneDensity', label: 'Bone density scan', minAge: 65, maxAge: 120, sex: ['female', 'male'], intervalMonths: 24, maleMinAge: 70 },
];

/**
 * Clinical guideline screening rules:
 * - cardioCheck: age >= 40, interval 12 months
 * - mammography: female, age 40-74, interval 12 months
 * - colonoscopy: age 50-75, interval 60 months
 * - papTest: female, age 21-65, interval 36 months
 * - psaCheck: male, age 50-70, interval 12 months
 * - boneDensity: female age >= 65 or male >= 70, interval 24 months
 */
export const VERIFIED_SCREENING_RULES: readonly ScreeningRule[] = [
  { type: 'cardioCheck', label: 'Cardiovascular check', minAge: 40, maxAge: 120, sex: ['female', 'male', 'other'], intervalMonths: 12 },
  { type: 'mammography', label: 'Mammography', minAge: 40, maxAge: 74, sex: ['female'], intervalMonths: 12 },
  { type: 'colonoscopy', label: 'Colonoscopy', minAge: 50, maxAge: 75, sex: ['female', 'male', 'other'], intervalMonths: 60, aliases: ['colorectalScreening'] },
  { type: 'papTest', label: 'Pap test', minAge: 21, maxAge: 65, sex: ['female'], intervalMonths: 36, aliases: ['cervicalSmear'] },
  { type: 'psaCheck', label: 'PSA check', minAge: 50, maxAge: 70, sex: ['male'], intervalMonths: 12 },
  { type: 'boneDensity', label: 'Bone density scan', minAge: 65, maxAge: 120, sex: ['female', 'male'], intervalMonths: 24, maleMinAge: 70 },
];

export function getScreeningRule(
  type: string,
  rules: readonly ScreeningRule[] = SCREENING_RULES
): ScreeningRule | undefined {
  return (
    rules.find((r) => r.type === type || r.aliases?.includes(type as ScreeningType)) ??
    VERIFIED_SCREENING_RULES.find((r) => r.type === type || r.aliases?.includes(type as ScreeningType))
  );
}


export interface ScreeningProfile {
  dateOfBirth: string;
  sex: ScreeningSex | '';
}

export interface ScreeningRecord {
  type: ScreeningType;
  status: 'done' | 'waived';
  atMs: number;
  snoozeUntilMs?: number | null;
  scheduledAtMs?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const avgMonthMs = 30.44 * DAY_MS;

/** Whole years between an ISO DOB and `nowMs` (boundary-exact, UTC). */
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

export function ruleApplies(rule: ScreeningRule, profile: ScreeningProfile, nowMs: number): boolean {
  const age = ageAt(profile.dateOfBirth, nowMs);
  if (age === null) {
    return false;
  }
  const minAge = profile.sex === 'male' && rule.maleMinAge !== undefined ? rule.maleMinAge : rule.minAge;
  if (age < minAge || age > rule.maxAge) {
    return false;
  }
  if (profile.sex && !rule.sex.includes(profile.sex)) {
    return false;
  }
  if (!profile.sex && rule.sex.length < 3) {
    return false;
  }
  return true;
}

/** One rule verdict. `due` when no record exists and the matrix applies, or a done record's interval elapsed. */
export interface ScreeningStatus {
  rule: ScreeningRule;
  state: 'due' | 'not_due';
  /** When the screening becomes due (0 = applies with no record yet). */
  dueAtMs: number;
  overdue: boolean;
}

export function evaluateScreenings(
  profile: ScreeningProfile,
  records: readonly ScreeningRecord[],
  nowMs: number,
  rules: readonly ScreeningRule[] = SCREENING_RULES
): ScreeningStatus[] {
  const byType = new Map(records.map((r) => [r.type, r]));
  const results: ScreeningStatus[] = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, profile, nowMs)) {
      continue;
    }
    const record =
      byType.get(rule.type) ??
      rule.aliases?.map((a) => byType.get(a)).find(Boolean);
    let state: ScreeningStatus['state'] = 'due';
    let dueAtMs = 0;
    if (record) {
      if (record.status === 'done') {
        dueAtMs = record.atMs + rule.intervalMonths * avgMonthMs;
        state = dueAtMs > nowMs ? 'not_due' : 'due';
      } else {
        // Waived: never surfaces as due again.
        state = 'not_due';
      }
      if (record.snoozeUntilMs && record.snoozeUntilMs > nowMs) {
        dueAtMs = record.snoozeUntilMs;
        state = 'not_due';
      }
      if (record.scheduledAtMs && record.scheduledAtMs > nowMs) {
        dueAtMs = record.scheduledAtMs;
        state = 'not_due';
      }
    }
    results.push({
      rule,
      state,
      dueAtMs,
      overdue: state === 'due' && (dueAtMs === 0 || dueAtMs <= nowMs),
    });
  }
  return results.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.state !== b.state) return a.state === 'due' ? -1 : 1;
    return a.rule.type.localeCompare(b.rule.type);
  });
}

interface ScreeningRow {
  id: string;
  type: ScreeningType;
  status: 'done' | 'waived';
  at_ms: string | number;
  snooze_until_ms: string | number | null;
  scheduled_at_ms: string | number | null;
}

/**
 * Evaluate the current user's due screenings and push `screening.due` for any
 * rule that newly became due (once per user/type/due-at). Runs on the
 * screenings read so the notification fires as soon as the user (or their
 * caregiver) opens the feature; harmless when nothing changed.
 */
export async function checkScreeningDue(userId: string): Promise<void> {
  const profile = await queryOne<{ date_of_birth: string; sex: string }>(
    `SELECT date_of_birth, sex FROM profiles WHERE user_id = $1`,
    [userId]
  );
  const records = await query<ScreeningRow>(
    `SELECT id, type, status, at_ms, snooze_until_ms, scheduled_at_ms
     FROM screenings WHERE user_id = $1`,
    [userId]
  );
  const nowMs = Date.now();
  const statuses = evaluateScreenings(
    {
      dateOfBirth: profile?.date_of_birth ?? '',
      sex: (profile?.sex ?? '') as ScreeningSex | '',
    },
    records.map((r) => ({
      type: r.type,
      status: r.status,
      atMs: Number(r.at_ms),
      snoozeUntilMs: r.snooze_until_ms === null ? null : Number(r.snooze_until_ms),
      scheduledAtMs: r.scheduled_at_ms === null ? null : Number(r.scheduled_at_ms),
    })),
    nowMs
  );
  for (const status of statuses) {
    if (status.state !== 'due') {
      continue;
    }
    const inserted = await query(
      `INSERT INTO screening_notices (user_id, type, due_at_ms, notified_at_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, type, due_at_ms) DO NOTHING
       RETURNING notified_at_ms`,
      [userId, status.rule.type, status.dueAtMs, nowMs]
    );
    if (inserted.length === 0) {
      continue; // Already alerted for this due cycle.
    }
    await notifyUser(userId, {
      kind: 'screening.due',
      title: `${status.rule.label} is due`,
      body: status.overdue
        ? 'This preventive check is overdue for your age group — book a visit or mark it done.'
        : 'A preventive check is recommended for your age group.',
      link: '/screenings',
    });
  }
}