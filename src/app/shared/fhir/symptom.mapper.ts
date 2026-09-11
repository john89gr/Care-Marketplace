/**
 * Symptom mapper: `Symptom` → FHIR R4 `Observation`
 * (FEATURE_PLAN.md §21 extension — FHIR has no dedicated Symptom resource, so
 * symptoms export as `exam`-category observations with the severity as the
 * value). The symptom name travels as the code `text` (free-form, no SNOMED
 * mapping in the curated scope).
 */
import type { Symptom } from '../../features/health-record/history.models';
import type { CodeableConcept, Observation, Reference } from './fhir.types';

/** Standard FHIR observation-category system (subtopic: exam). */
export const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

/**
 * Map a `Symptom` to an `Observation` resource.
 *
 * @throws when the symptom is missing an id or name.
 */
export function toSymptomObservation(
  symptom: Symptom,
  subject: Reference,
  nowMs: number = Date.now()
): Observation {
  if (!symptom || !symptom.id || !symptom.name) {
    throw new Error(
      `Cannot map Symptom to Observation: missing id or name (id=${(symptom as { id?: string })?.id ?? '<none>'}).`
    );
  }

  const category: CodeableConcept[] = [
    { text: 'symptom', coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: 'exam' }] },
  ];
  const note = symptom.notes ? [{ text: symptom.notes }] : undefined;

  return {
    resourceType: 'Observation',
    id: `symptom-${symptom.id}`,
    status: 'final',
    category,
    code: { text: symptom.name },
    subject,
    effectiveDateTime: new Date(symptom.onsetAtMs).toISOString(),
    valueCodeableConcept: { text: symptom.severity },
    note,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}