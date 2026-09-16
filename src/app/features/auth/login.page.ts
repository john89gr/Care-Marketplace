import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi, DemoAccount } from '../../core/auth/auth.api';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * Sign-in surface. Beside the real form it offers the demo backend's account
 * roster as one-click sign-ins (`GET /api/demo/accounts`): ten accounts
 * covering every role, so each capability of the product is one tap away.
 *
 * The picker is opportunistic — outside demo mode that endpoint 404s, the
 * list stays empty and the panel never renders.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth login">
      <div class="card auth-card">
        <header class="auth-head">
          <span class="brand-mark auth-mark" aria-hidden="true">✚</span>
          <h1 class="page-title">{{ i18n.t('account.logIn') }}</h1>
          <p class="page-subtitle">{{ i18n.t('auth.loginSubtitle') }}</p>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">{{ i18n.t('auth.email') }}</span>
            <input type="email" formControlName="email" autocomplete="username" />
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('auth.password') }}</span>
            <input type="password" formControlName="password" autocomplete="current-password" />
          </label>

          <button type="submit" class="btn block lg" [disabled]="auth.loginPending() || form.invalid">
            {{ i18n.t('account.logIn') }}
          </button>

          <div class="auth-sep" aria-hidden="true">
            <span>{{ i18n.t('auth.or') }}</span>
          </div>

          <!-- Gov.gr / Taxisnet is a product name: it reads the same in both locales. -->
          <button type="button" class="btn secondary block" (click)="auth.loginWithTaxisnet()">
            Gov.gr / Taxisnet
          </button>

          @if (auth.loginError()) {
            <p class="error" role="alert">{{ i18n.message(auth.errorSource(), auth.loginError()) }}</p>
          }
        </form>

        <p class="auth-alt">
          {{ i18n.t('auth.noAccount') }} <a routerLink="/register">{{ i18n.t('auth.createOne') }}</a>
        </p>
      </div>

      @if (demoAccounts().length > 0) {
        <aside class="card demo-card" aria-labelledby="demo-accounts-title">
          <h2 class="card-title" id="demo-accounts-title">{{ i18n.t('demo.accountsTitle') }}</h2>
          <p class="meta">{{ i18n.t('demo.accountsHint') }}</p>

          <ul class="demo-list">
            @for (account of demoAccounts(); track account.userId) {
              <li>
                <button
                  type="button"
                  class="demo-account"
                  [disabled]="auth.loginPending()"
                  [attr.aria-label]="i18n.t('demo.signInAs', { name: account.displayName })"
                  (click)="signInAs(account)"
                >
                  <span class="avatar demo-avatar" aria-hidden="true">
                    {{ initials(account.displayName) }}
                  </span>
                  <span class="demo-info">
                    <strong>{{ account.displayName }}</strong>
                    <span class="demo-email">{{ account.email }}</span>
                  </span>
                  <span class="demo-roles">
                    @for (role of account.roles; track role) {
                      <span class="badge outline">{{ i18n.t('market.role.' + role) }}</span>
                    }
                  </span>
                </button>
              </li>
            }
          </ul>
        </aside>
      }
    </section>
  `,
  styles: `
    .login {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: var(--space-5);
      flex-wrap: wrap;
    }
    .auth-sep {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--text-subtle);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .auth-sep::before,
    .auth-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }
    .demo-card {
      width: 100%;
      max-width: 28rem;
      padding: var(--space-5);
    }
    .demo-card .meta {
      margin: var(--space-1) 0 var(--space-4);
    }
    .demo-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.35rem;
      max-height: 26rem;
      overflow-y: auto;
    }
    .demo-account {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: 0.45rem 0.6rem;
      background: none;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: var(--text);
      text-align: left;
      cursor: pointer;
      box-shadow: none;
      font: inherit;
    }
    .demo-account:hover:not(:disabled) {
      background: var(--surface-raised);
      border-color: var(--border);
    }
    .demo-account:disabled {
      opacity: 0.6;
      cursor: progress;
    }
    .demo-avatar {
      width: 2.2rem;
      height: 2.2rem;
      font-size: var(--text-xs);
      flex: none;
    }
    .demo-info {
      display: grid;
      gap: 0.1rem;
      min-width: 0;
      flex: 1 1 auto;
    }
    .demo-info strong {
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .demo-email {
      font-size: var(--text-xs);
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .demo-roles {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
      justify-content: flex-end;
      flex: none;
    }
  `,
})
export class LoginPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly navigating = signal(false);
  /** Demo sign-in roster; empty outside demo mode (the endpoint 404s). */
  readonly demoAccounts = signal<DemoAccount[]>([]);

  ngOnInit(): void {
    this.auth.demoAccounts().subscribe({
      next: (accounts) => this.demoAccounts.set(accounts),
      error: () => this.demoAccounts.set([]),
    });
  }

  /** Initials for the account avatar bubble (decorative). */
  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  signInAs(account: DemoAccount): void {
    if (this.auth.loginPending()) {
      return;
    }
    // Prefill as well as submit, so the credentials stay visible if it fails.
    this.form.setValue({ email: account.email, password: account.password });
    this.auth.login(account.email, account.password).subscribe((result) => {
      if (result) {
        this.router.navigateByUrl('/marketplace');
      }
    });
  }

  submit(): void {
    if (this.form.invalid || this.auth.loginPending()) {
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe((result) => {
      if (result) {
        this.router.navigateByUrl('/marketplace');
      }
    });
  }
}
