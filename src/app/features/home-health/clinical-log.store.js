import { Injectable, inject, signal } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { ROLES } from '../../core/auth/roles';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
import * as i2 from "../../core/auth/session";
export class ClinicalLogStore {
    api;
    session;
    // Default-parameter injection keeps `new ClinicalLogStore(api, session)`
    // possible in unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient), session = inject(SessionStore)) {
        this.api = api;
        this.session = session;
    }
    _entries = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_entries" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _saving = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saving" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    _saved = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saved" }] : /* istanbul ignore next */ []));
    entries = this._entries.asReadonly();
    loading = this._loading.asReadonly();
    saving = this._saving.asReadonly();
    error = this._error.asReadonly();
    saved = this._saved.asReadonly();
    /** Whether the current user is a nurse (physio otherwise). */
    specialty = () => this.session.hasAnyRole([ROLES.NURSE]) ? 'nurse' : 'physio';
    load(visitId) {
        this._loading.set(true);
        this.api.get('/clinical-log').subscribe({
            next: (entries) => {
                this._entries.set(visitId ? entries.filter((e) => e.visitId === visitId) : entries);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    /** Saves a signed clinical log entry. Pass null to save without a signature. */
    save(draft, signatureDataUrl) {
        this._saving.set(true);
        this._saved.set(false);
        this._error.set('');
        const me = this.session.session();
        const entry = {
            id: crypto.randomUUID(),
            visitId: draft.visitId,
            authorId: me?.userId ?? '',
            authorName: me?.displayName ?? '',
            specialty: this.specialty(),
            observations: draft.observations,
            vitals: draft.vitals ?? null,
            rehab: draft.rehab ?? null,
            signatureDataUrl,
            signedAtMs: signatureDataUrl ? Date.now() : null,
        };
        return this.api.post('/clinical-log', entry).pipe(map((saved) => {
            this._entries.update((list) => [saved, ...list]);
            this._saving.set(false);
            this._saved.set(true);
            return true;
        }), catchError((error) => {
            this._saving.set(false);
            this._error.set(error?.error?.message ??
                'Could not save the clinical log. Please try again.');
            return of(false);
        }));
    }
    static ɵfac = function ClinicalLogStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || ClinicalLogStore)(i0.ɵɵinject(i1.ApiClient), i0.ɵɵinject(i2.SessionStore)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ClinicalLogStore, factory: ClinicalLogStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ClinicalLogStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }, { type: i2.SessionStore }], null); })();
