import { Injectable, inject, signal, computed } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
export const VITAL_LABELS = {
    bloodPressure: 'Blood pressure',
    glucose: 'Glucose',
    spo2: 'SpO₂',
    weight: 'Weight',
    temperature: 'Temperature',
    heartRate: 'Heart rate',
};
export const VITAL_UNITS = {
    bloodPressure: 'mmHg',
    glucose: 'mg/dL',
    spo2: '%',
    weight: 'kg',
    temperature: '°C',
    heartRate: 'bpm',
};
/** Reference ranges per type (systolic shown for BP; diastolic checked separately). */
const RANGES = {
    bloodPressure: { min: 90, max: 140 },
    glucose: { min: 70, max: 180 },
    spo2: { min: 95, max: null },
    weight: { min: null, max: null },
    temperature: { min: 36, max: 37.8 },
    heartRate: { min: 60, max: 100 },
};
const DIASTOLIC_RANGE = { min: 60, max: 90 };
export class VitalsStore {
    api;
    // Default-parameter injection keeps `new VitalsStore(api)` possible in
    // unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient)) {
        this.api = api;
    }
    _readings = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_readings" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _saving = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saving" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    _saved = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saved" }] : /* istanbul ignore next */ []));
    readings = this._readings.asReadonly();
    loading = this._loading.asReadonly();
    saving = this._saving.asReadonly();
    error = this._error.asReadonly();
    saved = this._saved.asReadonly();
    load() {
        this._loading.set(true);
        this.api.get('/vitals/me').subscribe({
            next: (readings) => {
                this._readings.set(readings);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    add(reading) {
        this._saving.set(true);
        this._saved.set(false);
        this._error.set('');
        const payload = { ...reading, id: crypto.randomUUID(), source: 'manual' };
        return this.api.post('/vitals/me', payload).pipe(map((saved) => {
            this._readings.update((list) => [saved, ...list]);
            this._saving.set(false);
            this._saved.set(true);
            return true;
        }), catchError((error) => {
            this._saving.set(false);
            this._error.set(error?.error?.message ??
                'Could not save the reading. Please try again.');
            return of(false);
        }));
    }
    /** Latest reading of a type, or null. */
    latest(type) {
        const ofType = this._readings().filter((r) => r.type === type);
        return ofType.length === 0
            ? null
            : ofType.reduce((a, b) => (a.measuredAtMs > b.measuredAtMs ? a : b));
    }
    /** Trend series for a type, oldest → newest, limited to `limit` points. */
    trend(type, limit = 14) {
        return this._readings()
            .filter((r) => r.type === type)
            .sort((a, b) => a.measuredAtMs - b.measuredAtMs)
            .slice(-limit);
    }
    /** Readings currently outside the reference range, newest first. */
    alerts = computed(() => {
        const flagged = [];
        for (const type of Object.keys(RANGES)) {
            const latest = this.latest(type);
            if (latest && isOutOfRange(latest, RANGES, DIASTOLIC_RANGE)) {
                flagged.push(latest);
            }
        }
        return flagged.sort((a, b) => b.measuredAtMs - a.measuredAtMs);
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "alerts" }] : /* istanbul ignore next */ []));
    static ɵfac = function VitalsStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || VitalsStore)(i0.ɵɵinject(i1.ApiClient)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: VitalsStore, factory: VitalsStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(VitalsStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }], null); })();
export function isOutOfRange(reading, ranges = RANGES, diastolicRange = DIASTOLIC_RANGE) {
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
function outOfBounds(value, range) {
    return (range.min !== null && value < range.min) || (range.max !== null && value > range.max);
}
