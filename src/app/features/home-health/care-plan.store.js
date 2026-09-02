import { Injectable, inject, signal } from '@angular/core';
import { map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
import * as i2 from "../../core/auth/session";
export class CarePlanStore {
    api;
    session;
    // Default-parameter injection keeps `new CarePlanStore(api, session)`
    // possible in unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient), session = inject(SessionStore)) {
        this.api = api;
        this.session = session;
    }
    _plan = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_plan" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _saving = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_saving" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    plan = this._plan.asReadonly();
    loading = this._loading.asReadonly();
    saving = this._saving.asReadonly();
    error = this._error.asReadonly();
    load() {
        this._loading.set(true);
        this.api.get('/care-plans').subscribe({
            next: (plans) => {
                const me = this.session.session();
                this._plan.set(me ? plans.find((p) => p.clientId === me.userId) ?? plans[0] ?? null : null);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    addGoal(text) {
        const id = this._plan()?.id;
        if (!id) {
            return of(false);
        }
        return this.mutate(this.api.post(`/care-plans/${id}/goals`, { text }));
    }
    setGoalStatus(goalId, status) {
        const id = this._plan()?.id;
        if (!id) {
            return of(false);
        }
        return this.mutate(this.api.patch(`/care-plans/${id}/goals/${goalId}`, { status }));
    }
    addNote(text) {
        const id = this._plan()?.id;
        if (!id) {
            return of(false);
        }
        const me = this.session.session();
        return this.mutate(this.api.post(`/care-plans/${id}/notes`, {
            text,
            authorId: me?.userId ?? '',
            authorName: me?.displayName ?? '',
            authorRole: me?.roles[0] ?? '',
        }));
    }
    mutate(request) {
        this._saving.set(true);
        this._error.set('');
        return request.pipe(map((plan) => {
            this._plan.set(plan);
            this._saving.set(false);
            return true;
        }), catchError((error) => {
            this._saving.set(false);
            this._error.set(error?.error?.message ??
                'Could not update the care plan. Please try again.');
            return of(false);
        }));
    }
    static ɵfac = function CarePlanStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || CarePlanStore)(i0.ɵɵinject(i1.ApiClient), i0.ɵɵinject(i2.SessionStore)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: CarePlanStore, factory: CarePlanStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(CarePlanStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }, { type: i2.SessionStore }], null); })();
export function careGoalStatusLabel(status) {
    return status.replace('-', ' ');
}
