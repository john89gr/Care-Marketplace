import { Component, computed, inject } from '@angular/core';
import { VettingStore } from '../vetting/vetting.store';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function AdminPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵdomElementEnd();
} }
function AdminPage_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 1);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.store.error());
} }
function AdminPage_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No submissions awaiting review.");
    i0.ɵɵdomElementEnd();
} }
function AdminPage_Conditional_8_For_2_For_10_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "span", 5);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const specialty_r3 = ctx.$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(specialty_r3);
} }
function AdminPage_Conditional_8_For_2_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const submission_r4 = i0.ɵɵnextContext().$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1("Note: ", submission_r4.note);
} }
function AdminPage_Conditional_8_For_2_Template(rf, ctx) { if (rf & 1) {
    const _r2 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "li", 3)(1, "div", 4)(2, "h3");
    i0.ɵɵtext(3);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(4, "span", 5);
    i0.ɵɵtext(5, "pending");
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(6, "p", 6);
    i0.ɵɵtext(7);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(8, "p", 7);
    i0.ɵɵrepeaterCreate(9, AdminPage_Conditional_8_For_2_For_10_Template, 2, 1, "span", 5, i0.ɵɵrepeaterTrackByIdentity);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(11, AdminPage_Conditional_8_For_2_Conditional_11_Template, 2, 1, "p", 6);
    i0.ɵɵdomElementStart(12, "p", 8)(13, "button", 9);
    i0.ɵɵdomListener("click", function AdminPage_Conditional_8_For_2_Template_button_click_13_listener() { const submission_r4 = i0.ɵɵrestoreView(_r2).$implicit; const ctx_r0 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r0.review(submission_r4, "approved")); });
    i0.ɵɵtext(14, "Approve");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(15, "button", 10);
    i0.ɵɵdomListener("click", function AdminPage_Conditional_8_For_2_Template_button_click_15_listener() { const submission_r4 = i0.ɵɵrestoreView(_r2).$implicit; const ctx_r0 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r0.review(submission_r4, "rejected")); });
    i0.ɵɵtext(16, "Reject");
    i0.ɵɵdomElementEnd()()();
} if (rf & 2) {
    const submission_r4 = ctx.$implicit;
    const ctx_r0 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate(submission_r4.providerName);
    i0.ɵɵadvance(4);
    i0.ɵɵtextInterpolate2("Licence ", submission_r4.licenceNumber, " \u00B7 submitted ", ctx_r0.formatDate(submission_r4.submittedAtMs));
    i0.ɵɵadvance(2);
    i0.ɵɵrepeater(submission_r4.specialties);
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(submission_r4.note ? 11 : -1);
} }
function AdminPage_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 2);
    i0.ɵɵrepeaterCreate(1, AdminPage_Conditional_8_For_2_Template, 17, 4, "li", 3, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r0.pending());
} }
function AdminPage_Conditional_9_For_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li", 3)(1, "div", 4)(2, "h3");
    i0.ɵɵtext(3);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(4, "span", 5);
    i0.ɵɵtext(5);
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(6, "p", 6);
    i0.ɵɵtext(7);
    i0.ɵɵdomElementEnd()();
} if (rf & 2) {
    const submission_r5 = ctx.$implicit;
    const ctx_r0 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate(submission_r5.providerName);
    i0.ɵɵadvance();
    i0.ɵɵclassProp("ok", submission_r5.status === "approved")("bad", submission_r5.status === "rejected");
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", submission_r5.status, " ");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate2("Licence ", submission_r5.licenceNumber, " \u00B7 reviewed ", ctx_r0.formatDate(submission_r5.reviewedAtMs ?? submission_r5.submittedAtMs));
} }
function AdminPage_Conditional_9_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "h2");
    i0.ɵɵtext(1, "Recently reviewed");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(2, "ul", 2);
    i0.ɵɵrepeaterCreate(3, AdminPage_Conditional_9_For_4_Template, 8, 8, "li", 3, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance(3);
    i0.ɵɵrepeater(ctx_r0.reviewed());
} }
function formatDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export class AdminPage {
    store = inject(VettingStore);
    pending = computed(() => this.store.queue().filter((s) => s.status === 'pending'), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "pending" }] : /* istanbul ignore next */ []));
    reviewed = computed(() => this.store
        .queue()
        .filter((s) => s.status !== 'pending')
        .sort((a, b) => (b.reviewedAtMs ?? 0) - (a.reviewedAtMs ?? 0)), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "reviewed" }] : /* istanbul ignore next */ []));
    ngOnInit() {
        this.store.loadQueue();
    }
    review(submission, decision) {
        this.store.review(submission.id, decision).subscribe();
    }
    formatDate(ms) {
        return formatDate(ms);
    }
    static ɵfac = function AdminPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || AdminPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: AdminPage, selectors: [["app-admin"]], decls: 10, vars: 2, consts: [[1, "admin"], ["role", "alert", 1, "error"], [1, "results"], [1, "card"], [1, "row"], [1, "chip"], [1, "meta"], [1, "roles"], [1, "actions"], ["type", "button", 3, "click"], ["type", "button", 1, "secondary", 3, "click"]], template: function AdminPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Admin & compliance");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "h2");
            i0.ɵɵtext(4, "Licence vetting queue");
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(5, AdminPage_Conditional_5_Template, 2, 0, "p")(6, AdminPage_Conditional_6_Template, 2, 1, "p", 1)(7, AdminPage_Conditional_7_Template, 2, 0, "p")(8, AdminPage_Conditional_8_Template, 3, 0, "ul", 2);
            i0.ɵɵconditionalCreate(9, AdminPage_Conditional_9_Template, 5, 0);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(5);
            i0.ɵɵconditional(ctx.store.loading() ? 5 : ctx.store.error() ? 6 : ctx.pending().length === 0 ? 7 : 8);
            i0.ɵɵadvance(4);
            i0.ɵɵconditional(ctx.reviewed().length > 0 ? 9 : -1);
        } }, styles: ["h2[_ngcontent-%COMP%] { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }\n    .row[_ngcontent-%COMP%] { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok[_ngcontent-%COMP%] { background: var(--%NS%success); color: #fff; }\n    .chip.bad[_ngcontent-%COMP%] { background: var(--%NS%danger); color: #fff; }\n    .actions[_ngcontent-%COMP%] { margin-top: 0.75rem; display: flex; gap: 0.5rem; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(AdminPage, [{
        type: Component,
        args: [{ selector: 'app-admin', standalone: true, imports: [], template: `
    <section class="admin">
      <h1>Admin & compliance</h1>

      <h2>Licence vetting queue</h2>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else if (pending().length === 0) {
        <p>No submissions awaiting review.</p>
      } @else {
        <ul class="results">
          @for (submission of pending(); track submission.id) {
            <li class="card">
              <div class="row">
                <h3>{{ submission.providerName }}</h3>
                <span class="chip">pending</span>
              </div>
              <p class="meta">Licence {{ submission.licenceNumber }} · submitted {{ formatDate(submission.submittedAtMs) }}</p>
              <p class="roles">
                @for (specialty of submission.specialties; track specialty) {
                  <span class="chip">{{ specialty }}</span>
                }
              </p>
              @if (submission.note) {
                <p class="meta">Note: {{ submission.note }}</p>
              }
              <p class="actions">
                <button type="button" (click)="review(submission, 'approved')">Approve</button>
                <button type="button" class="secondary" (click)="review(submission, 'rejected')">Reject</button>
              </p>
            </li>
          }
        </ul>
      }

      @if (reviewed().length > 0) {
        <h2>Recently reviewed</h2>
        <ul class="results">
          @for (submission of reviewed(); track submission.id) {
            <li class="card">
              <div class="row">
                <h3>{{ submission.providerName }}</h3>
                <span class="chip" [class.ok]="submission.status === 'approved'"
                  [class.bad]="submission.status === 'rejected'">
                  {{ submission.status }}
                </span>
              </div>
              <p class="meta">Licence {{ submission.licenceNumber }} · reviewed {{ formatDate(submission.reviewedAtMs ?? submission.submittedAtMs) }}</p>
            </li>
          }
        </ul>
      }
    </section>
  `, styles: ["\n    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }\n    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok { background: var(--success); color: #fff; }\n    .chip.bad { background: var(--danger); color: #fff; }\n    .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(AdminPage, { className: "AdminPage", filePath: "src/app/features/admin/admin.page.ts", lineNumber: 77 }); })();
