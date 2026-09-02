import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VitalsStore, VITAL_LABELS, VITAL_UNITS, isOutOfRange, } from './vitals.store';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
const _forTrack0 = ($index, $item) => $item.id;
function VitalsPage_Conditional_3_For_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const reading_r1 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate3(" \u26A0\uFE0F ", ctx_r1.label(reading_r1.type), " ", ctx_r1.display(reading_r1), " \u2014 outside the normal range (", ctx_r1.rangeText(reading_r1.type), "). ");
} }
function VitalsPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "div", 1)(1, "h2");
    i0.ɵɵtext(2, "Threshold alerts");
    i0.ɵɵelementEnd();
    i0.ɵɵrepeaterCreate(3, VitalsPage_Conditional_3_For_4_Template, 2, 3, "p", null, _forTrack0);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵadvance(3);
    i0.ɵɵrepeater(ctx_r1.store.alerts());
} }
function VitalsPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵelementEnd();
} }
function VitalsPage_Conditional_5_For_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "option", 4);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const type_r4 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵproperty("value", type_r4);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate2("", ctx_r1.label(type_r4), " (", ctx_r1.VITAL_UNITS[type_r4], ")");
} }
function VitalsPage_Conditional_5_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "label");
    i0.ɵɵtext(1, "Diastolic (mmHg) ");
    i0.ɵɵelement(2, "input", 8);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
} if (rf & 2) {
    i0.ɵɵadvance(2);
    i0.ɵɵcontrol();
} }
function VitalsPage_Conditional_5_Conditional_14_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 7);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r1.store.error());
} }
function VitalsPage_Conditional_5_For_18_Conditional_0_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 10);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const latest_r5 = ctx;
    const ctx_r1 = i0.ɵɵnextContext(4);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate2("Latest: ", ctx_r1.display(latest_r5), " \u00B7 ", ctx_r1.formatDate(latest_r5.measuredAtMs));
} }
function VitalsPage_Conditional_5_For_18_Conditional_0_For_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "li")(1, "span");
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "span", 13);
    i0.ɵɵtext(4);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const reading_r6 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(4);
    i0.ɵɵclassProp("alert", ctx_r1.outOfRange(reading_r6));
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(ctx_r1.display(reading_r6));
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(ctx_r1.formatDate(reading_r6.measuredAtMs));
} }
function VitalsPage_Conditional_5_For_18_Conditional_0_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "div", 9)(1, "h3");
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(3, VitalsPage_Conditional_5_For_18_Conditional_0_Conditional_3_Template, 2, 2, "p", 10);
    i0.ɵɵelementStart(4, "ul", 11);
    i0.ɵɵrepeaterCreate(5, VitalsPage_Conditional_5_For_18_Conditional_0_For_6_Template, 5, 4, "li", 12, _forTrack0);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    let tmp_14_0;
    const type_r7 = i0.ɵɵnextContext().$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(ctx_r1.label(type_r7));
    i0.ɵɵadvance();
    i0.ɵɵconditional((tmp_14_0 = ctx_r1.latest(type_r7)) ? 3 : -1, tmp_14_0);
    i0.ɵɵadvance(2);
    i0.ɵɵrepeater(ctx);
} }
function VitalsPage_Conditional_5_For_18_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵconditionalCreate(0, VitalsPage_Conditional_5_For_18_Conditional_0_Template, 7, 2, "div", 9);
} if (rf & 2) {
    let tmp_11_0;
    const type_r7 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵconditional((tmp_11_0 = ctx_r1.trendVisible(type_r7)) ? 0 : -1, tmp_11_0);
} }
function VitalsPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    const _r3 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "h2");
    i0.ɵɵtext(1, "Log a reading");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(2, "form", 2);
    i0.ɵɵlistener("ngSubmit", function VitalsPage_Conditional_5_Template_form_ngSubmit_2_listener() { i0.ɵɵrestoreView(_r3); const ctx_r1 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r1.submit()); });
    i0.ɵɵelementStart(3, "label");
    i0.ɵɵtext(4, "Type ");
    i0.ɵɵelementStart(5, "select", 3);
    i0.ɵɵrepeaterCreate(6, VitalsPage_Conditional_5_For_7_Template, 2, 3, "option", 4, i0.ɵɵrepeaterTrackByIdentity);
    i0.ɵɵelementEnd();
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(8, "label");
    i0.ɵɵtext(9);
    i0.ɵɵelement(10, "input", 5);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(11, VitalsPage_Conditional_5_Conditional_11_Template, 3, 0, "label");
    i0.ɵɵelementStart(12, "button", 6);
    i0.ɵɵtext(13);
    i0.ɵɵelementEnd()();
    i0.ɵɵconditionalCreate(14, VitalsPage_Conditional_5_Conditional_14_Template, 2, 1, "p", 7);
    i0.ɵɵelementStart(15, "h2");
    i0.ɵɵtext(16, "Trends");
    i0.ɵɵelementEnd();
    i0.ɵɵrepeaterCreate(17, VitalsPage_Conditional_5_For_18_Template, 1, 1, null, null, i0.ɵɵrepeaterTrackByIdentity);
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵadvance(2);
    i0.ɵɵproperty("formGroup", ctx_r1.form);
    i0.ɵɵadvance(3);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r1.types);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate1("", ctx_r1.label(ctx_r1.form.controls.type.value), " ");
    i0.ɵɵadvance();
    i0.ɵɵattribute("aria-label", "Value in " + ctx_r1.VITAL_UNITS[ctx_r1.form.controls.type.value]);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.form.controls.type.value === "bloodPressure" ? 11 : -1);
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r1.store.saving() || ctx_r1.form.invalid);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r1.store.saving() ? "Saving\u2026" : "Save reading", " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r1.store.error() ? 14 : -1);
    i0.ɵɵadvance(3);
    i0.ɵɵrepeater(ctx_r1.types);
} }
export class VitalsPage {
    store = inject(VitalsStore);
    fb = inject(FormBuilder);
    VITAL_UNITS = VITAL_UNITS;
    types = Object.keys(VITAL_LABELS);
    form = this.fb.nonNullable.group({
        type: ['bloodPressure', [Validators.required]],
        value: [null, [Validators.required, Validators.min(0)]],
        value2: [null],
    });
    ngOnInit() {
        this.store.load();
    }
    submit() {
        if (this.form.invalid || this.store.saving()) {
            return;
        }
        const raw = this.form.getRawValue();
        this.store
            .add({
            type: raw.type,
            value: raw.value,
            value2: raw.type === 'bloodPressure' ? raw.value2 : null,
            measuredAtMs: Date.now(),
        })
            .subscribe((ok) => {
            if (ok) {
                this.form.controls.value.reset();
                this.form.controls.value2.reset();
            }
        });
    }
    trendVisible(type) {
        const trend = this.store.trend(type);
        return trend.length > 0 ? trend : null;
    }
    latest(type) {
        return this.store.latest(type);
    }
    label(type) {
        return VITAL_LABELS[type];
    }
    display(reading) {
        return reading.type === 'bloodPressure' && reading.value2 !== null
            ? `${reading.value}/${reading.value2} ${VITAL_UNITS[reading.type]}`
            : `${reading.value} ${VITAL_UNITS[reading.type]}`;
    }
    rangeText(type) {
        return type === 'bloodPressure'
            ? '90–140/60–90 mmHg'
            : type === 'glucose'
                ? '70–180 mg/dL'
                : type === 'spo2'
                    ? '≥95%'
                    : type === 'temperature'
                        ? '36–37.8 °C'
                        : type === 'heartRate'
                            ? '60–100 bpm'
                            : '—';
    }
    outOfRange(reading) {
        return isOutOfRange(reading);
    }
    formatDate(ms) {
        return new Date(ms).toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    static ɵfac = function VitalsPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || VitalsPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: VitalsPage, selectors: [["app-vitals"]], decls: 6, vars: 2, consts: [[1, "vitals"], ["role", "alert", 1, "alerts"], [3, "ngSubmit", "formGroup"], ["formControlName", "type"], [3, "value"], ["type", "number", "step", "0.1", "formControlName", "value"], ["type", "submit", 3, "disabled"], ["role", "alert", 1, "error"], ["type", "number", "formControlName", "value2"], [1, "card", "trend"], [1, "meta"], [1, "trend-list"], [3, "alert"], [1, "date"]], template: function VitalsPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Vitals");
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(3, VitalsPage_Conditional_3_Template, 5, 0, "div", 1);
            i0.ɵɵconditionalCreate(4, VitalsPage_Conditional_4_Template, 2, 0, "p")(5, VitalsPage_Conditional_5_Template, 19, 7);
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.alerts().length > 0 ? 3 : -1);
            i0.ɵɵadvance();
            i0.ɵɵconditional(ctx.store.loading() ? 4 : 5);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.NgSelectOption, i1.ɵNgSelectMultipleOption, i1.DefaultValueAccessor, i1.NumberValueAccessor, i1.SelectControlValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.FormGroupDirective, i1.FormControlName], styles: ["h2[_ngcontent-%COMP%] { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    .alerts[_ngcontent-%COMP%] {\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      background: var(--%NS%danger-soft);\n      color: var(--%NS%danger);\n      margin-bottom: 0.75rem;\n    }\n    .alerts[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%] { margin: 0 0 0.35rem; }\n    .alerts[_ngcontent-%COMP%]   p[_ngcontent-%COMP%] { margin: 0.25rem 0; }\n    .trends[_ngcontent-%COMP%] { display: grid; gap: 0.75rem; }\n    .trend-list[_ngcontent-%COMP%] { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }\n    .trend-list[_ngcontent-%COMP%]   li[_ngcontent-%COMP%] { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }\n    .trend-list[_ngcontent-%COMP%]   li.alert[_ngcontent-%COMP%] { color: var(--%NS%danger); font-weight: 600; }\n    .date[_ngcontent-%COMP%] { color: var(--%NS%text-muted); font-size: 0.85rem; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(VitalsPage, [{
        type: Component,
        args: [{ selector: 'app-vitals', standalone: true, imports: [ReactiveFormsModule], template: `
    <section class="vitals">
      <h1>Vitals</h1>

      @if (store.alerts().length > 0) {
        <div class="alerts" role="alert">
          <h2>Threshold alerts</h2>
          @for (reading of store.alerts(); track reading.id) {
            <p>
              ⚠️ {{ label(reading.type) }} {{ display(reading) }} —
              outside the normal range ({{ rangeText(reading.type) }}).
            </p>
          }
        </div>
      }

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <h2>Log a reading</h2>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Type
            <select formControlName="type">
              @for (type of types; track type) {
                <option [value]="type">{{ label(type) }} ({{ VITAL_UNITS[type] }})</option>
              }
            </select>
          </label>
          <label>{{ label(form.controls.type.value) }}
            <input type="number" step="0.1" formControlName="value"
              [attr.aria-label]="'Value in ' + VITAL_UNITS[form.controls.type.value]" />
          </label>
          @if (form.controls.type.value === 'bloodPressure') {
            <label>Diastolic (mmHg)
              <input type="number" formControlName="value2" />
            </label>
          }
          <button type="submit" [disabled]="store.saving() || form.invalid">
            {{ store.saving() ? 'Saving…' : 'Save reading' }}
          </button>
        </form>

        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }

        <h2>Trends</h2>
        @for (type of types; track type) {
          @if (trendVisible(type); as trend) {
            <div class="card trend">
              <h3>{{ label(type) }}</h3>
              @if (latest(type); as latest) {
                <p class="meta">Latest: {{ display(latest) }} · {{ formatDate(latest.measuredAtMs) }}</p>
              }
              <ul class="trend-list">
                @for (reading of trend; track reading.id) {
                  <li [class.alert]="outOfRange(reading)">
                    <span>{{ display(reading) }}</span>
                    <span class="date">{{ formatDate(reading.measuredAtMs) }}</span>
                  </li>
                }
              </ul>
            </div>
          }
        }
      }
    </section>
  `, styles: ["\n    h2 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    .alerts {\n      border-radius: 0.75rem;\n      padding: 0.75rem 1rem;\n      background: var(--danger-soft);\n      color: var(--danger);\n      margin-bottom: 0.75rem;\n    }\n    .alerts h2 { margin: 0 0 0.35rem; }\n    .alerts p { margin: 0.25rem 0; }\n    .trends { display: grid; gap: 0.75rem; }\n    .trend-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }\n    .trend-list li { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }\n    .trend-list li.alert { color: var(--danger); font-weight: 600; }\n    .date { color: var(--text-muted); font-size: 0.85rem; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(VitalsPage, { className: "VitalsPage", filePath: "src/app/features/health-record/vitals.page.ts", lineNumber: 102 }); })();
