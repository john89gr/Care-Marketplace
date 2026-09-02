import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { EscrowTransaction } from '../payments/escrow.store';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';
import { GeoPoint, GeolocationService } from '../../core/services/geo/geolocation.service';
import { ROLES } from '../../core/auth/roles';
import { EscrowStore } from '../payments/escrow.store';

export type VisitStatus = 'scheduled' | 'in-progress' | 'completed' | 'cancelled';

export interface Visit {
  id: string;
  shiftId: string;
  bookingId: string;
  providerId: string;
  clientId: string;
  clientName: string;
  providerName: string;
  act: string;
  scheduledAtMs: number;
  status: VisitStatus;
  checkIn: GeoPoint | null;
  checkOut: GeoPoint | null;
}

/**
 * Visit lifecycle state (PLAN.md §5 Phase 2 — Check-in/GPS): the provider
 * stamps check-in/out with a GPS position; live positions are streamed over
 * the WebSocket so the family can follow the visit in real time.
 *
 * WS protocol:
 *   provider -> server: { type: 'visit.position', payload: { visitId, position } }
 *   server  -> client: { type: 'visit.status',  payload: { visitId, status } }
 */
@Injectable({ providedIn: 'root' })
export class VisitStore {
  // Default-parameter injection keeps `new VisitStore(api, session, geo, ws, escrow)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly session: SessionStore = inject(SessionStore),
    private readonly geo: GeolocationService = inject(GeolocationService),
    private readonly ws: WebSocketClient = inject(WebSocketClient),
    private readonly escrow: EscrowStore = inject(EscrowStore)
  ) {
    this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
  }
  private readonly _visits = signal<Visit[]>([]);
  private readonly _live = signal<Record<string, GeoPoint>>({});
  private readonly _loading = signal(false);
  private readonly _busyId = signal<string | null>(null);
  private readonly _error = signal('');
  private readonly _positionError = signal('');
  private readonly _tracking = signal(false);

  readonly visits = this._visits.asReadonly();
  readonly live = this._live.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly busyId = this._busyId.asReadonly();
  readonly error = this._error.asReadonly();
  readonly positionError = this._positionError.asReadonly();
  readonly tracking = this._tracking.asReadonly();

  readonly isProvider = computed(() =>
    this.session.hasAnyRole([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])
  );

  /** The provider's own in-progress visit (for the visits page). */
  readonly activeVisit = computed<Visit | null>(() => {
    const me = this.session.session();
    if (!me) {
      return null;
    }
    return (
      this._visits().find(
        (v) => v.status === 'in-progress' && v.providerId === me.userId
      ) ?? null
    );
  });

  /** In-progress visits involving the current user (family live view). */
  readonly liveVisits = computed(() =>
    this._visits().filter((v) => v.status === 'in-progress')
  );

  connect(): void {
    this.ws.connect(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/visits`
    );
  }

  load(): void {
    this._loading.set(true);
    this.api.get<Visit[]>('/visits/me').subscribe({
      next: (visits) => {
        this._visits.set(visits);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Provider: stamp check-in with the current GPS position. */
  checkIn(visitId: string): Observable<boolean> {
    return this.stamp(visitId, '/check-in');
  }

  /** Provider: stamp check-out with the current GPS position. */
  checkOut(visitId: string): Observable<boolean> {
    return this.stamp(visitId, '/check-out').pipe(
      map((ok) => {
        // Phase 2 exit criterion: escrow releases automatically on completion.
        if (ok) {
          this.releaseEscrowForVisit(visitId);
        }
        return ok;
      })
    );
  }

  /** Finds the completed visit's booking and releases its escrow hold. */
  private releaseEscrowForVisit(visitId: string): void {
    const visit = this._visits().find((v) => v.id === visitId);
    if (!visit?.bookingId) {
      return;
    }
    this.api
      .get<EscrowTransaction[]>('/payments/escrow')
      .subscribe({
        next: (transactions) => {
          const held = transactions.find(
            (t) => t.bookingId === visit.bookingId && t.status === 'held'
          );
          if (held) {
            this.escrow.release(held.id).subscribe();
          }
        },
      });
  }

  /** Live position of a visit (family tracking view). */
  positionOf(visitId: string): GeoPoint | null {
    return this._live()[visitId] ?? null;
  }

  /** Provider: start streaming live GPS positions for the active visit. */
  startTracking(visitId: string): void {
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

  stopTracking(): void {
    this._tracking.set(false);
  }

  handleEnvelope(envelope: WsEnvelope): void {
    switch (envelope.type) {
      case 'visit.position': {
        const { visitId, position } = envelope.payload as {
          visitId: string;
          position: GeoPoint;
        };
        this._live.update((all) => ({ ...all, [visitId]: position }));
        break;
      }
      case 'visit.status': {
        const { visitId, status } = envelope.payload as { visitId: string; status: VisitStatus };
        this._visits.update((list) =>
          list.map((v) => (v.id === visitId ? { ...v, status } : v))
        );
        break;
      }
    }
  }

  private stamp(visitId: string, path: '/check-in' | '/check-out'): Observable<boolean> {
    this._busyId.set(visitId);
    this._error.set('');
    return this.geo.currentPosition().pipe(
      switchMap((position) =>
        this.api.post<Visit>(`/visits/${visitId}${path}`, { position }).pipe(
          map((visit) => {
            this._visits.update((list) =>
              list.map((v) => (v.id === visit.id ? visit : v))
            );
            this._busyId.set(null);
            return true;
          }),
          catchError((error) => {
            this._busyId.set(null);
            this._error.set(
              (error as { error?: { message?: string } })?.error?.message ??
                'Could not save the visit. Please try again.'
            );
            return of(false);
          })
        )
      ),
      catchError(() => {
        this._busyId.set(null);
        this._error.set(
          path === '/check-in'
            ? 'Could not check in — enable location access to stamp your visit.'
            : 'Could not check out — enable location access to stamp your visit.'
        );
        return of(false);
      })
    );
  }
}
