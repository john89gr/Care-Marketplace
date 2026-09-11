import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  composeHealthSummary,
  HealthSummaryInput,
} from './export.payload';
import {
  EXPORT_LABELS,
  exportFilename,
  inExportRange,
  rangeCutoffMs,
  rangeLabel,
} from './export.types';
import type { VitalReading } from './vitals.store';
import type { ScreeningStatus } from './screening.rules';
import { SCREENING_RULES } from './screening.rules';
import type { CarePlan } from '../home-health/care-plan.store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

const reading = (daysAgo: number, value = 120): VitalReading => ({
  id: `r-${daysAgo}`,
  type: 'bloodPressure',
  value,
  value2: 80,
  measuredAtMs: NOW - daysAgo * DAY,
  source: 'manual',
});

const cardioStatus = (state: ScreeningStatus['state'] = 'due'): ScreeningStatus => ({
  rule: SCREENING_RULES.find((r) => r.type === 'cardioCheck')!,
  state,
  age: 58,
  lastCompletedAtMs: null,
  dueAtMs: null,
  overdue: state === 'due',
});

const plan: CarePlan = {
  id: 'cp-1',
  clientId: 'u-client',
  clientName: 'Maria Papadopoulou',
  goals: [{ id: 'g-1', text: 'Walk daily', status: 'open' }],
  notes: [
    {
      id: 'n-old',
      authorId: 'u-nurse',
      authorName: 'Elena',
      authorRole: 'nurse',
      text: 'Old note',
      atMs: NOW - 200 * DAY,
    },
    {
      id: 'n-new',
      authorId: 'u-nurse',
      authorName: 'Elena',
      authorRole: 'nurse',
      text: 'Recent note',
      atMs: NOW - 5 * DAY,
    },
  ],
  updatedAtMs: NOW - 5 * DAY,
  updatedBy: 'Elena',
};

function baseInput(overrides: Partial<HealthSummaryInput> = {}): HealthSummaryInput {
  return {
    profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
    readings: [reading(5), reading(40), reading(400)],
    medications: [
      {
        id: 'med-1',
        name: 'Insulin glargine',
        dose: '10 units',
        schedule: { kind: 'daily', timesMinutes: [480] },
        critical: true,
        createdAtMs: NOW - 300 * DAY,
      },
    ],
    adherenceLogs: [],
    screeningStatuses: [cardioStatus()],
    carePlan: plan,
    range: 30,
    locale: 'en',
    ...overrides,
  };
}

describe('composeHealthSummary', () => {
  it('filters vitals by range (30 days keeps only recent)', () => {
    const payload = composeHealthSummary(baseInput({ range: 30 }), NOW);
    expect(payload.vitals.map((r) => r.id)).toEqual(['r-5']);
    expect(payload.counts.vitals).toBe(1);
  });

  it('keeps the full history for range "all"', () => {
    const payload = composeHealthSummary(baseInput({ range: 'all' }), NOW);
    expect(payload.vitals).toHaveLength(3);
    // Oldest → newest (trend order).
    expect(payload.vitals.map((r) => r.id)).toEqual(['r-400', 'r-40', 'r-5']);
  });

  it('groups vitals by type', () => {
    const payload = composeHealthSummary(baseInput({ range: 'all' }), NOW);
    expect(Object.keys(payload.vitalsByType)).toEqual(['bloodPressure']);
    expect(payload.vitalsByType['bloodPressure']).toHaveLength(3);
  });

  it('filters care-plan notes by range but keeps goals as a snapshot', () => {
    const payload = composeHealthSummary(baseInput({ range: 30 }), NOW);
    expect(payload.carePlan?.notes.map((n) => n.text)).toEqual(['Recent note']);
    expect(payload.carePlan?.goals).toHaveLength(1);
  });

  it('excludes archived medications from the physician snapshot', () => {
    const payload = composeHealthSummary(
      baseInput({
        medications: [
          ...baseInput().medications,
          {
            id: 'med-old',
            name: 'Old med',
            dose: '5 mg',
            schedule: { kind: 'daily', timesMinutes: [540] },
            critical: false,
            archived: true,
            createdAtMs: NOW - 300 * DAY,
          },
        ],
      }),
      NOW
    );
    expect(payload.medications.map((m) => m.id)).toEqual(['med-1']);
  });

  it('reports empty sections explicitly', () => {
    const payload = composeHealthSummary(
      baseInput({ readings: [], medications: [], screeningStatuses: [], carePlan: null }),
      NOW
    );
    expect(payload.emptySections.sort()).toEqual(
      [
        'carePlan',
        'medications',
        'screenings',
        'vitals',
        'conditions',
        'allergies',
        'immunizations',
        'events',
        'symptoms',
        'prescriptions',
        'emergencyContacts',
      ].sort()
    );
    expect(payload.counts).toEqual({
      vitals: 0,
      medications: 0,
      screeningsDue: 0,
      carePlanGoals: 0,
      carePlanNotes: 0,
      conditions: 0,
      allergies: 0,
      immunizations: 0,
      events: 0,
      symptoms: 0,
      prescriptions: 0,
      emergencyContacts: 0,
    });
  });

  it('counts due screenings', () => {
    const payload = composeHealthSummary(
      baseInput({ screeningStatuses: [cardioStatus('due'), cardioStatus('not_due')] }),
      NOW
    );
    expect(payload.counts.screeningsDue).toBe(1);
  });

  it('carries the medical-history register into the payload (snapshot, not range-filtered)', () => {
    const payload = composeHealthSummary(
      baseInput({
        range: 30, // history must NOT be trimmed to 30 days
        conditions: [
          { id: 'c-1', name: 'Υπέρταση', icd11Code: 'BA00', status: 'chronic', diagnosedAtMs: NOW - 3000 * DAY, createdAtMs: NOW - 3000 * DAY },
        ],
        allergies: [
          { id: 'a-1', substance: 'Πενικιλίνη', kind: 'drug', severity: 'severe', confirmedAtMs: NOW - 100 * DAY, createdAtMs: NOW - 100 * DAY },
        ],
        immunizations: [
          { id: 'i-1', vaccine: 'Γρίπη', doseNumber: 1, administeredAtMs: NOW - 200 * DAY, source: 'manual', createdAtMs: NOW - 200 * DAY },
        ],
        events: [
          { id: 'e-1', kind: 'surgery', name: 'Σκωληκοειδεκτομή', occurredAtMs: NOW - 400 * DAY, createdAtMs: NOW - 400 * DAY },
        ],
        symptoms: [
          { id: 's-1', name: 'Πονοκέφαλος', severity: 'moderate', onsetAtMs: NOW - 10 * DAY, status: 'ongoing', createdAtMs: NOW - 10 * DAY },
        ],
        prescriptions: [
          { id: 'rx-1', drug: 'Ατορβαστατίνη', dose: '20mg', status: 'active', issuedAtMs: NOW - 30 * DAY, createdAtMs: NOW - 30 * DAY },
        ],
      }),
      NOW
    );
    expect(payload.conditions).toHaveLength(1);
    expect(payload.conditions[0].icd11Code).toBe('BA00');
    expect(payload.allergies).toHaveLength(1);
    expect(payload.immunizations).toHaveLength(1);
    expect(payload.events).toHaveLength(1);
    expect(payload.symptoms).toHaveLength(1);
    expect(payload.prescriptions).toHaveLength(1);
    expect(payload.counts.conditions).toBe(1);
    expect(payload.counts.prescriptions).toBe(1);
    expect(payload.emptySections).not.toContain('conditions');
    expect(payload.emptySections).not.toContain('allergies');
  });

  it('carries emergency / ICE contacts and drops archived rows', () => {
    const payload = composeHealthSummary(
      baseInput({
        emergencyContacts: [
          { id: 'ice-1', kind: 'emergency', name: 'Γιώργος', relationship: 'Σύζυγος', phone: '6970000001', isPrimary: true, priority: 0, createdAtMs: NOW },
          { id: 'ice-old', kind: 'emergency', name: 'Παλιά', relationship: '', phone: '6970000002', isPrimary: false, priority: 0, archived: true, createdAtMs: NOW },
        ],
      }),
      NOW
    );
    expect(payload.emergencyContacts.map((c) => c.id)).toEqual(['ice-1']);
    expect(payload.counts.emergencyContacts).toBe(1);
    expect(payload.emptySections).not.toContain('emergencyContacts');
  });

  it('flags drug/severe allergies for the safety warning and hides archived history', () => {
    const payload = composeHealthSummary(
      baseInput({
        allergies: [
          { id: 'a-1', substance: 'Πενικιλίνη', kind: 'drug', severity: 'severe', confirmedAtMs: 1, createdAtMs: 1 },
          { id: 'a-2', substance: 'Γύρη', kind: 'environmental', severity: 'mild', confirmedAtMs: 1, createdAtMs: 1 },
          { id: 'a-3', substance: 'Παλιά', kind: 'drug', severity: 'severe', confirmedAtMs: 1, createdAtMs: 1, archived: true },
        ],
        conditions: [
          { id: 'c-1', name: 'Παλιά πάθηση', status: 'resolved', diagnosedAtMs: 1, createdAtMs: 1, archived: true },
        ],
      }),
      NOW
    );
    expect(payload.safetyAllergies.map((a) => a.id)).toEqual(['a-1']);
    expect(payload.allergies.map((a) => a.id)).toEqual(['a-1', 'a-2']);
    expect(payload.conditions).toHaveLength(0);
    expect(payload.emptySections).toContain('conditions');
    expect(payload.emptySections).toContain('immunizations');
    expect(payload.emptySections).toContain('events');
    expect(payload.emptySections).toContain('symptoms');
    expect(payload.emptySections).toContain('prescriptions');
  });
});

describe('exportFilename', () => {
  it('formats health-summary-<yyyy-mm-dd>.pdf from a UTC date', () => {
    expect(exportFilename(Date.UTC(2026, 8, 3, 12, 0, 0))).toBe('health-summary-2026-09-03.pdf');
    expect(exportFilename(Date.UTC(2026, 0, 5, 23, 59, 59))).toBe('health-summary-2026-01-05.pdf');
  });

  it('matches the required filename convention', () => {
    expect(exportFilename(NOW)).toMatch(/^health-summary-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('range helpers', () => {
  it('rangeCutoffMs returns null for "all"', () => {
    expect(rangeCutoffMs('all', NOW)).toBeNull();
    expect(rangeCutoffMs(30, NOW)).toBe(NOW - 30 * DAY);
  });

  it('inExportRange applies the cutoff inclusively', () => {
    const cutoff = NOW - 30 * DAY;
    expect(inExportRange(cutoff, 30, NOW)).toBe(true);
    expect(inExportRange(cutoff - 1, 30, NOW)).toBe(false);
    expect(inExportRange(0, 'all', NOW)).toBe(true);
  });

  it('rangeLabel renders in both locales', () => {
    expect(rangeLabel(30, 'en')).toBe('Last 30 days');
    expect(rangeLabel('all', 'en')).toBe('All history');
    expect(rangeLabel(90, 'el')).toContain('90');
    expect(rangeLabel('all', 'el')).toBeTruthy();
  });

  it('provides Greek + English labels for every section', () => {
    for (const key of ['title', 'vitals', 'medications', 'screenings', 'carePlan'] as const) {
      expect(EXPORT_LABELS.en[key]).toBeTruthy();
      expect(EXPORT_LABELS.el[key]).toBeTruthy();
      expect(EXPORT_LABELS.el[key]).not.toBe(EXPORT_LABELS.en[key]);
    }
  });
});
