/**
 * Pharmacy orders store (FEATURE_PLAN.md §9 subtasks 4, 9–11, 13–14).
 *
 *   GET  /me/pharmacy-orders              → PharmacyOrder[] (pharmacy role: all)
 *   POST /pharmacy-orders/:id/status      → { to } (transition-guarded, 409 on illegal)
 *   WS   { type: 'pharmacy.status', payload: { orderId, status, atMs } }
 *
 * Live pushes merge into the matching order when the transition is legal;
 * anything else is ignored (never trust the socket over the state machine).
 * Delivery address defaults come from the profile (subtask 14) via
 * `addressFromProfile`; per-order overrides ride on the scan request.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, forkJoin, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import type { PharmacyOrder, PharmacyOrderStatus } from './pharmacy.models';
import { medicationDraftsFor, statusLabel } from './pharmacy.models';
import { canTransition } from './order-machine';

export interface PharmacyStatusPush {
  orderId: string;
  status: PharmacyOrderStatus;
  atMs: number;
}

@Injectable({ providedIn: 'root' })
export class OrdersStore {
  // Optional collaborators follow the MedicationsStore convention: injected
  // by DI in the app, omitted or faked in unit tests.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly ws?: WebSocketClient,
    private readonly notifications?: NotificationsService
  ) {
    this.ws?.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
  }

  private readonly _orders = signal<PharmacyOrder[]>([]);
  private readonly _loading = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  /** Orders already staged into the medication list (see TODO in models). */
  private readonly _importedIds = signal<readonly string[]>([]);

  readonly orders = this._orders.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly importedIds = this._importedIds.asReadonly();

  /** Newest first. */
  readonly sorted = computed(() =>
    [...this._orders()].sort((a, b) => b.createdAtMs - a.createdAtMs)
  );

  readonly failedOrders = computed(() => this._orders().filter((o) => o.status === 'failed'));

  isImported(orderId: string): boolean {
    return this._importedIds().includes(orderId);
  }

  load(): Observable<boolean> {
    this._loading.set(true);
    return this.api.get<PharmacyOrder[]>('/me/pharmacy-orders').pipe(
      map((orders) => {
        this._orders.set(orders ?? []);
        this._loading.set(false);
        this._loaded.set(true);
        this.watchOpenOrders();
        return true;
      }),
      catchError(() => {
        this._loading.set(false);
        return of(false);
      })
    );
  }

  /** Insert or replace one order (scan results, WS pushes, pharmacy view). */
  upsert(order: PharmacyOrder): void {
    this._orders.update((orders) =>
      orders.some((o) => o.id === order.id)
        ? orders.map((o) => (o.id === order.id ? order : o))
        : [order, ...orders]
    );
  }

  /**
   * Advance an order (pharmacy fulfilment view). The transition is guarded
   * locally first so illegal taps fail fast without a round-trip.
   */
  advance(orderId: string, to: PharmacyOrderStatus): Observable<boolean> {
    const order = this._orders().find((o) => o.id === orderId);
    if (!order) {
      this._error.set('Order not found. Refresh the list and try again.');
      return of(false);
    }
    if (!canTransition(order.status, to)) {
      this._error.set(`Cannot move an order from ${statusLabel(order.status)} to ${statusLabel(to)}.`);
      return of(false);
    }
    this._actingId.set(orderId);
    this._error.set('');
    return this.api.post<PharmacyOrder>(`/pharmacy-orders/${encodeURIComponent(orderId)}/status`, { to }).pipe(
      map((updated) => {
        this.upsert(updated);
        this._actingId.set(null);
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not update the order. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Retry a failed order: re-route to the nearest in-stock pharmacy. */
  retry(orderId: string): Observable<boolean> {
    return this.advance(orderId, 'routed');
  }

  /** Ask the demo backend to stream status progression for open orders. */
  watch(orderId: string): void {
    this.ws?.send({ type: 'pharmacy.watch', payload: { orderId } });
  }

  /** Stage a delivered order into the medication list (subtask 10). */
  markImported(orderId: string): void {
    if (!this._importedIds().includes(orderId)) {
      this._importedIds.update((ids) => [...ids, orderId]);
    }
  }

  /**
   * Filled order → medication list (subtask 10): persists every line item of
   * a delivered order via POST /me/medications. The scan payload carries no
   * schedule, so drafts default to a daily 08:00 dose the user adjusts on the
   * medications page. Idempotent per order (importedIds guard).
   */
  importToMedications(order: PharmacyOrder): Observable<boolean> {
    if (order.status !== 'delivered') {
      this._error.set('Only delivered orders can be added to your medications.');
      return of(false);
    }
    if (this.isImported(order.id)) {
      return of(true);
    }
    const drafts = medicationDraftsFor(order, order.prescriber);
    if (drafts.length === 0) {
      this._error.set('This order has no medications to import.');
      return of(false);
    }
    this._actingId.set(order.id);
    this._error.set('');
    const creates = drafts.map((draft) =>
      this.api.post('/me/medications', {
        name: draft.name,
        dose: draft.dose || 'dose as directed',
        schedule: { kind: 'daily', timesMinutes: [8 * 60] },
        critical: false,
        prescriber: draft.prescriber || undefined,
      })
    );
    return forkJoin(creates).pipe(
      map(() => {
        this.markImported(order.id);
        this._actingId.set(null);
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not add these medications. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Live order-status pushes (subtask 11). */
  handleEnvelope(envelope: WsEnvelope): void {
    if (envelope.type !== 'pharmacy.status') {
      return;
    }
    const payload = envelope.payload as unknown as Partial<PharmacyStatusPush> | undefined;
    if (!payload || typeof payload['orderId'] !== 'string' || typeof payload['status'] !== 'string') {
      return;
    }
    this.applyPush({
      orderId: payload['orderId'] as string,
      status: payload['status'] as PharmacyOrderStatus,
      atMs: typeof payload['atMs'] === 'number' ? (payload['atMs'] as number) : Date.now(),
    });
  }

  private applyPush(push: PharmacyStatusPush): void {
    const order = this._orders().find((o) => o.id === push.orderId);
    if (!order || !canTransition(order.status, push.status)) {
      return;
    }
    const updated: PharmacyOrder = {
      ...order,
      status: push.status,
      timeline: [...order.timeline, { status: push.status, atMs: push.atMs }],
      updatedAtMs: push.atMs,
    };
    this.upsert(updated);
    this.notifications?.notify(
      'system',
      `Pharmacy order ${statusLabel(push.status).toLowerCase()}`,
      `Order ${order.id} is now ${statusLabel(push.status).toLowerCase()}${order.pharmacyName ? ` at ${order.pharmacyName}` : ''}.`,
      '/pharmacy-orders'
    );
  }

  private watchOpenOrders(): void {
    for (const order of this._orders()) {
      if (order.status !== 'delivered' && order.status !== 'failed') {
        this.watch(order.id);
      }
    }
  }
}
