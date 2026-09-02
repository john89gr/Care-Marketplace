import { Component } from '@angular/core';
import * as i0 from "@angular/core";
export class HealthRecordPage {
    static ɵfac = function HealthRecordPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || HealthRecordPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: HealthRecordPage, selectors: [["app-health-record"]], decls: 5, vars: 0, consts: [[1, "health-record"]], template: function HealthRecordPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Personal Health Record");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "p");
            i0.ɵɵtext(4, "Vitals logging, smart medication reminders and FHIR export arrive in Phase 3 (PLAN.md \u00A75).");
            i0.ɵɵdomElementEnd()();
        } }, encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(HealthRecordPage, [{
        type: Component,
        args: [{
                selector: 'app-health-record',
                standalone: true,
                imports: [],
                template: `
    <section class="health-record">
      <h1>Personal Health Record</h1>
      <p>Vitals logging, smart medication reminders and FHIR export arrive in Phase 3 (PLAN.md §5).</p>
    </section>
  `,
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(HealthRecordPage, { className: "HealthRecordPage", filePath: "src/app/features/health-record/health-record.page.ts", lineNumber: 14 }); })();
