import { Component, computed, inject } from '@angular/core';
import { VisitStore } from './visit.store';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function VisitsPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵdomElementEnd();
} }
function VisitsPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No visits yet.");
    i0.ɵɵdomElementEnd();
} }
function VisitsPage_Conditional_5_For_2_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const visit_r1 = i0.ɵɵnextContext().$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1("Check-in: ", ctx_r1.position(visit_r1.checkIn));
} }
function VisitsPage_Conditional_5_For_2_Conditional_9_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const visit_r1 = i0.ɵɵnextContext().$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1("Check-out: ", ctx_r1.position(visit_r1.checkOut));
} }
function VisitsPage_Conditional_5_For_2_Conditional_10_Template(rf, ctx) { if (rf & 1) {
    const _r3 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "button", 8);
    i0.ɵɵdomListener("click", function VisitsPage_Conditional_5_For_2_Conditional_10_Template_button_click_0_listener() { i0.ɵɵrestoreView(_r3); const visit_r1 = i0.ɵɵnextContext().$implicit; const ctx_r1 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r1.checkIn(visit_r1)); });
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const visit_r1 = i0.ɵɵnextContext().$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵdomProperty("disabled", ctx_r1.store.busyId() === visit_r1.id);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r1.store.busyId() === visit_r1.id ? "Checking in\u2026" : "Check in (GPS)", " ");
} }
function VisitsPage_Conditional_5_For_2_Conditional_11_Template(rf, ctx) { if (rf & 1) {
    const _r4 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "button", 9);
    i0.ɵɵdomListener("click", function VisitsPage_Conditional_5_For_2_Conditional_11_Template_button_click_0_listener() { i0.ɵɵrestoreView(_r4); const visit_r1 = i0.ɵɵnextContext().$implicit; const ctx_r1 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r1.startTracking(visit_r1)); });
    i0.ɵɵtext(1, "Start live tracking");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(2, "button", 10);
    i0.ɵɵdomListener("click", function VisitsPage_Conditional_5_For_2_Conditional_11_Template_button_click_2_listener() { i0.ɵɵrestoreView(_r4); const visit_r1 = i0.ɵɵnextContext().$implicit; const ctx_r1 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r1.checkOut(visit_r1)); });
    i0.ɵɵtext(3, "Check out (GPS)");
    i0.ɵɵdomElementEnd();
} }
function VisitsPage_Conditional_5_For_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li", 3)(1, "div", 4)(2, "h3");
    i0.ɵɵtext(3);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(4, "span", 5);
    i0.ɵɵtext(5);
    i0.ɵɵdomElementEnd()();
    i0.ɵɵdomElementStart(6, "p", 6);
    i0.ɵɵtext(7);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(8, VisitsPage_Conditional_5_For_2_Conditional_8_Template, 2, 1, "p", 6);
    i0.ɵɵconditionalCreate(9, VisitsPage_Conditional_5_For_2_Conditional_9_Template, 2, 1, "p", 6);
    i0.ɵɵconditionalCreate(10, VisitsPage_Conditional_5_For_2_Conditional_10_Template, 2, 2, "button", 7)(11, VisitsPage_Conditional_5_For_2_Conditional_11_Template, 4, 0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const visit_r1 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate(visit_r1.act);
    i0.ɵɵadvance();
    i0.ɵɵclassProp("ok", visit_r1.status === "completed")("now", visit_r1.status === "in-progress");
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", visit_r1.status, " ");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate2("", visit_r1.clientName, " \u00B7 ", ctx_r1.formatDate(visit_r1.scheduledAtMs));
    i0.ɵɵadvance();
    i0.ɵɵconditional(visit_r1.checkIn ? 8 : -1);
    i0.ɵɵadvance();
    i0.ɵɵconditional(visit_r1.checkOut ? 9 : -1);
    i0.ɵɵadvance();
    i0.ɵɵconditional(visit_r1.status === "scheduled" ? 10 : visit_r1.status === "in-progress" ? 11 : -1);
} }
function VisitsPage_Conditional_5_Conditional_3_Conditional_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 1);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(3);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r1.store.positionError());
} }
function VisitsPage_Conditional_5_Conditional_3_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(3);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate2("\uD83D\uDCCD ", ctx_r1.position(ctx_r1.livePoint()), " \u00B7 accuracy \u00B1", ctx_r1.livePoint().accuracyM.toFixed(0), " m");
} }
function VisitsPage_Conditional_5_Conditional_3_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 6);
    i0.ɵɵtext(1, "Waiting for GPS fix\u2026");
    i0.ɵɵdomElementEnd();
} }
function VisitsPage_Conditional_5_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "h2");
    i0.ɵɵtext(1, "Live tracking");
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(2, VisitsPage_Conditional_5_Conditional_3_Conditional_2_Template, 2, 1, "p", 1)(3, VisitsPage_Conditional_5_Conditional_3_Conditional_3_Template, 2, 2, "p", 6)(4, VisitsPage_Conditional_5_Conditional_3_Conditional_4_Template, 2, 0, "p", 6);
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r1.store.positionError() ? 2 : ctx_r1.livePoint() ? 3 : 4);
} }
function VisitsPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 2);
    i0.ɵɵrepeaterCreate(1, VisitsPage_Conditional_5_For_2_Template, 12, 11, "li", 3, _forTrack0);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(3, VisitsPage_Conditional_5_Conditional_3_Template, 5, 1);
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r1.store.visits());
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r1.store.activeVisit() ? 3 : -1);
} }
function VisitsPage_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 1);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r1.store.error());
} }
function formatDate(ms) {
    return new Date(ms).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export class VisitsPage {
    store = inject(VisitStore);
    livePoint = computed(() => {
        const active = this.store.activeVisit();
        return active ? this.store.positionOf(active.id) : null;
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "livePoint" }] : /* istanbul ignore next */ []));
    ngOnInit() {
        this.store.connect();
        this.store.load();
    }
    checkIn(visit) {
        this.store.checkIn(visit.id).subscribe();
    }
    checkOut(visit) {
        this.store.checkOut(visit.id).subscribe((ok) => {
            if (ok) {
                this.store.stopTracking();
            }
        });
    }
    startTracking(visit) {
        this.store.startTracking(visit.id);
    }
    position(point) {
        return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    }
    formatDate(ms) {
        return formatDate(ms);
    }
    static ɵfac = function VisitsPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || VisitsPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: VisitsPage, selectors: [["app-visits"]], decls: 7, vars: 2, consts: [[1, "visits"], ["role", "alert", 1, "error"], [1, "results"], [1, "card"], [1, "row"], [1, "chip"], [1, "meta"], ["type", "button", 3, "disabled"], ["type", "button", 3, "click", "disabled"], ["type", "button", 1, "secondary", 3, "click"], ["type", "button", 3, "click"]], template: function VisitsPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "My visits");
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(3, VisitsPage_Conditional_3_Template, 2, 0, "p")(4, VisitsPage_Conditional_4_Template, 2, 0, "p")(5, VisitsPage_Conditional_5_Template, 4, 1);
            i0.ɵɵconditionalCreate(6, VisitsPage_Conditional_6_Template, 2, 1, "p", 1);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : ctx.store.visits().length === 0 ? 4 : 5);
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.error() ? 6 : -1);
        } }, styles: [".row[_ngcontent-%COMP%] { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok[_ngcontent-%COMP%] { background: var(--%NS%success); color: #fff; }\n    h2[_ngcontent-%COMP%] { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(VisitsPage, [{
        type: Component,
        args: [{ selector: 'app-visits', standalone: true, imports: [], template: `
    <section class="visits">
      <h1>My visits</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.visits().length === 0) {
        <p>No visits yet.</p>
      } @else {
        <ul class="results">
          @for (visit of store.visits(); track visit.id) {
            <li class="card">
              <div class="row">
                <h3>{{ visit.act }}</h3>
                <span class="chip" [class.ok]="visit.status === 'completed'"
                  [class.now]="visit.status === 'in-progress'">
                  {{ visit.status }}
                </span>
              </div>
              <p class="meta">{{ visit.clientName }} · {{ formatDate(visit.scheduledAtMs) }}</p>

              @if (visit.checkIn) {
                <p class="meta">Check-in: {{ position(visit.checkIn) }}</p>
              }
              @if (visit.checkOut) {
                <p class="meta">Check-out: {{ position(visit.checkOut) }}</p>
              }

              @if (visit.status === 'scheduled') {
                <button type="button"
                  [disabled]="store.busyId() === visit.id"
                  (click)="checkIn(visit)">
                  {{ store.busyId() === visit.id ? 'Checking in…' : 'Check in (GPS)' }}
                </button>
              } @else if (visit.status === 'in-progress') {
                <button type="button" class="secondary" (click)="startTracking(visit)">Start live tracking</button>
                <button type="button" (click)="checkOut(visit)">Check out (GPS)</button>
              }
            </li>
          }
        </ul>

        @if (store.activeVisit()) {
          <h2>Live tracking</h2>
          @if (store.positionError()) {
            <p class="error" role="alert">{{ store.positionError() }}</p>
          } @else if (livePoint()) {
            <p class="meta">📍 {{ position(livePoint()!) }} · accuracy ±{{ livePoint()!.accuracyM.toFixed(0) }} m</p>
          } @else {
            <p class="meta">Waiting for GPS fix…</p>
          }
        }
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `, styles: ["\n    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }\n    .chip.ok { background: var(--success); color: #fff; }\n    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(VisitsPage, { className: "VisitsPage", filePath: "src/app/features/home-health/visits.page.ts", lineNumber: 82 }); })();
