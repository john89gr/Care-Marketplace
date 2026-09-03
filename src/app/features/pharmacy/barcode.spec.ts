import { describe, it, expect } from 'vitest';
import {
  BarcodeParseError,
  UNKNOWN_PRESCRIBER,
  parseBarcodePayload,
  parseManualEntry,
} from './barcode';

/**
 * Barcode parse + manual-entry fallback tests (FEATURE_PLAN.md §9 subtask 16).
 */
describe('parseBarcodePayload', () => {
  it('parses the JSON e-prescription shape', () => {
    const result = parseBarcodePayload(
      JSON.stringify({
        prescriber: 'Dr. Stavrou',
        meds: [
          { name: 'Insulin glargine', dose: '10 units', qty: 1 },
          { name: 'Atorvastatin', dose: '20 mg', qty: 30 },
        ],
      })
    );
    expect(result.prescriber).toBe('Dr. Stavrou');
    expect(result.meds).toEqual([
      { name: 'Insulin glargine', dose: '10 units', qty: 1 },
      { name: 'Atorvastatin', dose: '20 mg', qty: 30 },
    ]);
  });

  it('accepts the medications alias and defaults dose/qty', () => {
    const result = parseBarcodePayload(JSON.stringify({ medications: [{ name: 'Aspirin' }] }));
    expect(result.prescriber).toBe(UNKNOWN_PRESCRIBER);
    expect(result.meds).toEqual([{ name: 'Aspirin', dose: '', qty: 1 }]);
  });

  it('falls back to line parsing for non-JSON payloads', () => {
    const result = parseBarcodePayload('Insulin glargine | 10 units | x1');
    expect(result.meds).toEqual([{ name: 'Insulin glargine', dose: '10 units', qty: 1 }]);
  });

  it('rejects empty payloads', () => {
    expect(() => parseBarcodePayload('   ')).toThrow(BarcodeParseError);
  });

  it('rejects JSON without any usable meds', () => {
    expect(() => parseBarcodePayload(JSON.stringify({ prescriber: 'Dr. X' }))).toThrow(
      BarcodeParseError
    );
    expect(() => parseBarcodePayload(JSON.stringify({ meds: [{ name: '  ' }] }))).toThrow(
      BarcodeParseError
    );
  });
});

describe('parseManualEntry', () => {
  it('parses pipe-separated lines with qty variants', () => {
    const result = parseManualEntry(
      'Insulin glargine | 10 units | x1\nAtorvastatin | 20 mg | qty: 30'
    );
    expect(result.meds).toEqual([
      { name: 'Insulin glargine', dose: '10 units', qty: 1 },
      { name: 'Atorvastatin', dose: '20 mg', qty: 30 },
    ]);
  });

  it('parses comma-separated and semicolon-separated items', () => {
    const result = parseManualEntry('Amoxicillin, 500 mg, x21; Vitamin D, 1000 IU, 60 tabs');
    expect(result.meds).toEqual([
      { name: 'Amoxicillin', dose: '500 mg', qty: 21 },
      { name: 'Vitamin D', dose: '1000 IU', qty: 60 },
    ]);
  });

  it('defaults missing dose and qty', () => {
    const result = parseManualEntry('Paracetamol');
    expect(result.meds).toEqual([{ name: 'Paracetamol', dose: '', qty: 1 }]);
  });

  it('skips blank lines but needs at least one medication', () => {
    expect(() => parseManualEntry('\n  \n')).toThrow(BarcodeParseError);
    const result = parseManualEntry('\n\nAspirin | 100 mg | x30\n\n');
    expect(result.meds).toHaveLength(1);
  });
});
