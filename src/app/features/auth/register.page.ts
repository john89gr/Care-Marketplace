import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { ROLES } from '../../core/auth/roles';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth">
      <div class="card auth-card">
        <header class="auth-head">
          <span class="brand-mark auth-mark" aria-hidden="true">✚</span>
          <h1 class="page-title">{{ i18n.t('auth.registerTitle') }}</h1>
          <p class="page-subtitle">{{ i18n.t('auth.registerSubtitle') }}</p>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">{{ i18n.t('auth.fullName') }}</span>
            <input type="text" formControlName="displayName" autocomplete="name" />
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('auth.email') }}</span>
            <input type="email" formControlName="email" autocomplete="username" />
          </label>
          <label class="field">
            <span class="field-label">{{ i18n.t('auth.password') }}</span>
            <input type="password" formControlName="password" autocomplete="new-password" />
          </label>

          <label class="field">
            <span class="field-label">{{ i18n.t('auth.roleLabel') }}</span>
            <select formControlName="role">
              <option [ngValue]="ROLES.CLIENT">{{ i18n.t('auth.roleClient') }}</option>
              <option [ngValue]="ROLES.CAREGIVER">{{ i18n.t('market.role.caregiver') }}</option>
            </select>
          </label>

          <button type="submit" class="btn block lg" [disabled]="auth.loginPending() || form.invalid">
            {{ auth.loginPending() ? i18n.t('auth.creating') : i18n.t('auth.createAccount') }}
          </button>

          @if (auth.loginError()) {
            <p class="error" role="alert">{{ i18n.message(auth.errorSource(), auth.loginError()) }}</p>
          }
        </form>

        <p class="auth-alt">
          {{ i18n.t('auth.alreadyRegistered') }} <a routerLink="/login">{{ i18n.t('account.logIn') }}</a>
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
    .auth-alt {
      margin: var(--space-5) 0 0;
      text-align: center;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class RegisterPage {
  protected readonly i18n = inject(I18n);

  readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly ROLES = ROLES;

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: [ROLES.CLIENT, [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.auth.loginPending()) {
      return;
    }
    const raw = this.form.getRawValue();
    this.auth.register(raw).subscribe((result) => {
      if (result) {
        this.router.navigateByUrl('/marketplace');
      }
    });
  }
}
