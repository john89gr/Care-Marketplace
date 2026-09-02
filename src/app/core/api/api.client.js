import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as i0 from "@angular/core";
/**
 * Shared API client contract. Generated typed clients will replace this
 * once the backend publishes an OpenAPI spec (PLAN.md §6).
 */
export class ApiClient {
    http = inject(HttpClient);
    get(path) {
        return this.http.get(`/api${path}`);
    }
    post(path, body) {
        return this.http.post(`/api${path}`, body);
    }
    patch(path, body) {
        return this.http.patch(`/api${path}`, body);
    }
    delete(path) {
        return this.http.delete(`/api${path}`);
    }
    static ɵfac = function ApiClient_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ApiClient)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ApiClient, factory: ApiClient.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ApiClient, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
