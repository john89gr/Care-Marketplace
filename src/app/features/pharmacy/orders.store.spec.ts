import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { OrdersStore } from './orders.store';
import type { PharmacyOrder } from './pharmacy.models';
import { ApiClient } from '../../core/api/api.client';
import { WebSocketClient } from '../../core/services/ws/websocket.client';

/**
 * Orders store tests (FEATURE_PLAN.md §9): transition-guarded advance, live
 * WS merge rules, retry, and the delivered → medications import hook.
 */

const ORDER: PharmacyOrder = {
  id: 'po-1',
  prescriptionId: 'rx-1',
  clientId: 'u-client',
  pharmacyId: 'ph-1',
  pharmacyName: 'Syntagma Central Pharmacy',
  meds: [{ name: 'Atorvastatin', dose: '20 mg', qty: 30 }],
  prescriber: 'Dr. Stavrou',
  status: 'routed',
  deliveryAddress: 'Mitropoleos 12, Athens',
  timeline: [
    { status: 'uploaded', atMs: 1000 },
    { status: 'routed', atMs: 2000, note: 'Routed to Syntagma Central Pharmacy (1.1 km)' },
  ],
  createdAtMs: 1000,
  updatedAtMs: 2000,
};

function makeApi() {
  return {
    get: vi.fn(() => of([ORDER])),
    post: vi.fn((url: string) => {
      if (url === '/me/medications') {
        return of({ id: 'med-new' });
      }
      const to = url.includes('/status') ? 'accepted' : 'routed';
      return of({ ...ORDER, status: to });
    }),
  } as unknown as ApiClient;
}

function makeWs() {
  return { messages$: new Subject<{ type: string; payload?: Record<string, unknown> }>(), send: vi.fn() } as unknown as WebSocketClient;
}

function makeNotifications() {
  return { notify: vi.fn() };
}

describe('OrdersStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0));
  });

  it('loads orders newest-first and watches open ones', () => {
    const ws = makeWs();
    const store = new OrdersStore(makeApi(), ws, makeNotifications());
    store.load().subscribe((ok) => expect(ok).toBe(true));
    expect(store.sorted().map((o) => o.id)).toEqual(['po-1']);
    expect(ws.send).toHaveBeenCalledWith({ type: 'pharmacy.watch', payload: { orderId: 'po-1' } });
  });

  it('advances on legal transitions and replaces the order', () => {
    const store = new OrdersStore(makeApi(), makeWs(), makeNotifications());
    store.load().subscribe();
    store.advance('po-1', 'accepted').subscribe((ok) => expect(ok).toBe(true));
    expect(store.orders().find((o) => o.id === 'po-1')?.status).toBe('accepted');
  });

  it('rejects illegal transitions locally without a request', () => {
    const api = makeApi();
    const store = new OrdersStore(api, makeWs(), makeNotifications());
    store.load().subscribe();
    store.advance('po-1', 'delivered').subscribe((ok) => expect(ok).toBe(false));
    expect(api.post).not.toHaveBeenCalled();
    expect(store.error()).toMatch(/Cannot move/);
  });

  it('merges legal WS pushes and notifies', () => {
    const notifications = makeNotifications();
    const store = new OrdersStore(makeApi(), makeWs(), notifications);
    store.load().subscribe();
    store.handleEnvelope({
      type: 'pharmacy.status',
      payload: { orderId: 'po-1', status: 'accepted', atMs: Date.now() },
    });
    const updated = store.orders().find((o) => o.id === 'po-1');
    expect(updated?.status).toBe('accepted');
    expect(updated?.timeline).toHaveLength(3);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('ignores illegal or unknown WS pushes', () => {
    const notifications = makeNotifications();
    const store = new OrdersStore(makeApi(), makeWs(), notifications);
    store.load().subscribe();
    // routed → delivered skips the pipeline.
    store.handleEnvelope({
      type: 'pharmacy.status',
      payload: { orderId: 'po-1', status: 'delivered', atMs: Date.now() },
    });
    // Unknown order.
    store.handleEnvelope({
      type: 'pharmacy.status',
      payload: { orderId: 'po-nope', status: 'accepted', atMs: Date.now() },
    });
    expect(store.orders().find((o) => o.id === 'po-1')?.status).toBe('routed');
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('imports a delivered order into medications exactly once', () => {
    const api = makeApi();
    const store = new OrdersStore(api, makeWs(), makeNotifications());
    store.upsert({ ...ORDER, status: 'delivered' });
    store.importToMedications({ ...ORDER, status: 'delivered' }).subscribe((ok) => expect(ok).toBe(true));
    expect(api.post).toHaveBeenCalledWith(
      '/me/medications',
      expect.objectContaining({ name: 'Atorvastatin', prescriber: 'Dr. Stavrou' })
    );
    expect(store.isImported('po-1')).toBe(true);
    // Second call is a no-op success without further requests.
    store.importToMedications({ ...ORDER, status: 'delivered' }).subscribe((ok) => expect(ok).toBe(true));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('refuses to import non-delivered orders', () => {
    const api = makeApi();
    const store = new OrdersStore(api, makeWs(), makeNotifications());
    store.upsert(ORDER);
    store.importToMedications(ORDER).subscribe((ok) => expect(ok).toBe(false));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('maps import failures to the error signal', () => {
    const api = makeApi();
    api.post = vi.fn(() => throwError(() => ({ error: { message: 'Nope.' } })));
    const store = new OrdersStore(api, makeWs(), makeNotifications());
    store.importToMedications({ ...ORDER, status: 'delivered' }).subscribe((ok) => expect(ok).toBe(false));
    expect(store.error()).toBe('Nope.');
    expect(store.isImported('po-1')).toBe(false);
  });
});
