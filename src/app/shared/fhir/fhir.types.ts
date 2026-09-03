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

export interface Patient extends FhirResource {
  resourceType: 'Patient';
  id: string;
  identifier?: Identifier[];
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: AdministrativeGender;
  birthDate?: string;
  address?: Address[];
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

/** Any of the four mapped resources. */
export type MappedResource = Patient | Observation | MedicationRequest | CarePlan;
