/**
 * Immunization mapper: `Immunization` → FHIR R4 `Immunization`
 * (FEATURE_PLAN.md §21 subtask 14). Wallet-imported entries keep
 * `primarySource: false`; manually recorded ones are the primary source.
 */
import type { Immunization as DomainImmunization } from '../../features/health-record/history.models';
import type { Immunization as FhirImmunization, Reference } from './fhir.types';

/**
 * Map a domain `Immunization` to a FHIR `Immunization` resource.
 *
 * @throws when the immunization is missing an id or vaccine name.
 */
export function toImmunization(
  immunization: DomainImmunization,
  subject: Reference,
  nowMs: number = Date.now()
): FhirImmunization {
  if (!immunization || !immunization.id || !immunization.vaccine) {
    throw new Error(
      `Cannot map Immunization to FHIR: missing id or vaccine (id=${(immunization as { id?: string })?.id ?? '<none>'}).`
    );
  }

  return {
    resourceType: 'Immunization',
    id: `immunization-${immunization.id}`,
    status: 'completed',
    vaccineCode: { text: immunization.vaccine },
    subject,
    occurrenceDateTime: new Date(immunization.administeredAtMs).toISOString(),
    primarySource: immunization.source !== 'wallet',
    doseNumberPositiveInt: immunization.doseNumber,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}