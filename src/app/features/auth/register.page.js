import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { ROLES } from '../../core/auth/roles';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
function RegisterPage_Conditional_22_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 8);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.auth.loginError());
} }
export class RegisterPage {
    auth = inject(AuthApi);
    router = inject(Router);
    fb = inject(FormBuilder);
    ROLES = ROLES;
    form = this.fb.nonNullable.group({
        displayName: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]],
        role: [ROLES.CLIENT, [Validators.required]],
    });
    submit() {
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
    static ɵfac = function RegisterPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || RegisterPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: RegisterPage, selectors: [["app-register"]], decls: 27, vars: 6, consts: [[1, "register"], [3, "ngSubmit", "formGroup"], ["type", "text", "formControlName", "displayName", "autocomplete", "name"], ["type", "email", "formControlName", "email", "autocomplete", "username"], ["type", "password", "formControlName", "password", "autocomplete", "new-password"], ["formControlName", "role"], [3, "ngValue"], ["type", "submit", 3, "disabled"], ["role", "alert", 1, "error"], ["routerLink", "/login"]], template: function RegisterPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Create an account");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "form", 1);
            i0.ɵɵlistener("ngSubmit", function RegisterPage_Template_form_ngSubmit_3_listener() { return ctx.submit(); });
            i0.ɵɵelementStart(4, "label");
            i0.ɵɵtext(5, "Full name ");
            i0.ɵɵelement(6, "input", 2);
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(7, "label");
            i0.ɵɵtext(8, "Email ");
            i0.ɵɵelement(9, "input", 3);
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(10, "label");
            i0.ɵɵtext(11, "Password ");
            i0.ɵɵelement(12, "input", 4);
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(13, "label");
            i0.ɵɵtext(14, "I am a\u2026 ");
            i0.ɵɵelementStart(15, "select", 5)(16, "option", 6);
            i0.ɵɵtext(17, "Family member / client");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(18, "option", 6);
            i0.ɵɵtext(19, "Caregiver");
            i0.ɵɵelementEnd()();
            i0.ɵɵcontrolCreate();
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(20, "button", 7);
            i0.ɵɵtext(21);
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(22, RegisterPage_Conditional_22_Template, 2, 1, "p", 8);
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(23, "p");
            i0.ɵɵtext(24, "Already registered? ");
            i0.ɵɵelementStart(25, "a", 9);
            i0.ɵɵtext(26, "Log in");
            i0.ɵɵelementEnd()()();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵproperty("formGroup", ctx.form);
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance(3);
            i0.ɵɵcontrol();
            i0.ɵɵadvance();
            i0.ɵɵproperty("ngValue", ctx.ROLES.CLIENT);
            i0.ɵɵadvance(2);
            i0.ɵɵproperty("ngValue", ctx.ROLES.CAREGIVER);
            i0.ɵɵadvance(2);
            i0.ɵɵproperty("disabled", ctx.auth.loginPending() || ctx.form.invalid);
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate1(" ", ctx.auth.loginPending() ? "Creating\u2026" : "Create account", " ");
            i0.ɵɵadvance();
            i0.ɵɵconditional(ctx.auth.loginError() ? 22 : -1);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.NgSelectOption, i1.ɵNgSelectMultipleOption, i1.DefaultValueAccessor, i1.SelectControlValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.FormGroupDirective, i1.FormControlName, RouterLink], encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(RegisterPage, [{
        type: Component,
        args: [{
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
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(RegisterPage, { className: "RegisterPage", filePath: "src/app/features/auth/register.page.ts", lineNumber: 41 }); })();
