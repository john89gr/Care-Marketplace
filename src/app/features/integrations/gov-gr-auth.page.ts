import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalizedMessage } from '../../core/i18n/localized-message';

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
      <div class="card gov-card">
        <span class="icon-bubble lg gov-mark" aria-hidden="true">🔐</span>
        <h1 class="page-title">{{ i18n.t('govGr.title') }}</h1>

        @if (status() === 'redirecting') {
          <p class="status" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {{ i18n.t('govGr.redirecting') }}
          </p>
        }

        @if (status() === 'exchanging') {
          <p class="status" role="status">
            <span class="spinner" aria-hidden="true"></span>
            {{ i18n.t('govGr.exchanging') }}
          </p>
        }

        @if (status() === 'error') {
          <p class="alert danger" role="alert">
            <span class="alert-icon" aria-hidden="true">⚠️</span>
            <span>{{ i18n.message(error.source(), error.value()) }}</span>
          </p>
          <button type="button" class="btn" (click)="retry()" [disabled]="retrying()">
            {{ retrying() ? i18n.t('govGr.retrying') : i18n.t('common.retry') }}
          </button>
        }
      </div>
    </section>
  `,
  styles: `
    .gov-gr-auth {
      display: flex;
      justify-content: center;
      padding: var(--space-7) 0;
    }
    .gov-card {
      position: relative;
      overflow: hidden;
      display: grid;
      justify-items: center;
      text-align: center;
      gap: var(--space-3);
      width: 100%;
      max-width: 26rem;
      padding: var(--space-6);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
    }
    .gov-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: var(--accent-grad);
    }
    .gov-mark {
      width: 3.25rem;
      height: 3.25rem;
      font-size: 1.5rem;
    }
    .gov-card .page-title {
      font-size: var(--text-xl);
      margin: 0;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
      margin: 0;
    }
    .gov-card .alert {
      text-align: left;
      width: 100%;
      margin: 0;
    }
    .spinner {
      width: 1rem;
      height: 1rem;
      border-radius: var(--radius-full);
      border: 2px solid var(--border-strong);
      border-top-color: var(--accent);
      animation: gov-spin 700ms linear infinite;
    }
    @keyframes gov-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class GovGrAuthPage implements OnInit {
  protected readonly i18n = inject(I18n);

  private readonly auth = inject(AuthApi);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly status = signal<'redirecting' | 'exchanging' | 'error' | 'success'>('redirecting');
  /** App-authored key, or the auth service's own (server) failure text. */
  readonly error = new LocalizedMessage();
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
          this.fail('govGr.error.start');
        }
      },
      error: () => this.fail('govGr.error.contact'),
    });
  }

  private exchangeCode(code: string, state: string): void {
    this.status.set('exchanging');
    this.auth.loginWithGovGr(code, state).subscribe((ok) => {
      if (ok) {
        this.status.set('success');
        this.router.navigateByUrl('/wallet');
      } else {
        const source = this.auth.errorSource();
        this.status.set('error');
        if (source) {
          this.error.set(source);
        } else {
          this.error.setFromServer(this.auth.loginError(), { key: 'govGr.error.failed' });
        }
      }
    });
  }

  /** App-authored failure: the key is rendered in the active language. */
  private fail(key: string): void {
    this.status.set('error');
    this.error.set({ key });
  }

  /** User-initiated retry — no automatic loop (subtask 17). */
  retry(): void {
    this.retrying.set(true);
    this.error.clear();
    this.status.set('redirecting');
    // Small delay so the button shows the "Retrying…" state before the flow
    // re-enters the redirecting/exchanging phases.
    setTimeout(() => {
      this.retrying.set(false);
      this.startFlow();
    }, 300);
  }
}
