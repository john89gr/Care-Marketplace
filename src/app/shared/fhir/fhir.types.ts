/**
 * Minimal FHIR R4 resource types (FEATURE_PLAN.md §11 subtask 1).
 *
 * Only the fields exercised by the four mapped resources are modelled — the
 * full `fhir` package types are intentionally avoided to keep the bundle
 * small (subtask 19). These are structural types, so the mappers produce
 * plain JSON that serialises to a valid FHIR JSON document.
 */

/** Base of every FHIR resource. */
export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  /** Security/workflow labels carried on every resource. */
  tag?: Coding[];
  /** Extensions on the whole resource (kept but usually empty here). */
  extension?: Extension[];
  /** Language, e.g. "el" for Greek (subtask 9 i18n of exported fields). */
  language?: string;
}

export interface Meta {
  /** Version-specific identifier, bumped on writes (subtask 12). */
  versionId?: string;
  /** When the resource last changed (FHIR `instant`). */
  lastUpdated?: string;
  /** Logical id of the source system that owns the resource. */
  source?: string;
  /** Profiles/implementation guides this resource claims to conform to. */
  profile?: string[];
  /** Security labels (e.g. special-category health data) */
  security?: Coding[];
  /** General tags — classification, etc. */
  tag?: Coding[];
}

export interface Extension {
  url: string;
  valueString?: string;
  valueBase64Data?: string;
}

export interface Coding {
  system?: string;
  version?: string;
  code: string;
  display?: string;
  /** True if the system was chosen by the user, not the algorithm. */
  userSelected?: boolean;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Reference {
  reference?: string;
  display?: string;
  type?: string;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  /** Oid/URI of the system that assigns the identifier value. */
  system?: string;
  /** The identifier value itself — never the raw AMKA for Patient (subtask 14). */
  value?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Annotation {
  authorReference?: Reference;
  authorString?: string;
  time?: string;
  text: string;
}

export interface Quantity {
  value?: number;
  comparator?: '<' | '<=' | '>=' | '>';
  /** Human-readable unit, e.g. "mmHg". */
  unit?: string;
  /** System supplying the unit code, e.g. UCUM. */
  system?: string;
  /** Actual unit code from the system, e.g. "mm[Hg]". */
  code?: string;
}

export interface TimingRepeat {
  /** Number of `period` units between occurrences. */
  period?: number;
  periodUnit?: 's' | 'min' | 'h' | 'd' | 'wk' | 'mo' | 'a';
  /** Specific days of the week (for weekly schedules) */
  dayOfWeek?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
  /** Time(s) of day in HH:MM[:SS] (user-local, no timezone). */
  timeOfDay?: string[];
}

export interface Timing {
  repeat?: TimingRepeat;
  code?: CodeableConcept;
}

export type AdministrativeGender = 'male' | 'female' | 'other' | 'unknown';

export type ObservationStatus =
  | 'registered'
  | 'preliminary'
  | 'final'
  | 'amended'
  | 'corrected'
  | 'cancelled'
  | 'entered-in-error'
  | 'unknown';

export type MedicationRequestStatus =
  | 'active'
  | 'on-hold'
  | 'completed'
  | 'entered-in-error'
  | 'stopped'
  | 'draft'
  | 'unknown';

export type MedicationRequestIntent = 'order' | 'plan' | 'instance-order';

export type CarePlanStatus = 'active' | 'inactive' | 'revoked' | 'completed' | 'entered-in-error';

export type CarePlanIntent = 'proposal' | 'plan' | 'order' | 'option';

export type BundleType =
  | 'collection'
  | 'searchset'
  | 'transaction'
  | 'transaction-response'
  | 'batch'
  | 'batch-response'
  | 'history';

export interface HumanName {
  use?: 'usual' | 'official' | 'temp' | 'maiden' | 'old' | 'current' | 'nickname';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface ContactPoint {
  system?: 'phone' | 'email' | 'url' | 'address' | 'fax' | 'pager' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'mobile' | 'old';
  rank?: number;
}

// ---- Patient ----

/**
 * Emergency contact carried on the Patient (FHIR R4 `Patient.contact`).
 * Name + relationship + phone only — the ICE directory is never exported into
 * richer resources.
 */
export interface PatientContact {
  name?: HumanName;
  relationship?: CodeableConcept[];
  telecom?: ContactPoint[];
  gender?: AdministrativeGender;
  address?: Address;
}

export interface Patient extends FhirResource {
  resourceType: 'Patient';
  id: string;
  identifier?: Identifier[];
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: AdministrativeGender;
  birthDate?: string;
  address?: Address[];
  /** Emergency / ICE contacts (contact phone manager). */
  contact?: PatientContact[];
  active?: boolean;
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// ---- Observation ----

export interface ObservationComponent {
  code: CodeableConcept;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  interpretation?: CodeableConcept[];
}

export interface Observation extends FhirResource {
  resourceType: 'Observation';
  id: string;
  identifier?: Identifier[];
  status: ObservationStatus;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  component?: ObservationComponent[];
  /** Comments about the observation (e.g. symptom notes). */
  note?: Annotation[];
}

// ---- MedicationRequest ----

export interface Dosage {
  text?: string;
  additionalInstruction?: CodeableConcept[];
  timing?: Timing;
  route?: CodeableConcept;
  doseAndRate?: Array<unknown>;
}

export interface MedicationRequest extends FhirResource {
  resourceType: 'MedicationRequest';
  id: string;
  identifier?: Identifier[];
  status: MedicationRequestStatus;
  intent: MedicationRequestIntent;
  /** The choice field: a medication expressed as a codeable concept. */
  medicationCodeableConcept: CodeableConcept;
  subject?: Reference;
  /** When the prescription was authored (FHIR `dateTime`). */
  authoredOn?: string;
  dosageInstruction?: Dosage[];
  note?: Annotation[];
}

// ---- Condition (medical history §21) ----

export type ConditionClinicalStatus =
  | 'active'
  | 'recurrence'
  | 'relapse'
  | 'inactive'
  | 'remission'
  | 'resolved';

export interface Condition extends FhirResource {
  resourceType: 'Condition';
  id: string;
  /** active | inactive | resolved (archived maps to inactive). */
  clinicalStatus?: CodeableConcept;
  /** Category, e.g. the chronic flag as display text. */
  category?: CodeableConcept[];
  code?: CodeableConcept;
  subject?: Reference;
  /** When the condition was first diagnosed (FHIR `dateTime`). */
  onsetDateTime?: string;
  /** When it was recorded in this system (FHIR `dateTime`). */
  recordedDate?: string;
  note?: Annotation[];
}

// ---- AllergyIntolerance (medical history §21) ----

export type AllergyIntoleranceCategory = 'medication' | 'food' | 'environmental';
export type AllergyIntoleranceCriticality = 'low' | 'high' | 'unable-to-assess';
export type AllergyIntoleranceSeverity = 'mild' | 'moderate' | 'severe';

export interface AllergyIntoleranceReaction {
  /** Observed clinical symptoms (manifestation). */
  manifestation?: CodeableConcept[];
  severity?: AllergyIntoleranceSeverity;
}

export interface AllergyIntolerance extends FhirResource {
  resourceType: 'AllergyIntolerance';
  id: string;
  /** active | inactive | resolved (archived maps to inactive). */
  clinicalStatus?: CodeableConcept;
  category?: AllergyIntoleranceCategory[];
  code?: CodeableConcept;
  subject?: Reference;
  criticality?: AllergyIntoleranceCriticality;
  reaction?: AllergyIntoleranceReaction[];
  /** When the allergy was confirmed/recorded (FHIR `dateTime`). */
  recordedDate?: string;
  note?: Annotation[];
}

// ---- Immunization (medical history §21) ----

export type ImmunizationStatus = 'completed' | 'entered-in-error' | 'not-done';

export interface Immunization extends FhirResource {
  resourceType: 'Immunization';
  id: string;
  status: ImmunizationStatus;
  vaccineCode?: CodeableConcept;
  subject?: Reference;
  /** When the dose was administered (FHIR `dateTime`). */
  occurrenceDateTime?: string;
  /** True when the data comes from the citizen (not an imported wallet record). */
  primarySource?: boolean;
  doseNumberPositiveInt?: number;
}

// ---- CarePlan ----

export interface CarePlanGoal {
  /** Human-readable description of the goal. */
  description?: string;
  /** Lifecycle status of this goal. */
  status?: string;
  /** Outcome notes / category. */
  category?: CodeableConcept[];
  note?: Annotation[];
}

export interface CarePlanActivity {
  outcomeCode?: CodeableConcept[];
  progress?: Annotation[];
  /** The act of describing the activity. */
  detail?: CodeableConcept;
}

export interface CarePlan extends FhirResource {
  resourceType: 'CarePlan';
  id: string;
  status: CarePlanStatus;
  intent: CarePlanIntent;
  title?: string;
  description?: string;
  subject?: Reference;
  period?: Period;
  /** When the care plan was created/last reviewed. */
  created?: string;
  goal?: CarePlanGoal[];
  activity?: CarePlanActivity[];
  note?: Annotation[];
}

// ---- Bundle ----

export interface BundleLink {
  relation: string;
  url: string;
  type?: 'string' | 'ref';
}

export interface BundleEntry {
  fullUrl?: string;
  resource?: FhirResource;
  link?: BundleLink[];
  /** Only present in searchset/batch; omitted for `collection`. */
  search?: {
    mode?: 'match' | 'include' | 'outcome' | 'orphan';
    score?: number;
    lastUpdated?: string;
  };
}

export interface Bundle extends FhirResource {
  resourceType: 'Bundle';
  id: string;
  type: BundleType;
  timestamp?: string;
  total?: number;
  link?: BundleLink[];
  entry: BundleEntry[];
  /** The signature/signing resources (kept optional, usually empty). */
  signature?: Array<unknown>;
}

/** Any resource the bundle builder can map from the app domain models. */
export type MappedResource =
  | Patient
  | Observation
  | MedicationRequest
  | CarePlan
  | Condition
  | AllergyIntolerance
  | Immunization;
