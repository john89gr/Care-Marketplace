import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import * as i0 from "@angular/core";
/**
 * Wraps the browser Geolocation API (PLAN.md §5 Phase 2 — Check-in/GPS).
 * The provider is injectable so unit tests can substitute a fake.
 */
export class GeolocationService {
    /** Overridable in tests to inject a fake navigator.geolocation. */
    provider = browserGeolocation();
    isSupported() {
        return this.provider !== null;
    }
    /** One-shot position used for check-in/out GPS stamps. */
    currentPosition() {
        return new Observable((subscriber) => {
            if (!this.provider) {
                subscriber.error(new Error('Geolocation is not supported in this browser.'));
                return;
            }
            this.provider.getCurrentPosition((position) => {
                subscriber.next(toPoint(position));
                subscriber.complete();
            }, (error) => subscriber.error(new Error(`Geolocation error (${error.code}): ${error.message}`)));
        });
    }
    /** Continuous position stream used for live visit tracking. */
    watchPosition() {
        return new Observable((subscriber) => {
            if (!this.provider) {
                subscriber.error(new Error('Geolocation is not supported in this browser.'));
                return;
            }
            const watchId = this.provider.watchPosition((position) => subscriber.next(toPoint(position)), (error) => subscriber.error(new Error(`Geolocation error (${error.code}): ${error.message}`)));
            return () => this.provider?.clearWatch(watchId);
        });
    }
    static ɵfac = function GeolocationService_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || GeolocationService)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: GeolocationService, factory: GeolocationService.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(GeolocationService, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], null, null); })();
function browserGeolocation() {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        return navigator.geolocation;
    }
    return null;
}
function toPoint(position) {
    return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        atMs: Date.now(),
    };
}
