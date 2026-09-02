import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VettingStore } from './vetting.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES } from '../../core/auth/roles';
import { licenceNumberValidator } from '../../shared/validators/id.validators';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
function OnboardingPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵelementEnd();
} }
function OnboardingPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 1);
    i0.ɵɵtext(1, " \u2705 Licence approved \u2014 you are fully onboarded and visible in the marketplace. ");
    i0.ɵɵelementEnd();
} }
function OnboardingPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 2);
    i0.ɵɵtext(1, " \u23F3 Licence under review \u2014 an administrator is vetting your submission. ");
    i0.ɵɵelementEnd();
} }
function OnboardingPage_Conditional_6_Conditional_0_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 3);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" \u274C Your previous submission was rejected: ", ctx_r1.store.mine()?.note || "no reason given", ". Correct it and resubmit. ");
} }
function OnboardingPage_Conditional_6_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 6);
    i0.ɵɵtext(1, "Licence: 5\u201320 letters, digits or hyphens.");
    i0.ɵɵelementEnd();
} }
function OnboardingPage_Conditional_6_For_10_Template(rf, ctx) { if (rf & 1) {
    const _r3 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "label", 7)(1, "input", 12);
    i0.ɵɵlistener("change", function OnboardingPage_Conditional_6_For_10_Template_input_change_1_listener() { const specialty_r4 = i0.ɵɵrestoreView(_r3).$implicit; const ctx_r1 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r1.toggleSpecialty(specialty_r4)); });
    i0.ɵɵelementEnd();
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const specialty_r4 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵproperty("checked", ctx_r1.selected().includes(specialty_r4));
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", specialty_r4, " ");
} }
function OnboardingPage_Conditional_6_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 8);
    i0.ɵɵtext(1, "Pick at least one specialty.");
    i0.ɵɵelementEnd();
} }
function OnboardingPage_Conditional_6_Conditional_17_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 11);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r1.store.error());
} }
function OnboardingPage_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵconditionalCreate(0, OnboardingPage_Conditional_6_Conditional_0_Template, 2, 1, "p", 3);
    i0.ɵɵelementStart(1, "form", 4);
    i0.ɵɵlistener("ngSubmit", function OnboardingPage_Conditional_6_Template_form_ngSubmit_1_listener() { i0.ɵɵrestoreView(_r1); const ctx_r1 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r1.submit()); });
    i0.ɵɵelementStart(2, "label");
    i0.ɵɵtext(3, "Licence number ");
    i0.ɵɵelement(4, "input", 5);
    i0.ɵɵcontrolCreate();
    i0.ɵɵconditionalCreate(5, OnboardingPage_Conditional_6_Conditional_5_Template, 2, 0, "span", 6);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(6, "fieldset")(7, "legend");
    i0.ɵɵtext(8, "Specialties");
    i0.ɵɵelementEnd();
    i0.ɵɵrepeaterCreate(9, OnboardingPage_Conditional_6_For_10_Template, 3, 2, "label", 7, i0.ɵɵrepeaterTrackByIdentity);
    i0.ɵɵconditionalCreate(11, OnboardingPage_Conditional_6_Conditional_11_Template, 2, 0, "span", 8);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(12, "label");
    i0.ɵɵtext(13, "Note (optional) ");
    i0.ɵɵelement(14, "textarea", 9);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(15, "button", 10);
    i0.ɵɵtext(16);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(17, OnboardingPage_Conditional_6_Conditional_17_Template, 2, 1, "p", 11);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵconditional(ctx_r1.store.isRejected() ? 0 : -1);
    i0.ɵɵadvance();
    i0.ɵɵproperty("formGroup", ctx_r1.form);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.form.controls.licenceNumber.dirty && ctx_r1.form.controls.licenceNumber.errors ? 5 : -1);
    i0.ɵɵadvance(4);
    i0.ɵɵrepeater(ctx_r1.specialties());
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r1.selected().length === 0 ? 11 : -1);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r1.store.submitting() || ctx_r1.form.invalid || ctx_r1.selected().length === 0);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r1.store.submitting() ? "Submitting\u2026" : ctx_r1.store.isRejected() ? "Resubmit" : "Submit for review", " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.store.error() ? 17 : -1);
} }
/** Specialty options per provider role (PLAN.md §3.A home health services). */
const SPECIALTIES = {
    [ROLES.CAREGIVER]: ['Elderly care', 'Childcare', 'Meal preparation', 'Mobility support'],
    [ROLES.NURSE]: ['Injections', 'Wound care', 'IV therapy', 'Pressure ulcer care'],
    [ROLES.PHYSIO]: ['Post-stroke rehab', 'Respiratory physio', 'Mobility training', 'Sports massage'],
};
export class OnboardingPage {
    store = inject(VettingStore);
    session = inject(SessionStore);
    fb = inject(FormBuilder);
    form = this.fb.nonNullable.group({
        licenceNumber: ['', [Validators.required], [licenceNumberValidator()]],
        note: [''],
    });
    selected = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "selected" }] : /* istanbul ignore next */ []));
    specialties = computed(() => {
        const role = this.providerRole();
        return SPECIALTIES[role] ?? [];
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "specialties" }] : /* istanbul ignore next */ []));
    ngOnInit() {
        this.store.loadMine();
    }
    toggleSpecialty(specialty) {
        this.selected.update((current) => current.includes(specialty)
            ? current.filter((s) => s !== specialty)
            : [...current, specialty]);
    }
    submit() {
        if (this.form.invalid || this.selected().length === 0 || this.store.submitting()) {
            return;
        }
        this.store
            .submit({
            licenceNumber: this.form.getRawValue().licenceNumber,
            specialties: this.selected(),
            note: this.form.getRawValue().note,
        })
            .subscribe();
    }
    providerRole() {
        const roles = this.session.roles();
        if (roles.includes(ROLES.NURSE)) {
            return ROLES.NURSE;
        }
        if (roles.includes(ROLES.PHYSIO)) {
            return ROLES.PHYSIO;
        }
        return ROLES.CAREGIVER;
    }
    static ɵfac = function OnboardingPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || OnboardingPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: OnboardingPage, selectors: [["app-onboarding"]], decls: 7, vars: 1, consts: [[1, "onboarding"], ["role", "status", 1, "status", "ok"], ["role", "status", 1, "status"], ["role", "alert", 1, "status", "bad"], [3, "ngSubmit", "formGroup"], ["type", "text", "formControlName", "licenceNumber", "placeholder", "e.g. \u039D\u039F\u03A3-2024-\u0391123", "aria-describedby", "licence-hint"], ["id", "licence-hint", 1, "error"], [1, "check"], [1, "error"], ["rows", "3", "formControlName", "note", "placeholder", "Certifications, experience, languages\u2026"], ["type", "submit", 3, "disabled"], ["role", "alert", 1, "error"], ["type", "checkbox", 3, "change", "checked"]], template: function OnboardingPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Professional onboarding");
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(3, OnboardingPage_Conditional_3_Template, 2, 0, "p")(4, OnboardingPage_Conditional_4_Template, 2, 0, "p", 1)(5, OnboardingPage_Conditional_5_Template, 2, 0, "p", 2)(6, OnboardingPage_Conditional_6_Template, 18, 7);
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : ctx.store.isApproved() ? 4 : ctx.store.isPending() ? 5 : 6);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.DefaultValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.FormGroupDirective, i1.FormControlName], styles: [".status[_ngcontent-%COMP%] {\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      background: var(--%NS%accent-soft);\n      margin: 0 0 1rem;\n    }\n    .status.ok[_ngcontent-%COMP%] { background: color-mix(in srgb, var(--%NS%success) 12%, transparent); }\n    .status.bad[_ngcontent-%COMP%] { background: var(--%NS%danger-soft); color: var(--%NS%danger); }\n    fieldset[_ngcontent-%COMP%] {\n      border: 1px solid var(--%NS%border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.5rem;\n    }\n    legend[_ngcontent-%COMP%] { color: var(--%NS%text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }\n    label.check[_ngcontent-%COMP%] { flex-direction: row; align-items: center; gap: 0.5rem; color: var(--%NS%text); }\n    label.check[_ngcontent-%COMP%]   input[_ngcontent-%COMP%] { width: auto; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(OnboardingPage, [{
        type: Component,
        args: [{ selector: 'app-onboarding', standalone: true, imports: [ReactiveFormsModule], template: `
    <section class="onboarding">
      <h1>Professional onboarding</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.isApproved()) {
        <p class="status ok" role="status">
          ✅ Licence approved — you are fully onboarded and visible in the marketplace.
        </p>
      } @else if (store.isPending()) {
        <p class="status" role="status">
          ⏳ Licence under review — an administrator is vetting your submission.
        </p>
      } @else {
        @if (store.isRejected()) {
          <p class="status bad" role="alert">
            ❌ Your previous submission was rejected:
            {{ store.mine()?.note || 'no reason given' }}. Correct it and resubmit.
          </p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Licence number
            <input
              type="text"
              formControlName="licenceNumber"
              placeholder="e.g. ΝΟΣ-2024-Α123"
              aria-describedby="licence-hint"
            />
            @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
              <span class="error" id="licence-hint">Licence: 5–20 letters, digits or hyphens.</span>
            }
          </label>

          <fieldset>
            <legend>Specialties</legend>
            @for (specialty of specialties(); track specialty) {
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="selected().includes(specialty)"
                  (change)="toggleSpecialty(specialty)"
                />
                {{ specialty }}
              </label>
            }
            @if (selected().length === 0) {
              <span class="error">Pick at least one specialty.</span>
            }
          </fieldset>

          <label>Note (optional)
            <textarea rows="3" formControlName="note"
              placeholder="Certifications, experience, languages…"></textarea>
          </label>

          <button type="submit" [disabled]="store.submitting() || form.invalid || selected().length === 0">
            {{ store.submitting() ? 'Submitting…' : (store.isRejected() ? 'Resubmit' : 'Submit for review') }}
          </button>

          @if (store.error()) {
            <p class="error" role="alert">{{ store.error() }}</p>
          }
        </form>
      }
    </section>
  `, styles: ["\n    .status {\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      background: var(--accent-soft);\n      margin: 0 0 1rem;\n    }\n    .status.ok { background: color-mix(in srgb, var(--success) 12%, transparent); }\n    .status.bad { background: var(--danger-soft); color: var(--danger); }\n    fieldset {\n      border: 1px solid var(--border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.5rem;\n    }\n    legend { color: var(--text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }\n    label.check { flex-direction: row; align-items: center; gap: 0.5rem; color: var(--text); }\n    label.check input { width: auto; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(OnboardingPage, { className: "OnboardingPage", filePath: "src/app/features/vetting/onboarding.page.ts", lineNumber: 109 }); })();
