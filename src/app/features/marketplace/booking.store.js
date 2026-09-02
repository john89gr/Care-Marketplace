import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { EscrowStore } from '../payments/escrow.store';
import * as i0 from "@angular/core";
const EMPTY_DRAFT = {
    caregiverId: '',
    scheduledAtMs: null,
    note: '',
};
export class BookingStore {
    api = inject(ApiClient);
    escrow = inject(EscrowStore);
    _draft = signal(EMPTY_DRAFT, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_draft" }] : /* istanbul ignore next */ []));
    _submitting = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_submitting" }] : /* istanbul ignore next */ []));
    _lastError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_lastError" }] : /* istanbul ignore next */ []));
    draft = this._draft.asReadonly();
    submitting = this._submitting.asReadonly();
    lastError = this._lastError.asReadonly();
    isDraftReady = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isDraftReady" }] : /* istanbul ignore next */ []));
    startDraft(caregiverId) {
        this._draft.set({ ...EMPTY_DRAFT, caregiverId });
    }
    updateDraft(patch) {
        this._draft.update((current) => ({ ...current, ...patch }));
    }
    clearDraft() {
        this._draft.set(EMPTY_DRAFT);
        this._lastError.set('');
    }
    async submit() {
        const draft = this._draft();
        if (!draft.caregiverId || draft.scheduledAtMs === null) {
            this._lastError.set('Complétez la date avant envoi.');
            return false;
        }
        this._submitting.set(true);
        this._lastError.set('');
        try {
            const payload = {
                caregiverId: draft.caregiverId,
                clientId: '', // filled server-side from the session
                scheduledAtMs: draft.scheduledAtMs,
                note: draft.note,
            };
            const booking = await new Promise((resolve, reject) => {
                this.api.post('/bookings', payload).subscribe({ next: resolve, error: reject });
            });
            // Phase 2: hold the funds in escrow until the visit completes.
            this.escrow.hold({
                bookingId: booking.id,
                providerId: booking.caregiverId,
                amountCents: booking.amountCents,
            }).subscribe();
            this.clearDraft();
            return true;
        }
        catch (error) {
            this._lastError.set('Échec de la demande. Réessayez.');
            return false;
        }
        finally {
            this._submitting.set(false);
        }
    }
    static ɵfac = function BookingStore_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || BookingStore)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: BookingStore, factory: BookingStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(BookingStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
