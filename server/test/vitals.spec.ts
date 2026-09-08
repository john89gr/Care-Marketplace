import { describe, expect, it } from 'vitest';
import { vitalsAlert } from '../src/vitals';

/**
 * Pure boundary tests for the server-side reference ranges (vitals.ts) — the
 * mirror of the frontend vitals.store.ts ranges that drives the vitals.alert
 * Web Push. Bounds are INCLUSIVE: exactly on the min/max is in range, one
 * step outside flags.
 */
describe('vitalsAlert reference ranges (boundaries)', () => {
  it.each<[string, number, number | null, boolean]>([
    // heartRate: 60–100 bpm
    ['heartRate', 60, null, false],
    ['heartRate', 59, null, true],
    ['heartRate', 100, null, false],
    ['heartRate', 101, null, true],
    // glucose: 70–180 mg/dL
    ['glucose', 70, null, false],
    ['glucose', 69, null, true],
    ['glucose', 180, null, false],
    ['glucose', 181, null, true],
    // spo2: ≥95 %, no upper bound
    ['spo2', 95, null, false],
    ['spo2', 94, null, true],
    ['spo2', 100, null, false],
    ['spo2', 101, null, false],
    // temperature: 36–37.8 °C
    ['temperature', 36, null, false],
    ['temperature', 35.9, null, true],
    ['temperature', 37.8, null, false],
    ['temperature', 37.9, null, true],
    // bloodPressure systolic 90–140, diastolic 60–90 (both must be in range)
    ['bloodPressure', 90, 60, false],
    ['bloodPressure', 89, 60, true],
    ['bloodPressure', 141, 60, true],
    ['bloodPressure', 120, 60, false],
    ['bloodPressure', 120, 59, true],
    ['bloodPressure', 120, 91, true],
    ['bloodPressure', 120, null, false], // no diastolic → systolic only
    ['bloodPressure', 89, 59, true], // both out → still a single alert
    // weight: unbounded both sides → never flags
    ['weight', 5, null, false],
    ['weight', 500, null, false],
    // unknown types are ignored
    ['vitalSignUnknown', 100, null, false],
  ])('type=%s value=%s value2=%s → alert=%s', (type, value, value2, expected) => {
    const result = vitalsAlert(type, value, value2);
    if (expected) {
      expect(result).not.toBeNull();
      expect(result?.label).toBeTruthy();
    } else {
      expect(result).toBeNull();
    }
  });
});

describe('vitalsAlert alert copy', () => {
  it('returns the label and body used for the push payload', () => {
    expect(vitalsAlert('heartRate', 121, null)).toEqual({
      label: 'Heart rate',
      body: 'Latest reading is outside the expected range — check the trends view.',
    });
  });

  it('labels diastolic flags as blood pressure', () => {
    expect(vitalsAlert('bloodPressure', 120, 95)?.label).toBe('Blood pressure');
    expect(vitalsAlert('bloodPressure', 165, 100)?.label).toBe('Blood pressure');
  });

  it('keeps the SpO₂ label with its unicode subscript', () => {
    expect(vitalsAlert('spo2', 90, null)?.label).toBe('SpO₂');
  });
});