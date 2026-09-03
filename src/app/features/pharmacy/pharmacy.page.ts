/**
 * Pharmacy partner console stub (FEATURE_PLAN.md §9 subtask 12): read-only
 * order queue for the PHARMACY role with fulfilment actions guarded by the
 * order state machine. The PHARMACY role already exists in `core/auth/roles.ts`
 * (kept compatible — nothing added).
 */
import { Component, inject } from '@angular/core';
import { OrdersStore } from './orders.store';
import { nextStatuses } from './order-machine';
import { statusLabel, type PharmacyOrder, type PharmacyOrderStatus } from './pharmacy.models';

@Component({
  selector: 'app-pharmacy',
  standalone: true,
  imports: [],
  template: `
    <section class="console">
      <h1>Pharmacy console</h1>
      <p class="meta">
        Partner view (stub): incoming routed orders with fulfilment actions.
        Every action is guarded by the order state machine — illegal
        transitions are rejected before any request.
      </p>

      <button type="button" class="secondary" (click)="refresh()" [disabled]="store.loading()">
        {{ store.loading() ? 'Loading…' : 'Refresh queue' }}
      </button>
      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      @if (!store.loading() && store.sorted().length === 0) {
        <p class="meta">No orders in the queue.</p>
      }

      <ul class="list">
        @for (order of store.sorted(); track order.id) {
          <li class="card">
            <div class="head">
              <h2>Order {{ order.id }}</h2>
              <span class="chip" [attr.data-status]="order.status">{{ statusLabel(order.status) }}</span>
            </div>
            <p class="meta">Deliver to: {{ order.deliveryAddress || '—' }}</p>
            <ul class="meds">
              @for (med of order.meds; track med.name) {
                <li>{{ med.name }} — {{ med.dose || 'dose as directed' }} × {{ med.qty }}</li>
              }
            </ul>
            <div class="row-actions">
              @for (to of next(order); track to) {
                <button
                  type="button"
                  [disabled]="store.actingId() === order.id"
                  (click)="advance(order, to)"
                >
                  {{ statusLabel(to) }}
                </button>
              }
              @if (next(order).length === 0) {
                <span class="meta">No further actions.</span>
              }
            </div>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .console { display: grid; gap: 0.75rem; max-width: 44rem; justify-items: start; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem; width: 100%; }
    .card { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.8rem 1rem; }
    .head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .head h2 { margin: 0; font-size: 1rem; }
    .chip { border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.8rem; background: var(--surface-2, #eef1f6); }
    .meds { margin: 0.4rem 0; padding-left: 1.2rem; }
    .row-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
    button { min-height: 44px; padding: 0.5rem 1rem; cursor: pointer; }
    .secondary { background: none; }
    .error { color: var(--danger, #c62828); }
    .meta { color: var(--text-muted); }
  `,
})
export class PharmacyPage {
  readonly store = inject(OrdersStore);

  protected readonly statusLabel = statusLabel;

  constructor() {
    this.store.load().subscribe();
  }

  next(order: PharmacyOrder): PharmacyOrderStatus[] {
    return nextStatuses(order.status);
  }

  refresh(): void {
    this.store.load().subscribe();
  }

  advance(order: PharmacyOrder, to: PharmacyOrderStatus): void {
    this.store.advance(order.id, to).subscribe();
  }
}
