import { Injectable, signal, computed } from '@angular/core';
import { rolesFrom } from './roles';
import * as i0 from "@angular/core";
const SESSION_KEY = 'cm.session.v1';
export class SessionStore {
    _session = signal(this._load(), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_session" }] : /* istanbul ignore next */ []));
    session = this._session.asReadonly();
    isLoggedIn = computed(() => this._session() !== null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isLoggedIn" }] : /* istanbul ignore next */ []));
    roles = computed(() => this._session()?.roles ?? [], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "roles" }] : /* istanbul ignore next */ []));
    displayName = computed(() => this._session()?.displayName ?? '', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "displayName" }] : /* istanbul ignore next */ []));
    setSession(session) {
        this._session.set(session);
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
        catch {
            // Storage unavailable (private mode) — session stays in memory only.
        }
    }
    clear() {
        this._session.set(null);
        try {
            localStorage.removeItem(SESSION_KEY);
        }
        catch {
            // Ignore storage failures on logout.
        }
    }
    hasAnyRole(required) {
        const current = this.roles();
        return required.some((role) => current.includes(role));
    }
    _load() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.userId !== 'string' || !Array.isArray(parsed.roles)) {
                return null;
            }
            if (typeof parsed.expiresAtMs === 'number' && parsed.expiresAtMs < Date.now()) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return {
                userId: parsed.userId,
                displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
                roles: rolesFrom(parsed.roles),
                expiresAtMs: typeof parsed.expiresAtMs === 'number' ? parsed.expiresAtMs : 0,
            };
        }
        catch {
            return null;
        }
    }
    static ɵfac = function SessionStore_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || SessionStore)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: SessionStore, factory: SessionStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(SessionStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
