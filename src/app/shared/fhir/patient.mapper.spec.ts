import { describe, expect, it } from 'vitest';
import { buildPatientContacts, toPatient } from './patient.mapper';
import type { MedicalContact } from '../../features/health-record/contacts.models';

/**
 * Patient mapper tests (FEATURE_PLAN.md §11 subtask 2 + contact phone manager):
 * profile → FHIR `Patient`, and emergency contacts → `Patient.contact[]`.
 */

const ice: MedicalContact = {
  id: 'ice-1',
  kind: 'emergency',
  name: 'Γιώργος Παπαδόπουλος',
  relationship: 'Σύζυγος',
  phone: '6970000001',
  address: 'Αθήνα',
  isPrimary: true,
  priority: 10,
  createdAtMs: 1,
};

const care: MedicalContact = { ...ice, id: 'care-1', kind: 'care', name: 'Δρ. Χ' };
const archived: MedicalContact = { ...ice, id: 'ice-old', archived: true };

describe('buildPatientContacts', () => {
  it('maps emergency contacts to Patient.contact and skips care/archived rows', () => {
    const contacts = buildPatientContacts([ice, care, archived]);
    expect(contacts).toHaveLength(1);
    expect(contacts?.[0].name?.text).toBe('Γιώργος Παπαδόπουλος');
    expect(contacts?.[0].relationship?.[0].text).toBe('Σύζυγος');
    expect(contacts?.[0].telecom?.[0]).toEqual({ system: 'phone', value: '6970000001' });
    expect(contacts?.[0].address?.text).toBe('Αθήνα');
  });

  it('returns undefined when there are no live emergency contacts', () => {
    expect(buildPatientContacts([])).toBeUndefined();
    expect(buildPatientContacts([care])).toBeUndefined();
    expect(buildPatientContacts(undefined)).toBeUndefined();
  });
});

describe('toPatient', () => {
  const profile = {
    userId: 'u-client',
    displayName: 'Maria Papadopoulou',
    phone: '6940000000',
    amka: '',
    afm: '',
    licenceNumber: '',
    hourlyRate: null,
    dateOfBirth: '',
    sex: '' as const,
  };

  it('attaches ICE contacts as Patient.contact', () => {
    const patient = toPatient(profile, 1_700_000_000_000, [ice]);
    expect(patient.contact).toHaveLength(1);
    expect(patient.contact?.[0].telecom?.[0].value).toBe('6970000001');
  });

  it('omits contact when no emergency contacts are provided', () => {
    expect(toPatient(profile, 0).contact).toBeUndefined();
  });
});
