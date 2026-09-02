import { Injectable, inject, signal, computed } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
export class EscrowStore {
    api;
    // Default-parameter injection keeps `new EscrowStore(api)` possible in
    // unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient)) {
        this.api = api;
    }
    _transactions = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_transactions" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _actingId = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_actingId" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    transactions = this._transactions.asReadonly();
    loading = this._loading.asReadonly();
    actingId = this._actingId.asReadonly();
    error = this._error.asReadonly();
    heldTotalCents = computed(() => this._transactions()
        .filter((t) => t.status === 'held')
        .reduce((sum, t) => sum + t.amountCents, 0), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "heldTotalCents" }] : /* istanbul ignore next */ []));
    load() {
        this._loading.set(true);
        this.api.get('/payments/escrow').subscribe({
            next: (transactions) => {
                this._transactions.set(transactions);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    /** Hold funds when a booking is created. */
    hold(request) {
        this._error.set('');
        return this.api.post('/payments/escrow', request).pipe(map((transaction) => {
            this._transactions.update((list) => [transaction, ...list]);
            return true;
        }), catchError((error) => {
            this._error.set(error?.error?.message ??
                'Could not place the escrow hold.');
            return of(false);
        }));
    }
    /** Release a held transaction (automatic on completed visit). */
    release(transactionId) {
        return this.settle(transactionId, '/release', 'released');
    }
    /** Refund a held transaction (cancelled booking). */
    refund(transactionId) {
        return this.settle(transactionId, '/refund', 'refunded');
    }
    settle(transactionId, path, status) {
        this._actingId.set(transactionId);
        this._error.set('');
        return this.api.post(`/payments/escrow/${transactionId}${path}`, {}).pipe(map((transaction) => {
            this._transactions.update((list) => list.map((t) => (t.id === transaction.id ? transaction : t)));
            this._actingId.set(null);
            return true;
        }), catchError((error) => {
            this._actingId.set(null);
            this._error.set(error?.error?.message ??
                (status === 'released' ? 'Could not release the escrow.' : 'Could not refund the escrow.'));
            return of(false);
        }));
    }
    static ɵfac = function EscrowStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || EscrowStore)(i0.ɵɵinject(i1.ApiClient)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: EscrowStore, factory: EscrowStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(EscrowStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }], null); })();
