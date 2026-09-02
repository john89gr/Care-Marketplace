import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Personal health record vitals (PLAN.md §3.C / §5 Phase 3 — PHR).
 * Readings are keyed by type with per-type reference ranges; any reading
 * outside its range raises a threshold alert, and trend series feed the
 * trends view. Manual + Web Bluetooth (source field, contract only).
 */
export type VitalType = 'bloodPressure' | 'glucose' | 'spo2' | 'weight' | 'temperature' | 'heartRate';

export interface VitalReading {
  id: string;
  type: VitalType;
  /** Main value: systolic BP, glucose mg/dL, SpO2 %, kg, °C, bpm. */
  value: number;
  /** Diastolic BP (bloodPressure only). */
  value2: number | null;
  measuredAtMs: number;
  source: 'manual' | 'bluetooth';
}

export interface VitalRange {
  /** Inclusive lower bound, or null when unbounded. */
  min: number | null;
  /** Inclusive upper bound, or null when unbounded. */
  max: number | null;
}

export const VITAL_LABELS: Record<VitalType, string> = {
  bloodPressure: 'Blood pressure',
  glucose: 'Glucose',
  spo2: 'SpO₂',
  weight: 'Weight',
  temperature: 'Temperature',
  heartRate: 'Heart rate',
};

export const VITAL_UNITS: Record<VitalType, string> = {
  bloodPressure: 'mmHg',
  glucose: 'mg/dL',
  spo2: '%',
  weight: 'kg',
  temperature: '°C',
  heartRate: 'bpm',
};

/** Reference ranges per type (systolic shown for BP; diastolic checked separately). */
const RANGES: Record<VitalType, VitalRange> = {
  bloodPressure: { min: 90, max: 140 },
  glucose: { min: 70, max: 180 },
  spo2: { min: 95, max: null },
  weight: { min: null, max: null },
  temperature: { min: 36, max: 37.8 },
  heartRate: { min: 60, max: 100 },
};

const DIASTOLIC_RANGE: VitalRange = { min: 60, max: 90 };

@Injectable({ providedIn: 'root' })
export class VitalsStore {
  // Default-parameter injection keeps `new VitalsStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _readings = signal<VitalReading[]>([]);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal('');
  private readonly _saved = signal(false);

  readonly readings = this._readings.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();
  readonly saved = this._saved.asReadonly();

  load(): void {
    this._loading.set(true);
    this.api.get<VitalReading[]>('/vitals/me').subscribe({
      next: (readings) => {
        this._readings.set(readings);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  add(reading: Omit<VitalReading, 'id' | 'source'>): Observable<boolean> {
    this._saving.set(true);
    this._saved.set(false);
    this._error.set('');
    const payload: VitalReading = { ...reading, id: crypto.randomUUID(), source: 'manual' };
    return this.api.post<VitalReading>('/vitals/me', payload).pipe(
      map((saved) => {
        this._readings.update((list) => [saved, ...list]);
        this._saving.set(false);
        this._saved.set(true);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save the reading. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Latest reading of a type, or null. */
  latest(type: VitalType): VitalReading | null {
    const ofType = this._readings().filter((r) => r.type === type);
    return ofType.length === 0
      ? null
      : ofType.reduce((a, b) => (a.measuredAtMs > b.measuredAtMs ? a : b));
  }

  /** Trend series for a type, oldest → newest, limited to `limit` points. */
  trend(type: VitalType, limit = 14): VitalReading[] {
    return this._readings()
      .filter((r) => r.type === type)
      .sort((a, b) => a.measuredAtMs - b.measuredAtMs)
      .slice(-limit);
  }

  /** Readings currently outside the reference range, newest first. */
  readonly alerts = computed<VitalReading[]>(() => {
    const flagged: VitalReading[] = [];
    for (const type of Object.keys(RANGES) as VitalType[]) {
      const latest = this.latest(type);
      if (latest && isOutOfRange(latest, RANGES, DIASTOLIC_RANGE)) {
        flagged.push(latest);
      }
    }
    return flagged.sort((a, b) => b.measuredAtMs - a.measuredAtMs);
  });
}

export function isOutOfRange(
  reading: VitalReading,
  ranges: Record<VitalType, VitalRange> = RANGES,
  diastolicRange: VitalRange = DIASTOLIC_RANGE
): boolean {
  const range = ranges[reading.type];
  if (!range) {
    return false;
  }
  const main = outOfBounds(reading.value, range);
  if (reading.type === 'bloodPressure') {
    const diastolic = reading.value2 === null ? false : outOfBounds(reading.value2, diastolicRange);
    return main || diastolic;
  }
  return main;
}

function outOfBounds(value: number, range: VitalRange): boolean {
  return (range.min !== null && value < range.min) || (range.max !== null && value > range.max);
}