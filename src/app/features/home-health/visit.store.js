import { Injectable, inject, signal, computed } from '@angular/core';
import { map, catchError, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import { GeolocationService } from '../../core/services/geo/geolocation.service';
import { ROLES } from '../../core/auth/roles';
import { EscrowStore } from '../payments/escrow.store';
import * as i0 from "@angular/core";
import * as i1 from "../../core/api/api.client";
import * as i2 from "../../core/auth/session";
import * as i3 from "../../core/services/geo/geolocation.service";
import * as i4 from "../../core/services/ws/websocket.client";
import * as i5 from "../payments/escrow.store";
/**
 * Visit lifecycle state (PLAN.md §5 Phase 2 — Check-in/GPS): the provider
 * stamps check-in/out with a GPS position; live positions are streamed over
 * the WebSocket so the family can follow the visit in real time.
 *
 * WS protocol:
 *   provider -> server: { type: 'visit.position', payload: { visitId, position } }
 *   server  -> client: { type: 'visit.status',  payload: { visitId, status } }
 */
export class VisitStore {
    api;
    session;
    geo;
    ws;
    escrow;
    // Default-parameter injection keeps `new VisitStore(api, session, geo, ws, escrow)`
    // possible in unit tests while remaining DI-friendly in the app.
    constructor(api = inject(ApiClient), session = inject(SessionStore), geo = inject(GeolocationService), ws = inject(WebSocketClient), escrow = inject(EscrowStore)) {
        this.api = api;
        this.session = session;
        this.geo = geo;
        this.ws = ws;
        this.escrow = escrow;
        this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
    }
    _visits = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_visits" }] : /* istanbul ignore next */ []));
    _live = signal({}, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_live" }] : /* istanbul ignore next */ []));
    _loading = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_loading" }] : /* istanbul ignore next */ []));
    _busyId = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_busyId" }] : /* istanbul ignore next */ []));
    _error = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_error" }] : /* istanbul ignore next */ []));
    _positionError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_positionError" }] : /* istanbul ignore next */ []));
    _tracking = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_tracking" }] : /* istanbul ignore next */ []));
    visits = this._visits.asReadonly();
    live = this._live.asReadonly();
    loading = this._loading.asReadonly();
    busyId = this._busyId.asReadonly();
    error = this._error.asReadonly();
    positionError = this._positionError.asReadonly();
    tracking = this._tracking.asReadonly();
    isProvider = computed(() => this.session.hasAnyRole([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO]), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "isProvider" }] : /* istanbul ignore next */ []));
    /** The provider's own in-progress visit (for the visits page). */
    activeVisit = computed(() => {
        const me = this.session.session();
        if (!me) {
            return null;
        }
        return (this._visits().find((v) => v.status === 'in-progress' && v.providerId === me.userId) ?? null);
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "activeVisit" }] : /* istanbul ignore next */ []));
    /** In-progress visits involving the current user (family live view). */
    liveVisits = computed(() => this._visits().filter((v) => v.status === 'in-progress'), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "liveVisits" }] : /* istanbul ignore next */ []));
    connect() {
        this.ws.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/visits`);
    }
    load() {
        this._loading.set(true);
        this.api.get('/visits/me').subscribe({
            next: (visits) => {
                this._visits.set(visits);
                this._loading.set(false);
            },
            error: () => this._loading.set(false),
        });
    }
    /** Provider: stamp check-in with the current GPS position. */
    checkIn(visitId) {
        return this.stamp(visitId, '/check-in');
    }
    /** Provider: stamp check-out with the current GPS position. */
    checkOut(visitId) {
        return this.stamp(visitId, '/check-out').pipe(map((ok) => {
            // Phase 2 exit criterion: escrow releases automatically on completion.
            if (ok) {
                this.releaseEscrowForVisit(visitId);
            }
            return ok;
        }));
    }
    /** Finds the completed visit's booking and releases its escrow hold. */
    releaseEscrowForVisit(visitId) {
        const visit = this._visits().find((v) => v.id === visitId);
        if (!visit?.bookingId) {
            return;
        }
        this.api
            .get('/payments/escrow')
            .subscribe({
            next: (transactions) => {
                const held = transactions.find((t) => t.bookingId === visit.bookingId && t.status === 'held');
                if (held) {
                    this.escrow.release(held.id).subscribe();
                }
            },
        });
    }
    /** Live position of a visit (family tracking view). */
    positionOf(visitId) {
        return this._live()[visitId] ?? null;
    }
    /** Provider: start streaming live GPS positions for the active visit. */
    startTracking(visitId) {
        this.stopTracking();
        const me = this.session.session();
        if (!me) {
            return;
        }
        this._tracking.set(true);
        this._positionError.set('');
        this.geo.watchPosition().subscribe({
            next: (position) => {
                this._live.update((all) => ({ ...all, [visitId]: position }));
                this.ws.send({
                    type: 'visit.position',
                    payload: { visitId, position },
                });
            },
            error: () => {
                this._positionError.set('Live tracking unavailable — GPS error.');
                this._tracking.set(false);
            },
        });
    }
    stopTracking() {
        this._tracking.set(false);
    }
    handleEnvelope(envelope) {
        switch (envelope.type) {
            case 'visit.position': {
                const { visitId, position } = envelope.payload;
                this._live.update((all) => ({ ...all, [visitId]: position }));
                break;
            }
            case 'visit.status': {
                const { visitId, status } = envelope.payload;
                this._visits.update((list) => list.map((v) => (v.id === visitId ? { ...v, status } : v)));
                break;
            }
        }
    }
    stamp(visitId, path) {
        this._busyId.set(visitId);
        this._error.set('');
        return this.geo.currentPosition().pipe(switchMap((position) => this.api.post(`/visits/${visitId}${path}`, { position }).pipe(map((visit) => {
            this._visits.update((list) => list.map((v) => (v.id === visit.id ? visit : v)));
            this._busyId.set(null);
            return true;
        }), catchError((error) => {
            this._busyId.set(null);
            this._error.set(error?.error?.message ??
                'Could not save the visit. Please try again.');
            return of(false);
        }))), catchError(() => {
            this._busyId.set(null);
            this._error.set(path === '/check-in'
                ? 'Could not check in — enable location access to stamp your visit.'
                : 'Could not check out — enable location access to stamp your visit.');
            return of(false);
        }));
    }
    static ɵfac = function VisitStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || VisitStore)(i0.ɵɵinject(i1.ApiClient), i0.ɵɵinject(i2.SessionStore), i0.ɵɵinject(i3.GeolocationService), i0.ɵɵinject(i4.WebSocketClient), i0.ɵɵinject(i5.EscrowStore)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: VisitStore, factory: VisitStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(VisitStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.ApiClient }, { type: i2.SessionStore }, { type: i3.GeolocationService }, { type: i4.WebSocketClient }, { type: i5.EscrowStore }], null); })();
