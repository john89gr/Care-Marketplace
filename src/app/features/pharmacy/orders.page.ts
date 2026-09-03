/**
 * Pharmacy orders page (FEATURE_PLAN.md §9 subtasks 9–10, 13): live status
 * timeline per order, retry for failed routing, and adding a delivered order
 * to the medication list (subtask 10 — persisted via POST /me/medications,
 * default daily-morning schedule adjustable on the medications page).
 */
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrdersStore } from './orders.store';
import { statusLabel, type PharmacyOrder } from './pharmacy.models';

@Component({
  selector: 'app-pharmacy-orders',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="orders">
      <h1>Pharmacy orders</h1>

      <div class="toolbar">
        <button type="button" class="secondary" (click)="refresh()" [disabled]="store.loading()">
          {{ store.loading() ? 'Loading…' : 'Refresh' }}
        </button>
        <a routerLink="/prescriptions">Scan a prescription →</a>
      </div>

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
      <p class="meta" aria-live="polite">{{ feedback() }}</p>

      @if (!store.loading() && store.sorted().length === 0) {
        <p class="meta">
          No pharmacy orders yet. <a routerLink="/prescriptions">Scan your first prescription</a>
          and it will be routed to the nearest partner pharmacy with stock.
        </p>
      }

      <ul class="list">
        @for (order of store.sorted(); track order.id) {
          <li class="card" [class.failed]="order.status === 'failed'">
            <div class="head">
              <h2>Order {{ order.id }}</h2>
              <span class="chip" [attr.data-status]="order.status">{{ statusLabel(order.status) }}</span>
            </div>
            <p class="meta">
              @if (order.pharmacyName) {
                {{ order.pharmacyName }} ·
              }
              Deliver to: {{ order.deliveryAddress || '—' }}
            </p>
            <ul class="meds">
              @for (med of order.meds; track med.name) {
                <li>{{ med.name }} — {{ med.dose || 'dose as directed' }} × {{ med.qty }}</li>
              }
            </ul>

            <h3>Status timeline</h3>
            <ol class="timeline">
              @for (entry of order.timeline; track entry.atMs + entry.status) {
                <li [class.current]="$last">
                  <strong>{{ statusLabel(entry.status) }}</strong>
                  <span class="meta">{{ date(entry.atMs) }}</span>
                  @if (entry.note) {
                    <span class="meta"> — {{ entry.note }}</span>
                  }
                </li>
              }
            </ol>

            <div class="row-actions">
              @if (order.status === 'failed') {
                <button
                  type="button"
                  [disabled]="store.actingId() === order.id"
                  (click)="retry(order)"
                >
                  Retry routing
                </button>
              }
              @if (order.status === 'delivered' && !store.isImported(order.id)) {
                <button type="button" class="secondary" (click)="importMeds(order)">
                  Add to my medications
                </button>
              }
              @if (store.isImported(order.id)) {
                <span class="meta" role="status">✓ Added to your medications ({{ order.meds.length }} item{{ order.meds.length > 1 ? 's' : '' }}, refill in ~30 days).</span>
              }
            </div>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .orders { display: grid; gap: 0.75rem; max-width: 44rem; }
    .toolbar { display: flex; gap: 1rem; align-items: center; }
    button { min-height: 44px; padding: 0.5rem 1rem; cursor: pointer; }
    .secondary { background: none; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem; }
    .card { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.8rem 1rem; }
    .card.failed { border-color: var(--danger, #c62828); border-width: 2px; }
    .head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .head h2 { margin: 0; font-size: 1rem; }
    .chip { border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.8rem; background: var(--surface-2, #eef1f6); }
    .chip[data-status='delivered'] { background: var(--success, #1d7a3d); color: #fff; }
    .chip[data-status='failed'] { background: var(--danger, #c62828); color: #fff; }
    .meds { margin: 0.4rem 0; padding-left: 1.2rem; }
    .timeline { list-style: none; margin: 0.4rem 0; padding: 0 0 0 0.4rem; border-left: 2px solid var(--border, #d9dee7); display: grid; gap: 0.35rem; }
    .timeline li { padding-left: 0.6rem; }
    .timeline li.current { font-weight: 600; }
    .row-actions { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem; }
    .error { color: var(--danger, #c62828); }
    .meta { color: var(--text-muted); }
  `,
})
export class OrdersPage {
  readonly store = inject(OrdersStore);
  readonly feedback = signal('');

  protected readonly statusLabel = statusLabel;

  constructor() {
    this.store.load().subscribe();
  }

  refresh(): void {
    this.store.load().subscribe((ok) => {
      this.feedback.set(ok ? 'Orders refreshed.' : 'Could not refresh orders.');
    });
  }

  retry(order: PharmacyOrder): void {
    this.store.retry(order.id).subscribe((ok) => {
      this.feedback.set(
        ok ? `Order ${order.id} re-routed.` : `Could not retry order ${order.id}.`
      );
    });
  }

  /** Add a delivered order to the medication list (subtask 10). */
  importMeds(order: PharmacyOrder): void {
    this.store.importToMedications(order).subscribe((ok) => {
      this.feedback.set(
        ok
          ? `Order ${order.id}: ${order.meds.length} medication${order.meds.length > 1 ? 's' : ''} added — review the schedule on the medications page.`
          : `Could not add order ${order.id} to your medications.`
      );
    });
  }

  date(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
