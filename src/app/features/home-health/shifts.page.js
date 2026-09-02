import { Component, inject } from '@angular/core';
import { ShiftsStore, WEEKDAYS, TIME_SEGMENTS } from './shifts.store';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.label;
const _forTrack1 = ($index, $item) => $item.id;
function ShiftsPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵdomElementEnd();
} }
function ShiftsPage_Conditional_4_For_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "th", 2);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const segment_r2 = ctx.$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(segment_r2.label);
} }
function ShiftsPage_Conditional_4_For_11_For_4_Template(rf, ctx) { if (rf & 1) {
    const _r3 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "td")(1, "input", 4);
    i0.ɵɵdomListener("change", function ShiftsPage_Conditional_4_For_11_For_4_Template_input_change_1_listener() { const segment_r4 = i0.ɵɵrestoreView(_r3).$implicit; const ɵ$index_29_r5 = i0.ɵɵnextContext().$index; const ctx_r5 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r5.store.toggleSegment(ɵ$index_29_r5, segment_r4.startMinutes, segment_r4.endMinutes)); });
    i0.ɵɵdomElementEnd()();
} if (rf & 2) {
    const segment_r4 = ctx.$implicit;
    const ctx_r6 = i0.ɵɵnextContext();
    const weekday_r8 = ctx_r6.$implicit;
    const ɵ$index_29_r5 = ctx_r6.$index;
    const ctx_r5 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵdomProperty("checked", ctx_r5.store.hasSegment(ɵ$index_29_r5, segment_r4.startMinutes, segment_r4.endMinutes));
    i0.ɵɵattribute("aria-label", weekday_r8 + " " + segment_r4.label);
} }
function ShiftsPage_Conditional_4_For_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "tr")(1, "th", 8);
    i0.ɵɵtext(2);
    i0.ɵɵdomElementEnd();
    i0.ɵɵrepeaterCreate(3, ShiftsPage_Conditional_4_For_11_For_4_Template, 2, 2, "td", null, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const weekday_r8 = ctx.$implicit;
    const ctx_r5 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(weekday_r8);
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r5.TIME_SEGMENTS);
} }
function ShiftsPage_Conditional_4_Conditional_17_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r5 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r5.store.saveError());
} }
function ShiftsPage_Conditional_4_Conditional_20_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No upcoming shifts.");
    i0.ɵɵdomElementEnd();
} }
function ShiftsPage_Conditional_4_Conditional_21_For_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li", 9)(1, "h3");
    i0.ɵɵtext(2);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(3, "p", 10);
    i0.ɵɵtext(4);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(5, "span", 11);
    i0.ɵɵtext(6);
    i0.ɵɵdomElementEnd()();
} if (rf & 2) {
    const shift_r9 = ctx.$implicit;
    const ctx_r5 = i0.ɵɵnextContext(3);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(shift_r9.act);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate3("", shift_r9.clientName, " \u00B7 ", ctx_r5.formatDate(shift_r9.scheduledAtMs), " \u00B7 ", shift_r9.durationMinutes, " min");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(shift_r9.status);
} }
function ShiftsPage_Conditional_4_Conditional_21_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 7);
    i0.ɵɵrepeaterCreate(1, ShiftsPage_Conditional_4_Conditional_21_For_2_Template, 7, 5, "li", 9, _forTrack1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r5 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r5.store.upcomingShifts());
} }
function ShiftsPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "h2");
    i0.ɵɵtext(1, "Weekly availability");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(2, "table", 1)(3, "thead")(4, "tr")(5, "th", 2);
    i0.ɵɵtext(6, "Day");
    i0.ɵɵdomElementEnd();
    i0.ɵɵrepeaterCreate(7, ShiftsPage_Conditional_4_For_8_Template, 2, 1, "th", 2, _forTrack0);
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(9, "tbody");
    i0.ɵɵrepeaterCreate(10, ShiftsPage_Conditional_4_For_11_Template, 5, 1, "tr", null, i0.ɵɵrepeaterTrackByIdentity);
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(12, "label", 3)(13, "input", 4);
    i0.ɵɵdomListener("change", function ShiftsPage_Conditional_4_Template_input_change_13_listener($event) { i0.ɵɵrestoreView(_r1); const ctx_r5 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r5.store.setOnDemand($event.target.checked)); });
    i0.ɵɵdomElementEnd();
    i0.ɵɵtext(14, " Accept on-demand requests ");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(15, "button", 5);
    i0.ɵɵdomListener("click", function ShiftsPage_Conditional_4_Template_button_click_15_listener() { i0.ɵɵrestoreView(_r1); const ctx_r5 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r5.save()); });
    i0.ɵɵtext(16);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(17, ShiftsPage_Conditional_4_Conditional_17_Template, 2, 1, "p", 6);
    i0.ɵɵdomElementStart(18, "h2");
    i0.ɵɵtext(19, "Upcoming shifts");
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(20, ShiftsPage_Conditional_4_Conditional_20_Template, 2, 0, "p")(21, ShiftsPage_Conditional_4_Conditional_21_Template, 3, 0, "ul", 7);
} if (rf & 2) {
    const ctx_r5 = i0.ɵɵnextContext();
    i0.ɵɵadvance(7);
    i0.ɵɵrepeater(ctx_r5.TIME_SEGMENTS);
    i0.ɵɵadvance(3);
    i0.ɵɵrepeater(ctx_r5.WEEKDAYS);
    i0.ɵɵadvance(3);
    i0.ɵɵdomProperty("checked", ctx_r5.store.onDemand());
    i0.ɵɵadvance(2);
    i0.ɵɵdomProperty("disabled", ctx_r5.store.saving());
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r5.store.saving() ? "Saving\u2026" : "Save availability", " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(ctx_r5.store.saveError() ? 17 : -1);
    i0.ɵɵadvance(3);
    i0.ɵɵconditional(ctx_r5.store.upcomingShifts().length === 0 ? 20 : 21);
} }
function formatDate(ms) {
    return new Date(ms).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export class ShiftsPage {
    store = inject(ShiftsStore);
    WEEKDAYS = WEEKDAYS;
    TIME_SEGMENTS = TIME_SEGMENTS;
    ngOnInit() {
        this.store.load();
    }
    save() {
        this.store.save().subscribe();
    }
    formatDate(ms) {
        return formatDate(ms);
    }
    static ɵfac = function ShiftsPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ShiftsPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: ShiftsPage, selectors: [["app-shifts"]], decls: 5, vars: 1, consts: [[1, "shifts"], ["aria-label", "Weekly availability grid", 1, "grid"], ["scope", "col"], [1, "on-demand"], ["type", "checkbox", 3, "change", "checked"], ["type", "button", 3, "click", "disabled"], ["role", "alert", 1, "error"], [1, "results"], ["scope", "row"], [1, "card"], [1, "meta"], [1, "chip"]], template: function ShiftsPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Shifts & visits");
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(3, ShiftsPage_Conditional_3_Template, 2, 0, "p")(4, ShiftsPage_Conditional_4_Template, 22, 5);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : 4);
        } }, styles: ["h2[_ngcontent-%COMP%] { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }\n    .grid[_ngcontent-%COMP%] {\n      border-collapse: collapse;\n      background: var(--%NS%surface);\n      border: 1px solid var(--%NS%border);\n      border-radius: 0.75rem;\n      overflow: hidden;\n      margin-bottom: 1rem;\n    }\n    .grid[_ngcontent-%COMP%]   th[_ngcontent-%COMP%], .grid[_ngcontent-%COMP%]   td[_ngcontent-%COMP%] {\n      border-bottom: 1px solid var(--%NS%border);\n      padding: 0.5rem 0.9rem;\n      text-align: left;\n    }\n    .grid[_ngcontent-%COMP%]   th[_ngcontent-%COMP%] { color: var(--%NS%text-muted); font-weight: 600; }\n    .grid[_ngcontent-%COMP%]   input[type='checkbox'][_ngcontent-%COMP%] { width: auto; }\n    .on-demand[_ngcontent-%COMP%] {\n      flex-direction: row;\n      align-items: center;\n      gap: 0.5rem;\n      color: var(--%NS%text);\n      margin-bottom: 1rem;\n    }\n    .on-demand[_ngcontent-%COMP%]   input[_ngcontent-%COMP%] { width: auto; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ShiftsPage, [{
        type: Component,
        args: [{ selector: 'app-shifts', standalone: true, imports: [], template: `
    <section class="shifts">
      <h1>Shifts & visits</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <h2>Weekly availability</h2>
        <table class="grid" aria-label="Weekly availability grid">
          <thead>
            <tr>
              <th scope="col">Day</th>
              @for (segment of TIME_SEGMENTS; track segment.label) {
                <th scope="col">{{ segment.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (weekday of WEEKDAYS; track weekday; let i = $index) {
              <tr>
                <th scope="row">{{ weekday }}</th>
                @for (segment of TIME_SEGMENTS; track segment.label) {
                  <td>
                    <input
                      type="checkbox"
                      [checked]="store.hasSegment(i, segment.startMinutes, segment.endMinutes)"
                      (change)="store.toggleSegment(i, segment.startMinutes, segment.endMinutes)"
                      [attr.aria-label]="weekday + ' ' + segment.label"
                    />
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>

        <label class="on-demand">
          <input
            type="checkbox"
            [checked]="store.onDemand()"
            (change)="store.setOnDemand($any($event.target).checked)"
          />
          Accept on-demand requests
        </label>

        <button type="button" (click)="save()" [disabled]="store.saving()">
          {{ store.saving() ? 'Saving…' : 'Save availability' }}
        </button>
        @if (store.saveError()) {
          <p class="error" role="alert">{{ store.saveError() }}</p>
        }

        <h2>Upcoming shifts</h2>
        @if (store.upcomingShifts().length === 0) {
          <p>No upcoming shifts.</p>
        } @else {
          <ul class="results">
            @for (shift of store.upcomingShifts(); track shift.id) {
              <li class="card">
                <h3>{{ shift.act }}</h3>
                <p class="meta">{{ shift.clientName }} · {{ formatDate(shift.scheduledAtMs) }} · {{ shift.durationMinutes }} min</p>
                <span class="chip">{{ shift.status }}</span>
              </li>
            }
          </ul>
        }
      }
    </section>
  `, styles: ["\n    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }\n    .grid {\n      border-collapse: collapse;\n      background: var(--surface);\n      border: 1px solid var(--border);\n      border-radius: 0.75rem;\n      overflow: hidden;\n      margin-bottom: 1rem;\n    }\n    .grid th, .grid td {\n      border-bottom: 1px solid var(--border);\n      padding: 0.5rem 0.9rem;\n      text-align: left;\n    }\n    .grid th { color: var(--text-muted); font-weight: 600; }\n    .grid input[type='checkbox'] { width: auto; }\n    .on-demand {\n      flex-direction: row;\n      align-items: center;\n      gap: 0.5rem;\n      color: var(--text);\n      margin-bottom: 1rem;\n    }\n    .on-demand input { width: auto; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(ShiftsPage, { className: "ShiftsPage", filePath: "src/app/features/home-health/shifts.page.ts", lineNumber: 114 }); })();
