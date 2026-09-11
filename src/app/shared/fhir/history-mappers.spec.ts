import { describe, expect, it } from 'vitest';
import { toCondition, ICD11_SYSTEM } from './condition.mapper';
import { toAllergyIntolerance } from './allergy.mapper';
import { toImmunization } from './immunization.mapper';
import { toSymptomObservation } from './symptom.mapper';
import { toMedicationRequestFromPrescription } from './prescription.mapper';
import { buildFhirBundle } from './bundle';
import { validateResource } from './validator';
import type { Reference } from './fhir.types';

/**
 * FHIR medical-history mapper golden fixtures (FEATURE_PLAN.md §21 subtask 14):
 * Condition (ICD-11 coded), AllergyIntolerance, Immunization, symptom
 * Observations and register MedicationRequests, plus bundle integration +
 * validator structural checks.
 */

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const subject: Reference = { reference: 'Patient/u-client' };

describe('toCondition', () => {
  it('maps a chronic ICD-11-coded condition with the Greek display label', () => {
    const resource = toCondition(
      {
        id: 'c-1',
        name: 'Υπέρταση',
        icd11Code: 'BA00',
        status: 'chronic',
        diagnosedAtMs: NOW - 3000 * 86400000,
        createdAtMs: NOW - 3000 * 86400000,
        notes: 'Υπό αγωγή',
      },
      subject,
      NOW
    );
    expect(resource.resourceType).toBe('Condition');
    expect(resource.id).toBe('condition-c-1');
    expect(resource.clinicalStatus?.text).toBe('active'); // chronic is not a FHIR clinical status
    expect(resource.category).toEqual([{ text: 'chronic' }]);
    expect(resource.code?.coding?.[0]).toEqual({
      system: ICD11_SYSTEM,
      code: 'BA00',
      display: 'Ιδιοπαθής υπέρταση',
    });
    expect(resource.onsetDateTime).toBe(new Date(NOW - 3000 * 86400000).toISOString());
    expect(resource.recordedDate).toBe(new Date(NOW - 3000 * 86400000).toISOString().slice(0, 10));
    expect(validateResource(resource).valid).toBe(true);
  });

  it('throws on a condition missing a name', () => {
    expect(() =>
      toCondition({ id: 'c-2', name: '', status: 'active', diagnosedAtMs: 1, createdAtMs: 1 } as never, subject, NOW)
    ).toThrow(/missing id or name/);
  });
});

describe('toAllergyIntolerance', () => {
  it('maps a severe drug allergy to high criticality + medication category', () => {
    const resource = toAllergyIntolerance(
      {
        id: 'a-1',
        substance: 'Πενικιλίνη',
        kind: 'drug',
        reaction: 'Κνίδωση',
        severity: 'severe',
        confirmedAtMs: NOW,
        createdAtMs: NOW,
      },
      subject,
      NOW
    );
    expect(resource.resourceType).toBe('AllergyIntolerance');
    expect(resource.category).toEqual(['medication']);
    expect(resource.criticality).toBe('high');
    expect(resource.clinicalStatus?.text).toBe('active');
    expect(resource.reaction).toEqual([
      { manifestation: [{ text: 'Κνίδωση' }], severity: 'severe' },
    ]);
    expect(validateResource(resource).valid).toBe(true);
  });

  it('marks archived allergies inactive and mild ones low criticality', () => {
    const resource = toAllergyIntolerance(
      {
        id: 'a-2',
        substance: 'Pollen',
        kind: 'environmental',
        severity: 'mild',
        confirmedAtMs: NOW,
        createdAtMs: NOW,
        archived: true,
      },
      subject,
      NOW
    );
    expect(resource.clinicalStatus?.text).toBe('inactive');
    expect(resource.criticality).toBe('low');
    expect(resource.category).toEqual(['environmental']);
  });
});

describe('toImmunization', () => {
  it('maps a manual immunization as primary source with dose number', () => {
    const resource = toImmunization(
      {
        id: 'i-1',
        vaccine: 'Γρίπη (εποχικό εμβόλιο)',
        doseNumber: 2,
        administeredAtMs: NOW,
        source: 'manual',
        createdAtMs: NOW,
      },
      subject,
      NOW
    );
    expect(resource.resourceType).toBe('Immunization');
    expect(resource.status).toBe('completed');
    expect(resource.vaccineCode?.text).toBe('Γρίπη (εποχικό εμβόλιο)');
    expect(resource.primarySource).toBe(true);
    expect(resource.doseNumberPositiveInt).toBe(2);
    expect(validateResource(resource).valid).toBe(true);
  });

  it('keeps wallet imports non-primary-source', () => {
    const resource = toImmunization(
      {
        id: 'i-2',
        vaccine: 'COVID-19',
        administeredAtMs: NOW,
        source: 'wallet',
        createdAtMs: NOW,
      },
      subject,
      NOW
    );
    expect(resource.primarySource).toBe(false);
  });
});

describe('toSymptomObservation', () => {
  it('maps a symptom to an exam-category Observation with severity as value', () => {
    const resource = toSymptomObservation(
      {
        id: 's-1',
        name: 'Πονοκέφαλος',
        severity: 'moderate',
        onsetAtMs: NOW,
        status: 'ongoing',
        createdAtMs: NOW,
      },
      subject,
      NOW
    );
    expect(resource.resourceType).toBe('Observation');
    expect(resource.status).toBe('final');
    expect(resource.category?.[0].coding?.[0]?.code).toBe('exam');
    expect(resource.code?.text).toBe('Πονοκέφαλος');
    expect(resource.valueCodeableConcept?.text).toBe('moderate');
    expect(validateResource(resource).valid).toBe(true);
  });
});

describe('toMedicationRequestFromPrescription', () => {
  it('maps status + instructions, reusing the MedicationRequest shape', () => {
    const resource = toMedicationRequestFromPrescription(
      {
        id: 'rx-1',
        drug: 'Ατορβαστατίνη',
        dose: '20mg',
        instructions: 'Ένα δισκίο το βράδυ.',
        prescriber: 'Δρ. Παπαδόπουλος',
        issuedAtMs: NOW,
        status: 'active',
        createdAtMs: NOW,
      },
      subject,
      NOW
    );
    expect(resource.resourceType).toBe('MedicationRequest');
    expect(resource.id).toBe('medreq-rx-rx-1');
    expect(resource.status).toBe('active');
    expect(resource.intent).toBe('order');
    expect(resource.medicationCodeableConcept.text).toBe('Ατορβαστατίνη 20mg');
    expect(resource.dosageInstruction?.[0].text).toBe('Ένα δισκίο το βράδυ.');
    expect(resource.note?.[0].authorString).toBe('Δρ. Παπαδόπουλος');
  });

  it('maps cancelled to stopped and completed to completed', () => {
    const base = {
      drug: 'X',
      issuedAtMs: NOW,
      createdAtMs: NOW,
    };
    expect(toMedicationRequestFromPrescription({ ...base, id: 'a', status: 'cancelled' }, subject, NOW).status).toBe('stopped');
    expect(toMedicationRequestFromPrescription({ ...base, id: 'b', status: 'completed' }, subject, NOW).status).toBe('completed');
  });
});

describe('buildFhirBundle (history integration)', () => {
  it('includes every history category, archived records excluded, and validates', () => {
    const nowMs = NOW;
    const result = buildFhirBundle({
      profile: { userId: 'u-client', displayName: 'Maria Papadopoulou', sex: 'female', dateOfBirth: '1968-03-14' } as never,
      readings: [],
      medications: [],
      carePlan: null,
      conditions: [
        { id: 'c-1', name: 'Υπέρταση', icd11Code: 'BA00', status: 'chronic', diagnosedAtMs: NOW, createdAtMs: NOW },
      ],
      allergies: [
        { id: 'a-1', substance: 'Πενικιλίνη', kind: 'drug', severity: 'severe', confirmedAtMs: NOW, createdAtMs: NOW },
        { id: 'a-arch', substance: 'Old', kind: 'food', severity: 'mild', confirmedAtMs: NOW, createdAtMs: NOW, archived: true },
      ],
      immunizations: [
        { id: 'i-1', vaccine: 'Γρίπη', administeredAtMs: NOW, source: 'manual', createdAtMs: NOW },
      ],
      symptoms: [
        { id: 's-1', name: 'Πονοκέφαλος', severity: 'moderate', onsetAtMs: NOW, status: 'ongoing', createdAtMs: NOW },
      ],
      prescriptions: [
        { id: 'rx-1', drug: 'Ατορβαστατίνη', status: 'active', issuedAtMs: NOW, createdAtMs: NOW },
      ],
      nowMs,
    });

    expect(result.validation.valid).toBe(true);
    const types = result.bundle.entry.map((e) => e.resource?.resourceType);
    // Patient + 1 Condition + 1 AllergyIntolerance (archived excluded) +
    // 1 Immunization + 1 Observation (symptom) + 1 MedicationRequest (register).
    expect(types.filter((t) => t === 'Condition')).toHaveLength(1);
    expect(types.filter((t) => t === 'AllergyIntolerance')).toHaveLength(1);
    expect(types.filter((t) => t === 'Immunization')).toHaveLength(1);
    expect(types.filter((t) => t === 'Observation')).toHaveLength(1);
    expect(types.filter((t) => t === 'MedicationRequest')).toHaveLength(1);
    expect(result.bundle.entry).toHaveLength(6);
    // Reference integrity: every subject reference resolves to the patient.
    expect(result.validation.errors).toEqual([]);
  });
});