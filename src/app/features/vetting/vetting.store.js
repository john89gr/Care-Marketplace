import { Injectable, inject, signal, computed } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
export class VettingStore {
    api;
    // Default-parameter injection keeps `new VettingStore(api)` possible in
    // unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient)) {
        this.api = api;
    }
    _mine = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_mine" }] : /* istanbul ignore next */ []));
    _queue = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_queue" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _submitting = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_submitting" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    mine = this._mine.asReadonly();
    queue = this._queue.asReadonly();
    loading = this._loading.asReadonly();
    submitting = this._submitting.asReadonly();
    error = this._error.asReadonly();
    isApproved = computed(() => this._mine()?.status === 'approved', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isApproved" }] : /* istanbul ignore next */ []));
    isPending = computed(() => this._mine()?.status === 'pending', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isPending" }] : /* istanbul ignore next */ []));
    isRejected = computed(() => this._mine()?.status === 'rejected', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isRejected" }] : /* istanbul ignore next */ []));
    loadMine() {
        this._loading.set(true);
        this.api.get('/vetting/submissions/me').subscribe({
            next: (submission) => {
                this._mine.set(submission);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    submit(draft) {
        this._submitting.set(true);
        this._error.set('');
        return this.api.post('/vetting/submissions', draft).pipe(map((submission) => {
            this._mine.set(submission);
            this._submitting.set(false);
            return true;
        }), catchError((error) => {
            this._submitting.set(false);
            this._error.set(error?.error?.message ??
                'Could not submit your licence. Please try again.');
            return of(false);
        }));
    }
    /** Admin: load the full review queue. */
    loadQueue() {
        this._loading.set(true);
        this.api.get('/vetting/submissions').subscribe({
            next: (submissions) => {
                this._queue.set(submissions);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    /** Admin: approve or reject a submission. */
    review(id, decision, note = '') {
        this._error.set('');
        return this.api.post(`/vetting/submissions/${id}/review`, { decision, note }).pipe(map((updated) => {
            this._queue.update((list) => list.map((s) => (s.id === id ? updated : s)));
            return true;
        }), catchError((error) => {
            this._error.set(error?.error?.message ??
                'Could not review the submission.');
            return of(false);
        }));
    }
    static ɵfac = function VettingStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || VettingStore)(i0.ɵɵinject(i1.ApiClient)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: VettingStore, factory: VettingStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(VettingStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }], null); })();
