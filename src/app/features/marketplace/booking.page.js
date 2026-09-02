import { Component, inject } from '@angular/core';
import { BookingStore } from './booking.store';
import * as i0 from "@angular/core";
function BookingPage_Conditional_12_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 5);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.store.lastError());
} }
export class BookingPage {
    store = inject(BookingStore);
    isoValue() {
        const ms = this.store.draft().scheduledAtMs;
        return ms === null ? '' : new Date(ms).toISOString().slice(0, 16);
    }
    onDate(value) {
        const ms = value ? new Date(value).getTime() : null;
        this.store.updateDraft({ scheduledAtMs: Number.isNaN(ms) ? null : ms });
    }
    submit(event) {
        event.preventDefault();
        void this.store.submit();
    }
    static ɵfac = function BookingPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || BookingPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: BookingPage, selectors: [["app-booking"]], decls: 13, vars: 5, consts: [[1, "booking"], [3, "submit"], ["type", "datetime-local", 3, "change", "value"], ["rows", "3", 3, "input", "value"], ["type", "submit", 3, "disabled"], ["role", "alert", 1, "error"]], template: function BookingPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Booking request");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "form", 1);
            i0.ɵɵdomListener("submit", function BookingPage_Template_form_submit_3_listener($event) { return ctx.submit($event); });
            i0.ɵɵdomElementStart(4, "label");
            i0.ɵɵtext(5, "Date & time ");
            i0.ɵɵdomElementStart(6, "input", 2);
            i0.ɵɵdomListener("change", function BookingPage_Template_input_change_6_listener($event) { return ctx.onDate($event.target.value); });
            i0.ɵɵdomElementEnd()();
            i0.ɵɵdomElementStart(7, "label");
            i0.ɵɵtext(8, "Note ");
            i0.ɵɵdomElementStart(9, "textarea", 3);
            i0.ɵɵdomListener("input", function BookingPage_Template_textarea_input_9_listener($event) { return ctx.store.updateDraft({ note: $event.target.value }); });
            i0.ɵɵdomElementEnd()();
            i0.ɵɵdomElementStart(10, "button", 4);
            i0.ɵɵtext(11);
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(12, BookingPage_Conditional_12_Template, 2, 1, "p", 5);
            i0.ɵɵdomElementEnd()();
        } if (rf & 2) {
            i0.ɵɵadvance(6);
            i0.ɵɵdomProperty("value", ctx.isoValue());
            i0.ɵɵadvance(3);
            i0.ɵɵdomProperty("value", ctx.store.draft().note);
            i0.ɵɵadvance();
            i0.ɵɵdomProperty("disabled", ctx.store.submitting() || !ctx.store.draft().scheduledAtMs);
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate1(" ", ctx.store.submitting() ? "Sending\u2026" : "Send request", " ");
            i0.ɵɵadvance();
            i0.ɵɵconditional(ctx.store.lastError() ? 12 : -1);
        } }, encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(BookingPage, [{
        type: Component,
        args: [{
                selector: 'app-booking',
                standalone: true,
                imports: [],
                template: `
    <section class="booking">
      <h1>Booking request</h1>
      <form (submit)="submit($event)">
        <label>Date & time
          <input
            type="datetime-local"
            [value]="isoValue()"
            (change)="onDate($any($event.target).value)"
          />
        </label>
        <label>Note
          <textarea rows="3" [value]="store.draft().note"
            (input)="store.updateDraft({ note: $any($event.target).value })"></textarea>
        </label>
        <button type="submit" [disabled]="store.submitting() || !store.draft().scheduledAtMs">
          {{ store.submitting() ? 'Sending…' : 'Send request' }}
        </button>
        @if (store.lastError()) {
          <p class="error" role="alert">{{ store.lastError() }}</p>
        }
      </form>
    </section>
  `,
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(BookingPage, { className: "BookingPage", filePath: "src/app/features/marketplace/booking.page.ts", lineNumber: 33 }); })();
