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
    expect(text).toContain('Page 1 of 1');
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
