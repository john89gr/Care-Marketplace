import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Subject } from 'rxjs';
import {
  NotificationsService,
  routeForKind,
  AppNotification,
  PANEL_PAGE_SIZE,
  PANEL_MAX_ITEMS,
} from './notifications.service';
import { ApiClient } from '../../api/api.client';
import { WebSocketClient, WsEnvelope } from '../ws/websocket.client';

function item(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'ntf-1',
    kind: 'system',
    title: 'Hello',
    body: 'World',
    createdAtMs: 1000,
    readAtMs: null,
    ...overrides,
  };
}

function makeDeps(apiOverrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  const messages = new Subject<WsEnvelope>();
  const api = {
    get: vi.fn(() => of({ items: [], unread: 0 })),
    post: vi.fn(() => of({ ok: true })),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...apiOverrides,
  } as unknown as ApiClient;
  const ws = { messages$: messages.asObservable() } as unknown as WebSocketClient;
  const router = { navigateByUrl: vi.fn() } as unknown as Router;
  return { api, ws, router, messages };
}

interface Router {
  navigateByUrl: ReturnType<typeof vi.fn>;
}

describe('routeForKind', () => {
  it('maps booking kinds to /bookings', () => {
    expect(routeForKind('booking.accepted')).toBe('/bookings');
    expect(routeForKind('booking.cancelled')).toBe('/bookings');
    expect(routeForKind('booking.disputed')).toBe('/bookings');
  });

  it('maps vitals alerts to /vitals and vetting to /onboarding', () => {
    expect(routeForKind('vitals.alert')).toBe('/vitals');
    expect(routeForKind('vetting.decision')).toBe('/onboarding');
  });

  it('falls back to /marketplace for system/unknown', () => {
    expect(routeForKind('system')).toBe('/marketplace');
  });
});

describe('NotificationsService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads from the backend and computes the unread count', () => {
    const deps = makeDeps({
      get: vi.fn(() =>
        of({ items: [item(), item({ id: 'ntf-2', readAtMs: 500 })], unread: 1 })
      ),
    });
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.load();
    expect(service.items()).toHaveLength(2);
    expect(service.unreadCount()).toBe(1);
    expect(service.loaded()).toBe(true);
    expect(deps.api.get).toHaveBeenCalledWith('/me/notifications');
  });

  it('marks one notification read (idempotent, single POST)', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.notify('booking.accepted', 'A', 'b');
    service.notify('booking.accepted', 'C', 'd');
    const first = service.items().find((n) => n.title === 'A')!;

    service.markRead(first.id);
    expect(service.unreadCount()).toBe(1);
    expect(deps.api.post).toHaveBeenCalledTimes(1);

    // Second call: no state change, no extra POST.
    service.markRead(first.id);
    expect(service.unreadCount()).toBe(1);
    expect(deps.api.post).toHaveBeenCalledTimes(1);
  });

  it('marks all read', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.notify('system', 'a', 'a');
    service.notify('system', 'b', 'b');
    service.notify('system', 'c', 'c');
    expect(service.unreadCount()).toBe(3);
    service.markAllRead();
    expect(service.unreadCount()).toBe(0);
  });

  it('activates: marks read and navigates to the link (or kind route)', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.notify('vitals.alert', 'Alert', 'body'); // no explicit link
    const n = service.items()[0];
    service.activate(n.id);
    expect(deps.router.navigateByUrl).toHaveBeenCalledWith('/vitals');
    expect(service.unreadCount()).toBe(0);
  });

  it('merges server items while preserving local read marks', () => {
    let serverItems = [item()];
    const deps = makeDeps({
      get: vi.fn(() => of({ items: serverItems, unread: serverItems.filter((n) => n.readAtMs === null).length })),
    });
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.load();
    expect(service.unreadCount()).toBe(1);

    // Mark read locally (optimistic + persisted).
    service.markRead('ntf-1');
    expect(service.unreadCount()).toBe(0);

    // Server still reports it unread (stale payload) — merge must keep it read.
    service.load();
    expect(service.items()[0].id).toBe('ntf-1');
    expect(service.items()[0].readAtMs).not.toBeNull();
    expect(service.unreadCount()).toBe(0);

    // When the server itself marks it read, the server timestamp wins.
    serverItems = [item({ readAtMs: 9999 })];
    service.load();
    expect(service.items()[0].readAtMs).toBe(9999);
  });

  it('markRead on an unknown id is a no-op', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.markRead('does-not-exist');
    expect(deps.api.post).not.toHaveBeenCalled();
  });

  it('muted kinds are hidden from the panel and unread count (kept in store)', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.toggleMute('vitals.alert');
    service.notify('vitals.alert', 'muted', 'body');
    service.notify('system', 'kept', 'body');
    // Stored (so unmuting restores history) but hidden everywhere in the UI.
    expect(service.items()).toHaveLength(2);
    expect(service.panelItems().map((n) => n.title)).toEqual(['kept']);
    expect(service.unreadCount()).toBe(1);
    expect(service.isMuted('vitals.alert')).toBe(true);
    // Unmuting restores the item.
    service.toggleMute('vitals.alert');
    expect(service.panelItems()).toHaveLength(2);
    expect(service.unreadCount()).toBe(2);
  });

  it('mutes persist across instances via localStorage', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.toggleMute('system');
    const service2 = new NotificationsService(deps.api, deps.ws, deps.router);
    expect(service2.isMuted('system')).toBe(true);
  });

  it('handles the notification.push WS envelope and toasts it', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    deps.messages.next({
      type: 'notification.push',
      payload: item({ id: 'ntf-live', title: 'Live', createdAtMs: Date.now() }),
    });
    expect(service.items().map((n) => n.id)).toContain('ntf-live');
    expect(service.toasts().length).toBe(1);
  });

  it('ignores malformed WS envelopes', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    deps.messages.next({ type: 'notification.push', payload: undefined });
    deps.messages.next({ type: 'chat.message', payload: {} });
    expect(service.items()).toHaveLength(0);
  });

  it('caps the in-memory list and pages the panel', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    for (let i = 0; i < 25; i++) {
      service.notify('system', `n${i}`, 'b');
    }
    expect(service.items().length).toBe(25);
    expect(service.panelItems().length).toBe(PANEL_PAGE_SIZE);
    expect(service.hasMore()).toBe(true);
    service.panelLimit.set(50);
    expect(service.panelItems().length).toBe(25);
    expect(service.hasMore()).toBe(false);
  });

  it('dedupes identical toasts', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    service.toast('same text');
    service.toast('same text');
    expect(service.toasts()).toHaveLength(1);
  });

  it('load errors do not wipe existing items', () => {
    const failing = makeDeps({ get: vi.fn(() => throwError(() => new Error('down'))) });
    const service = new NotificationsService(failing.api, failing.ws, failing.router);
    service.notify('system', 'local', 'item');
    service.load();
    expect(service.items()).toHaveLength(1);
    expect(service.loaded()).toBe(false);
  });

  it('load errors surface an error message and clear on retry', () => {
    const failing = makeDeps({ get: vi.fn(() => throwError(() => new Error('down'))) });
    const service = new NotificationsService(failing.api, failing.ws, failing.router);
    service.load();
    expect(service.error()).toMatch(/could not load/i);
    expect(service.loaded()).toBe(false);
  });

  it('caps the panel DOM at PANEL_MAX_ITEMS (50)', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    expect(PANEL_MAX_ITEMS).toBe(50);
    for (let i = 0; i < 70; i++) {
      service.notify('system', `n${i}`, 'b');
    }
    service.panelLimit.set(1000);
    expect(service.panelItems().length).toBe(PANEL_MAX_ITEMS);
    expect(service.hasMore()).toBe(true);
  });

  it('accepts an opaque payload without affecting the unread count', () => {
    const deps = makeDeps();
    const service = new NotificationsService(deps.api, deps.ws, deps.router);
    deps.messages.next({
      type: 'notification.push',
      payload: item({ id: 'ntf-p', payload: { bookingId: 'b-1' } }) as unknown as Record<string, unknown>,
    });
    expect(service.items().map((n) => n.id)).toContain('ntf-p');
    expect(service.unreadCount()).toBe(1);
  });
});
