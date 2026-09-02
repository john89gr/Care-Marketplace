import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="login">
      <h1>Connexion</h1>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Email
          <input type="email" formControlName="email" autocomplete="username" />
        </label>
        <label>Mot de passe
          <input type="password" formControlName="password" autocomplete="current-password" />
        </label>
        <button type="submit" [disabled]="auth.loginPending() || form.invalid">Se connecter</button>
        <button type="button" class="secondary" (click)="auth.loginWithTaxisnet()">Gov.gr / Taxisnet</button>
        @if (auth.loginError()) {
          <p class="error" role="alert">{{ auth.loginError() }}</p>
        }
      </form>
      <p>No account yet? <a routerLink="/register">Create one</a></p>
    </section>
  `,
})
export class LoginPage {
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
