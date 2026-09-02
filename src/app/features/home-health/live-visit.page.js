import { Component, inject } from '@angular/core';
import { VisitStore } from './visit.store';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function LiveVisitPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵdomElementEnd();
} }
function LiveVisitPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No visits in progress right now.");
    i0.ɵɵdomElementEnd();
} }
function LiveVisitPage_Conditional_5_For_2_Conditional_7_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 3);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(2, "a", 5);
    i0.ɵɵtext(3, "Open in Maps");
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const point_r1 = ctx;
    const ctx_r1 = i0.ɵɵnextContext(3);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate3("\uD83D\uDCCD ", ctx_r1.position(point_r1), " \u00B7 accuracy \u00B1", point_r1.accuracyM.toFixed(0), " m \u00B7 ", ctx_r1.timeAgo(point_r1.atMs));
    i0.ɵɵadvance();
    i0.ɵɵdomProperty("href", ctx_r1.mapsUrl(point_r1), i0.ɵɵsanitizeUrl);
} }
function LiveVisitPage_Conditional_5_For_2_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 3);
    i0.ɵɵtext(1, "Waiting for a live position update\u2026");
    i0.ɵɵdomElementEnd();
} }
function LiveVisitPage_Conditional_5_For_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "li", 2)(1, "h3");
    i0.ɵɵtext(2);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(3, "p", 3)(4, "span", 4);
    i0.ɵɵtext(5, "in progress");
    i0.ɵɵdomElementEnd();
    i0.ɵɵtext(6);
    i0.ɵɵdomElementEnd();
    i0.ɵɵconditionalCreate(7, LiveVisitPage_Conditional_5_For_2_Conditional_7_Template, 4, 4)(8, LiveVisitPage_Conditional_5_For_2_Conditional_8_Template, 2, 0, "p", 3);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    let tmp_13_0;
    const visit_r3 = ctx.$implicit;
    const ctx_r1 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate2("", visit_r3.act, " \u2014 ", visit_r3.providerName);
    i0.ɵɵadvance(4);
    i0.ɵɵtextInterpolate1(" started ", ctx_r1.formatDate(visit_r3.scheduledAtMs), " ");
    i0.ɵɵadvance();
    i0.ɵɵconditional((tmp_13_0 = ctx_r1.store.positionOf(visit_r3.id)) ? 7 : 8, tmp_13_0);
} }
function LiveVisitPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 1);
    i0.ɵɵrepeaterCreate(1, LiveVisitPage_Conditional_5_For_2_Template, 9, 4, "li", 2, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r1 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r1.store.liveVisits());
} }
export class LiveVisitPage {
    store = inject(VisitStore);
    ngOnInit() {
        this.store.connect();
        this.store.load();
    }
    position(point) {
        return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    }
    mapsUrl(point) {
        return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
    }
    timeAgo(atMs) {
        const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
        if (seconds < 60) {
            return `${seconds}s ago`;
        }
        return `${Math.round(seconds / 60)}m ago`;
    }
    formatDate(ms) {
        return new Date(ms).toLocaleString(undefined, {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    static ɵfac = function LiveVisitPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || LiveVisitPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: LiveVisitPage, selectors: [["app-live-visit"]], decls: 6, vars: 1, consts: [[1, "live-visit"], [1, "results"], [1, "card"], [1, "meta"], [1, "chip", "now"], ["target", "_blank", "rel", "noopener", 3, "href"]], template: function LiveVisitPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Live visit tracking");
            i0.ɵɵdomElementEnd();
            i0.ɵɵconditionalCreate(3, LiveVisitPage_Conditional_3_Template, 2, 0, "p")(4, LiveVisitPage_Conditional_4_Template, 2, 0, "p")(5, LiveVisitPage_Conditional_5_Template, 3, 0, "ul", 1);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : ctx.store.liveVisits().length === 0 ? 4 : 5);
        } }, encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(LiveVisitPage, [{
        type: Component,
        args: [{
                selector: 'app-live-visit',
                standalone: true,
                imports: [],
                template: `
    <section class="live-visit">
      <h1>Live visit tracking</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.liveVisits().length === 0) {
        <p>No visits in progress right now.</p>
      } @else {
        <ul class="results">
          @for (visit of store.liveVisits(); track visit.id) {
            <li class="card">
              <h3>{{ visit.act }} — {{ visit.providerName }}</h3>
              <p class="meta">
                <span class="chip now">in progress</span>
                started {{ formatDate(visit.scheduledAtMs) }}
              </p>
              @if (store.positionOf(visit.id); as point) {
                <p class="meta">📍 {{ position(point) }} · accuracy ±{{ point.accuracyM.toFixed(0) }} m · {{ timeAgo(point.atMs) }}</p>
                <a [href]="mapsUrl(point)" target="_blank" rel="noopener">Open in Maps</a>
              } @else {
                <p class="meta">Waiting for a live position update…</p>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(LiveVisitPage, { className: "LiveVisitPage", filePath: "src/app/features/home-health/live-visit.page.ts", lineNumber: 38 }); })();
