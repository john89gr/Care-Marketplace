import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from './core/auth/session';
import { AuthApi } from './core/auth/auth.api';
import { ROLES } from './core/auth/roles';
import * as i0 from "@angular/core";
const _c0 = a0 => ({ exact: a0 });
const _forTrack0 = ($index, $item) => $item.href;
function App_For_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "a", 3);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const item_r1 = ctx.$implicit;
    i0.ɵɵproperty("routerLink", item_r1.href)("routerLinkActiveOptions", i0.ɵɵpureFunction1(3, _c0, item_r1.exact));
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", item_r1.label, " ");
} }
function App_Conditional_9_Template(rf, ctx) { if (rf & 1) {
    const _r2 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "a", 8);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(2, "button", 9);
    i0.ɵɵlistener("click", function App_Conditional_9_Template_button_click_2_listener() { i0.ɵɵrestoreView(_r2); const ctx_r2 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r2.logout()); });
    i0.ɵɵtext(3, "Log out");
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r2.session.displayName());
} }
function App_Conditional_10_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "a", 6);
    i0.ɵɵtext(1, "Log in");
    i0.ɵɵelementEnd();
} }
const NAV_ITEMS = [
    { label: 'Marketplace', href: '/marketplace', exact: true, roles: [] },
    { label: 'Bookings', href: '/bookings', exact: false, roles: [ROLES.CLIENT] },
    { label: 'Live visit', href: '/live-visit', exact: false, roles: [ROLES.CLIENT] },
    { label: 'Onboarding', href: '/onboarding', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Shifts', href: '/shifts', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Visits', href: '/visits', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Clinical log', href: '/clinical-log', exact: false, roles: [ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Care plan', href: '/care-plan', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Vitals', href: '/vitals', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
    { label: 'Payments', href: '/payments', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
    { label: 'Health record', href: '/health-record', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
    { label: 'Chat', href: '/chat', exact: false, roles: [] },
    { label: 'Admin', href: '/admin', exact: false, roles: [ROLES.ADMIN] },
];
const THEME_KEY = 'cm.theme.v1';
export class App {
    session = inject(SessionStore);
    auth = inject(AuthApi);
    router = inject(Router);
    navItems = computed(() => NAV_ITEMS.filter((item) => item.roles.length === 0 || this.session.hasAnyRole(item.roles)), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "navItems" }] : /* istanbul ignore next */ []));
    theme = signal(this.loadTheme(), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "theme" }] : /* istanbul ignore next */ []));
    constructor() {
        this.applyTheme(this.theme());
    }
    toggleTheme() {
        this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
        this.applyTheme(this.theme());
    }
    logout() {
        this.auth.logout();
        this.router.navigateByUrl('/marketplace');
    }
    loadTheme() {
        try {
            return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
        }
        catch {
            return 'light';
        }
    }
    applyTheme(theme) {
        document.documentElement.dataset['theme'] = theme;
        try {
            localStorage.setItem(THEME_KEY, theme);
        }
        catch {
            // Theme stays in memory when storage is unavailable.
        }
    }
    static ɵfac = function App_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || App)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: App, selectors: [["app-root"]], decls: 13, vars: 3, consts: [[1, "shell-header"], ["routerLink", "/marketplace", 1, "brand"], ["aria-label", "Main navigation", 1, "shell-nav"], ["routerLinkActive", "active", 3, "routerLink", "routerLinkActiveOptions"], [1, "shell-account"], ["type", "button", 1, "theme-toggle", 3, "click"], ["routerLink", "/login"], [1, "shell-main"], ["routerLink", "/profile", 1, "who"], ["type", "button", 3, "click"]], template: function App_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "header", 0)(1, "a", 1);
            i0.ɵɵtext(2, "CareMarketplace");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "nav", 2);
            i0.ɵɵrepeaterCreate(4, App_For_5_Template, 2, 5, "a", 3, _forTrack0);
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(6, "div", 4)(7, "button", 5);
            i0.ɵɵlistener("click", function App_Template_button_click_7_listener() { return ctx.toggleTheme(); });
            i0.ɵɵtext(8);
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(9, App_Conditional_9_Template, 4, 1)(10, App_Conditional_10_Template, 2, 0, "a", 6);
            i0.ɵɵelementEnd()();
            i0.ɵɵelementStart(11, "main", 7);
            i0.ɵɵelement(12, "router-outlet");
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(4);
            i0.ɵɵrepeater(ctx.navItems());
            i0.ɵɵadvance(3);
            i0.ɵɵattribute("aria-label", ctx.theme() === "dark" ? "Switch to light mode" : "Switch to dark mode");
            i0.ɵɵadvance();
            i0.ɵɵtextInterpolate1(" ", ctx.theme() === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19", " ");
            i0.ɵɵadvance();
            i0.ɵɵconditional(ctx.session.isLoggedIn() ? 9 : 10);
        } }, dependencies: [RouterLink, RouterLinkActive, RouterOutlet], styles: ["[_nghost-%COMP%] {\n  display: block;\n  min-height: 100dvh;\n}\n\n.shell-header[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  gap: 1.5rem;\n  padding: 0.75rem 1.25rem;\n  border-bottom: 1px solid var(--%NS%border);\n  background: var(--%NS%surface);\n  position: sticky;\n  top: 0;\n  z-index: 10;\n}\n\n.brand[_ngcontent-%COMP%] {\n  font-weight: 700;\n  font-size: 1.1rem;\n  color: var(--%NS%text);\n  text-decoration: none;\n  white-space: nowrap;\n}\n\n.shell-nav[_ngcontent-%COMP%] {\n  display: flex;\n  gap: 0.25rem;\n  flex-wrap: wrap;\n  flex: 1;\n}\n\n.shell-nav[_ngcontent-%COMP%]   a[_ngcontent-%COMP%] {\n  color: var(--%NS%text-muted);\n  text-decoration: none;\n  padding: 0.4rem 0.7rem;\n  border-radius: 0.5rem;\n  font-size: 0.95rem;\n}\n\n.shell-nav[_ngcontent-%COMP%]   a[_ngcontent-%COMP%]:hover {\n  color: var(--%NS%text);\n  background: var(--%NS%surface-raised);\n}\n\n.shell-nav[_ngcontent-%COMP%]   a.active[_ngcontent-%COMP%] {\n  color: var(--%NS%accent);\n  background: var(--%NS%accent-soft);\n  font-weight: 600;\n}\n\n.shell-account[_ngcontent-%COMP%] {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  white-space: nowrap;\n}\n\n.shell-account[_ngcontent-%COMP%]   .who[_ngcontent-%COMP%] {\n  color: var(--%NS%text);\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.theme-toggle[_ngcontent-%COMP%] {\n  background: none;\n  border: 1px solid var(--%NS%border);\n  border-radius: 0.5rem;\n  padding: 0.25rem 0.5rem;\n  cursor: pointer;\n  font-size: 1rem;\n  line-height: 1;\n}\n\n.shell-main[_ngcontent-%COMP%] {\n  max-width: 64rem;\n  margin: 0 auto;\n  padding: 1.5rem 1.25rem 3rem;\n}"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(App, [{
        type: Component,
        args: [{ imports: [RouterLink, RouterLinkActive, RouterOutlet], selector: 'app-root', template: "<header class=\"shell-header\">\n  <a class=\"brand\" routerLink=\"/marketplace\">CareMarketplace</a>\n\n  <nav class=\"shell-nav\" aria-label=\"Main navigation\">\n    @for (item of navItems(); track item.href) {\n      <a\n        [routerLink]=\"item.href\"\n        routerLinkActive=\"active\"\n        [routerLinkActiveOptions]=\"{ exact: item.exact }\"\n      >\n        {{ item.label }}\n      </a>\n    }\n  </nav>\n\n  <div class=\"shell-account\">\n    <button type=\"button\" class=\"theme-toggle\" (click)=\"toggleTheme()\" [attr.aria-label]=\"theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'\">\n      {{ theme() === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19' }}\n    </button>\n\n    @if (session.isLoggedIn()) {\n      <a routerLink=\"/profile\" class=\"who\">{{ session.displayName() }}</a>\n      <button type=\"button\" (click)=\"logout()\">Log out</button>\n    } @else {\n      <a routerLink=\"/login\">Log in</a>\n    }\n  </div>\n</header>\n\n<main class=\"shell-main\">\n  <router-outlet />\n</main>\n", styles: [":host {\n  display: block;\n  min-height: 100dvh;\n}\n\n.shell-header {\n  display: flex;\n  align-items: center;\n  gap: 1.5rem;\n  padding: 0.75rem 1.25rem;\n  border-bottom: 1px solid var(--border);\n  background: var(--surface);\n  position: sticky;\n  top: 0;\n  z-index: 10;\n}\n\n.brand {\n  font-weight: 700;\n  font-size: 1.1rem;\n  color: var(--text);\n  text-decoration: none;\n  white-space: nowrap;\n}\n\n.shell-nav {\n  display: flex;\n  gap: 0.25rem;\n  flex-wrap: wrap;\n  flex: 1;\n}\n\n.shell-nav a {\n  color: var(--text-muted);\n  text-decoration: none;\n  padding: 0.4rem 0.7rem;\n  border-radius: 0.5rem;\n  font-size: 0.95rem;\n}\n\n.shell-nav a:hover {\n  color: var(--text);\n  background: var(--surface-raised);\n}\n\n.shell-nav a.active {\n  color: var(--accent);\n  background: var(--accent-soft);\n  font-weight: 600;\n}\n\n.shell-account {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  white-space: nowrap;\n}\n\n.shell-account .who {\n  color: var(--text);\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.theme-toggle {\n  background: none;\n  border: 1px solid var(--border);\n  border-radius: 0.5rem;\n  padding: 0.25rem 0.5rem;\n  cursor: pointer;\n  font-size: 1rem;\n  line-height: 1;\n}\n\n.shell-main {\n  max-width: 64rem;\n  margin: 0 auto;\n  padding: 1.5rem 1.25rem 3rem;\n}\n"] }]
    }], () => [], null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(App, { className: "App", filePath: "src/app/app.ts", lineNumber: 38 }); })();
