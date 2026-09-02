import { Component, inject } from '@angular/core';
import { EscrowStore } from './escrow.store';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function PaymentsPage_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵdomElementEnd();
} }
function PaymentsPage_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No escrow transactions yet.");
    i0.ɵɵdomElementEnd();
} }
function PaymentsPage_Conditional_9_For_2_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "p", 7)(1, "button", 8);
    i0.ɵɵdomListener("click", function PaymentsPage_Conditional_9_For_2_Conditional_8_Template_button_click_1_listener() { i0.ɵɵrestoreView(_r1); const tx_r2 = i0.ɵɵnextContext().$implicit; const ctx_r2 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r2.release(tx_r2)); });
    i0.ɵɵtext(2, "Release");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(3, "button", 9);
    i0.ɵɵdomListener("click", function PaymentsPage_Conditional_9_For_2_Conditional_8_Template_button_click_3_listener() { i0.ɵɵrestoreView(_r1); const tx_r2 = i0.ɵɵnextContext().$implicit; const ctx_r2 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r2.refund(tx_r2)); });
    i0.ɵɵtext(4, "Refund");
    i0.ɵɵdomElementEnd()();
} if (rf & 2) {
    const tx_r2 = i0.ɵɵnextContext().$implicit;
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵdomProperty("disabled", ctx_r2.store.actingId() === tx_r2.id);
    i0.ɵɵadvance(2);
    i0.ɵɵdomProperty("disabled", ctx_r2.store.actingId() === tx_r2.id);
} }
function PaymentsPage_Conditional_9_For_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li", 4)(1, "div", 5)(2, "h3");
    i0.ɵɵtext(3);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(4, "span", 6);
    i0.ɵɵtext(5);
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(6, "p", 1);
    i0.ɵɵtext(7);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(8, PaymentsPage_Conditional_9_For_2_Conditional_8_Template, 5, 2, "p", 7);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const tx_r2 = ctx.$implicit;
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate1("", (tx_r2.amountCents / 100).toFixed(2), " \u20AC");
    i0.ɵɵadvance();
    i0.ɵɵclassProp("ok", tx_r2.status === "released")("bad", tx_r2.status === "refunded");
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", tx_r2.status, " ");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate2("Booking ", tx_r2.bookingId, " \u00B7 ", ctx_r2.formatDate(tx_r2.createdAtMs));
    i0.ɵɵadvance();
    i0.ɵɵconditional(tx_r2.status === "held" ? 8 : -1);
} }
function PaymentsPage_Conditional_9_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 2);
    i0.ɵɵrepeaterCreate(1, PaymentsPage_Conditional_9_For_2_Template, 9, 9, "li", 4, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r2.store.transactions());
} }
function PaymentsPage_Conditional_10_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 3);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r2.store.error());
} }
function formatDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export class PaymentsPage {
    store = inject(EscrowStore);
    ngOnInit() {
        this.store.load();
    }
    release(tx) {
        this.store.release(tx.id).subscribe();
    }
    refund(tx) {
        this.store.refund(tx.id).subscribe();
    }
    formatDate(ms) {
        return formatDate(ms);
    }
    static ɵfac = function PaymentsPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || PaymentsPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: PaymentsPage, selectors: [["app-payments"]], decls: 11, vars: 3, consts: [[1, "payments"], [1, "meta"], [1, "results"], ["role", "alert", 1, "error"], [1, "card"], [1, "row"], [1, "chip"], [1, "actions"], ["type", "button", 3, "click", "disabled"], ["type", "button", 1, "secondary", 3, "click", "disabled"]], template: function PaymentsPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Payments & escrow");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "p", 1);
            i0.ɵɵtext(4, " Held balance: ");
            i0.ɵɵdomElementStart(5, "strong");
            i0.ɵɵtext(6);
            i0.ɵɵdomElementEnd()();
            i0.ɵɵconditionalCreate(7, PaymentsPage_Conditional_7_Template, 2, 0, "p")(8, PaymentsPage_Conditional_8_Template, 2, 0, "p")(9, PaymentsPage_Conditional_9_Template, 3, 0, "ul", 2);
            i0.ɵɵconditionalCreate(10, PaymentsPage_Conditional_10_Template, 2, 1, "p", 3);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(6);
            i0.ɵɵtextInterpolate1("", (ctx.store.heldTotalCents() / 100).toFixed(2), " \u20AC");
            i0.ɵɵadvance();
            i0.ɵɵconditional(ctx.store.loading() ? 7 : ctx.store.transactions().length === 0 ? 8 : 9);
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.error() ? 10 : -1);
        } }, styles: [".row[_ngcontent-%COMP%] { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok[_ngcontent-%COMP%] { background: var(--%NS%success); color: #fff; }\n    .chip.bad[_ngcontent-%COMP%] { background: var(--%NS%danger); color: #fff; }\n    .actions[_ngcontent-%COMP%] { display: flex; gap: 0.5rem; margin-top: 0.5rem; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(PaymentsPage, [{
        type: Component,
        args: [{ selector: 'app-payments', standalone: true, imports: [], template: `
    <section class="payments">
      <h1>Payments & escrow</h1>

      <p class="meta">
        Held balance: <strong>{{ (store.heldTotalCents() / 100).toFixed(2) }} €</strong>
      </p>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.transactions().length === 0) {
        <p>No escrow transactions yet.</p>
      } @else {
        <ul class="results">
          @for (tx of store.transactions(); track tx.id) {
            <li class="card">
              <div class="row">
                <h3>{{ (tx.amountCents / 100).toFixed(2) }} €</h3>
                <span class="chip" [class.ok]="tx.status === 'released'"
                  [class.bad]="tx.status === 'refunded'">
                  {{ tx.status }}
                </span>
              </div>
              <p class="meta">Booking {{ tx.bookingId }} · {{ formatDate(tx.createdAtMs) }}</p>
              @if (tx.status === 'held') {
                <p class="actions">
                  <button type="button"
                    [disabled]="store.actingId() === tx.id"
                    (click)="release(tx)">Release</button>
                  <button type="button" class="secondary"
                    [disabled]="store.actingId() === tx.id"
                    (click)="refund(tx)">Refund</button>
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `, styles: ["\n    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok { background: var(--success); color: #fff; }\n    .chip.bad { background: var(--danger); color: #fff; }\n    .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(PaymentsPage, { className: "PaymentsPage", filePath: "src/app/features/payments/payments.page.ts", lineNumber: 63 }); })();
