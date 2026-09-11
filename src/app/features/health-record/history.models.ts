/**
 * Medical-history data contracts (FEATURE_PLAN.md §21 subtask 1, extended with
 * an ICD-11 Greek catalog — `icd11.ts` — and a Symptoms category). Pure types
 * in the codebase camelCase convention; the server row mappers mirror them.
 * Every record carries an `archived` soft-delete flag so history is never
 * hard-deleted (audit-friendly, mirrors §7 medication archive).
 */

export type HistoryKind =
  | 'conditions'
  | 'allergies'
  | 'immunizations'
  | 'events'
  | 'symptoms'
  | 'prescriptions';

// ---- Conditions (ICD-11 coded) ----

export type ConditionStatus = 'active' | 'chronic' | 'resolved';

export interface MedicalCondition {
  id: string;
  name: string;
  /** ICD-11 MMS code, curated subset with Greek labels (see icd11.ts). */
  icd11Code?: string;
  status: ConditionStatus;
  diagnosedAtMs: number;
  resolvedAtMs?: number | null;
  notes?: string;
  archived?: boolean;
  createdAtMs: number;
}

// ---- Allergies ----

export type AllergyKind = 'drug' | 'food' | 'environmental';
export type AllergySeverity = 'mild' | 'moderate' | 'severe';

export interface Allergy {
  id: string;
  substance: string;
  kind: AllergyKind;
  reaction?: string;
  severity: AllergySeverity;
  confirmedAtMs: number;
  notes?: string;
  archived?: boolean;
  createdAtMs: number;
}

// ---- Immunizations ----

export interface Immunization {
  id: string;
  vaccine: string;
  doseNumber?: number;
  administeredAtMs: number;
  /** `wallet` = imported from the Gov.gr Health Wallet (deduped upstream). */
  source: 'manual' | 'wallet';
  notes?: string;
  archived?: boolean;
  createdAtMs: number;
}

// ---- Events (procedures / hospitalizations / surgeries) ----

export type MedicalEventKind = 'procedure' | 'hospitalization' | 'surgery' | 'other';

export interface MedicalEvent {
  id: string;
  kind: MedicalEventKind;
  name: string;
  facility?: string;
  occurredAtMs: number;
  notes?: string;
  archived?: boolean;
  createdAtMs: number;
}

// ---- Symptoms ----

export type SymptomSeverity = 'mild' | 'moderate' | 'severe';
export type SymptomStatus = 'ongoing' | 'resolved';

export interface Symptom {
  id: string;
  name: string;
  severity: SymptomSeverity;
  onsetAtMs: number;
  status: SymptomStatus;
  notes?: string;
  archived?: boolean;
  createdAtMs: number;
}

// ---- Prescriptions register ----

export type PrescriptionStatus = 'active' | 'completed' | 'cancelled';

export interface PrescriptionRecord {
  id: string;
  drug: string;
  dose?: string;
  instructions?: string;
  prescriber?: string;
  issuedAtMs: number;
  durationDays?: number;
  status: PrescriptionStatus;
  /** Optional link to a scanned pharmacy prescription (§9). */
  pharmacyPrescriptionId?: string;
  /** Set when the register entry created a medication (§7 bridge). */
  medicationId?: string | null;
  archived?: boolean;
  createdAtMs: number;
}

/** Every history kind's row shape — union kept narrow for store generics. */
export type HistoryRecord =
  | MedicalCondition
  | Allergy
  | Immunization
  | MedicalEvent
  | Symptom
  | PrescriptionRecord;

// ---- Drafts (POST bodies; id/createdAtMs are server-assigned) ----

export type HistoryDraft<T extends HistoryRecord = HistoryRecord> = Omit<
  T,
  'id' | 'createdAtMs' | 'archived'
> &
  Partial<Pick<T, 'archived'>>;

export type ConditionDraft = Omit<MedicalCondition, 'id' | 'createdAtMs' | 'archived'>;
export type AllergyDraft = Omit<Allergy, 'id' | 'createdAtMs' | 'archived'>;
export type ImmunizationDraft = Omit<Immunization, 'id' | 'createdAtMs' | 'archived'>;
export type MedicalEventDraft = Omit<MedicalEvent, 'id' | 'createdAtMs' | 'archived'>;
export type SymptomDraft = Omit<Symptom, 'id' | 'createdAtMs' | 'archived'>;
export type PrescriptionDraft = Omit<PrescriptionRecord, 'id' | 'createdAtMs' | 'archived'>;

// ---- Bilingual enum labels (Greek primary, English fallback) ----

export interface BilingualLabel {
  el: string;
  en: string;
}

export const CONDITION_STATUS_LABELS: Record<ConditionStatus, BilingualLabel> = {
  active: { el: 'Ενεργή', en: 'Active' },
  chronic: { el: 'Χρόνια', en: 'Chronic' },
  resolved: { el: 'Υποχωρημένη', en: 'Resolved' },
};

export const ALLERGY_KIND_LABELS: Record<AllergyKind, BilingualLabel> = {
  drug: { el: 'Φάρμακο', en: 'Drug' },
  food: { el: 'Τρόφιμο', en: 'Food' },
  environmental: { el: 'Περιβαλλοντική', en: 'Environmental' },
};

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, BilingualLabel> = {
  mild: { el: 'Ήπια', en: 'Mild' },
  moderate: { el: 'Μέτρια', en: 'Moderate' },
  severe: { el: 'Σοβαρή', en: 'Severe' },
};

export const EVENT_KIND_LABELS: Record<MedicalEventKind, BilingualLabel> = {
  procedure: { el: 'Ιατρική πράξη', en: 'Procedure' },
  hospitalization: { el: 'Νοσηλεία', en: 'Hospitalization' },
  surgery: { el: 'Χειρουργική επέμβαση', en: 'Surgery' },
  other: { el: 'Άλλο', en: 'Other' },
};

export const SYMPTOM_SEVERITY_LABELS: Record<SymptomSeverity, BilingualLabel> = {
  mild: { el: 'Ήπιο', en: 'Mild' },
  moderate: { el: 'Μέτριο', en: 'Moderate' },
  severe: { el: 'Σοβαρό', en: 'Severe' },
};

export const SYMPTOM_STATUS_LABELS: Record<SymptomStatus, BilingualLabel> = {
  ongoing: { el: 'Σε εξέλιξη', en: 'Ongoing' },
  resolved: { el: 'Υποχώρησε', en: 'Resolved' },
};

export const PRESCRIPTION_STATUS_LABELS: Record<PrescriptionStatus, BilingualLabel> = {
  active: { el: 'Ενεργή', en: 'Active' },
  completed: { el: 'Ολοκληρωμένη', en: 'Completed' },
  cancelled: { el: 'Ακυρωμένη', en: 'Cancelled' },
};

export const HISTORY_KIND_LABELS: Record<HistoryKind, BilingualLabel> = {
  conditions: { el: 'Παθήσεις / Διαγνώσεις', en: 'Conditions / Diagnoses' },
  allergies: { el: 'Αλλεργίες', en: 'Allergies' },
  immunizations: { el: 'Εμβολιασμοί', en: 'Immunizations' },
  events: { el: 'Ιατρικά συμβάντα', en: 'Medical events' },
  symptoms: { el: 'Συμπτώματα', en: 'Symptoms' },
  prescriptions: { el: 'Συνταγές', en: 'Prescriptions' },
};

/** Greek label for an enum value (el default; en fallback for the i18n pass). */
export function historyLabel(
  map: Record<string, BilingualLabel>,
  key: string,
  locale: 'el' | 'en' = 'el'
): string {
  const entry = map[key];
  if (!entry) {
    return key;
  }
  return locale === 'el' ? entry.el : entry.en;
}

/**
 * Allergies that must never be missed: drug allergies and anything severe —
 * drives the persistent safety banner on the PHR dashboard and exports.
 */
export function safetyAllergies(allergies: readonly Allergy[]): Allergy[] {
  return allergies.filter((a) => !a.archived && (a.kind === 'drug' || a.severity === 'severe'));
}