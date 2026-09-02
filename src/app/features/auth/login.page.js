import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
function LoginPage_Conditional_14_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.auth.loginError());
} }
export class LoginPage {
    auth = inject(AuthApi);
    router = inject(Router);
    fb = inject(FormBuilder);
    form = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
    });
    navigating = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "navigating" }] : /* istanbul ignore next */ []));
    submit() {
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
    static ɵfac = function LoginPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || LoginPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: LoginPage, selectors: [["app-login"]], decls: 19, vars: 3, consts: [[1, "login"], [3, "ngSubmit", "formGroup"], ["type", "email", "formControlName", "email", "autocomplete", "username"], ["type", "password", "formControlName", "password", "autocomplete", "current-password"], ["type", "submit", 3, "disabled"], ["type", "button", 1, "secondary", 3, "click"], ["role", "alert", 1, "error"], ["routerLink", "/register"]], template: function LoginPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Connexion");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "form", 1);
            i0.ɵɵlistener("ngSubmit", function LoginPage_Template_form_ngSubmit_3_listener() { return ctx.submit(); });
            i0.ɵɵelementStart(4, "label");
            i0.ɵɵtext(5, "Email ");
            i0.ɵɵelement(6, "input", 2);
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(7, "label");
            i0.ɵɵtext(8, "Mot de passe ");
            i0.ɵɵelement(9, "input", 3);
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(10, "button", 4);
            i0.ɵɵtext(11, "Se connecter");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(12, "button", 5);
            i0.ɵɵlistener("click", function LoginPage_Template_button_click_12_listener() { return ctx.auth.loginWithTaxisnet(); });
            i0.ɵɵtext(13, "Gov.gr / Taxisnet");
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(14, LoginPage_Conditional_14_Template, 2, 1, "p", 6);
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(15, "p");
            i0.ɵɵtext(16, "No account yet? ");
            i0.ɵɵelementStart(17, "a", 7);
            i0.ɵɵtext(18, "Create one");
            i0.ɵɵelementEnd()()();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵproperty("formGroup", ctx.form);
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance();
            i0.ɵɵproperty("disabled", ctx.auth.loginPending() || ctx.form.invalid);
            i0.ɵɵadvance(4);
            i0.ɵɵconditional(ctx.auth.loginError() ? 14 : -1);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.DefaultValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.FormGroupDirective, i1.FormControlName, RouterLink], encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(LoginPage, [{
        type: Component,
        args: [{
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
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(LoginPage, { className: "LoginPage", filePath: "src/app/features/auth/login.page.ts", lineNumber: 30 }); })();
