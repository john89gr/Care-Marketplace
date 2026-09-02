import { Injectable, inject, signal } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import * as i0 from "@angular/core";
const EMPTY_PROFILE = {
    userId: '',
    displayName: '',
    phone: '',
    amka: '',
    afm: '',
    licenceNumber: '',
    hourlyRate: null,
};
export class ProfileStore {
    api = inject(ApiClient);
    _profile = signal(EMPTY_PROFILE, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_profile" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _saving = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saving" }] : /* istanbul ignore next */ []));
    _saveError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saveError" }] : /* istanbul ignore next */ []));
    _saved = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saved" }] : /* istanbul ignore next */ []));
    profile = this._profile.asReadonly();
    loading = this._loading.asReadonly();
    saving = this._saving.asReadonly();
    saveError = this._saveError.asReadonly();
    saved = this._saved.asReadonly();
    load() {
        this._loading.set(true);
        return this.api.get('/profiles/me').pipe(map((profile) => {
            this._profile.set({ ...EMPTY_PROFILE, ...profile });
            this._loading.set(false);
            return true;
        }), catchError(() => {
            this._loading.set(false);
            return of(false);
        }));
    }
    save(patch) {
        this._saving.set(true);
        this._saved.set(false);
        this._saveError.set('');
        return this.api.patch('/profiles/me', patch).pipe(map((profile) => {
            this._profile.set({ ...EMPTY_PROFILE, ...profile });
            this._saving.set(false);
            this._saved.set(true);
            return true;
        }), catchError((error) => {
            this._saving.set(false);
            this._saveError.set(error?.error?.message ??
                'Could not save your profile. Please try again.');
            return of(false);
        }));
    }
    static ɵfac = function ProfileStore_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ProfileStore)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ProfileStore, factory: ProfileStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ProfileStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
