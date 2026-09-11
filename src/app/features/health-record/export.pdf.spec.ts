import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
  buildPdfBytes,
  encodePdfText,
  sparklineCoords,
  wrapText,
} from '../../shared/utils/pdf-builder';
import { generateHealthSummaryPdf } from './export.pdf';
import { composeHealthSummary } from './export.payload';
import { sparklineDataUrl, sparklinePoints } from './export.sparkline';
import type { VitalReading } from './vitals.store';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('pdf-builder', () => {
  it('produces a valid PDF with header, pages and page numbers', () => {
    const bytes = buildPdfBytes({
      title: 'Health summary',
      headerLines: ['Patient: Maria'],
      blocks: [{ kind: 'text', text: 'Vitals', size: 'heading' }],
      footerLeft: 'health-summary',
    });
    const text = pdfText(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Page');
    expect(text).toContain('(Health summary)');
    expect(text).toContain('Page 1 of 1');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('escapes parentheses in literal strings', () => {
    expect(encodePdfText('a(b)c')).toBe('(a\\(b\\)c)');
  });

  it('encodes Greek labels as UTF-16BE hex strings', () => {
    const encoded = encodePdfText('Σύνοψη');
    expect(encoded.startsWith('<FEFF')).toBe(true);
    expect(encoded).toContain('03A3'); // Σ
  });

  it('paginates long documents with correct page numbers', () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({
      kind: 'text' as const,
      text: `Line number ${i} with some filler words to simulate a table row`,
      size: 'body' as const,
    }));
    const bytes = buildPdfBytes({ title: 'Big', headerLines: [], blocks, footerLeft: 'f' });
    const text = pdfText(bytes);
    expect(text).toContain('Page 1 of 3');
    expect(text).toContain('Page 3 of 3');
  });

  it('wraps long lines and hard-splits over-long words', () => {
    expect(wrapText('a b c', 2)).toEqual(['a', 'b', 'c']);
    expect(wrapText('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
    expect(wrapText('', 10)).toEqual(['']);
  });

  it('computes sparkline coordinates without NaN (flat + single)', () => {
    for (const values of [[72, 72, 72], [80], [70, 90, 80]]) {
      const pts = sparklineCoords(values, 0, 100, 200, 60);
      expect(pts).toHaveLength(values.length);
      for (const p of pts) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
    expect(sparklineCoords([], 0, 100, 200, 60)).toEqual([]);
  });
});

describe('generateHealthSummaryPdf', () => {
  function payload(locale: 'el' | 'en' = 'en', readingCount = 3) {
    const readings: VitalReading[] = Array.from({ length: readingCount }, (_, i) => ({
      id: `r-${i}`,
      type: 'bloodPressure' as const,
      value: 118 + i,
      value2: 78,
      measuredAtMs: NOW - (readingCount - i) * DAY,
      source: 'manual' as const,
    }));
    return composeHealthSummary(
      {
        profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
        readings,
        medications: [
          {
            id: 'med-1',
            name: 'Insulin glargine',
            dose: '10 units',
            schedule: { kind: 'daily', timesMinutes: [480] },
            critical: true,
            prescriber: 'Dr. Stavrou',
            createdAtMs: NOW - 300 * DAY,
          },
        ],
        adherenceLogs: [],
        screeningStatuses: [],
        carePlan: null,
        range: 'all',
        locale,
      },
      NOW
    );
  }

  it('embeds header, sections, medication and page numbers', () => {
    const text = pdfText(generateHealthSummaryPdf(payload()));
    expect(text).toContain('Maria Papadopoulou');
    expect(text).toContain('2026-09-03');
    expect(text).toContain('(Vitals)');
    expect(text).toContain('(Medications)');
    expect(text).toContain('Insulin glargine');
    // The six medical-history sections (even empty ones) may push past page 1.
    expect(text).toContain('Page 1 of');
  });

  it('embeds both English and Greek labels', () => {
    const text = pdfText(generateHealthSummaryPdf(payload('el')));
    // Greek title as UTF-16BE hex (Σ = 03A3).
    expect(text).toContain('03A3');
    // English mirror labels stay ASCII-searchable.
    expect(text).toContain('Health summary');
  });

  it('renders explicit no-data lines for empty sections', () => {
    const text = pdfText(generateHealthSummaryPdf(payload('en', 0)));
    expect(text).toContain('No data in this section.');
  });

  it('prints the medical-history register sections (§21 subtask 13)', () => {
    const text = pdfText(
      generateHealthSummaryPdf(
        composeHealthSummary(
          {
            profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
            readings: [],
            medications: [],
            adherenceLogs: [],
            screeningStatuses: [],
            carePlan: null,
            range: 'all',
            locale: 'en',
            conditions: [
              { id: 'c-1', name: 'Hypertension', icd11Code: 'BA00', status: 'chronic', diagnosedAtMs: NOW - 3000 * DAY, createdAtMs: NOW - 3000 * DAY },
            ],
            allergies: [
              { id: 'a-1', substance: 'Penicillin', kind: 'drug', severity: 'severe', confirmedAtMs: NOW - 100 * DAY, createdAtMs: NOW - 100 * DAY },
            ],
            immunizations: [
              { id: 'i-1', vaccine: 'Influenza', doseNumber: 1, administeredAtMs: NOW - 200 * DAY, source: 'manual', createdAtMs: NOW - 200 * DAY },
            ],
            events: [
              { id: 'e-1', kind: 'surgery', name: 'Appendectomy', occurredAtMs: NOW - 400 * DAY, createdAtMs: NOW - 400 * DAY },
            ],
            symptoms: [
              { id: 's-1', name: 'Headache', severity: 'moderate', onsetAtMs: NOW - 10 * DAY, status: 'ongoing', createdAtMs: NOW - 10 * DAY },
            ],
            prescriptions: [
              { id: 'rx-1', drug: 'Atorvastatin', dose: '20mg', status: 'active', issuedAtMs: NOW - 30 * DAY, createdAtMs: NOW - 30 * DAY },
            ],
          },
          NOW
        )
      )
    );
    for (const heading of [
      'Conditions / Diagnoses',
      'Allergies',
      'Immunizations',
      'Medical events',
      'Symptoms',
      'Prescriptions',
    ]) {
      expect(text).toContain(`(${heading})`);
    }
    expect(text).toContain('Hypertension');
    expect(text).toContain('Penicillin');
    expect(text).toContain('Influenza');
    expect(text).toContain('Appendectomy');
    expect(text).toContain('Headache');
    expect(text).toContain('Atorvastatin');
  });

  it('prints a prominent allergy warning for drug/severe allergies (subtask 9)', () => {
    const text = pdfText(
      generateHealthSummaryPdf(
        composeHealthSummary(
          {
            profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
            readings: [],
            medications: [],
            adherenceLogs: [],
            screeningStatuses: [],
            carePlan: null,
            range: 'all',
            locale: 'en',
            allergies: [
              { id: 'a-1', substance: 'Penicillin', kind: 'drug', severity: 'severe', confirmedAtMs: NOW - 100 * DAY, createdAtMs: NOW - 100 * DAY },
            ],
          },
          NOW
        )
      )
    );
    expect(text).toContain('(Allergies to communicate:)');
    expect(text).toContain('Penicillin');
  });

  it('prints the saved medicine instruction sheet under the medication row', () => {
    const text = pdfText(
      generateHealthSummaryPdf(
        composeHealthSummary(
          {
            profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
            readings: [],
            medications: [
              {
                id: 'med-1',
                name: 'Atorvastatin',
                dose: '20mg',
                schedule: { kind: 'daily', timesMinutes: [21 * 60] },
                critical: false,
                createdAtMs: NOW,
                instructions: {
                  doseForm: 'Tablet',
                  route: 'oral',
                  foodRelation: 'with',
                  maxDailyDoses: 1,
                  warnings: ['Avoid grapefruit'],
                  sideEffects: 'Muscle pain',
                  storage: 'Dry place',
                  specialInstructions: 'Take in the evening',
                },
              },
            ],
            adherenceLogs: [],
            screeningStatuses: [],
            carePlan: null,
            range: 'all',
            locale: 'en',
          },
          NOW
        )
      )
    );
    expect(text).toContain('How to take');
    expect(text).toContain('With food');
    expect(text).toContain('Avoid grapefruit');
    expect(text).toContain('Take in the evening');
    expect(text).toContain('Dry place');
  });

  it('does not print a catalog suggestion as if it were a saved sheet', () => {
    // Atorvastatin is in the catalog, but no sheet was saved for this med —
    // the export must not present the suggestion as a medical record.
    const text = pdfText(
      generateHealthSummaryPdf(
        composeHealthSummary(
          {
            profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
            readings: [],
            medications: [
              {
                id: 'med-1',
                name: 'Atorvastatin',
                dose: '20mg',
                schedule: { kind: 'daily', timesMinutes: [21 * 60] },
                critical: false,
                createdAtMs: NOW,
              },
            ],
            adherenceLogs: [],
            screeningStatuses: [],
            carePlan: null,
            range: 'all',
            locale: 'en',
          },
          NOW
        )
      )
    );
    expect(text).toContain('Atorvastatin');
    expect(text).not.toContain('How to take');
  });

  it('prints emergency / ICE contacts near the top of the summary', () => {
    const text = pdfText(
      generateHealthSummaryPdf(
        composeHealthSummary(
          {
            profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
            readings: [],
            medications: [],
            adherenceLogs: [],
            screeningStatuses: [],
            carePlan: null,
            range: 'all',
            locale: 'en',
            emergencyContacts: [
              { id: 'ice-1', kind: 'emergency', name: 'George', relationship: 'Spouse', phone: '6970000001', isPrimary: true, priority: 0, createdAtMs: NOW },
            ],
          },
          NOW
        )
      )
    );
    expect(text).toContain('(Emergency ICE contacts:)');
    expect(text).toContain('George - Spouse - 6970000001');
  });

  it('perf: 1,000 readings export in < 3s', () => {
    const readings: VitalReading[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `r-${i}`,
      type: (['bloodPressure', 'heartRate', 'glucose'] as const)[i % 3],
      value: 100 + (i % 50),
      value2: 80,
      measuredAtMs: NOW - (1000 - i) * 60 * 60 * 1000,
      source: 'manual',
    }));
    const composed = composeHealthSummary(
      {
        profile: { userId: 'u-client', displayName: 'Maria' },
        readings,
        medications: [],
        adherenceLogs: [],
        screeningStatuses: [],
        carePlan: null,
        range: 'all',
        locale: 'en',
      },
      NOW
    );
    const start = performance.now();
    const bytes = generateHealthSummaryPdf(composed);
    const elapsed = performance.now() - start;
    expect(bytes.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('sparkline', () => {
  it('normalizes ascending values across the box', () => {
    const pts = sparklinePoints([10, 20, 30], 100, 40);
    expect(pts).toHaveLength(3);
    expect(pts[0].y).toBeGreaterThan(pts[2].y);
    expect(pts[0].x).toBeLessThan(pts[2].x);
  });

  it('handles empty, single and constant series without NaN', () => {
    expect(sparklinePoints([], 100, 40)).toEqual([]);
    const single = sparklinePoints([72], 100, 40);
    expect(single).toHaveLength(1);
    expect(Number.isFinite(single[0].x) && Number.isFinite(single[0].y)).toBe(true);
    const flat = sparklinePoints([80, 80], 100, 40);
    expect(flat[0].y).toBe(flat[1].y);
  });

  it('sparklineDataUrl degrades to null when canvas is unavailable', () => {
    // jsdom has no canvas 2D context → graceful null (PDF vector fallback).
    expect(sparklineDataUrl([])).toBeNull();
    expect(sparklineDataUrl([70, 72, 71])).toBeNull();
  });
});
