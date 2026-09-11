import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  filterTimeline,
  groupTimelineByYear,
  HistoryInput,
} from './history.timeline';

/** Timeline merge + grouping tests (FEATURE_PLAN.md §21 subtask 10). */

const base: HistoryInput = {
  conditions: [],
  allergies: [],
  immunizations: [],
  events: [],
  symptoms: [],
  prescriptions: [],
};

describe('buildTimeline', () => {
  it('merges every category and sorts newest first', () => {
    const input: HistoryInput = {
      ...base,
      conditions: [
        { id: 'c1', name: 'Hypertension', icd11Code: 'BA00', status: 'chronic', diagnosedAtMs: 1_600_000_000_000, createdAtMs: 1 },
      ],
      allergies: [
        { id: 'a1', substance: 'Penicillin', kind: 'drug', severity: 'severe', confirmedAtMs: 1_700_000_000_000, createdAtMs: 1 },
      ],
      events: [
        { id: 'e1', kind: 'surgery', name: 'Appendectomy', occurredAtMs: 1_500_000_000_000, createdAtMs: 1 },
      ],
      prescriptions: [
        { id: 'p1', drug: 'Metformin', dose: '500mg', status: 'active', issuedAtMs: 1_650_000_000_000, createdAtMs: 1 },
      ],
      symptoms: [
        { id: 's1', name: 'Headache', severity: 'moderate', onsetAtMs: 1_550_000_000_000, status: 'ongoing', createdAtMs: 1 },
      ],
    };
    const entries = buildTimeline(input);
    expect(entries).toHaveLength(5);
    // Newest first: allergy (1.7e12) → prescription (1.65e12) → condition (1.6e12) → symptom (1.55e12) → event (1.5e12).
    expect(entries.map((e) => e.kind)).toEqual([
      'allergies',
      'prescriptions',
      'conditions',
      'symptoms',
      'events',
    ]);
  });

  it('keeps archived records but flags them', () => {
    const input: HistoryInput = {
      ...base,
      conditions: [
        { id: 'c1', name: 'Old diagnosis', status: 'resolved', diagnosedAtMs: 1000, createdAtMs: 1, archived: true },
      ],
    };
    const [entry] = buildTimeline(input);
    expect(entry.archived).toBe(true);
  });

  it('renders the ICD-11 Greek label inside the condition detail', () => {
    const input: HistoryInput = {
      ...base,
      conditions: [
        { id: 'c1', name: 'Υπέρταση', icd11Code: 'BA00', status: 'active', diagnosedAtMs: 1000, createdAtMs: 1 },
      ],
    };
    const [entry] = buildTimeline(input);
    expect(entry.detail).toContain('Ιδιοπαθής υπέρταση');
    expect(entry.detail).toContain('BA00');
  });
});

describe('groupTimelineByYear', () => {
  it('groups by year, newest year first', () => {
    const entries = buildTimeline({
      ...base,
      conditions: [
        { id: 'c1', name: 'A', status: 'active', diagnosedAtMs: new Date(2020, 5, 1).getTime(), createdAtMs: 1 },
        { id: 'c2', name: 'B', status: 'active', diagnosedAtMs: new Date(2024, 0, 15).getTime(), createdAtMs: 1 },
        { id: 'c3', name: 'C', status: 'active', diagnosedAtMs: new Date(2024, 11, 30).getTime(), createdAtMs: 1 },
      ],
    });
    const groups = groupTimelineByYear(entries);
    expect(groups.map((g) => g.year)).toEqual([2024, 2020]);
    expect(groups[0].entries.map((e) => e.title)).toEqual(['C', 'B']);
  });
});

describe('filterTimeline', () => {
  it('returns everything for the empty filter and only the kind otherwise', () => {
    const entries = buildTimeline({
      ...base,
      conditions: [{ id: 'c1', name: 'A', status: 'active', diagnosedAtMs: 1, createdAtMs: 1 }],
      allergies: [{ id: 'a1', substance: 'X', kind: 'drug', severity: 'mild', confirmedAtMs: 2, createdAtMs: 1 }],
    });
    expect(filterTimeline(entries, '')).toHaveLength(2);
    expect(filterTimeline(entries, 'allergies')).toHaveLength(1);
  });
});