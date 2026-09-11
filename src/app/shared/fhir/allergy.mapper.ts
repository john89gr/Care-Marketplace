/**
 * Allergy mapper: `Allergy` → FHIR R4 `AllergyIntolerance`
 * (FEATURE_PLAN.md §21 subtask 14). Drug allergies map to category
 * `medication`, severe ones to criticality `high`; archived allergies map to
 * clinicalStatus `inactive` (history preserved, no longer communicated).
 */
import type { Allergy } from '../../features/health-record/history.models';
import type {
  AllergyIntolerance,
  AllergyIntoleranceCategory,
  AllergyIntoleranceCriticality,
  CodeableConcept,
  Reference,
} from './fhir.types';

const CATEGORY_MAP: Record<Allergy['kind'], AllergyIntoleranceCategory> = {
  drug: 'medication',
  food: 'food',
  environmental: 'environmental',
};

/** Criticality: severe → high, everything else → low (mild/moderate). */
function criticalityOf(severity: Allergy['severity']): AllergyIntoleranceCriticality {
  return severity === 'severe' ? 'high' : 'low';
}

/**
 * Map an `Allergy` to an `AllergyIntolerance` resource.
 *
 * @throws when the allergy is missing an id or substance.
 */
export function toAllergyIntolerance(
  allergy: Allergy,
  subject: Reference,
  nowMs: number = Date.now()
): AllergyIntolerance {
  if (!allergy || !allergy.id || !allergy.substance) {
    throw new Error(
      `Cannot map Allergy to AllergyIntolerance: missing id or substance (id=${(allergy as { id?: string })?.id ?? '<none>'}).`
    );
  }

  const manifestation: CodeableConcept[] = allergy.reaction
    ? [{ text: allergy.reaction }]
    : [];
  const note =
    allergy.notes !== undefined && allergy.notes !== '' ? [{ text: allergy.notes }] : undefined;

  return {
    resourceType: 'AllergyIntolerance',
    id: `allergy-${allergy.id}`,
    clinicalStatus: { text: allergy.archived ? 'inactive' : 'active' },
    category: [CATEGORY_MAP[allergy.kind]],
    code: { text: allergy.substance },
    subject,
    criticality: criticalityOf(allergy.severity),
    reaction: manifestation.length > 0 ? [{ manifestation, severity: allergy.severity }] : undefined,
    recordedDate: new Date(allergy.confirmedAtMs).toISOString().slice(0, 10),
    note,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}