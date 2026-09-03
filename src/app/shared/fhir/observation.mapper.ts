/**
 * Observation mapper: `VitalReading` → FHIR R4 `Observation` (subtask 3).
 *
 * Each `VitalType` maps to a stable LOINC code via {@link OBSERVATION_LOINC}.
 * Blood pressure is the panel code (85354-9) with systolic/diastolic split into
 * FHIR `component`s; all other vitals map to a single `valueQuantity`.
 */
import type { VitalReading, VitalType } from '../../features/health-record/vitals.store';
import type { Observation, Quantity, Reference, CodeableConcept, ObservationComponent } from './fhir.types';

export const LOINC_SYSTEM = 'http://loinc.org';
export const UCUM_SYSTEM = 'http://unitsofmeasure.org';

/** Observation category for vital signs. */
export const VITAL_SIGNS_CATEGORY: CodeableConcept = {
  coding: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs',
    },
  ],
  text: 'Vital Signs',
};

export interface ObservationLoinc {
  /** LOINC code for the observation (or panel). */
  code: string;
  /** LOINC display for the code. */
  display: string;
  /** Human-readable unit, e.g. "mmHg". */
  unit: string;
  /** UCUM code, e.g. "mm[Hg]". */
  ucum: string;
  /** Component LOINC codes; only populated for blood pressure. */
  systolicLoinc?: string;
  systolicDisplay?: string;
  diastolicLoinc?: string;
  diastolicDisplay?: string;
}

/**
 * LOINC mapping per vital type. Typed as `Record<VitalType, …>` (with
 * `satisfies`) so the compiler rejects any missing/extra `VitalType` — this is
 * the compile-time exhaustiveness guard (subtask 4); a matching runtime check
 * lives in the spec.
 */
export const OBSERVATION_LOINC = {
  bloodPressure: {
    code: '85354-9',
    display: 'Blood pressure panel with all children optional',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    systolicLoinc: '8480-6',
    systolicDisplay: 'Systolic blood pressure',
    diastolicLoinc: '8462-4',
    diastolicDisplay: 'Diastolic blood pressure',
  },
  glucose: {
    code: '2339-0',
    display: 'Glucose [Mass/volume] in Serum or Plasma',
    unit: 'mg/dL',
    ucum: 'mg/dL',
  },
  spo2: {
    code: '5940-8',
    display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
    unit: '%',
    ucum: '%',
  },
  weight: {
    code: '29463-7',
    display: 'Body weight',
    unit: 'kg',
    ucum: 'kg',
  },
  temperature: {
    code: '8310-5',
    display: 'Body temperature',
    unit: '°C',
    ucum: 'Cel',
  },
  heartRate: {
    code: '8867-4',
    display: 'Heart rate',
    unit: 'bpm',
    ucum: '/min',
  },
} satisfies Record<VitalType, ObservationLoinc>;

/** Build a FHIR Quantity for a vital value + unit pair. */
function quantity(value: number, spec: ObservationLoinc): Quantity {
  return { value, unit: spec.unit, system: UCUM_SYSTEM, code: spec.ucum };
}

function codeable(code: string, display: string): CodeableConcept {
  return {
    coding: [{ system: LOINC_SYSTEM, code, display }],
    text: display,
  };
}

/**
 * Map a `VitalReading` to an `Observation`. Uses the LOINC code for the vital's
 * type; blood pressure reads use `component` (systolic/diastolic).
 *
 * @param reading    A vital reading (must have a `type` and a finite `value`).
 * @param subject    The FHIR `Patient` reference the observation belongs to.
 * @param nowMs      Fixed timestamp for deterministic `meta.lastUpdated`.
 * @throws when the reading is structurally invalid (subtask 16).
 */
export function toObservation(
  reading: VitalReading,
  subject: Reference,
  nowMs: number = Date.now()
): Observation {
  if (!reading || typeof reading.type !== 'string' || !(reading.type in OBSERVATION_LOINC)) {
    throw new Error(
      `Cannot map VitalReading to Observation: missing or unknown type (id=${(reading as { id?: string })?.id ?? '<none>'}).`
    );
  }
  if (!Number.isFinite(reading.value)) {
    throw new Error(
      `Cannot map VitalReading to Observation: missing or non-finite value (id=${reading.id}).`
    );
  }

  const spec = OBSERVATION_LOINC[reading.type as VitalType];
  const id = `obs-${reading.id}`;
  const base = {
    id,
    status: 'final' as const,
    category: [VITAL_SIGNS_CATEGORY],
    code: codeable(spec.code, spec.display),
    subject,
    effectiveDateTime: new Date(reading.measuredAtMs).toISOString(),
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };

  // Blood pressure: panel code with systolic/diastolic components.
  if (reading.type === 'bloodPressure') {
    const comp: ObservationComponent[] = [];
    if (reading.value2 == null) {
      throw new Error(
        `Cannot map blood-pressure VitalReading to Observation: missing diastolic value (id=${reading.id}).`
      );
    }
    comp.push({
      code: codeable(spec.systolicLoinc!, spec.systolicDisplay!),
      valueQuantity: quantity(reading.value, spec),
    });
    comp.push({
      code: codeable(spec.diastolicLoinc!, spec.diastolicDisplay!),
      valueQuantity: quantity(reading.value2, spec),
    });
    return { ...base, component: comp };
  }

  // Scalar vitals: valueQuantity holds the primary measurement.
  return { ...base, valueQuantity: quantity(reading.value, spec) };
}

/** The LOINC code for a vital type (used by the spec + golden fixtures). */
export function loincFor(type: VitalType): ObservationLoinc {
  return OBSERVATION_LOINC[type];
}
