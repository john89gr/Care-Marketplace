/**
 * MedicationRequest mapper: `Medication` → FHIR R4 `MedicationRequest` (subtask 5).
 *
 * The schedule is translated into a FHIR `Timing`/`Dosage`; archived medications
 * map to `status: completed` (their history stays available for audit).
 *
 * The structured medicine-instructions sheet is surfaced on the dosage
 * (`text`, `route`, `additionalInstruction` for food relation / max daily
 * doses) and on the request's free-text `note` (warnings, side effects,
 * storage, special instructions) together with the prescriber note.
 */
import type { Medication, MedicationSchedule } from '../../features/health-record/medications.logic';
import {
  FOOD_RELATION_LABELS,
  MEDICINE_ROUTE_LABELS,
  MedicineInstructions,
  hasInstructions,
  medicineLabel,
  normalizeInstructions,
} from '../../features/health-record/medicine.info';
import type {
  MedicationRequest,
  Dosage,
  Reference,
  CodeableConcept,
  Annotation,
  TimingRepeat,
} from './fhir.types';

/** System for the care-marketplace's own medication identifier (no RxNorm here). */
export const MEDICATION_CODE_SYSTEM = 'https://care-marketplace.example/medication';

function instantISO(ms: number): string {
  return new Date(ms).toISOString();
}

/** Convert minutes-from-midnight to HH:MM (user-local time-of-day). */
function timeOfDay(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const WEEKDAY_TO_FHIR: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

/** Build a human-readable dosage text + FHIR timing from a schedule. */
function dosageFromSchedule(schedule: MedicationSchedule): { dosage: Dosage; text: string } {
  if (schedule.kind === 'daily') {
    const times = (schedule.timesMinutes ?? []).slice().sort((a, b) => a - b);
    const repeat: TimingRepeat = {
      period: 1,
      periodUnit: 'd',
      timeOfDay: times.map(timeOfDay),
    };
    return {
      dosage: { text: `Daily at ${times.map(timeOfDay).join(', ')}`, timing: { repeat } },
      text: `daily ${times.map(timeOfDay).join(', ')}`,
    };
  }

  if (schedule.kind === 'interval') {
    const t = timeOfDay(schedule.timeMinutes);
    const repeat: TimingRepeat = {
      period: schedule.everyDays,
      periodUnit: 'd',
      timeOfDay: [t],
    };
    return {
      dosage: { text: `Every ${schedule.everyDays} day(s) at ${t}`, timing: { repeat } },
      text: `every ${schedule.everyDays}d at ${t}`,
    };
  }

  if (schedule.kind === 'weekly') {
    const days = schedule.weekdays.slice().sort((a, b) => a - b);
    const repeat: TimingRepeat = {
      period: 1,
      periodUnit: 'wk',
      timeOfDay: [timeOfDay(schedule.timeMinutes)],
      dayOfWeek: days.map((d) => WEEKDAY_TO_FHIR[d] ?? 'mon'),
    };
    return {
      dosage: {
        text: `Weekly on ${days.map((d) => WEEKDAY_TO_FHIR[d] ?? 'mon').join(', ')} at ${timeOfDay(schedule.timeMinutes)}`,
        timing: { repeat },
      },
      text: `weekly on ${days.map((d) => WEEKDAY_TO_FHIR[d] ?? 'mon').join(', ')}`,
    };
  }

  // Unreachable given MedicationSchedule's union is exhaustive; satisfies the compiler.
  const exhaustive: never = schedule;
  throw new Error(`Unknown medication schedule kind: ${(exhaustive as { kind: string }).kind}`);
}

/** Map a prescriber string into an Annotation note (if present). */
function prescriberNote(prescriber: string | undefined): Annotation[] | undefined {
  if (!prescriber) {
    return undefined;
  }
  return [{ authorString: prescriber, text: `Prescriber: ${prescriber}` }];
}

/**
 * The medication's saved instruction sheet when it actually carries
 * information, else null. The curated catalog suggestion is deliberately
 * never exported: it is a UI convenience, not part of the medical record
 * (the PDF export applies the same rule).
 */
function savedInstructions(med: Medication): MedicineInstructions | null {
  if (!med.instructions) {
    return null;
  }
  const normalized = normalizeInstructions(med.instructions);
  return hasInstructions(normalized) ? normalized : null;
}

/**
 * One-line "how to take it" suffix for the dosage text. Scaffolding labels are
 * English (like the rest of the generated FHIR text) while the medication's
 * own free-text fields stay verbatim.
 */
function howToTake(instructions: MedicineInstructions): string {
  const parts: string[] = [];
  if (instructions.doseForm) {
    parts.push(instructions.doseForm);
  }
  if (instructions.route) {
    parts.push(medicineLabel(MEDICINE_ROUTE_LABELS, instructions.route, 'en'));
  }
  if (instructions.foodRelation !== 'any') {
    parts.push(medicineLabel(FOOD_RELATION_LABELS, instructions.foodRelation, 'en'));
  }
  if ((instructions.maxDailyDoses ?? null) !== null) {
    parts.push(`max ${instructions.maxDailyDoses}/day`);
  }
  return parts.join('; ');
}

/** `dosage.route` from the sheet's route (text-only; no terminology server). */
function instructionsRoute(instructions: MedicineInstructions): CodeableConcept | undefined {
  return instructions.route
    ? { text: medicineLabel(MEDICINE_ROUTE_LABELS, instructions.route, 'en') }
    : undefined;
}

/** Food relation + max daily doses as `dosage.additionalInstruction`. */
function additionalInstructions(
  instructions: MedicineInstructions
): CodeableConcept[] | undefined {
  const out: CodeableConcept[] = [];
  if (instructions.foodRelation !== 'any') {
    out.push({ text: medicineLabel(FOOD_RELATION_LABELS, instructions.foodRelation, 'en') });
  }
  if ((instructions.maxDailyDoses ?? null) !== null) {
    out.push({ text: `Up to ${instructions.maxDailyDoses} dose(s) per day` });
  }
  return out.length > 0 ? out : undefined;
}

/** Warnings, side effects, storage and special instructions as free-text notes. */
function instructionsNotes(instructions: MedicineInstructions): Annotation[] {
  const notes: Annotation[] = instructions.warnings.map((w) => ({ text: `Warning: ${w}` }));
  if (instructions.sideEffects) {
    notes.push({ text: `Possible side effects: ${instructions.sideEffects}` });
  }
  if (instructions.storage) {
    notes.push({ text: `Storage: ${instructions.storage}` });
  }
  if (instructions.specialInstructions) {
    notes.push({ text: `Special instructions: ${instructions.specialInstructions}` });
  }
  return notes;
}

/** Merge note lists, returning undefined when there is nothing to say. */
function mergeNotes(...lists: (Annotation[] | undefined)[]): Annotation[] | undefined {
  const merged = lists.flatMap((list) => list ?? []);
  return merged.length > 0 ? merged : undefined;
}

/**
 * Map a `Medication` to a `MedicationRequest` resource.
 *
 * @throws when the medication is missing an id or name (subtask 16-equivalent).
 */
export function toMedicationRequest(
  med: Medication,
  subject: Reference,
  nowMs: number = Date.now()
): MedicationRequest {
  if (!med || !med.id || !med.name) {
    throw new Error(
      `Cannot map Medication to MedicationRequest: missing id or name (id=${(med as { id?: string })?.id ?? '<none>'}).`
    );
  }

  const dosage = dosageFromSchedule(med.schedule);
  const text = `${med.name}${med.dose ? ` ${med.dose}` : ''}`.trim();
  const instructions = savedInstructions(med);
  const howTo = instructions ? howToTake(instructions) : '';

  return {
    resourceType: 'MedicationRequest',
    id: `medreq-${med.id}`,
    status: med.archived ? 'completed' : 'active',
    intent: 'order',
    medicationCodeableConcept: {
      text,
      coding: [{ system: MEDICATION_CODE_SYSTEM, code: med.id, display: med.name }],
    },
    subject,
    authoredOn: new Date(med.createdAtMs).toISOString(),
    dosageInstruction: [
      {
        text: howTo ? `${text} — ${dosage.text} — ${howTo}` : `${text} — ${dosage.text}`,
        timing: dosage.dosage.timing,
        route: instructions ? instructionsRoute(instructions) : undefined,
        additionalInstruction: instructions ? additionalInstructions(instructions) : undefined,
      },
    ],
    note: mergeNotes(
      prescriberNote(med.prescriber),
      instructions ? instructionsNotes(instructions) : undefined
    ),
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}

/** A codeable concept summarising a medication (name + dose). */
export function medicationSummary(med: Medication): CodeableConcept {
  const text = `${med.name}${med.dose ? ` ${med.dose}` : ''}`.trim();
  return { text, coding: [{ system: MEDICATION_CODE_SYSTEM, code: med.id, display: med.name }] };
}
