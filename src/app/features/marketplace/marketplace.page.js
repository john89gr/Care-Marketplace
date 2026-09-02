import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MarketplaceStore } from './marketplace.store';
import { BookingStore } from './booking.store';
import { ROLES } from '../../core/auth/roles';
import * as i0 from "@angular/core";
const _forTrack0 = ($index, $item) => $item.id;
function MarketplacePage_Conditional_23_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "Searching\u2026");
    i0.ɵɵdomElementEnd();
} }
function MarketplacePage_Conditional_24_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p", 11);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.store.error());
} }
function MarketplacePage_Conditional_25_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "p");
    i0.ɵɵtext(1, "No caregivers match the current filters.");
    i0.ɵɵdomElementEnd();
} }
function MarketplacePage_Conditional_26_For_2_For_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "span", 15);
    i0.ɵɵtext(1);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const role_r3 = ctx.$implicit;
    const ctx_r0 = i0.ɵɵnextContext(3);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r0.roleLabel(role_r3));
} }
function MarketplacePage_Conditional_26_For_2_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "span", 17);
    i0.ɵɵtext(1, "available now");
    i0.ɵɵdomElementEnd();
} }
function MarketplacePage_Conditional_26_For_2_Template(rf, ctx) { if (rf & 1) {
    const _r2 = i0.ɵɵgetCurrentView();
    i0.ɵɵdomElementStart(0, "li", 13)(1, "h3");
    i0.ɵɵtext(2);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(3, "p", 14);
    i0.ɵɵrepeaterCreate(4, MarketplacePage_Conditional_26_For_2_For_5_Template, 2, 1, "span", 15, i0.ɵɵrepeaterTrackByIdentity);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(6, "p", 16);
    i0.ɵɵtext(7);
    i0.ɵɵconditionalCreate(8, MarketplacePage_Conditional_26_For_2_Conditional_8_Template, 2, 0, "span", 17);
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(9, "p", 18)(10, "button", 9);
    i0.ɵɵdomListener("click", function MarketplacePage_Conditional_26_For_2_Template_button_click_10_listener() { const card_r4 = i0.ɵɵrestoreView(_r2).$implicit; const ctx_r0 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r0.book(card_r4.id)); });
    i0.ɵɵtext(11, "Request booking");
    i0.ɵɵdomElementEnd();
    i0.ɵɵdomElementStart(12, "button", 10);
    i0.ɵɵdomListener("click", function MarketplacePage_Conditional_26_For_2_Template_button_click_12_listener() { const card_r4 = i0.ɵɵrestoreView(_r2).$implicit; const ctx_r0 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r0.chat(card_r4)); });
    i0.ɵɵtext(13, "Message");
    i0.ɵɵdomElementEnd()()();
} if (rf & 2) {
    const card_r4 = ctx.$implicit;
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(card_r4.displayName);
    i0.ɵɵadvance(2);
    i0.ɵɵrepeater(card_r4.roles);
    i0.ɵɵadvance(3);
    i0.ɵɵtextInterpolate3(" \u2605 ", card_r4.rating, " \u00B7 ", card_r4.distanceKm, " km \u00B7 ", card_r4.hourlyRate, "/h ");
    i0.ɵɵadvance();
    i0.ɵɵconditional(card_r4.availableNow ? 8 : -1);
} }
function MarketplacePage_Conditional_26_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵdomElementStart(0, "ul", 12);
    i0.ɵɵrepeaterCreate(1, MarketplacePage_Conditional_26_For_2_Template, 14, 5, "li", 13, _forTrack0);
    i0.ɵɵdomElementEnd();
} if (rf & 2) {
    const ctx_r0 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r0.store.results());
} }
const ROLE_LABELS = {
    [ROLES.CAREGIVER]: 'Caregiver',
    [ROLES.NURSE]: 'Nurse',
    [ROLES.PHYSIO]: 'Physiotherapist',
    [ROLES.PHARMACY]: 'Pharmacy',
    [ROLES.CLIENT]: 'Family',
    [ROLES.ADMIN]: 'Admin',
};
export class MarketplacePage {
    store = inject(MarketplaceStore);
    booking = inject(BookingStore);
    router = inject(Router);
    ngOnInit() {
        this.store.search();
    }
    roleLabel(role) {
        return ROLE_LABELS[role] ?? role;
    }
    book(caregiverId) {
        this.booking.startDraft(caregiverId);
    }
    chat(card) {
        this.router.navigate(['/chat'], { queryParams: { with: card.id, name: card.displayName } });
    }
    onQuery(query) {
        this.store.setFilters({ query });
    }
    ratingOrNull(value) {
        return value === '' ? null : Number(value);
    }
    static ɵfac = function MarketplacePage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || MarketplacePage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: MarketplacePage, selectors: [["app-marketplace"]], decls: 27, vars: 4, consts: [[1, "marketplace"], [1, "filters"], ["type", "search", "placeholder", "Search caregivers\u2026", 3, "input", "value"], ["type", "checkbox", 3, "change", "checked"], [3, "change", "value"], ["value", ""], ["value", "3"], ["value", "4"], ["value", "4.5"], ["type", "button", 3, "click"], ["type", "button", 1, "secondary", 3, "click"], ["role", "alert", 1, "error"], [1, "results"], [1, "card"], [1, "roles"], [1, "chip"], [1, "meta"], [1, "chip", "now"], [1, "actions"]], template: function MarketplacePage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Marketplace");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "div", 1)(4, "input", 2);
            i0.ɵɵdomListener("input", function MarketplacePage_Template_input_input_4_listener($event) { return ctx.onQuery($event.target.value); });
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(5, "label")(6, "input", 3);
            i0.ɵɵdomListener("change", function MarketplacePage_Template_input_change_6_listener($event) { return ctx.store.setFilters({ availableNowOnly: $event.target.checked }); });
            i0.ɵɵdomElementEnd();
            i0.ɵɵtext(7, " Available now ");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(8, "label");
            i0.ɵɵtext(9, " Min rating ");
            i0.ɵɵdomElementStart(10, "select", 4);
            i0.ɵɵdomListener("change", function MarketplacePage_Template_select_change_10_listener($event) { return ctx.store.setFilters({ minRating: ctx.ratingOrNull($event.target.value) }); });
            i0.ɵɵdomElementStart(11, "option", 5);
            i0.ɵɵtext(12, "Any");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(13, "option", 6);
            i0.ɵɵtext(14, "3+");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(15, "option", 7);
            i0.ɵɵtext(16, "4+");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(17, "option", 8);
            i0.ɵɵtext(18, "4.5+");
            i0.ɵɵdomElementEnd()()();
            i0.ɵɵdomElementStart(19, "button", 9);
            i0.ɵɵdomListener("click", function MarketplacePage_Template_button_click_19_listener() { return ctx.store.search(); });
            i0.ɵɵtext(20, "Search");
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(21, "button", 10);
            i0.ɵɵdomListener("click", function MarketplacePage_Template_button_click_21_listener() { return ctx.store.resetFilters(); });
            i0.ɵɵtext(22, "Reset");
            i0.ɵɵdomElementEnd()();
            i0.ɵɵconditionalCreate(23, MarketplacePage_Conditional_23_Template, 2, 0, "p")(24, MarketplacePage_Conditional_24_Template, 2, 1, "p", 11)(25, MarketplacePage_Conditional_25_Template, 2, 0, "p")(26, MarketplacePage_Conditional_26_Template, 3, 0, "ul", 12);
            i0.ɵɵdomElementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(4);
            i0.ɵɵdomProperty("value", ctx.store.filters().query);
            i0.ɵɵadvance(2);
            i0.ɵɵdomProperty("checked", ctx.store.filters().availableNowOnly);
            i0.ɵɵadvance(4);
            i0.ɵɵdomProperty("value", ctx.store.filters().minRating ?? "");
            i0.ɵɵadvance(13);
            i0.ɵɵconditional(ctx.store.loading() ? 23 : ctx.store.error() ? 24 : !ctx.store.hasResults() ? 25 : 26);
        } }, encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(MarketplacePage, [{
        type: Component,
        args: [{
                selector: 'app-marketplace',
                standalone: true,
                imports: [],
                template: `
    <section class="marketplace">
      <h1>Marketplace</h1>

      <div class="filters">
        <input
          type="search"
          placeholder="Search caregivers…"
          [value]="store.filters().query"
          (input)="onQuery($any($event.target).value)"
        />
        <label>
          <input
            type="checkbox"
            [checked]="store.filters().availableNowOnly"
            (change)="store.setFilters({ availableNowOnly: $any($event.target).checked })"
          />
          Available now
        </label>
        <label>
          Min rating
          <select
            [value]="store.filters().minRating ?? ''"
            (change)="store.setFilters({ minRating: ratingOrNull($any($event.target).value) })"
          >
            <option value="">Any</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </label>
        <button type="button" (click)="store.search()">Search</button>
        <button type="button" class="secondary" (click)="store.resetFilters()">Reset</button>
      </div>

      @if (store.loading()) {
        <p>Searching…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else if (!store.hasResults()) {
        <p>No caregivers match the current filters.</p>
      } @else {
        <ul class="results">
          @for (card of store.results(); track card.id) {
            <li class="card">
              <h3>{{ card.displayName }}</h3>
              <p class="roles">
                @for (role of card.roles; track role) {
                  <span class="chip">{{ roleLabel(role) }}</span>
                }
              </p>
              <p class="meta">
                ★ {{ card.rating }} · {{ card.distanceKm }} km · {{ card.hourlyRate }}/h
                @if (card.availableNow) {
                  <span class="chip now">available now</span>
                }
              </p>
              <p class="actions">
                <button type="button" (click)="book(card.id)">Request booking</button>
                <button type="button" class="secondary" (click)="chat(card)">Message</button>
              </p>
            </li>
          }
        </ul>
      }
    </section>
  `,
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(MarketplacePage, { className: "MarketplacePage", filePath: "src/app/features/marketplace/marketplace.page.ts", lineNumber: 88 }); })();
