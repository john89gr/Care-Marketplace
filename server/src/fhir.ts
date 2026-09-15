import { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth } from './auth';
import { logAuditEvent } from './audit';

/**
 * Standard Greek AMKA OID in HL7 / FHIR.
 * urn:oid:2.16.840.1.113883.2.25.1
 */
export const AMKA_SYSTEM = 'urn:oid:2.16.840.1.113883.2.25.1';
export const AFM_SYSTEM = 'urn:oid:2.16.840.1.113883.2.25.2';
export const PATIENT_ID_SYSTEM = 'https://care-marketplace.example/patient';
export const MEDICATION_CODE_SYSTEM = 'https://care-marketplace.example/medication';

export const LOINC_SYSTEM = 'http://loinc.org';
export const UCUM_SYSTEM = 'http://unitsofmeasure.org';
export const OBSERVATION_CATEGORY_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/observation-category';

export interface ObservationLoincSpec {
  code: string;
  display: string;
  unit: string;
  ucum: string;
  systolicLoinc?: string;
  diastolicLoinc?: string;
}

/** Standard LOINC mapping per vital type. */
export const LOINC_CODES: Record<string, ObservationLoincSpec> = {
  bloodPressure: {
    code: '85354-9',
    display: 'Blood pressure panel with all children optional',
    unit: 'mmHg',
    ucum: 'mm[Hg]',
    systolicLoinc: '8480-6',
    diastolicLoinc: '8462-4',
  },
  heartRate: {
    code: '8867-4',
    display: 'Heart rate',
    unit: '/min',
    ucum: '/min',
  },
  glucose: {
    code: '2339-0',
    display: 'Glucose [Mass/volume] in Blood',
    unit: 'mg/dL',
    ucum: 'mg/dL',
  },
  spo2: {
    code: '59408-5',
    display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
    unit: '%',
    ucum: '%',
  },
  weight: {
    code: '29463-7',
    display: 'Body weight',
    unit: 'kg',
    ucum: 'kg',
  },
  temperature: {
    code: '8310-5',
    display: 'Body temperature',
    unit: 'Cel',
    ucum: 'Cel',
  },
};

/** Convert minutes from midnight to HH:MM format. */
export function timeOfDay(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

const WEEKDAY_TO_FHIR: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

/** Split display name into given and family components. */
export function splitName(displayName: string): { family: string; given: string[]; text: string } {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) {
    return { family: '', given: [], text: '' };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { family: parts[0], given: [parts[0]], text: trimmed };
  }
  const family = parts[parts.length - 1];
  const given = parts.slice(0, parts.length - 1);
  return { family, given, text: trimmed };
}

/** Map app gender/sex string to FHIR administrative gender. */
export function mapGender(sex: unknown): 'male' | 'female' | 'other' | 'unknown' {
  const s = String(sex ?? '').toLowerCase().trim();
  if (s === 'female') return 'female';
  if (s === 'male') return 'male';
  if (s === 'other') return 'other';
  return 'unknown';
}

/** Map care goal status to FHIR goal lifecycle status. */
export function mapGoalStatus(status: unknown): string {
  switch (String(status)) {
    case 'open':
      return 'planned';
    case 'in-progress':
      return 'in-progress';
    case 'done':
      return 'achieved';
    default:
      return 'planned';
  }
}

/** Map schedule to FHIR timing structure. */
export function timingFromSchedule(schedule: any): any {
  if (!schedule || typeof schedule !== 'object') {
    return undefined;
  }
  if (schedule.kind === 'daily') {
    const times = (schedule.timesMinutes ?? []).slice().sort((a: number, b: number) => a - b);
    return {
      repeat: {
        period: 1,
        periodUnit: 'd',
        timeOfDay: times.map(timeOfDay),
      },
    };
  }
  if (schedule.kind === 'interval') {
    return {
      repeat: {
        period: Number(schedule.everyDays) || 1,
        periodUnit: 'd',
        timeOfDay: [timeOfDay(schedule.timeMinutes ?? 0)],
      },
    };
  }
  if (schedule.kind === 'weekly') {
    const days = (schedule.weekdays ?? []).slice().sort((a: number, b: number) => a - b);
    return {
      repeat: {
        period: 1,
        periodUnit: 'wk',
        timeOfDay: [timeOfDay(schedule.timeMinutes ?? 0)],
        dayOfWeek: days.map((d: number) => WEEKDAY_TO_FHIR[d] ?? 'mon'),
      },
    };
  }
  return undefined;
}

export interface FhirExportPayload {
  user: Row;
  profile: Row | null;
  vitals: Row[];
  medications: Row[];
  carePlans: Array<Row & { goals: Row[]; notes: Row[] }>;
  conditions: Row[];
  allergies: Row[];
  immunizations: Row[];
  events: Row[];
  symptoms: Row[];
  prescriptionRecords: Row[];
  iceContacts: Row[];
  bundleType?: 'document' | 'collection';
  nowMs?: number;
}

/**
 * Pure mapping orchestrator: maps all domain models to a valid HL7 FHIR R4 Bundle.
 */
export function mapDomainToFhirBundle(payload: FhirExportPayload): any {
  const {
    user,
    profile,
    vitals,
    medications,
    carePlans,
    conditions,
    allergies,
    immunizations,
    events,
    symptoms,
    prescriptionRecords,
    iceContacts,
    bundleType = 'document',
    nowMs = Date.now(),
  } = payload;

  const patientId = `patient-${user.id}`;
  const subjectRef = { reference: `Patient/${patientId}` };
  const lastUpdated = new Date(nowMs).toISOString();

  // 1. Patient Resource
  const identifiers: any[] = [];
  if (profile?.amka) {
    identifiers.push({
      use: 'official',
      system: AMKA_SYSTEM,
      value: String(profile.amka),
    });
  }
  if (profile?.afm) {
    identifiers.push({
      use: 'secondary',
      system: AFM_SYSTEM,
      value: String(profile.afm),
    });
  }
  identifiers.push({
    use: 'usual',
    system: PATIENT_ID_SYSTEM,
    value: String(user.id),
  });

  const parsedName = splitName(String(user.display_name ?? ''));
  const telecom: any[] = [];
  if (profile?.phone) {
    telecom.push({
      system: 'phone',
      value: String(profile.phone),
      use: 'mobile',
    });
  }
  if (user.email) {
    telecom.push({
      system: 'email',
      value: String(user.email),
      use: 'home',
    });
  }

  const patientContacts = iceContacts.map((c) => {
    const cName = splitName(String(c.name ?? ''));
    return {
      relationship: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
              code: 'C',
              display: 'Emergency Contact',
            },
          ],
          text: c.relationship ? String(c.relationship) : 'Emergency Contact',
        },
      ],
      name: {
        text: cName.text,
        family: cName.family,
        given: cName.given,
      },
      telecom: [
        { system: 'phone', value: String(c.phone), use: 'mobile' },
        ...(c.email ? [{ system: 'email', value: String(c.email) }] : []),
      ],
      address: c.address ? { text: String(c.address) } : undefined,
    };
  });

  const patientResource: any = {
    resourceType: 'Patient',
    id: patientId,
    meta: { lastUpdated },
    identifier: identifiers,
    name: [
      {
        use: 'official',
        text: parsedName.text,
        family: parsedName.family,
        given: parsedName.given,
      },
    ],
    telecom: telecom.length > 0 ? telecom : undefined,
    gender: mapGender(profile?.sex),
    birthDate: profile?.date_of_birth ? String(profile.date_of_birth) : undefined,
    address: profile?.address
      ? [
          {
            use: 'home',
            text: String(profile.address),
            line: [String(profile.address)],
          },
        ]
      : undefined,
    contact: patientContacts.length > 0 ? patientContacts : undefined,
    active: true,
  };

  const resources: any[] = [patientResource];

  // 2. Observations for Vitals
  for (const vital of vitals) {
    const typeKey = String(vital.type);
    const spec = LOINC_CODES[typeKey] ?? {
      code: '8867-4',
      display: typeKey,
      unit: '',
      ucum: '',
    };
    const effectiveDateTime = new Date(Number(vital.measured_at_ms)).toISOString();

    if (typeKey === 'bloodPressure') {
      const components: any[] = [
        {
          code: {
            coding: [
              {
                system: LOINC_SYSTEM,
                code: spec.systolicLoinc ?? '8480-6',
                display: 'Systolic blood pressure',
              },
            ],
            text: 'Systolic blood pressure',
          },
          valueQuantity: {
            value: Number(vital.value),
            unit: 'mmHg',
            system: UCUM_SYSTEM,
            code: 'mm[Hg]',
          },
        },
      ];
      if (vital.value2 != null) {
        components.push({
          code: {
            coding: [
              {
                system: LOINC_SYSTEM,
                code: spec.diastolicLoinc ?? '8462-4',
                display: 'Diastolic blood pressure',
              },
            ],
            text: 'Diastolic blood pressure',
          },
          valueQuantity: {
            value: Number(vital.value2),
            unit: 'mmHg',
            system: UCUM_SYSTEM,
            code: 'mm[Hg]',
          },
        });
      }
      resources.push({
        resourceType: 'Observation',
        id: `obs-${vital.id}`,
        meta: { lastUpdated },
        status: 'final',
        category: [
          {
            coding: [
              {
                system: OBSERVATION_CATEGORY_SYSTEM,
                code: 'vital-signs',
                display: 'Vital Signs',
              },
            ],
            text: 'vital-signs',
          },
        ],
        code: {
          coding: [
            {
              system: LOINC_SYSTEM,
              code: spec.code,
              display: spec.display,
            },
          ],
          text: spec.display,
        },
        subject: subjectRef,
        effectiveDateTime,
        component: components,
      });
    } else {
      resources.push({
        resourceType: 'Observation',
        id: `obs-${vital.id}`,
        meta: { lastUpdated },
        status: 'final',
        category: [
          {
            coding: [
              {
                system: OBSERVATION_CATEGORY_SYSTEM,
                code: 'vital-signs',
                display: 'Vital Signs',
              },
            ],
            text: 'vital-signs',
          },
        ],
        code: {
          coding: [
            {
              system: LOINC_SYSTEM,
              code: spec.code,
              display: spec.display,
            },
          ],
          text: spec.display,
        },
        subject: subjectRef,
        effectiveDateTime,
        valueQuantity: {
          value: Number(vital.value),
          unit: spec.unit,
          system: UCUM_SYSTEM,
          code: spec.ucum,
        },
      });
    }
  }

  // 3. MedicationRequest Resources
  for (const med of medications) {
    const schedule =
      typeof med.schedule === 'string'
        ? JSON.parse(med.schedule)
        : (med.schedule ?? { kind: 'daily', timesMinutes: [] });
    const instructions =
      typeof med.instructions === 'string'
        ? JSON.parse(med.instructions)
        : (med.instructions ?? null);

    const drugText = `${med.name}${med.dose ? ` ${med.dose}` : ''}`.trim();
    let dosageText = drugText;
    if (schedule.kind === 'daily' && schedule.timesMinutes?.length) {
      dosageText += ` — Daily at ${schedule.timesMinutes.map(timeOfDay).join(', ')}`;
    } else if (schedule.kind === 'interval') {
      dosageText += ` — Every ${schedule.everyDays} day(s)`;
    } else if (schedule.kind === 'weekly') {
      dosageText += ` — Weekly`;
    }

    const notes: any[] = [];
    if (med.prescriber) {
      notes.push({ text: `Prescriber: ${med.prescriber}` });
    }
    if (instructions?.warnings?.length) {
      notes.push({ text: `Warnings: ${instructions.warnings.join(', ')}` });
    }
    if (instructions?.sideEffects) {
      notes.push({ text: `Side effects: ${instructions.sideEffects}` });
    }
    if (instructions?.storage) {
      notes.push({ text: `Storage: ${instructions.storage}` });
    }
    if (instructions?.specialInstructions) {
      notes.push({ text: `Special instructions: ${instructions.specialInstructions}` });
    }

    resources.push({
      resourceType: 'MedicationRequest',
      id: `medreq-${med.id}`,
      meta: { lastUpdated },
      status: med.archived ? 'stopped' : 'active',
      intent: 'plan',
      medicationCodeableConcept: {
        text: drugText,
        coding: [
          {
            system: MEDICATION_CODE_SYSTEM,
            code: String(med.id),
            display: String(med.name),
          },
        ],
      },
      subject: subjectRef,
      authoredOn: new Date(Number(med.created_at_ms)).toISOString(),
      requester: med.prescriber ? { display: String(med.prescriber) } : undefined,
      dosageInstruction: [
        {
          text: dosageText,
          timing: timingFromSchedule(schedule),
          route: instructions?.route
            ? {
                text: String(instructions.route),
                coding: [
                  {
                    system: 'http://snomed.info/sct',
                    code: instructions.route === 'oral' ? '260548002' : '78421000',
                    display: String(instructions.route),
                  },
                ],
              }
            : undefined,
          additionalInstruction: instructions?.foodRelation
            ? [
                {
                  text: `Take ${instructions.foodRelation} food`,
                },
              ]
            : undefined,
        },
      ],
      note: notes.length > 0 ? notes : undefined,
    });
  }

  // 4. CarePlan Resource + Goal references
  for (const plan of carePlans) {
    const goals = plan.goals || [];
    const notes = plan.notes || [];

    // Add referenced Goal resources to the bundle
    for (const g of goals) {
      resources.push({
        resourceType: 'Goal',
        id: `goal-${g.id}`,
        meta: { lastUpdated },
        lifecycleStatus:
          g.status === 'done' ? 'completed' : g.status === 'in-progress' ? 'active' : 'proposed',
        description: { text: String(g.text) },
        subject: subjectRef,
      });
    }

    resources.push({
      resourceType: 'CarePlan',
      id: `careplan-${plan.id}`,
      meta: { lastUpdated },
      status: 'active',
      intent: 'plan',
      title: `Shared care plan — ${plan.client_name}`,
      subject: subjectRef,
      period: {
        start: new Date(Number(plan.updated_at_ms)).toISOString(),
      },
      created: new Date(Number(plan.updated_at_ms)).toISOString(),
      goal: goals.map((g: Row) => ({
        reference: `Goal/goal-${g.id}`,
        display: String(g.text),
        description: String(g.text),
        status: mapGoalStatus(g.status),
      })),
      activity: goals.map((g: Row) => ({
        detail: {
          description: String(g.text),
          status:
            g.status === 'done'
              ? 'completed'
              : g.status === 'in-progress'
                ? 'in-progress'
                : 'not-started',
          code: { text: String(g.text) },
        },
        progress: [{ text: `Goal status: ${g.status}` }],
      })),
      note: notes.map((n: Row) => ({
        authorString: `${n.author_name}${n.author_role ? ` (${n.author_role})` : ''}`,
        time: new Date(Number(n.at_ms)).toISOString(),
        text: String(n.text),
      })),
    });
  }

  // 5. AllergyIntolerance Resources
  for (const allergy of allergies) {
    const manifestation = allergy.reaction ? [{ text: String(allergy.reaction) }] : [];
    const criticality = allergy.severity === 'severe' ? 'high' : 'low';

    resources.push({
      resourceType: 'AllergyIntolerance',
      id: `allergy-${allergy.id}`,
      meta: { lastUpdated },
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: allergy.archived ? 'inactive' : 'active',
            display: allergy.archived ? 'Inactive' : 'Active',
          },
        ],
        text: allergy.archived ? 'inactive' : 'active',
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
        text: 'confirmed',
      },
      type: 'allergy',
      category: [
        allergy.kind === 'drug'
          ? 'medication'
          : allergy.kind === 'food'
            ? 'food'
            : 'environmental',
      ],
      criticality,
      code: {
        text: String(allergy.substance),
      },
      substance: {
        text: String(allergy.substance),
      },
      subject: subjectRef,
      reaction:
        manifestation.length > 0
          ? [
              {
                manifestation,
                severity: String(allergy.severity),
              },
            ]
          : undefined,
      recordedDate: new Date(Number(allergy.confirmed_at_ms)).toISOString(),
      note: allergy.notes ? [{ text: String(allergy.notes) }] : undefined,
    });
  }

  // 6. Condition Resources
  for (const cond of conditions) {
    const isResolved = cond.status === 'resolved';
    const icdCode = cond.icd11_code ? String(cond.icd11_code).trim() : '';

    resources.push({
      resourceType: 'Condition',
      id: `condition-${cond.id}`,
      meta: { lastUpdated },
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: isResolved ? 'resolved' : 'active',
            display: isResolved ? 'Resolved' : 'Active',
          },
        ],
        text: isResolved ? 'resolved' : 'active',
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
        text: 'confirmed',
      },
      category:
        cond.status === 'chronic'
          ? [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                    code: 'chronic',
                    display: 'Chronic',
                  },
                ],
                text: 'chronic',
              },
            ]
          : undefined,
      code: {
        coding: icdCode
          ? [
              {
                system: 'http://id.who.int/icd/release/11/mms',
                code: icdCode,
                display: String(cond.name),
              },
            ]
          : undefined,
        text: String(cond.name),
      },
      subject: subjectRef,
      onsetDateTime: new Date(Number(cond.diagnosed_at_ms)).toISOString(),
      recordedDate: new Date(Number(cond.created_at_ms)).toISOString().slice(0, 10),
      note: cond.notes ? [{ text: String(cond.notes) }] : undefined,
    });
  }

  // 7. Immunization Resources
  for (const im of immunizations) {
    resources.push({
      resourceType: 'Immunization',
      id: `immunization-${im.id}`,
      meta: { lastUpdated },
      status: 'completed',
      vaccineCode: {
        text: String(im.vaccine),
      },
      subject: subjectRef,
      occurrenceDateTime: new Date(Number(im.administered_at_ms)).toISOString(),
      primarySource: im.source !== 'wallet',
      doseNumberPositiveInt: Number(im.dose_number) || 1,
      note: im.notes ? [{ text: String(im.notes) }] : undefined,
    });
  }

  // 8. Procedure Resources (Medical events)
  for (const ev of events) {
    resources.push({
      resourceType: 'Procedure',
      id: `procedure-${ev.id}`,
      meta: { lastUpdated },
      status: 'completed',
      category: {
        text: String(ev.kind),
      },
      code: {
        text: String(ev.name),
      },
      subject: subjectRef,
      performedDateTime: new Date(Number(ev.occurred_at_ms)).toISOString(),
      location: ev.facility ? { display: String(ev.facility) } : undefined,
      note: ev.notes ? [{ text: String(ev.notes) }] : undefined,
    });
  }

  // 9. Symptom Observations
  for (const sym of symptoms) {
    resources.push({
      resourceType: 'Observation',
      id: `symptom-${sym.id}`,
      meta: { lastUpdated },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: OBSERVATION_CATEGORY_SYSTEM,
              code: 'exam',
            },
          ],
          text: 'symptom',
        },
      ],
      code: { text: String(sym.name) },
      subject: subjectRef,
      effectiveDateTime: new Date(Number(sym.onset_at_ms)).toISOString(),
      valueCodeableConcept: { text: String(sym.severity) },
      note: sym.notes ? [{ text: String(sym.notes) }] : undefined,
    });
  }

  // 10. Prescription Register records (as additional MedicationRequests if not already mapped)
  for (const rx of prescriptionRecords) {
    const rxText = `${rx.drug}${rx.dose ? ` ${rx.dose}` : ''}`.trim();
    resources.push({
      resourceType: 'MedicationRequest',
      id: `medreq-rx-${rx.id}`,
      meta: { lastUpdated },
      status: rx.status === 'cancelled' ? 'stopped' : rx.status === 'completed' ? 'completed' : 'active',
      intent: 'plan',
      medicationCodeableConcept: {
        text: rxText,
        coding: [
          {
            system: MEDICATION_CODE_SYSTEM,
            code: `rx-${rx.id}`,
            display: String(rx.drug),
          },
        ],
      },
      subject: subjectRef,
      authoredOn: new Date(Number(rx.issued_at_ms)).toISOString(),
      requester: rx.prescriber ? { display: String(rx.prescriber) } : undefined,
      dosageInstruction: rx.instructions ? [{ text: String(rx.instructions) }] : undefined,
      note: rx.prescriber ? [{ text: `Prescriber: ${rx.prescriber}` }] : undefined,
    });
  }

  // Assemble FHIR Bundle
  const bundleId = `bundle-${randomBytes(6).toString('hex')}`;
  return {
    resourceType: 'Bundle',
    id: bundleId,
    type: bundleType,
    timestamp: new Date(nowMs).toISOString(),
    total: resources.length,
    entry: resources.map((res) => ({
      fullUrl: `urn:uuid:${res.id}`,
      resource: res,
    })),
  };
}

export const fhirRouter = Router();

/**
 * GET /api/me/fhir/export (and alias /api/me/fhir/bundle)
 * Returns the authenticated user's Personal Health Record as an HL7 FHIR R4 Bundle.
 */
async function handleFhirExport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const me = req.user as AuthedUser;
    const userId = me.userId;

    // 1. Fetch user account
    const user = await queryOne<Row>(
      `SELECT id, display_name, email, roles, created_at_ms FROM user_accounts WHERE id = $1`,
      [userId]
    );
    if (!user) {
      res.status(404).json({ message: 'User account not found.' });
      return;
    }

    // 2. Fetch profile
    const profile = await queryOne<Row>(
      `SELECT user_id, phone, amka, afm, licence_number, hourly_rate, address, date_of_birth, sex FROM profiles WHERE user_id = $1`,
      [userId]
    );

    // 3. Fetch vitals
    const vitals = await query<Row>(
      `SELECT id, type, value, value2, measured_at_ms, source FROM vitals WHERE user_id = $1 ORDER BY measured_at_ms DESC`,
      [userId]
    );

    // 4. Fetch medications (active and archived)
    const medications = await query<Row>(
      `SELECT id, name, dose, schedule, critical, prescriber, instructions, prescription_id, archived, created_at_ms
       FROM medications WHERE user_id = $1 ORDER BY created_at_ms DESC`,
      [userId]
    );

    // 5. Fetch care plans + goals + notes
    const carePlans = await query<Row>(
      `SELECT id, client_id, client_name, updated_at_ms, updated_by FROM care_plans WHERE client_id = $1`,
      [userId]
    );
    const carePlansWithDetails = await Promise.all(
      carePlans.map(async (cp) => {
        const goals = await query<Row>(
          `SELECT id, plan_id, text, status FROM care_plan_goals WHERE plan_id = $1 ORDER BY id ASC`,
          [cp.id]
        );
        const notes = await query<Row>(
          `SELECT id, plan_id, author_id, author_name, author_role, text, at_ms FROM care_plan_notes WHERE plan_id = $1 ORDER BY at_ms DESC`,
          [cp.id]
        );
        return { ...cp, goals, notes };
      })
    );

    // 6. Fetch medical conditions, allergies, immunizations, events, symptoms, prescription records
    const conditions = await query<Row>(
      `SELECT id, name, icd11_code, status, diagnosed_at_ms, resolved_at_ms, notes, archived, created_at_ms
       FROM medical_conditions WHERE user_id = $1 AND archived = FALSE ORDER BY diagnosed_at_ms DESC`,
      [userId]
    );
    const allergies = await query<Row>(
      `SELECT id, substance, kind, reaction, severity, confirmed_at_ms, notes, archived, created_at_ms
       FROM allergies WHERE user_id = $1 AND archived = FALSE ORDER BY confirmed_at_ms DESC`,
      [userId]
    );
    const immunizations = await query<Row>(
      `SELECT id, vaccine, dose_number, administered_at_ms, source, notes, archived, created_at_ms
       FROM immunizations WHERE user_id = $1 AND archived = FALSE ORDER BY administered_at_ms DESC`,
      [userId]
    );
    const events = await query<Row>(
      `SELECT id, kind, name, facility, occurred_at_ms, notes, archived, created_at_ms
       FROM medical_events WHERE user_id = $1 AND archived = FALSE ORDER BY occurred_at_ms DESC`,
      [userId]
    );
    const symptoms = await query<Row>(
      `SELECT id, name, severity, onset_at_ms, status, notes, archived, created_at_ms
       FROM symptoms WHERE user_id = $1 AND archived = FALSE ORDER BY onset_at_ms DESC`,
      [userId]
    );
    const prescriptionRecords = await query<Row>(
      `SELECT id, drug, dose, instructions, prescriber, issued_at_ms, duration_days, status, archived, created_at_ms
       FROM prescription_records WHERE user_id = $1 AND archived = FALSE ORDER BY issued_at_ms DESC`,
      [userId]
    );

    // 7. Primary ICE contacts
    const allIceContacts = await query<Row>(
      `SELECT id, kind, name, relationship, phone, alt_phone, email, address, notes, is_primary, priority
       FROM medical_contacts WHERE user_id = $1 AND kind = 'emergency' AND archived = FALSE
       ORDER BY is_primary DESC, priority DESC`,
      [userId]
    );
    const primaryOnly = allIceContacts.filter((c) => c.is_primary);
    const iceContacts = primaryOnly.length > 0 ? primaryOnly : allIceContacts;

    const bundleType = req.query.type === 'collection' ? 'collection' : 'document';

    const bundle = mapDomainToFhirBundle({
      user,
      profile,
      vitals,
      medications,
      carePlans: carePlansWithDetails,
      conditions,
      allergies,
      immunizations,
      events,
      symptoms,
      prescriptionRecords,
      iceContacts,
      bundleType,
    });

    // Audit log this export (FEATURE_PLAN.md §16)
    try {
      await logAuditEvent(userId, 'fhir_export', 'Bundle', bundle.id, {
        entryCount: bundle.total,
        bundleType: bundle.type,
      });
    } catch {
      // Best-effort audit logging
    }

    res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
    res.status(200).json(bundle);
  } catch (error) {
    next(error);
  }
}

fhirRouter.get('/me/fhir/export', requireAuth, handleFhirExport);
fhirRouter.get('/me/fhir/bundle', requireAuth, handleFhirExport);
