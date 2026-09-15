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

export const VITAL_TYPES = [
  'bloodPressure',
  'glucose',
  'spo2',
  'weight',
  'heartRate',
  'temperature',
] as const;

export type VitalType = (typeof VITAL_TYPES)[number];

export interface VitalStatItem {
  type: VitalType;
  latest: number | null;
  latestValue: number | null;
  latestValue2: number | null;
  min: number | null;
  max: number | null;
  average: number | null;
  avg: number | null;
  count: number;
  totalCount: number;
  outOfRangeAlerts: number;
  outOfRangeCount: number;
}

export function isVitalOutOfRange(type: string, value: number, value2: number | null = null): boolean {
  return vitalsAlert(type, value, value2) !== null;
}

export interface VitalRowLike {
  type: string;
  value: number | string;
  value2?: number | string | null;
  measured_at_ms: number | string;
}

export function computeVitalStats(
  rows: readonly VitalRowLike[],
  days = 30,
  nowMs = Date.now()
): Record<VitalType, VitalStatItem> {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;

  const result = {} as Record<VitalType, VitalStatItem>;

  for (const type of VITAL_TYPES) {
    const ofType = rows
      .filter((r) => r.type === type)
      .slice()
      .sort((a, b) => Number(b.measured_at_ms) - Number(a.measured_at_ms));

    const latestRow = ofType[0] ?? null;
    const latest = latestRow !== null ? Number(latestRow.value) : null;
    const latestValue2 =
      latestRow !== null && latestRow.value2 !== null && latestRow.value2 !== undefined
        ? Number(latestRow.value2)
        : null;

    const values = ofType.map((r) => Number(r.value));
    const min = values.length > 0 ? Math.min(...values) : null;
    const max = values.length > 0 ? Math.max(...values) : null;

    const recent = ofType.filter((r) => Number(r.measured_at_ms) >= cutoffMs);
    let average: number | null = null;
    if (recent.length > 0) {
      const sum = recent.reduce((acc, r) => acc + Number(r.value), 0);
      average = Math.round((sum / recent.length) * 100) / 100;
    }

    let alertCount = 0;
    for (const r of ofType) {
      const val2 = r.value2 !== null && r.value2 !== undefined ? Number(r.value2) : null;
      if (vitalsAlert(r.type, Number(r.value), val2) !== null) {
        alertCount++;
      }
    }

    result[type] = {
      type,
      latest,
      latestValue: latest,
      latestValue2,
      min,
      max,
      average,
      avg: average,
      count: ofType.length,
      totalCount: ofType.length,
      outOfRangeAlerts: alertCount,
      outOfRangeCount: alertCount,
    };
  }

  return result;
}