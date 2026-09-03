import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { SessionStore } from '../../core/auth/session';

/**
 * Gov.gr OIDC callback handler (FEATURE_PLAN.md §15 subtasks 4, 17).
 *
 * In production the browser is redirected to the real Gov.gr authorize URL;
 * the user returns here with `?code=…&state=…` query params which are exchanged
 * for a session. In demo mode the authorize endpoint returns a simulated code
 * inline, so the full PKCE exchange is exercised without leaving the app.
 *
 * Failure modes (subtask 17): errors are surfaced as user-friendly copy with
 * a retry button; retry is user-initiated only (no automatic loops).
 */
@Component({
  selector: 'app-gov-gr-auth',
  standalone: true,
  template: `
    <section class="gov-gr-auth">
      <h1>Gov.gr identity verification</h1>

      @if (status() === 'redirecting') {
        <p role="status">Redirecting to Gov.gr…</p>
      }

      @if (status() === 'exchanging') {
        <p role="status">Completing verification…</p>
      }

      @if (status() === 'error') {
        <p class="error" role="alert">{{ error() }}</p>
        <button type="button" (click)="retry()" [disabled]="retrying()">
          {{ retrying() ? 'Retrying…' : 'Retry' }}
        </button>
      }
    </section>
  `,
  styles: `
    .gov-gr-auth { max-width: 28rem; margin: 4rem auto; text-align: center; }
    .error { color: var(--danger, #c62828); margin: 1rem 0; }
    button { min-height: 44px; padding: 0.5rem 1.5rem; border-radius: 0.5rem; cursor: pointer; }
  `,
})
export class GovGrAuthPage implements OnInit {
  private readonly auth = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly status = signal<'redirecting' | 'exchanging' | 'error' | 'success'>('redirecting');
  readonly error = signal('');
  readonly retrying = signal(false);

  ngOnInit(): void {
    this.startFlow();
  }

  private startFlow(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    const state = this.route.snapshot.queryParamMap.get('state');

    if (code && state) {
      // Real OIDC callback: exchange the code for a session.
      this.exchangeCode(code, state);
    } else {
      // Demo / simulated flow: ask the backend for a code, then exchange.
      this.simulateFlow();
    }
  }

  private simulateFlow(): void {
    this.status.set('redirecting');
    this.auth.govGrAuthorize().subscribe({
      next: (resp) => {
        if (resp.demo && resp.code) {
          this.exchangeCode(resp.code, resp.state);
        } else if (resp.authorizeUrl) {
          // Production path: redirect the browser to Gov.gr.
          window.location.href = resp.authorizeUrl;
        } else {
          this.fail('Unable to start the Gov.gr verification flow.');
        }
      },
      error: () => this.fail('Could not contact the Gov.gr service. Please try again.'),
    });
  }

  private exchangeCode(code: string, state: string): void {
    this.status.set('exchanging');
    this.auth.loginWithGovGr(code, state).subscribe((ok) => {
      if (ok) {
        this.status.set('success');
        this.router.navigateByUrl('/wallet');
      } else {
        this.fail(this.auth.loginError() || 'Gov.gr verification failed. Please try again.');
      }
    });
  }

  private fail(message: string): void {
    this.status.set('error');
    this.error.set(message);
  }

  /** User-initiated retry — no automatic loop (subtask 17). */
  retry(): void {
    this.retrying.set(true);
    this.error.set('');
    this.status.set('redirecting');
    // Small delay so the button shows the "Retrying…" state before the flow
    // re-enters the redirecting/exchanging phases.
    setTimeout(() => {
      this.retrying.set(false);
      this.startFlow();
    }, 300);
  }
}
