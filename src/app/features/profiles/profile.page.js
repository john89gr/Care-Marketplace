import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileStore } from './profile.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, isVisitProvider } from '../../core/auth/roles';
import { amkaValidator, afmValidator, licenceNumberValidator } from '../../shared/validators/id.validators';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
function ProfilePage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵelementEnd();
} }
function ProfilePage_Conditional_4_Conditional_7_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 9);
    i0.ɵɵtext(1, "AMKA must be 11 digits with a valid date.");
    i0.ɵɵelementEnd();
} }
function ProfilePage_Conditional_4_Conditional_7_Conditional_10_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 11);
    i0.ɵɵtext(1, "AFM must be 9 digits with a valid checksum.");
    i0.ɵɵelementEnd();
} }
function ProfilePage_Conditional_4_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "fieldset")(1, "legend");
    i0.ɵɵtext(2, "Greek identifiers (used for vetting)");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "label");
    i0.ɵɵtext(4, "AMKA ");
    i0.ɵɵelement(5, "input", 8);
    i0.ɵɵcontrolCreate();
    i0.ɵɵconditionalCreate(6, ProfilePage_Conditional_4_Conditional_7_Conditional_6_Template, 2, 0, "span", 9);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(7, "label");
    i0.ɵɵtext(8, "AFM (tax number) ");
    i0.ɵɵelement(9, "input", 10);
    i0.ɵɵcontrolCreate();
    i0.ɵɵconditionalCreate(10, ProfilePage_Conditional_4_Conditional_7_Conditional_10_Template, 2, 0, "span", 11);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(5);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.form.controls.amka.dirty && ctx_r1.form.controls.amka.errors ? 6 : -1);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.form.controls.afm.dirty && ctx_r1.form.controls.afm.errors ? 10 : -1);
} }
function ProfilePage_Conditional_4_Conditional_8_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 13);
    i0.ɵɵtext(1, "Licence: 5\u201320 letters, digits or hyphens.");
    i0.ɵɵelementEnd();
} }
function ProfilePage_Conditional_4_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "fieldset")(1, "legend");
    i0.ɵɵtext(2, "Professional details");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "label");
    i0.ɵɵtext(4, "Licence number ");
    i0.ɵɵelement(5, "input", 12);
    i0.ɵɵcontrolCreate();
    i0.ɵɵconditionalCreate(6, ProfilePage_Conditional_4_Conditional_8_Conditional_6_Template, 2, 0, "span", 13);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(7, "label");
    i0.ɵɵtext(8, "Hourly rate (\u20AC) ");
    i0.ɵɵelement(9, "input", 14);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(5);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.form.controls.licenceNumber.dirty && ctx_r1.form.controls.licenceNumber.errors ? 6 : -1);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
} }
function ProfilePage_Conditional_4_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 6);
    i0.ɵɵtext(1, "Profile saved.");
    i0.ɵɵelementEnd();
} }
function ProfilePage_Conditional_4_Conditional_12_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 7);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r1.store.saveError());
} }
function ProfilePage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "form", 2);
    i0.ɵɵlistener("ngSubmit", function ProfilePage_Conditional_4_Template_form_ngSubmit_0_listener() { i0.ɵɵrestoreView(_r1); const ctx_r1 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r1.submit()); });
    i0.ɵɵelementStart(1, "label");
    i0.ɵɵtext(2, "Full name ");
    i0.ɵɵelement(3, "input", 3);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(4, "label");
    i0.ɵɵtext(5, "Phone ");
    i0.ɵɵelement(6, "input", 4);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(7, ProfilePage_Conditional_4_Conditional_7_Template, 11, 2, "fieldset");
    i0.ɵɵconditionalCreate(8, ProfilePage_Conditional_4_Conditional_8_Template, 10, 1, "fieldset");
    i0.ɵɵelementStart(9, "button", 5);
    i0.ɵɵtext(10);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(11, ProfilePage_Conditional_4_Conditional_11_Template, 2, 0, "p", 6);
    i0.ɵɵconditionalCreate(12, ProfilePage_Conditional_4_Conditional_12_Template, 2, 1, "p", 7);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵproperty("formGroup", ctx_r1.form);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.isClient() ? 7 : -1);
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.isProvider() ? 8 : -1);
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r1.store.saving() || ctx_r1.form.invalid);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r1.store.saving() ? "Saving\u2026" : "Save profile", " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.store.saved() ? 11 : -1);
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.store.saveError() ? 12 : -1);
} }
export class ProfilePage {
    store = inject(ProfileStore);
    session = inject(SessionStore);
    fb = inject(FormBuilder);
    form = this.fb.nonNullable.group({
        displayName: ['', [Validators.required, Validators.minLength(2)]],
        phone: [''],
        amka: ['', [], [amkaValidator()]],
        afm: ['', [], [afmValidator()]],
        licenceNumber: ['', [], [licenceNumberValidator()]],
        hourlyRate: [null],
    });
    isClient = computed(() => this.session.hasAnyRole([ROLES.CLIENT]), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isClient" }] : /* istanbul ignore next */ []));
    isProvider = computed(() => isVisitProvider(this.session.roles()), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isProvider" }] : /* istanbul ignore next */ []));
    ngOnInit() {
        this.store.load().subscribe(() => {
            const p = this.store.profile();
            this.form.patchValue({
                displayName: p.displayName,
                phone: p.phone,
                amka: p.amka,
                afm: p.afm,
                licenceNumber: p.licenceNumber,
                hourlyRate: p.hourlyRate,
            });
        });
    }
    submit() {
        if (this.form.invalid || this.store.saving()) {
            return;
        }
        const raw = this.form.getRawValue();
        this.store.save({
            displayName: raw.displayName,
            phone: raw.phone,
            amka: this.isClient() ? raw.amka : '',
            afm: this.isClient() ? raw.afm : '',
            licenceNumber: this.isProvider() ? raw.licenceNumber : '',
            hourlyRate: this.isProvider() ? raw.hourlyRate : null,
        }).subscribe();
    }
    static ɵfac = function ProfilePage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ProfilePage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: ProfilePage, selectors: [["app-profile"]], decls: 5, vars: 1, consts: [[1, "profile"], [3, "formGroup"], [3, "ngSubmit", "formGroup"], ["type", "text", "formControlName", "displayName", "autocomplete", "name"], ["type", "tel", "formControlName", "phone", "autocomplete", "tel"], ["type", "submit", 3, "disabled"], ["role", "status", 1, "saved"], ["role", "alert", 1, "error"], ["type", "text", "inputmode", "numeric", "formControlName", "amka", "placeholder", "11 digits", "aria-describedby", "amka-hint"], ["id", "amka-hint", 1, "error"], ["type", "text", "inputmode", "numeric", "formControlName", "afm", "placeholder", "9 digits", "aria-describedby", "afm-hint"], ["id", "afm-hint", 1, "error"], ["type", "text", "formControlName", "licenceNumber", "placeholder", "e.g. \u039D\u039F\u03A3-2024-\u0391123", "aria-describedby", "licence-hint"], ["id", "licence-hint", 1, "error"], ["type", "number", "min", "0", "step", "1", "formControlName", "hourlyRate"]], template: function ProfilePage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "My profile");
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(3, ProfilePage_Conditional_3_Template, 2, 0, "p")(4, ProfilePage_Conditional_4_Template, 13, 7, "form", 1);
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : 4);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.DefaultValueAccessor, i1.NumberValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.MinValidator, i1.FormGroupDirective, i1.FormControlName], styles: ["fieldset[_ngcontent-%COMP%] {\n      border: 1px solid var(--%NS%border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.9rem;\n    }\n    legend[_ngcontent-%COMP%] {\n      color: var(--%NS%text-muted);\n      font-size: 0.85rem;\n      padding-inline: 0.25rem;\n    }\n    .saved[_ngcontent-%COMP%] {\n      color: var(--%NS%success);\n      margin: 0;\n    }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ProfilePage, [{
        type: Component,
        args: [{ selector: 'app-profile', standalone: true, imports: [ReactiveFormsModule], template: `
    <section class="profile">
      <h1>My profile</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Full name
            <input type="text" formControlName="displayName" autocomplete="name" />
          </label>
          <label>Phone
            <input type="tel" formControlName="phone" autocomplete="tel" />
          </label>

          @if (isClient()) {
            <fieldset>
              <legend>Greek identifiers (used for vetting)</legend>
              <label>AMKA
                <input type="text" inputmode="numeric" formControlName="amka"
                  placeholder="11 digits" aria-describedby="amka-hint" />
                @if (form.controls.amka.dirty && form.controls.amka.errors) {
                  <span class="error" id="amka-hint">AMKA must be 11 digits with a valid date.</span>
                }
              </label>
              <label>AFM (tax number)
                <input type="text" inputmode="numeric" formControlName="afm"
                  placeholder="9 digits" aria-describedby="afm-hint" />
                @if (form.controls.afm.dirty && form.controls.afm.errors) {
                  <span class="error" id="afm-hint">AFM must be 9 digits with a valid checksum.</span>
                }
              </label>
            </fieldset>
          }

          @if (isProvider()) {
            <fieldset>
              <legend>Professional details</legend>
              <label>Licence number
                <input type="text" formControlName="licenceNumber"
                  placeholder="e.g. ΝΟΣ-2024-Α123" aria-describedby="licence-hint" />
                @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
                  <span class="error" id="licence-hint">Licence: 5–20 letters, digits or hyphens.</span>
                }
              </label>
              <label>Hourly rate (€)
                <input type="number" min="0" step="1" formControlName="hourlyRate" />
              </label>
            </fieldset>
          }

          <button type="submit" [disabled]="store.saving() || form.invalid">
            {{ store.saving() ? 'Saving…' : 'Save profile' }}
          </button>

          @if (store.saved()) {
            <p class="saved" role="status">Profile saved.</p>
          }
          @if (store.saveError()) {
            <p class="error" role="alert">{{ store.saveError() }}</p>
          }
        </form>
      }
    </section>
  `, styles: ["\n    fieldset {\n      border: 1px solid var(--border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.9rem;\n    }\n    legend {\n      color: var(--text-muted);\n      font-size: 0.85rem;\n      padding-inline: 0.25rem;\n    }\n    .saved {\n      color: var(--success);\n      margin: 0;\n    }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(ProfilePage, { className: "ProfilePage", filePath: "src/app/features/profiles/profile.page.ts", lineNumber: 97 }); })();
