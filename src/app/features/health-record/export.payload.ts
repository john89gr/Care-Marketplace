/**
 * Health-summary payload composition (FEATURE_PLAN.md §10 subtask 3).
 * Pure functions: profile basics + vitals trends + meds + screenings +
 * care-plan snapshot, with range filtering and explicit empty sections.
 */
import type { VitalReading } from './vitals.store';
import type { AdherenceLog, Medication } from './medications.logic';
import type { ScreeningStatus } from './screening.rules';
import type { CarePlan } from '../home-health/care-plan.store';
import {
  ExportLocale,
  ExportRangeDays,
  inExportRange,
} from './export.types';

export interface HealthSummaryInput {
  profile: { userId: string; displayName: string };
  readings: readonly VitalReading[];
  medications: readonly Medication[];
  adherenceLogs: readonly AdherenceLog[];
  screeningStatuses: readonly ScreeningStatus[];
  carePlan: CarePlan | null;
  range: ExportRangeDays;
  locale: ExportLocale;
  generatedAtMs?: number;
}

export interface ScreeningSummary {
  type: string;
  label: string;
  state: string;
  overdue: boolean;
  lastCompletedAtMs: number | null;
}

export interface CarePlanSnapshot {
  goals: { text: string; status: string }[];
  notes: { text: string; authorName: string; atMs: number }[];
  updatedAtMs: number;
}

export interface HealthSummaryPayload {
  patientName: string;
  patientId: string;
  generatedAtMs: number;
  range: ExportRangeDays;
  locale: ExportLocale;
  vitals: VitalReading[];
  vitalsByType: Record<string, VitalReading[]>;
  medications: Medication[];
  adherenceLogs: AdherenceLog[];
  screenings: ScreeningSummary[];
  carePlan: CarePlanSnapshot | null;
  counts: {
    vitals: number;
    medications: number;
    screeningsDue: number;
    carePlanGoals: number;
    carePlanNotes: number;
  };
  /** Section keys with nothing to show (rendered as explicit "no data"). */
  emptySections: string[];
}

export function composeHealthSummary(
  input: HealthSummaryInput,
  nowMs: number = Date.now()
): HealthSummaryPayload {
  const generatedAtMs = input.generatedAtMs ?? nowMs;

  // Vitals: range-filtered, oldest → newest (trend order).
  const vitals = input.readings
    .filter((r) => inExportRange(r.measuredAtMs, input.range, nowMs))
    .sort((a, b) => a.measuredAtMs - b.measuredAtMs);
  const vitalsByType: Record<string, VitalReading[]> = {};
  for (const reading of vitals) {
    (vitalsByType[reading.type] ??= []).push(reading);
  }

  // Medications: current snapshot — archived entries stay out of the
  // physician summary (their logs remain for audit, per medications.store).
  const medications = input.medications.filter((m) => !m.archived);

  // Care-plan notes are time-bound like vitals; goals are a snapshot.
  const carePlan: CarePlanSnapshot | null = input.carePlan
    ? {
        goals: input.carePlan.goals.map((g) => ({ text: g.text, status: g.status })),
        notes: input.carePlan.notes
          .filter((n) => inExportRange(n.atMs, input.range, nowMs))
          .sort((a, b) => a.atMs - b.atMs)
          .map((n) => ({ text: n.text, authorName: n.authorName, atMs: n.atMs })),
        updatedAtMs: input.carePlan.updatedAtMs,
      }
    : null;

  const screenings: ScreeningSummary[] = input.screeningStatuses.map((s) => ({
    type: s.rule.type,
    label: s.rule.label,
    state: s.state,
    overdue: s.overdue,
    lastCompletedAtMs: s.lastCompletedAtMs,
  }));

  const emptySections: string[] = [];
  if (vitals.length === 0) {
    emptySections.push('vitals');
  }
  if (medications.length === 0) {
    emptySections.push('medications');
  }
  if (screenings.length === 0) {
    emptySections.push('screenings');
  }
  if (!carePlan || (carePlan.goals.length === 0 && carePlan.notes.length === 0)) {
    emptySections.push('carePlan');
  }

  return {
    patientName: input.profile.displayName,
    patientId: input.profile.userId,
    generatedAtMs,
    range: input.range,
    locale: input.locale,
    vitals,
    vitalsByType,
    medications,
    adherenceLogs: [...input.adherenceLogs],
    screenings,
    carePlan,
    counts: {
      vitals: vitals.length,
      medications: medications.length,
      screeningsDue: screenings.filter((s) => s.state === 'due').length,
      carePlanGoals: carePlan?.goals.length ?? 0,
      carePlanNotes: carePlan?.notes.length ?? 0,
    },
    emptySections,
  };
}
