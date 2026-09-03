import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { SessionStore, IdVerificationMethod } from '../auth/session';
import { Role, rolesFrom } from '../auth/roles';

interface SessionPayload {
  userId: string;
  displayName: string;
  roles: unknown;
  expiresAtMs: number;
  idVerifiedVia?: IdVerificationMethod;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
  role: Role;
}

/**
 * Auth API client. Talks to the backend (contract per PLAN.md §1:
 * OAuth2/OIDC + Taxisnet) and feeds the SessionStore. Until the backend
 * exists, login()/register() against the demo endpoint fails gracefully and
 * the store stays empty — guards then redirect to /login.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly sessionStore = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly _loginPending = signal(false);
  private readonly _loginError = signal('');

  readonly loginPending = this._loginPending.asReadonly();
  readonly loginError = this._loginError.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionStore.isLoggedIn());

  login(email: string, password: string): Observable<unknown> {
    this._begin();
    return this.http
      .post<SessionPayload>('/api/auth/login', { email, password })
      .pipe(
        tap((payload) => this._applySession(payload)),
        catchError((error) => this._fail(error))
      );
  }

  register(payload: RegisterPayload): Observable<unknown> {
    this._begin();
    return this.http
      .post<SessionPayload>('/api/auth/register', payload)
      .pipe(
        tap((session) => this._applySession(session)),
        catchError((error) => this._fail(error))
      );
  }

  loginWithTaxisnet(): void {
    // Gov.gr / Taxisnet OIDC flow is handled by the gov-gr-auth callback page.
    // The page calls /api/auth/gov-gr/authorize then /api/auth/gov-gr/callback.
    this.router.navigateByUrl('/gov-gr-auth');
  }

  /**
   * Process a Gov.gr OIDC callback by exchanging the authorization code.
   * In demo mode the authorize endpoint returns a simulated code directly;
   * in production this mirrors the real PKCE token exchange
   * (PLAN.md §3.D, FEATURE_PLAN.md §15 subtask 4).
   */
  loginWithGovGr(code: string, state: string): Observable<boolean> {
    this._begin();
    return this.http
      .post<SessionPayload>('/api/auth/gov-gr/callback', { code, state })
      .pipe(
        tap((payload) => this._applySession(payload)),
        map(() => true),
        catchError((error) => this._fail(error))
      );
  }

  /**
   * Start the Gov.gr OIDC flow: fetches the authorize URL + state (and a
   * simulated code in demo mode) from the backend.
   */
  govGrAuthorize(): Observable<{ authorizeUrl: string; state: string; code?: string; demo?: boolean }> {
    return this.http.get<{ authorizeUrl: string; state: string; code?: string; demo?: boolean }>(
      '/api/auth/gov-gr/authorize'
    );
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}).pipe(catchError(() => of(null))).subscribe({
      complete: () => this.sessionStore.clear(),
    });
    this.sessionStore.clear();
  }

  private _begin(): void {
    this._loginPending.set(true);
    this._loginError.set('');
  }

  private _applySession(payload: SessionPayload): void {
    this.sessionStore.setSession({
      userId: payload.userId,
      displayName: payload.displayName,
      roles: rolesFrom(payload.roles),
      expiresAtMs: payload.expiresAtMs,
      idVerifiedVia: payload.idVerifiedVia ?? 'email',
    });
    this._loginPending.set(false);
  }

  private _fail(error: unknown): Observable<boolean> {
    this._loginPending.set(false);
    this._loginError.set(
      (error as { error?: { message?: string } })?.error?.message ??
        'Échec de connexion. Vérifiez vos identifiants.'
    );
    return of(false);
  }
}
