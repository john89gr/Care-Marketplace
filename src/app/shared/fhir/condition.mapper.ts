/**
 * Condition mapper: `MedicalCondition` → FHIR R4 `Condition`
 * (FEATURE_PLAN.md §21 subtask 14). The ICD-11 code (when curated) maps to
 * the WHO ICD-11 MMS system with the Greek display label; free-form codes
 * still map with the code in `display`.
 */
import type { MedicalCondition } from '../../features/health-record/history.models';
import { icd11ByCode } from '../../features/health-record/icd11';
import type { Annotation, CodeableConcept, Condition, Reference } from './fhir.types';

/** WHO ICD-11 MMS code system URI (mortality & morbidity statistics). */
export const ICD11_SYSTEM = 'http://id.who.int/icd/release/11/mms';

/** App condition status → FHIR Condition.clinicalStatus (chronic → active + category note). */
function clinicalStatusOf(status: MedicalCondition['status']): CodeableConcept {
  if (status === 'resolved') {
    return { text: 'resolved' };
  }
  // active | chronic are both ongoing clinical states in FHIR terms.
  return { text: 'active' };
}

/**
 * Map a `MedicalCondition` to a `Condition` resource.
 *
 * @throws when the condition is missing an id or name.
 */
export function toCondition(
  condition: MedicalCondition,
  subject: Reference,
  nowMs: number = Date.now()
): Condition {
  if (!condition || !condition.id || !condition.name) {
    throw new Error(
      `Cannot map Condition to FHIR: missing id or name (id=${(condition as { id?: string })?.id ?? '<none>'}).`
    );
  }

  const icd11 = condition.icd11Code ? icd11ByCode(condition.icd11Code) : null;
  const coding = condition.icd11Code
    ? [
        {
          system: ICD11_SYSTEM,
          code: condition.icd11Code,
          display: icd11?.labelEl ?? condition.icd11Code,
        },
      ]
    : undefined;

  const category: CodeableConcept[] = [];
  if (condition.status === 'chronic') {
    category.push({ text: 'chronic' });
  }

  const note: Annotation[] | undefined = condition.notes
    ? [{ text: condition.notes }]
    : undefined;

  return {
    resourceType: 'Condition',
    id: `condition-${condition.id}`,
    clinicalStatus: clinicalStatusOf(condition.status),
    category: category.length > 0 ? category : undefined,
    code: { text: condition.name, coding },
    subject,
    onsetDateTime: new Date(condition.diagnosedAtMs).toISOString(),
    recordedDate: new Date(condition.createdAtMs).toISOString().slice(0, 10),
    note,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}