/**
 * Prescription-register mapper: `PrescriptionRecord` → FHIR R4
 * `MedicationRequest` (FEATURE_PLAN.md §21 subtask 14 — the register entries
 * reuse the same MedicationRequest shape as the §7 medication list; the
 * register carries no schedule, so `dosageInstruction` keeps the free-text
 * instructions only).
 *
 * A bridged prescription's structured instruction sheet lives on the created
 * `Medication`, which is exported as its own MedicationRequest (see
 * `medication.mapper.ts`) — so the sheet is never duplicated onto the
 * register entry, and no catalog suggestion is invented here.
 */
import type { PrescriptionRecord } from '../../features/health-record/history.models';
import type { MedicationRequest, Reference } from './fhir.types';
import { MEDICATION_CODE_SYSTEM } from './medication.mapper';

/** App prescription status → FHIR MedicationRequest.status. */
function statusOf(status: PrescriptionRecord['status']): MedicationRequest['status'] {
  switch (status) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'stopped';
  }
}

/**
 * Map a prescriptions-register entry to a `MedicationRequest` resource.
 *
 * @throws when the prescription is missing an id or drug name.
 */
export function toMedicationRequestFromPrescription(
  rx: PrescriptionRecord,
  subject: Reference,
  nowMs: number = Date.now()
): MedicationRequest {
  if (!rx || !rx.id || !rx.drug) {
    throw new Error(
      `Cannot map PrescriptionRecord to MedicationRequest: missing id or drug (id=${(rx as { id?: string })?.id ?? '<none>'}).`
    );
  }

  const text = `${rx.drug}${rx.dose ? ` ${rx.dose}` : ''}`.trim();
  const note =
    rx.prescriber !== undefined && rx.prescriber !== ''
      ? [{ authorString: rx.prescriber, text: `Prescriber: ${rx.prescriber}` }]
      : undefined;

  return {
    resourceType: 'MedicationRequest',
    id: `medreq-rx-${rx.id}`,
    status: statusOf(rx.status),
    intent: 'order',
    medicationCodeableConcept: {
      text,
      coding: [{ system: MEDICATION_CODE_SYSTEM, code: `rx-${rx.id}`, display: rx.drug }],
    },
    subject,
    authoredOn: new Date(rx.issuedAtMs).toISOString(),
    dosageInstruction:
      rx.instructions !== undefined && rx.instructions !== ''
        ? [{ text: rx.instructions }]
        : undefined,
    note,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };
}