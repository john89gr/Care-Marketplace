import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
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
    </section>
  `,
  styles: `
    .auth {
      display: flex;
      justify-content: center;
      padding: var(--space-5) 0 var(--space-7);
    }
    .auth-card {
      width: 100%;
      max-width: 26rem;
      padding: var(--space-6);
      box-shadow: var(--shadow-lg);
    }
    .auth-head {
      display: grid;
      justify-items: center;
      text-align: center;
      gap: var(--space-2);
      margin-bottom: var(--space-5);
    }
    .auth-mark {
      width: 3rem;
      height: 3rem;
      font-size: 1.4rem;
      border-radius: var(--radius-lg);
    }
    .auth-head .page-title {
      font-size: var(--text-xl);
    }
    .auth-head .page-subtitle {
      margin: 0;
    }
    form {
      max-width: none;
      gap: var(--space-4);
    }
    .auth-sep {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--text-subtle);
      font-size: var(--text-xs);
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
    .auth-alt {
      margin: var(--space-5) 0 0;
      text-align: center;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class LoginPage {
  protected readonly i18n = inject(I18n);

  readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly navigating = signal(false);

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
