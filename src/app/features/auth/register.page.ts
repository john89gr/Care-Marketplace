import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { ROLES } from '../../core/auth/roles';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="register">
      <h1>Create an account</h1>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Full name
          <input type="text" formControlName="displayName" autocomplete="name" />
        </label>
        <label>Email
          <input type="email" formControlName="email" autocomplete="username" />
        </label>
        <label>Password
          <input type="password" formControlName="password" autocomplete="new-password" />
        </label>
        <label>I am a…
          <select formControlName="role">
            <option [ngValue]="ROLES.CLIENT">Family member / client</option>
            <option [ngValue]="ROLES.CAREGIVER">Caregiver</option>
          </select>
        </label>
        <button type="submit" [disabled]="auth.loginPending() || form.invalid">
          {{ auth.loginPending() ? 'Creating…' : 'Create account' }}
        </button>
        @if (auth.loginError()) {
          <p class="error" role="alert">{{ auth.loginError() }}</p>
        }
      </form>
      <p>Already registered? <a routerLink="/login">Log in</a></p>
    </section>
  `,
})
export class RegisterPage {
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
