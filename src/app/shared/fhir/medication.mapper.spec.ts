import { describe, expect, it } from 'vitest';
import { toMedicationRequest, MEDICATION_CODE_SYSTEM } from './medication.mapper';
import { buildFhirBundle } from './bundle';
import { validateResource } from './validator';
import type { Medication } from '../../features/health-record/medications.logic';
import type { MedicineInstructions } from '../../features/health-record/medicine.info';
import type { MedicationRequest, Reference } from './fhir.types';

/**
 * Medication mapper tests (FEATURE_PLAN.md §11 subtask 5 + medicine
 * instructions manager): schedule → FHIR `Timing`/`Dosage`, and the saved
 * instruction sheet surfaced on the dosage (`route`, `additionalInstruction`)
 * and the free-text `note`. The curated catalog suggestion is never exported.
 */

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const subject: Reference = { reference: 'Patient/u-client' };

const SHEET: MedicineInstructions = {
  doseForm: 'Δισκίο',
  route: 'oral',
  foodRelation: 'after',
  maxDailyDoses: 3,
  warnings: ['Αποφύγετε τον χυμό γκρέιπφρουτ.', 'Αναφέρετε ανεξήγητο μυϊκό πόνο.'],
  sideEffects: 'Μυϊκός πόνος, κεφαλαλγία.',
  storage: 'Σε ξηρό, δροσερό μέρος.',
  specialInstructions: 'Λαμβάνεται το βράδυ, την ίδια ώρα.',
};

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    name: 'Atorvastatin',
    dose: '20 mg',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    critical: false,
    createdAtMs: NOW - 1000,
    ...overrides,
  };
}

describe('toMedicationRequest', () => {
  it('maps the schedule to a timing and omits instruction fields when there is no sheet', () => {
    const resource = toMedicationRequest(med(), subject, NOW);
    expect(resource.resourceType).toBe('MedicationRequest');
    expect(resource.id).toBe('medreq-med-1');
    expect(resource.status).toBe('active');
    expect(resource.medicationCodeableConcept).toEqual({
      text: 'Atorvastatin 20 mg',
      coding: [{ system: MEDICATION_CODE_SYSTEM, code: 'med-1', display: 'Atorvastatin' }],
    });
    expect(resource.dosageInstruction?.[0].text).toBe('Atorvastatin 20 mg — daily 08:00, 20:00');
    expect(resource.dosageInstruction?.[0].timing?.repeat).toEqual({
      period: 1,
      periodUnit: 'd',
      timeOfDay: ['08:00', '20:00'],
    });
    expect(resource.dosageInstruction?.[0].route).toBeUndefined();
    expect(resource.dosageInstruction?.[0].additionalInstruction).toBeUndefined();
    expect(resource.note).toBeUndefined();
    expect(validateResource(resource).valid).toBe(true);
  });

  it('archives to completed and keeps the prescriber note', () => {
    const resource = toMedicationRequest(
      med({ archived: true, prescriber: 'Dr. Stavrou' }),
      subject,
      NOW
    );
    expect(resource.status).toBe('completed');
    expect(resource.note).toEqual([
      { authorString: 'Dr. Stavrou', text: 'Prescriber: Dr. Stavrou' },
    ]);
  });

  it('surfaces the saved sheet on the dosage and the note', () => {
    const resource = toMedicationRequest(
      med({ prescriber: 'Dr. Stavrou', instructions: SHEET }),
      subject,
      NOW
    );

    const dosage = resource.dosageInstruction?.[0];
    expect(dosage?.text).toBe(
      'Atorvastatin 20 mg — daily 08:00, 20:00 — Δισκίο; By mouth; After food; max 3/day'
    );
    expect(dosage?.timing?.repeat).toEqual({ period: 1, periodUnit: 'd', timeOfDay: ['08:00', '20:00'] });
    expect(dosage?.route).toEqual({ text: 'By mouth' });
    expect(dosage?.additionalInstruction).toEqual([
      { text: 'After food' },
      { text: 'Up to 3 dose(s) per day' },
    ]);

    // Prescriber first, then the sheet's free-text fields, verbatim.
    expect(resource.note).toEqual([
      { authorString: 'Dr. Stavrou', text: 'Prescriber: Dr. Stavrou' },
      { text: 'Warning: Αποφύγετε τον χυμό γκρέιπφρουτ.' },
      { text: 'Warning: Αναφέρετε ανεξήγητο μυϊκό πόνο.' },
      { text: 'Possible side effects: Μυϊκός πόνος, κεφαλαλγία.' },
      { text: 'Storage: Σε ξηρό, δροσερό μέρος.' },
      { text: 'Special instructions: Λαμβάνεται το βράδυ, την ίδια ώρα.' },
    ]);
    expect(validateResource(resource).valid).toBe(true);
  });

  it('treats a sheet with nothing meaningful as absent', () => {
    const resource = toMedicationRequest(
      med({
        instructions: {
          doseForm: '',
          route: 'oral',
          foodRelation: 'any',
          maxDailyDoses: null,
          warnings: [],
          sideEffects: '',
          storage: '',
          specialInstructions: '',
        },
      }),
      subject,
      NOW
    );
    expect(resource.dosageInstruction?.[0].text).toBe('Atorvastatin 20 mg — daily 08:00, 20:00');
    expect(resource.dosageInstruction?.[0].route).toBeUndefined();
    expect(resource.note).toBeUndefined();
  });

  it('never exports the catalog suggestion as if it were the record', () => {
    // The catalog has Atorvastatin (with warnings), but with no saved sheet the
    // resource must stay free of invented clinical text.
    const resource = toMedicationRequest(med({ name: 'Atorvastatin' }), subject, NOW);
    expect(JSON.stringify(resource)).not.toContain('Warning:');
    expect(resource.dosageInstruction?.[0].additionalInstruction).toBeUndefined();
  });

  it('throws without an id or name', () => {
    expect(() => toMedicationRequest(med({ id: '' }), subject, NOW)).toThrow(/missing id or name/);
    expect(() => toMedicationRequest(med({ name: '' }), subject, NOW)).toThrow(/missing id or name/);
  });
});

describe('buildFhirBundle (medication instructions integration)', () => {
  it('exports the sheet on the bundle MedicationRequest and still validates', () => {
    const result = buildFhirBundle({
      profile: {
        userId: 'u-client',
        displayName: 'Maria Papadopoulou',
        sex: 'female',
        dateOfBirth: '1968-03-14',
      } as never,
      readings: [],
      medications: [med({ instructions: SHEET })],
      carePlan: null,
      nowMs: NOW,
    });

    expect(result.validation.valid).toBe(true);
    const request = result.bundle.entry
      .map((entry) => entry.resource)
      .find((resource): resource is MedicationRequest => resource?.resourceType === 'MedicationRequest');
    expect(request).toBeDefined();
    expect(request?.dosageInstruction?.[0].route).toEqual({ text: 'By mouth' });
    expect(request?.note?.[0].text).toBe('Warning: Αποφύγετε τον χυμό γκρέιπφρουτ.');
  });
});
