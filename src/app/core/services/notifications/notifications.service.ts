import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiClient } from '../../api/api.client';
import { WebSocketClient, WsEnvelope } from '../ws/websocket.client';
import { Router } from '@angular/router';

/**
 * Notification center (FEATURE_PLAN.md §4), built on the §3 seam. Backend is
 * the source of truth; local merge keeps read-state consistent:
 *
 *   GET  /me/notifications            -> { items, unread }
 *   POST /me/notifications/:id/read   -> { ok }
 *   POST /me/notifications/read-all   -> { ok }
 *   WS   { type: 'notification.push', payload: AppNotification }
 */

export type NotificationKind =
  | 'booking.accepted'
  | 'booking.started'
  | 'booking.completed'
  | 'booking.cancelled'
  | 'booking.rescheduled'
  | 'booking.disputed'
  | 'dispute.opened'
  | 'dispute.resolved'
  | 'dispute.rejected'
  | 'review.submitted'
  | 'vitals.alert'
  | 'vetting.decision'
  | 'screening.due'
  | 'medication.missed'
  | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Route to navigate to when activated (kind→route map used as fallback). */
  link?: string;
  /** Opaque backend payload (ids, amounts, …); UI renders title/body. */
  payload?: Record<string, unknown>;
  createdAtMs: number;
  readAtMs: number | null;
}

export interface AppToast {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
}

/** Cap on the in-memory list (subtask 19): the panel shows a window of it. */
const MAX_ITEMS = 200;
/** Default panel window; "load more" grows it up to PANEL_MAX_ITEMS. */
export const PANEL_PAGE_SIZE = 15;
/** Hard cap on panel DOM rows (subtask 19: never render more than 50). */
export const PANEL_MAX_ITEMS = 50;

const READ_KEY = 'cm.notifications.read.v1';
const MUTE_KEY = 'cm.notifications.mutes.v1';

let seq = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Kind → default click-through route (subtask 8). */
export function routeForKind(kind: NotificationKind): string {
  switch (kind) {
    case 'booking.accepted':
    case 'booking.started':
    case 'booking.completed':
    case 'booking.cancelled':
    case 'booking.rescheduled':
    case 'booking.disputed':
    case 'dispute.opened':
      return '/bookings';
    case 'dispute.resolved':
    case 'dispute.rejected':
      return '/disputes';
    case 'review.submitted':
      return '/marketplace';
    case 'vitals.alert':
      return '/vitals';
    case 'screening.due':
      return '/screenings';
    case 'medication.missed':
      return '/medications';
    case 'vetting.decision':
      return '/onboarding';
    case 'system':
    default:
      return '/marketplace';
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  // Default-parameter injection keeps direct instantiation possible in unit
  // tests while remaining DI-friendly in the app (codebase convention).
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly ws: WebSocketClient = inject(WebSocketClient),
    private readonly router: Router = inject(Router)
  ) {
    this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
    if (typeof window !== 'undefined') {
      // Badge resync when the tab regains focus (subtask 11). The
      // visibilitychange listener covers the poll fallback when the WS is
      // disconnected (no socket → next focus/visibility still reloads).
      window.addEventListener('focus', () => this.load());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.load();
        }
      });
    }
  }

  private readonly _items = signal<AppNotification[]>([]);
  private readonly _toasts = signal<AppToast[]>([]);
  private readonly _loading = signal(false);
  /** Last load error message (empty = no error; drives the panel error state). */
  private readonly _error = signal('');
  /** Kinds the user muted (no panel entry, no toast, no push). */
  private readonly _mutes = signal<Set<NotificationKind>>(this.loadMutes());
  /** Set once the first backend load completed (empty-state handling). */
  private readonly _loaded = signal(false);

  readonly items = this._items.asReadonly();
  readonly toasts = this._toasts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly mutes = this._mutes.asReadonly();

  readonly unreadCount = computed(
    () => this._items().filter((n) => n.readAtMs === null && !this._mutes().has(n.kind)).length
  );

  /** Newest-first window of unmuted items for the panel; "load more" raises the limit (capped at PANEL_MAX_ITEMS). */
  readonly panelLimit = signal(PANEL_PAGE_SIZE);
  readonly panelItems = computed(() =>
    this._items()
      .filter((n) => !this._mutes().has(n.kind))
      .slice(0, Math.min(this.panelLimit(), PANEL_MAX_ITEMS))
  );
  readonly hasMore = computed(
    () =>
      this._items().filter((n) => !this._mutes().has(n.kind)).length >
      Math.min(this.panelLimit(), PANEL_MAX_ITEMS)
  );

  /** Backend load + merge with locally tracked read state. */
  load(): void {
    if (this._loading()) {
      return;
    }
    this._loading.set(true);
    this._error.set('');
    this.api
      .get<{ items: AppNotification[]; unread: number }>('/me/notifications')
      .subscribe({
        next: ({ items }) => {
          this.merge(items);
          this._loading.set(false);
          this._loaded.set(true);
        },
        error: () => {
          this._loading.set(false);
          this._error.set('Could not load notifications. Please try again.');
        },
      });
  }

  /** Merge server items, preserving local read flags (server timestamps win on conflict). */
  private merge(items: AppNotification[]): void {
    const read = this.readLocal();
    const existing = new Map(this._items().map((n) => [n.id, n]));
    for (const item of items) {
      const current = existing.get(item.id);
      const wasReadLocally = read.has(item.id) || current?.readAtMs !== undefined && current?.readAtMs !== null;
      const merged: AppNotification = {
        ...item,
        // Server-provided readAtMs wins; otherwise honour a local read mark.
        readAtMs:
          item.readAtMs !== null
            ? item.readAtMs
            : wasReadLocally
              ? (current?.readAtMs ?? Date.now())
              : null,
      };
      existing.set(item.id, merged);
    }
    const list = [...existing.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, MAX_ITEMS);
    this._items.set(list);
  }

  /** Live push over the shared WebSocket bus. */
  handleEnvelope(envelope: WsEnvelope): void {
    if (envelope.type !== 'notification.push') {
      return;
    }
    const payload = envelope.payload as unknown as AppNotification;
    if (!payload || typeof payload.id !== 'string') {
      return;
    }
    this.ingest(payload, true);
  }

  /** Insert or update one notification (used by push and by notify()). */
  private ingest(item: AppNotification, announce: boolean): void {
    this._items.update((list) => {
      const exists = list.some((n) => n.id === item.id);
      const next = exists ? list.map((n) => (n.id === item.id ? item : n)) : [item, ...list];
      return next.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, MAX_ITEMS);
    });
    if (announce && !this._mutes().has(item.kind)) {
      this.toast(`${item.title} — ${item.body}`, 'info');
    }
  }

  /** In-app emit (feature-3 seam; kept for local-only events). */
  notify(kind: NotificationKind, title: string, body: string, link?: string): void {
    this.ingest(
      { id: nextId('ntf'), kind, title, body, link, createdAtMs: Date.now(), readAtMs: null },
      false
    );
  }

  toast(text: string, tone: AppToast['tone'] = 'info'): void {
    if (this._toasts().some((t) => t.text === text)) {
      return;
    }
    const toast: AppToast = { id: nextId('tst'), text, tone };
    this._toasts.update((list) => [...list.slice(-4), toast]);
    setTimeout(() => {
      this._toasts.update((list) => list.filter((t) => t.id !== toast.id));
    }, 5000);
  }

  markRead(id: string): void {
    const item = this._items().find((n) => n.id === id);
    if (!item || item.readAtMs !== null) {
      return; // idempotent
    }
    const at = Date.now();
    this._items.update((list) =>
      list.map((n) => (n.id === id ? { ...n, readAtMs: at } : n))
    );
    this.rememberRead(id);
    this.api.post(`/me/notifications/${encodeURIComponent(id)}/read`, {}).subscribe({
      error: () => {
        // Keep the optimistic read state; the next load() reconciles.
      },
    });
  }

  markAllRead(): void {
    const at = Date.now();
    this._items.update((list) =>
      list.map((n) => (n.readAtMs === null ? { ...n, readAtMs: at } : n))
    );
    for (const n of this._items()) {
      this.rememberRead(n.id);
    }
    this.api.post('/me/notifications/read-all', {}).subscribe({});
  }

  /** Activate a notification: mark read + navigate to its target. */
  activate(id: string): void {
    const item = this._items().find((n) => n.id === id);
    if (!item) {
      return;
    }
    this.markRead(id);
    const link = item.link ?? routeForKind(item.kind);
    void this.router.navigateByUrl(link);
  }

  isMuted(kind: NotificationKind): boolean {
    return this._mutes().has(kind);
  }

  toggleMute(kind: NotificationKind): void {
    this._mutes.update((set) => {
      const next = new Set(set);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
    this.persistMutes();
  }

  clear(): void {
    this._items.set([]);
    this._loaded.set(false);
  }

  /**
   * Browser push opt-in (subtask 12). Permission-only stub: the PWA service
   * worker (feature 20) will deliver the actual notifications.
   */
  async enablePush(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.requestPermission();
  }

  async pushEnabled(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    return Notification.permission === 'granted';
  }

  // ---- read-state + mute persistence (private) ----

  private readLocal(): Set<string> {
    try {
      const raw = localStorage.getItem(READ_KEY);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private rememberRead(id: string): void {
    try {
      const read = this.readLocal();
      read.add(id);
      localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-500)));
    } catch {
      // Storage unavailable — read state stays in memory only.
    }
  }

  private loadMutes(): Set<NotificationKind> {
    try {
      const raw = localStorage.getItem(MUTE_KEY);
      return new Set(raw ? (JSON.parse(raw) as NotificationKind[]) : []);
    } catch {
      return new Set();
    }
  }

  private persistMutes(): void {
    try {
      localStorage.setItem(MUTE_KEY, JSON.stringify([...this._mutes()]));
    } catch {
      // Storage unavailable — mutes stay in memory only.
    }
  }
}
