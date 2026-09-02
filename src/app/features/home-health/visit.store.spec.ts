import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError, Subject } from 'rxjs';
import { VisitStore, Visit } from './visit.store';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';
import { GeoPoint, GeolocationService } from '../../core/services/geo/geolocation.service';
import { EscrowStore, EscrowTransaction } from '../payments/escrow.store';
import { ApiClient } from '../../core/api/api.client';
import { ROLES } from '../../core/auth/roles';

const POINT: GeoPoint = { lat: 37.9838, lng: 23.7275, accuracyM: 10, atMs: 1000 };

function makeSession() {
  return {
    userId: 'u-nurse',
    displayName: 'Elena Papadaki',
    roles: [ROLES.NURSE],
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
}

function visit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: 'visit-1',
    shiftId: 's-1',
    bookingId: 'b-1',
    providerId: 'u-nurse',
    clientId: 'u-client',
    clientName: 'Maria Papadopoulou',
    providerName: 'Elena Papadaki',
    act: 'Injection',
    scheduledAtMs: 1000,
    status: 'scheduled',
    checkIn: null,
    checkOut: null,
    ...overrides,
  };
}

function makeStore(overrides: {
  api?: Partial<Record<'get' | 'post', unknown>>;
  geo?: Partial<GeolocationService>;
} = {}) {
  const session = new SessionStore();
  session.setSession(makeSession());

  const api = {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...(overrides.api ?? {}),
  } as unknown as ApiClient;

  const geo = {
    currentPosition: vi.fn(() => of(POINT)),
    watchPosition: vi.fn(() => of(POINT)),
    isSupported: () => true,
    ...(overrides.geo ?? {}),
  } as unknown as GeolocationService;

  const messages$ = new Subject<WsEnvelope>();
  const connected$ = new Subject<boolean>();
  const ws = {
    messages$,
    connected$,
    connect: vi.fn(),
    send: vi.fn(() => true),
    close: vi.fn(),
  } as unknown as WebSocketClient;

  const escrow = new EscrowStore(api);
  const store = new VisitStore(api, session, geo, ws, escrow);
  return { store, api, geo, ws, escrow, messages$ };
}

describe('VisitStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads visits', () => {
    const { store, api } = makeStore({ api: { get: vi.fn(() => of([visit()])) } });
    store.load();
    expect(store.visits()).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith('/visits/me');
  });

  it('check-in stamps the GPS position via the API', async () => {
    const { store, api } = makeStore({
      api: {
        get: vi.fn(() => of([visit()])),
        post: vi.fn(() => of(visit({ status: 'in-progress', checkIn: POINT }))),
      },
    });
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.checkIn('visit-1').subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/visits/visit-1/check-in', { position: POINT });
    expect(store.visits()[0].status).toBe('in-progress');
  });

  it('check-in fails gracefully when geolocation is unavailable', async () => {
    const { store } = makeStore({
      geo: { currentPosition: () => throwError(() => new Error('denied')) },
    });
    const ok = await new Promise<boolean>((resolve) => store.checkIn('visit-1').subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.error()).toContain('location access');
  });

  it('check-out releases the escrow hold for the booking', async () => {
    const escrowTx: EscrowTransaction = {
      id: 'e-1',
      bookingId: 'b-1',
      providerId: 'u-nurse',
      clientId: 'u-client',
      amountCents: 4500,
      status: 'held',
      createdAtMs: 1000,
      settledAtMs: null,
    };
    const { store, api, escrow } = makeStore({
      api: {
        get: vi.fn((path: string) => {
          if (path === '/visits/me') {
            return of([visit({ status: 'in-progress', checkIn: POINT })]);
          }
          if (path === '/payments/escrow') {
            return of([escrowTx]);
          }
          return of([]);
        }),
        post: vi.fn((path: string) => {
          if (path === '/visits/visit-1/check-out') {
            return of(visit({ status: 'completed', checkIn: POINT, checkOut: POINT }));
          }
          if (path === '/payments/escrow/e-1/release') {
            return of({ ...escrowTx, status: 'released', settledAtMs: 2000 });
          }
          return of(null);
        }),
      },
    });
    store.load();
    escrow.load();
    const ok = await new Promise<boolean>((resolve) => store.checkOut('visit-1').subscribe(resolve));
    expect(ok).toBe(true);
    expect(store.visits()[0].status).toBe('completed');
    expect(escrow.transactions().find((t) => t.id === 'e-1')?.status).toBe('released');
  });

  it('starts live tracking and broadcasts positions over the socket', () => {
    const { store, ws } = makeStore({ api: { get: vi.fn(() => of([visit()])) } });
    store.load();
    store.startTracking('visit-1');
    expect(ws.send).toHaveBeenCalledWith({
      type: 'visit.position',
      payload: { visitId: 'visit-1', position: POINT },
    });
    expect(store.positionOf('visit-1')).toEqual(POINT);
  });

  it('updates live positions from incoming visit.position envelopes', () => {
    const { store, messages$ } = makeStore();
    messages$.next({
      type: 'visit.position',
      payload: { visitId: 'visit-1', position: POINT },
    });
    expect(store.positionOf('visit-1')).toEqual(POINT);
  });

  it('updates visit status from incoming visit.status envelopes', () => {
    const { store, messages$ } = makeStore({ api: { get: vi.fn(() => of([visit()])) } });
    store.load();
    messages$.next({
      type: 'visit.status',
      payload: { visitId: 'visit-1', status: 'completed' },
    });
    expect(store.visits()[0].status).toBe('completed');
  });

  it('exposes the active visit for the current provider', () => {
    const { store } = makeStore({
      api: {
        get: vi.fn(() =>
          of([
            visit({ id: 'v1', status: 'in-progress', checkIn: POINT }),
            visit({ id: 'v2', status: 'scheduled' }),
          ])
        ),
      },
    });
    store.load();
    expect(store.activeVisit()?.id).toBe('v1');
  });
});
