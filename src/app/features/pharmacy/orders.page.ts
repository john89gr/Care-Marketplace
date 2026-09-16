/**
 * Pharmacy orders page (FEATURE_PLAN.md §9 subtasks 9–10, 13): live status
 * timeline per order, retry for failed routing, and adding a delivered order
 * to the medication list (subtask 10 — persisted via POST /me/medications,
 * default daily-morning schedule adjustable on the medications page).
 */
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrdersStore } from './orders.store';
import {
  statusLabel as statusLabelFor,
  type PharmacyOrder,
  type PharmacyOrderStatus,
} from './pharmacy.models';
import { I18n, TranslatableMessage } from '../../core/i18n/i18n.service';
import { reloadOnLanguageChange } from '../../core/i18n/content-locale';

/** Badge tone per fulfilment status (the label carries the meaning, not the colour). */
const STATUS_TONES: Record<PharmacyOrderStatus, string> = {
  uploaded: 'info',
  routed: 'info',
  accepted: 'accent',
  preparing: 'accent',
  out_for_delivery: 'warning',
  delivered: 'success',
  failed: 'danger',
};

@Component({
  selector: 'app-pharmacy-orders',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="orders">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('pharmacy.ordersTitle') }}</h1>
        </div>
        <div class="page-actions">
          <a class="btn secondary" routerLink="/prescriptions">
            {{ i18n.t('pharmacy.scanLink') }} →
          </a>
          <button type="button" class="btn secondary" (click)="refresh()" [disabled]="store.loading()">
            {{ store.loading() ? i18n.t('common.loading') : i18n.t('pharmacy.refresh') }}
          </button>
        </div>
      </header>

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }
      <p class="meta feedback" aria-live="polite">{{ i18n.message(feedback()) }}</p>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.sorted().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">📦</span>
          <p>
            {{ i18n.t('pharmacy.ordersEmpty') }}
            <a routerLink="/prescriptions">{{ i18n.t('pharmacy.ordersEmptyLink') }}</a>
            {{ i18n.t('pharmacy.ordersEmptyHint') }}
          </p>
        </div>
      } @else {
        <ul class="list">
          @for (order of store.sorted(); track order.id) {
            <li class="card" [class.failed]="order.status === 'failed'">
              <div class="card-head">
                <h2 class="card-title">{{ i18n.t('pharmacy.orderTitle', { id: order.id }) }}</h2>
                <span [class]="'badge ' + statusTone(order.status)">
                  <span class="dot"></span>{{ statusLabel(order.status) }}
                </span>
              </div>

              <p class="meta">
                @if (order.pharmacyName) {
                  {{ order.pharmacyName }} ·
                }
                {{ i18n.t('pharmacy.deliverTo', { address: order.deliveryAddress || '—' }) }}
              </p>

              <ul class="meds">
                @for (med of order.meds; track med.name) {
                  <li>
                    <span class="med-name">{{ med.name }}</span>
                    <span class="med-dose">
                      {{ med.dose || i18n.t('pharmacy.doseAsDirected') }} × {{ med.qty }}
                    </span>
                  </li>
                }
              </ul>

              <h3 class="timeline-heading">{{ i18n.t('pharmacy.timeline') }}</h3>
              <ol class="order-timeline">
                @for (entry of order.timeline; track entry.atMs + entry.status) {
                  <li [class.current]="$last">
                    <span class="step-dot" aria-hidden="true"></span>
                    <strong>{{ statusLabel(entry.status) }}</strong>
                    <span class="meta">{{ date(entry.atMs) }}</span>
                    @if (entry.note) {
                      <span class="meta"> — {{ entry.note }}</span>
                    }
                  </li>
                }
              </ol>

              <div class="card-actions">
                @if (order.status === 'failed') {
                  <button
                    type="button"
                    class="btn"
                    [disabled]="store.actingId() === order.id"
                    (click)="retry(order)"
                  >
                    {{ i18n.t('pharmacy.retryRouting') }}
                  </button>
                }
                @if (order.status === 'delivered' && !store.isImported(order.id)) {
                  <button type="button" class="btn secondary" (click)="importMeds(order)">
                    {{ i18n.t('pharmacy.addToMeds') }}
                  </button>
                }
                @if (store.isImported(order.id)) {
                  <span class="badge success" role="status">
                    <span class="dot"></span>{{ i18n.t('pharmacy.addedToMeds', { count: order.meds.length }) }}
                  </span>
                }
                @if (order.status === 'delivered' && !store.isHistoryImported(order.id)) {
                  <button type="button" class="btn secondary" (click)="importHistory(order)">
                    {{ i18n.t('pharmacy.addToHistory') }}
                  </button>
                }
                @if (store.isHistoryImported(order.id)) {
                  <span class="badge accent" role="status">
                    <span class="dot"></span>{{ i18n.t('pharmacy.inHistory', { count: order.meds.length }) }}
                  </span>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .feedback:empty {
      display: none;
    }
    .card.failed {
      border-color: color-mix(in srgb, var(--danger) 55%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--danger) 30%, transparent);
    }
    .meds {
      list-style: none;
      margin: var(--space-2) 0;
      padding: 0;
      display: grid;
      gap: var(--space-1);
    }
    .meds li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      font-size: var(--text-sm);
    }
    .med-name {
      font-weight: var(--weight-semibold);
    }
    .med-dose {
      color: var(--text-muted);
      white-space: nowrap;
    }
    .timeline-heading {
      margin: var(--space-4) 0 var(--space-2);
      font-size: var(--text-sm);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-subtle);
    }
    .order-timeline {
      list-style: none;
      margin: 0;
      padding: 0 0 0 var(--space-4);
      display: grid;
      gap: var(--space-2);
      position: relative;
    }
    .order-timeline::before {
      content: '';
      position: absolute;
      inset: 0.4rem auto 0.4rem 0.24rem;
      width: 2px;
      background: var(--border-strong);
      border-radius: var(--radius-full);
    }
    .order-timeline li {
      position: relative;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }
    .order-timeline li .step-dot {
      position: absolute;
      left: calc(-1 * var(--space-4) + 0.03rem);
      top: 0.45rem;
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full);
      background: var(--border-strong);
    }
    .order-timeline li.current,
    .order-timeline li.current strong {
      color: var(--text);
      font-weight: var(--weight-semibold);
    }
    .order-timeline li.current .step-dot {
      background: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }
  `,
})
export class OrdersPage {
  protected readonly i18n = inject(I18n);

  readonly store = inject(OrdersStore);
  /** Bilingual status line: an app key, resolved in the template. */
  readonly feedback = signal<TranslatableMessage | null>(null);

  /** Pipeline status in the active language. */
  statusLabel(status: PharmacyOrderStatus): string {
    return statusLabelFor(status, this.i18n.language());
  }

  statusTone(status: PharmacyOrderStatus): string {
    return STATUS_TONES[status] ?? '';
  }

  constructor() {
    this.store.load().subscribe();
    // Partner pharmacy names are backend content, so a language switch
    // re-fetches the queue rather than leaving the old names behind.
    reloadOnLanguageChange(() => this.store.load().subscribe());
  }

  refresh(): void {
    this.store.load().subscribe((ok) => {
      this.feedback.set({
        key: ok ? 'pharmacy.feedback.refreshed' : 'pharmacy.feedback.refreshFailed',
      });
    });
  }

  retry(order: PharmacyOrder): void {
    this.store.retry(order.id).subscribe((ok) => {
      this.feedback.set({
        key: ok ? 'pharmacy.feedback.rerouted' : 'pharmacy.feedback.retryFailed',
        params: { id: order.id },
      });
    });
  }

  /** Add a delivered order to the medication list (subtask 10). */
  importMeds(order: PharmacyOrder): void {
    this.store.importToMedications(order).subscribe((ok) => {
      this.feedback.set({
        key: ok ? 'pharmacy.feedback.medsAdded' : 'pharmacy.feedback.medsAddFailed',
        params: { id: order.id, count: order.meds.length },
      });
    });
  }

  /** Add a delivered order to the prescriptions register (§21 subtask 12). */
  importHistory(order: PharmacyOrder): void {
    this.store.importToHistory(order).subscribe((ok) => {
      this.feedback.set({
        key: ok ? 'pharmacy.feedback.historyAdded' : 'pharmacy.feedback.historyAddFailed',
        params: { id: order.id, count: order.meds.length },
      });
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
