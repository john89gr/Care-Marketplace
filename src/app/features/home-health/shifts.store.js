import { Injectable, inject, signal, computed } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
export const WEEKDAYS = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
];
/** Preset availability segments shown in the grid. */
export const TIME_SEGMENTS = [
    { label: 'Morning', startMinutes: 8 * 60, endMinutes: 12 * 60 },
    { label: 'Afternoon', startMinutes: 12 * 60, endMinutes: 17 * 60 },
    { label: 'Evening', startMinutes: 17 * 60, endMinutes: 21 * 60 },
];
export class ShiftsStore {
    api;
    // Default-parameter injection keeps `new ShiftsStore(api)` possible in
    // unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient)) {
        this.api = api;
    }
    _availability = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_availability" }] : /* istanbul ignore next */ []));
    _onDemand = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_onDemand" }] : /* istanbul ignore next */ []));
    _shifts = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_shifts" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _saving = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saving" }] : /* istanbul ignore next */ []));
    _saveError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saveError" }] : /* istanbul ignore next */ []));
    availability = this._availability.asReadonly();
    onDemand = this._onDemand.asReadonly();
    shifts = this._shifts.asReadonly();
    loading = this._loading.asReadonly();
    saving = this._saving.asReadonly();
    saveError = this._saveError.asReadonly();
    /** Upcoming confirmed/requested shifts, soonest first. */
    upcomingShifts = computed(() => this._shifts()
        .filter((s) => s.status === 'requested' || s.status === 'confirmed')
        .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "upcomingShifts" }] : /* istanbul ignore next */ []));
    load() {
        this._loading.set(true);
        this.api.get('/shifts/me').subscribe({
            next: (payload) => {
                this._availability.set(payload.availability ?? []);
                this._onDemand.set(payload.onDemand ?? false);
                this._shifts.set(payload.shifts ?? []);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    /** Toggles a time segment for a weekday in the local grid. */
    toggleSegment(weekday, startMinutes, endMinutes) {
        this._availability.update((slots) => {
            const existing = slots.find((s) => s.weekday === weekday && s.startMinutes === startMinutes && s.endMinutes === endMinutes);
            if (existing) {
                return slots.filter((s) => s.id !== existing.id);
            }
            return [
                ...slots,
                { id: crypto.randomUUID(), weekday, startMinutes, endMinutes },
            ];
        });
    }
    hasSegment(weekday, startMinutes, endMinutes) {
        return this._availability().some((s) => s.weekday === weekday && s.startMinutes === startMinutes && s.endMinutes === endMinutes);
    }
    setOnDemand(onDemand) {
        this._onDemand.set(onDemand);
    }
    save() {
        this._saving.set(true);
        this._saveError.set('');
        return this.api
            .patch('/shifts/me', {
            availability: this._availability(),
            onDemand: this._onDemand(),
        })
            .pipe(map(() => {
            this._saving.set(false);
            return true;
        }), catchError((error) => {
            this._saving.set(false);
            this._saveError.set(error?.error?.message ??
                'Could not save your availability. Please try again.');
            return of(false);
        }));
    }
    static ɵfac = function ShiftsStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || ShiftsStore)(i0.ɵɵinject(i1.ApiClient)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ShiftsStore, factory: ShiftsStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ShiftsStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }], null); })();
