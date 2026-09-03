/**
 * MedicationRequest mapper: `Medication` → FHIR R4 `MedicationRequest` (subtask 5).
 *
 * The schedule is translated into a FHIR `Timing`/`Dosage`; archived medications
 * map to `status: completed` (their history stays available for audit).
 */
import type { Medication, MedicationSchedule } from '../../features/health-record/medications.logic';
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
        text: `${text} — ${dosage.text}`,
        timing: dosage.dosage.timing,
      },
    ],
    note: prescriberNote(med.prescriber),
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}

/** A codeable concept summarising a medication (name + dose). */
export function medicationSummary(med: Medication): CodeableConcept {
  const text = `${med.name}${med.dose ? ` ${med.dose}` : ''}`.trim();
  return { text, coding: [{ system: MEDICATION_CODE_SYSTEM, code: med.id, display: med.name }] };
}
