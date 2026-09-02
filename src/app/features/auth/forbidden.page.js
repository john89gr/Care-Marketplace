import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import * as i0 from "@angular/core";
export class ForbiddenPage {
    static ɵfac = function ForbiddenPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ForbiddenPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: ForbiddenPage, selectors: [["app-forbidden"]], decls: 7, vars: 0, consts: [[1, "forbidden"], ["routerLink", "/marketplace"]], template: function ForbiddenPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Acc\u00E8s refus\u00E9");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "p");
            i0.ɵɵtext(4, "Votre r\u00F4le ne permet pas d'ouvrir cette page.");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(5, "a", 1);
            i0.ɵɵtext(6, "Retour au marketplace");
            i0.ɵɵelementEnd()();
        } }, dependencies: [RouterLink], encapsulation: 2 });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ForbiddenPage, [{
        type: Component,
        args: [{
                selector: 'app-forbidden',
                standalone: true,
                imports: [RouterLink],
                template: `
    <section class="forbidden">
      <h1>Accès refusé</h1>
      <p>Votre rôle ne permet pas d'ouvrir cette page.</p>
      <a routerLink="/marketplace">Retour au marketplace</a>
    </section>
  `,
            }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(ForbiddenPage, { className: "ForbiddenPage", filePath: "src/app/features/auth/forbidden.page.ts", lineNumber: 16 }); })();
