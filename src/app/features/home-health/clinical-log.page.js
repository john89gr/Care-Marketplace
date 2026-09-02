import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicalLogStore } from './clinical-log.store';
import { VisitStore } from './visit.store';
import { SignaturePad } from '../../shared/signature-pad/signature-pad';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
const _forTrack0 = ($index, $item) => $item.id;
function ClinicalLogPage_For_9_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "option", 4);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const visit_r1 = ctx.$implicit;
    i0.ɵɵproperty("value", visit_r1.id);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate3(" ", visit_r1.act, " \u2014 ", visit_r1.clientName, " (", visit_r1.status, ") ");
} }
function ClinicalLogPage_Conditional_10_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵelementEnd();
} }
function ClinicalLogPage_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Choose a visit above to document it.");
    i0.ɵɵelementEnd();
} }
function ClinicalLogPage_Conditional_12_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "fieldset")(1, "legend");
    i0.ɵɵtext(2, "Vitals (nurse)");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "div", 10)(4, "label");
    i0.ɵɵtext(5, "Systolic (mmHg) ");
    i0.ɵɵelement(6, "input", 11);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(7, "label");
    i0.ɵɵtext(8, "Diastolic (mmHg) ");
    i0.ɵɵelement(9, "input", 12);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(10, "label");
    i0.ɵɵtext(11, "Heart rate (bpm) ");
    i0.ɵɵelement(12, "input", 13);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(13, "label");
    i0.ɵɵtext(14, "SpO2 (%) ");
    i0.ɵɵelement(15, "input", 14);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd()()();
} if (rf & 2) {
    i0.ɵɵadvance(6);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
} }
function ClinicalLogPage_Conditional_12_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "fieldset")(1, "legend");
    i0.ɵɵtext(2, "Rehab assessment (physio)");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "label");
    i0.ɵɵtext(4, "Range of motion ");
    i0.ɵɵelement(5, "input", 15);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(6, "label");
    i0.ɵɵtext(7, "Pain level (0\u201310) ");
    i0.ɵɵelement(8, "input", 16);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(9, "label");
    i0.ɵɵtext(10, "Exercises prescribed ");
    i0.ɵɵelement(11, "textarea", 17);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    i0.ɵɵadvance(5);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
} }
function ClinicalLogPage_Conditional_12_Conditional_16_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 9);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r2.store.error());
} }
function ClinicalLogPage_Conditional_12_Conditional_17_For_4_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelement(0, "img", 21);
} if (rf & 2) {
    const entry_r4 = i0.ɵɵnextContext().$implicit;
    i0.ɵɵproperty("src", entry_r4.signatureDataUrl, i0.ɵɵsanitizeUrl);
} }
function ClinicalLogPage_Conditional_12_Conditional_17_For_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "li", 19)(1, "p", 20);
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "p");
    i0.ɵɵtext(4);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(5, ClinicalLogPage_Conditional_12_Conditional_17_For_4_Conditional_5_Template, 1, 1, "img", 21);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const entry_r4 = ctx.$implicit;
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate3("", entry_r4.authorName, " \u00B7 ", entry_r4.specialty, " \u00B7 ", entry_r4.signedAtMs !== null ? "signed" : "unsigned");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(entry_r4.observations);
    i0.ɵɵadvance();
    i0.ɵɵconditional(entry_r4.signatureDataUrl ? 5 : -1);
} }
function ClinicalLogPage_Conditional_12_Conditional_17_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "h2");
    i0.ɵɵtext(1, "Signed entries");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(2, "ul", 18);
    i0.ɵɵrepeaterCreate(3, ClinicalLogPage_Conditional_12_Conditional_17_For_4_Template, 6, 5, "li", 19, _forTrack0);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(3);
    i0.ɵɵrepeater(ctx_r2.entries());
} }
function ClinicalLogPage_Conditional_12_Template(rf, ctx) { if (rf & 1) {
    const _r2 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "form", 5);
    i0.ɵɵlistener("ngSubmit", function ClinicalLogPage_Conditional_12_Template_form_ngSubmit_0_listener() { i0.ɵɵrestoreView(_r2); const ctx_r2 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r2.submit()); });
    i0.ɵɵelementStart(1, "h2");
    i0.ɵɵtext(2, "Observation notes");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "label");
    i0.ɵɵtext(4, "Observations ");
    i0.ɵɵelement(5, "textarea", 6);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(6, ClinicalLogPage_Conditional_12_Conditional_6_Template, 16, 0, "fieldset")(7, ClinicalLogPage_Conditional_12_Conditional_7_Template, 12, 0, "fieldset");
    i0.ɵɵelementStart(8, "h2");
    i0.ɵɵtext(9, "Digital signature");
    i0.ɵɵelementEnd();
    i0.ɵɵelement(10, "app-signature-pad", null, 0);
    i0.ɵɵelementStart(12, "p", 7);
    i0.ɵɵtext(13, " Signing certifies the observations above were made during this visit. ");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(14, "button", 8);
    i0.ɵɵtext(15);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(16, ClinicalLogPage_Conditional_12_Conditional_16_Template, 2, 1, "p", 9);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(17, ClinicalLogPage_Conditional_12_Conditional_17_Template, 5, 0);
} if (rf & 2) {
    const pad_r5 = i0.ɵɵreference(11);
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵproperty("formGroup", ctx_r2.form);
    i0.ɵɵadvance(5);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r2.isNurse() ? 6 : 7);
    i0.ɵɵadvance(8);
    i0.ɵɵproperty("disabled", ctx_r2.store.saving() || ctx_r2.form.invalid || !pad_r5.signed());
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r2.store.saving() ? "Saving\u2026" : "Sign & save", " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r2.store.error() ? 16 : -1);
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r2.entries().length > 0 ? 17 : -1);
} }
export class ClinicalLogPage {
    store = inject(ClinicalLogStore);
    visitStore = inject(VisitStore);
    fb = inject(FormBuilder);
    pad = viewChild(SignaturePad, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "pad" }] : /* istanbul ignore next */ []));
    selectedVisitId = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "selectedVisitId" }] : /* istanbul ignore next */ []));
    visits = () => this.visitStore.visits();
    entries = () => this.store.entries();
    isNurse = computed(() => this.store.specialty() === 'nurse', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isNurse" }] : /* istanbul ignore next */ []));
    form = this.fb.nonNullable.group({
        observations: ['', [Validators.required, Validators.minLength(5)]],
        systolic: [null],
        diastolic: [null],
        heartRate: [null],
        spo2: [null],
        rangeOfMotion: [''],
        painLevel: [null],
        exercisesPrescribed: [''],
    });
    ngOnInit() {
        this.visitStore.connect();
        this.visitStore.load();
        this.store.load();
    }
    selectVisit(id) {
        this.selectedVisitId.set(id);
        this.store.load(id);
    }
    submit() {
        if (this.form.invalid || this.store.saving()) {
            return;
        }
        const raw = this.form.getRawValue();
        const signatureDataUrl = this.pad()?.toDataUrl() ?? null;
        this.store
            .save({
            visitId: this.selectedVisitId(),
            observations: raw.observations,
            vitals: this.isNurse()
                ? {
                    systolic: raw.systolic,
                    diastolic: raw.diastolic,
                    heartRate: raw.heartRate,
                    spo2: raw.spo2,
                }
                : null,
            rehab: this.isNurse()
                ? null
                : {
                    rangeOfMotion: raw.rangeOfMotion,
                    painLevel: raw.painLevel,
                    exercisesPrescribed: raw.exercisesPrescribed,
                },
        }, signatureDataUrl)
            .subscribe((ok) => {
            if (ok) {
                this.pad()?.clear();
                this.form.controls.observations.reset();
            }
        });
    }
    static ɵfac = function ClinicalLogPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ClinicalLogPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: ClinicalLogPage, selectors: [["app-clinical-log"]], viewQuery: function ClinicalLogPage_Query(rf, ctx) { if (rf & 1) {
            i0.ɵɵviewQuerySignal(ctx.pad, SignaturePad, 5);
        } if (rf & 2) {
            i0.ɵɵqueryAdvance();
        } }, decls: 13, vars: 2, consts: [["pad", ""], [1, "clinical-log"], [3, "change", "value"], ["value", ""], [3, "value"], [3, "ngSubmit", "formGroup"], ["rows", "4", "formControlName", "observations", "placeholder", "Clinical findings, complaints, response to treatment\u2026"], [1, "hint"], ["type", "submit", 3, "disabled"], ["role", "alert", 1, "error"], [1, "grid"], ["type", "number", "formControlName", "systolic"], ["type", "number", "formControlName", "diastolic"], ["type", "number", "formControlName", "heartRate"], ["type", "number", "min", "0", "max", "100", "formControlName", "spo2"], ["type", "text", "formControlName", "rangeOfMotion", "placeholder", "e.g. shoulder flexion 0\u2013120\u00B0"], ["type", "number", "min", "0", "max", "10", "formControlName", "painLevel"], ["rows", "2", "formControlName", "exercisesPrescribed"], [1, "results"], [1, "card"], [1, "meta"], ["alt", "Signed signature", 1, "sig", 3, "src"]], template: function ClinicalLogPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 1)(1, "h1");
            i0.ɵɵtext(2, "Clinical log");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "label");
            i0.ɵɵtext(4, "Visit ");
            i0.ɵɵelementStart(5, "select", 2);
            i0.ɵɵlistener("change", function ClinicalLogPage_Template_select_change_5_listener($event) { return ctx.selectVisit($event.target.value); });
            i0.ɵɵelementStart(6, "option", 3);
            i0.ɵɵtext(7, "Select a visit\u2026");
            i0.ɵɵelementEnd();
            i0.ɵɵrepeaterCreate(8, ClinicalLogPage_For_9_Template, 2, 4, "option", 4, _forTrack0);
            i0.ɵɵelementEnd()();
            i0.ɵɵconditionalCreate(10, ClinicalLogPage_Conditional_10_Template, 2, 0, "p")(11, ClinicalLogPage_Conditional_11_Template, 2, 0, "p")(12, ClinicalLogPage_Conditional_12_Template, 18, 6);
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(5);
            i0.ɵɵproperty("value", ctx.selectedVisitId());
            i0.ɵɵadvance(3);
            i0.ɵɵrepeater(ctx.visits());
            i0.ɵɵadvance(2);
            i0.ɵɵconditional(ctx.store.loading() ? 10 : !ctx.selectedVisitId() ? 11 : 12);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.NgSelectOption, i1.ɵNgSelectMultipleOption, i1.DefaultValueAccessor, i1.NumberValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.MinValidator, i1.MaxValidator, i1.FormGroupDirective, i1.FormControlName, SignaturePad], styles: ["h2[_ngcontent-%COMP%] { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    fieldset[_ngcontent-%COMP%] {\n      border: 1px solid var(--%NS%border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.9rem;\n    }\n    legend[_ngcontent-%COMP%] { color: var(--%NS%text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }\n    .grid[_ngcontent-%COMP%] { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }\n    .hint[_ngcontent-%COMP%] { color: var(--%NS%text-muted); font-size: 0.85rem; }\n    .sig[_ngcontent-%COMP%] { border: 1px solid var(--%NS%border); border-radius: 0.5rem; max-width: 220px; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ClinicalLogPage, [{
        type: Component,
        args: [{ selector: 'app-clinical-log', standalone: true, imports: [ReactiveFormsModule, SignaturePad], template: `
    <section class="clinical-log">
      <h1>Clinical log</h1>

      <label>Visit
        <select [value]="selectedVisitId()" (change)="selectVisit($any($event.target).value)">
          <option value="">Select a visit…</option>
          @for (visit of visits(); track visit.id) {
            <option [value]="visit.id">
              {{ visit.act }} — {{ visit.clientName }} ({{ visit.status }})
            </option>
          }
        </select>
      </label>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (!selectedVisitId()) {
        <p>Choose a visit above to document it.</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <h2>Observation notes</h2>
          <label>Observations
            <textarea rows="4" formControlName="observations"
              placeholder="Clinical findings, complaints, response to treatment…"></textarea>
          </label>

          @if (isNurse()) {
            <fieldset>
              <legend>Vitals (nurse)</legend>
              <div class="grid">
                <label>Systolic (mmHg)
                  <input type="number" formControlName="systolic" />
                </label>
                <label>Diastolic (mmHg)
                  <input type="number" formControlName="diastolic" />
                </label>
                <label>Heart rate (bpm)
                  <input type="number" formControlName="heartRate" />
                </label>
                <label>SpO2 (%)
                  <input type="number" min="0" max="100" formControlName="spo2" />
                </label>
              </div>
            </fieldset>
          } @else {
            <fieldset>
              <legend>Rehab assessment (physio)</legend>
              <label>Range of motion
                <input type="text" formControlName="rangeOfMotion"
                  placeholder="e.g. shoulder flexion 0–120°" />
              </label>
              <label>Pain level (0–10)
                <input type="number" min="0" max="10" formControlName="painLevel" />
              </label>
              <label>Exercises prescribed
                <textarea rows="2" formControlName="exercisesPrescribed"></textarea>
              </label>
            </fieldset>
          }

          <h2>Digital signature</h2>
          <app-signature-pad #pad />
          <p class="hint">
            Signing certifies the observations above were made during this visit.
          </p>

          <button type="submit"
            [disabled]="store.saving() || form.invalid || !pad.signed()">
            {{ store.saving() ? 'Saving…' : 'Sign & save' }}
          </button>

          @if (store.error()) {
            <p class="error" role="alert">{{ store.error() }}</p>
          }
        </form>

        @if (entries().length > 0) {
          <h2>Signed entries</h2>
          <ul class="results">
            @for (entry of entries(); track entry.id) {
              <li class="card">
                <p class="meta">{{ entry.authorName }} · {{ entry.specialty }} ·
                  {{ entry.signedAtMs !== null ? 'signed' : 'unsigned' }}</p>
                <p>{{ entry.observations }}</p>
                @if (entry.signatureDataUrl) {
                  <img class="sig" [src]="entry.signatureDataUrl" alt="Signed signature" />
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `, styles: ["\n    h2 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    fieldset {\n      border: 1px solid var(--border);\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      display: flex;\n      flex-direction: column;\n      gap: 0.9rem;\n    }\n    legend { color: var(--text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }\n    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }\n    .hint { color: var(--text-muted); font-size: 0.85rem; }\n    .sig { border: 1px solid var(--border); border-radius: 0.5rem; max-width: 220px; }\n  "] }]
    }], null, { pad: [{ type: i0.ViewChild, args: [i0.forwardRef(() => SignaturePad), { isSignal: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(ClinicalLogPage, { className: "ClinicalLogPage", filePath: "src/app/features/home-health/clinical-log.page.ts", lineNumber: 122 }); })();
