import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, catchError, of } from 'rxjs';
import { SessionStore } from '../auth/session';
import { rolesFrom } from '../auth/roles';
import * as i0 from "@angular/core";
/**
 * Auth API client. Talks to the backend (contract per PLAN.md §1:
 * OAuth2/OIDC + Taxisnet) and feeds the SessionStore. Until the backend
 * exists, login()/register() against the demo endpoint fails gracefully and
 * the store stays empty — guards then redirect to /login.
 */
export class AuthApi {
    http = inject(HttpClient);
    sessionStore = inject(SessionStore);
    _loginPending = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loginPending" }] : /* istanbul ignore next */ []));
    _loginError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loginError" }] : /* istanbul ignore next */ []));
    loginPending = this._loginPending.asReadonly();
    loginError = this._loginError.asReadonly();
    isAuthenticated = computed(() => this.sessionStore.isLoggedIn(), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isAuthenticated" }] : /* istanbul ignore next */ []));
    login(email, password) {
        this._begin();
        return this.http
            .post('/api/auth/login', { email, password })
            .pipe(tap((payload) => this._applySession(payload)), catchError((error) => this._fail(error)));
    }
    register(payload) {
        this._begin();
        return this.http
            .post('/api/auth/register', payload)
            .pipe(tap((session) => this._applySession(session)), catchError((error) => this._fail(error)));
    }
    loginWithTaxisnet() {
        // Gov.gr / Taxisnet OIDC redirect — backend supplies the authorize URL.
        window.location.href = '/api/auth/taxisnet/authorize';
    }
    logout() {
        this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null))).subscribe({
            complete: () => this.sessionStore.clear(),
        });
        this.sessionStore.clear();
    }
    _begin() {
        this._loginPending.set(true);
        this._loginError.set('');
    }
    _applySession(payload) {
        this.sessionStore.setSession({
            userId: payload.userId,
            displayName: payload.displayName,
            roles: rolesFrom(payload.roles),
            expiresAtMs: payload.expiresAtMs,
        });
        this._loginPending.set(false);
    }
    _fail(error) {
        this._loginPending.set(false);
        this._loginError.set(error?.error?.message ??
            'Échec de connexion. Vérifiez vos identifiants.');
        return of(null);
    }
    static ɵfac = function AuthApi_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || AuthApi)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: AuthApi, factory: AuthApi.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(AuthApi, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
