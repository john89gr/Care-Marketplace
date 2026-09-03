/**
 * FHIR Bundle construction + the high-level export entry point (subtask 7, 9).
 *
 * `toBundle` is a low-level wrapper: given already-mapped FHIR resources it
 * returns a `collection` Bundle. `buildFhirBundle` is the orchestrator the UI
 * and the demo backend share: it maps a snapshot of the app domain models into
 * one validated, downloadable Bundle.
 */
import type { UserProfile } from '../../features/profiles/profile.store';
import type { VitalReading } from '../../features/health-record/vitals.store';
import type { Medication } from '../../features/health-record/medications.logic';
import type { CarePlan as DomainCarePlan } from '../../features/home-health/care-plan.store';
import type {
  Bundle,
  MappedResource,
  Reference,
  Patient,
  Observation,
  MedicationRequest,
  CarePlan as FhirCarePlan,
} from './fhir.types';
import { toPatient } from './patient.mapper';
import { toObservation } from './observation.mapper';
import { toMedicationRequest } from './medication.mapper';
import { toCarePlan } from './care-plan.mapper';
import { validateBundle, ValidationResult } from './validator';

/** Snapshot of the domain models the export needs (sourced from the stores). */
export interface FhirBundleInput {
  profile: UserProfile | null | undefined;
  readings: readonly VitalReading[];
  medications: readonly Medication[];
  carePlan: DomainCarePlan | null | undefined;
  /** Optional override of "now" for deterministic exports (meta.lastUpdated). */
  nowMs?: number;
}

/** A bundle ready for download + the determinstic patient id it was built for. */
export interface FhirExportResult {
  bundle: Bundle;
  patientId: string;
  validation: ValidationResult;
}

/** Build a `Patient/<id>` reference for a patient already mapped into the bundle. */
export function subjectReference(patientId: string): Reference {
  return { reference: `Patient/${patientId}` };
}

/** Wrap mapped resources in a FHIR `collection` Bundle (subtask 7). */
export function toBundle(
  resources: MappedResource[],
  nowMs: number = Date.now(),
  bundleId = 'bundle'
): Bundle {
  return {
    resourceType: 'Bundle',
    id: bundleId,
    type: 'collection',
    timestamp: new Date(nowMs).toISOString(),
    total: resources.length,
    entry: resources.map((resource) => ({
      fullUrl: `urn:uuid:${resource.id ?? ''}`,
      resource,
    })),
  };
}

/**
 * Build + validate a FHIR Bundle from the app domain snapshot (subtask 9
 * client fallback). The same function powers the demo `GET /me/fhir/bundle`
 * endpoint so server and client export stay consistent.
 */
export function buildFhirBundle(input: FhirBundleInput): FhirExportResult {
  const nowMs = input.nowMs ?? Date.now();
  const patient = toPatient(input.profile ?? null, nowMs);
  const subject = subjectReference(patient.id);

  const resources: MappedResource[] = [patient];
  resources.push(...input.readings.map((r) => toObservation(r, subject, nowMs)));
  resources.push(...input.medications.map((m) => toMedicationRequest(m, subject, nowMs)));
  if (input.carePlan) {
    resources.push(toCarePlan(input.carePlan, subject, nowMs));
  }

  const bundle = toBundle(resources, nowMs);
  const validation = validateBundle(bundle);
  return { bundle, patientId: patient.id, validation };
}
