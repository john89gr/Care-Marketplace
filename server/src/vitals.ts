/**
 * Server-side mirror of the frontend reference ranges (vitals.store.ts) so
 * out-of-range readings raise a push alert even when the client tab is closed.
 * Keep in sync with src/app/features/health-record/vitals.store.ts.
 */
export interface VitalRange {
  /** Inclusive lower bound, or null when unbounded. */
  min: number | null;
  /** Inclusive upper bound, or null when unbounded. */
  max: number | null;
}

const RANGES: Record<string, VitalRange & { label: string }> = {
  bloodPressure: { min: 90, max: 140, label: 'Blood pressure' },
  glucose: { min: 70, max: 180, label: 'Glucose' },
  spo2: { min: 95, max: null, label: 'SpO₂' },
  weight: { min: null, max: null, label: 'Weight' },
  temperature: { min: 36, max: 37.8, label: 'Temperature' },
  heartRate: { min: 60, max: 100, label: 'Heart rate' },
};

const DIASTOLIC_RANGE: VitalRange = { min: 60, max: 90 };

function outOfRange(value: number, range: VitalRange): boolean {
  return (range.min !== null && value < range.min) || (range.max !== null && value > range.max);
}

/**
 * Returns the alert copy when a reading falls outside its reference range
 * (blood pressure checks systolic `value` and diastolic `value2`), else null.
 * Same messages as the frontend so the in-app and push copies match.
 */
export function vitalsAlert(
  type: string,
  value: number,
  value2: number | null
): { label: string; body: string } | null {
  const range = RANGES[type];
  if (!range || (range.min === null && range.max === null)) {
    return null;
  }
  const flagged = outOfRange(value, range);
  const diastolicFlagged =
    type === 'bloodPressure' && value2 !== null && outOfRange(value2, DIASTOLIC_RANGE);
  if (!flagged && !diastolicFlagged) {
    return null;
  }
  return {
    label: range.label,
    body: 'Latest reading is outside the expected range — check the trends view.',
  };
}