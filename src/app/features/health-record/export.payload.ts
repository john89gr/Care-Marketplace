/**
 * Health-summary payload composition (FEATURE_PLAN.md §10 subtask 3).
 * Pure functions: profile basics + vitals trends + meds + screenings +
 * care-plan snapshot, with range filtering and explicit empty sections.
 */
import type { VitalReading } from './vitals.store';
import type { AdherenceLog, Medication } from './medications.logic';
import type { ScreeningStatus } from './screening.rules';
import type { CarePlan } from '../home-health/care-plan.store';
import type {
  Allergy,
  Immunization,
  MedicalCondition,
  MedicalEvent,
  PrescriptionRecord,
  Symptom,
} from './history.models';
import { safetyAllergies } from './history.models';
import type { MedicalContact } from './contacts.models';
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
  /** Medical-history register (FEATURE_PLAN.md §21 subtask 13). */
  conditions?: readonly MedicalCondition[];
  allergies?: readonly Allergy[];
  immunizations?: readonly Immunization[];
  events?: readonly MedicalEvent[];
  symptoms?: readonly Symptom[];
  prescriptions?: readonly PrescriptionRecord[];
  /** Emergency / ICE contacts (contact phone manager). */
  emergencyContacts?: readonly MedicalContact[];
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
  /** Medical-history register (snapshot — point-in-time records, not range-filtered). */
  conditions: MedicalCondition[];
  allergies: Allergy[];
  immunizations: Immunization[];
  events: MedicalEvent[];
  symptoms: Symptom[];
  prescriptions: PrescriptionRecord[];
  /** Emergency / ICE contacts — printed near the top of the export. */
  emergencyContacts: MedicalContact[];
  /** Drug / severe allergies — always printed near the top of the export (§21 subtask 9). */
  safetyAllergies: Allergy[];
  counts: {
    vitals: number;
    medications: number;
    screeningsDue: number;
    carePlanGoals: number;
    carePlanNotes: number;
    conditions: number;
    allergies: number;
    immunizations: number;
    events: number;
    symptoms: number;
    prescriptions: number;
    emergencyContacts: number;
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

  // History is a snapshot: point-in-time records are never range-filtered
  // (a 30-day summary still lists every chronic diagnosis). Archived records
  // stay out of the physician-facing document (their audit trail remains).
  const conditions = (input.conditions ?? []).filter((c) => !c.archived);
  const allergies = (input.allergies ?? []).filter((a) => !a.archived);
  const immunizations = (input.immunizations ?? []).filter((i) => !i.archived);
  const events = (input.events ?? []).filter((e) => !e.archived);
  const symptoms = (input.symptoms ?? []).filter((s) => !s.archived);
  const prescriptions = (input.prescriptions ?? []).filter((p) => !p.archived);
  // Emergency contacts are archived-filtered like every other section.
  const emergencyContacts = (input.emergencyContacts ?? []).filter((c) => !c.archived);

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
  if (conditions.length === 0) emptySections.push('conditions');
  if (allergies.length === 0) emptySections.push('allergies');
  if (immunizations.length === 0) emptySections.push('immunizations');
  if (events.length === 0) emptySections.push('events');
  if (symptoms.length === 0) emptySections.push('symptoms');
  if (prescriptions.length === 0) emptySections.push('prescriptions');
  if (emergencyContacts.length === 0) emptySections.push('emergencyContacts');

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
    conditions,
    allergies,
    immunizations,
    events,
    symptoms,
    prescriptions,
    emergencyContacts,
    safetyAllergies: safetyAllergies(allergies),
    counts: {
      vitals: vitals.length,
      medications: medications.length,
      screeningsDue: screenings.filter((s) => s.state === 'due').length,
      carePlanGoals: carePlan?.goals.length ?? 0,
      carePlanNotes: carePlan?.notes.length ?? 0,
      conditions: conditions.length,
      allergies: allergies.length,
      immunizations: immunizations.length,
      events: events.length,
      symptoms: symptoms.length,
      prescriptions: prescriptions.length,
      emergencyContacts: emergencyContacts.length,
    },
    emptySections,
  };
}
