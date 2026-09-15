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
import { I18n } from '../../core/i18n/i18n.service';

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
  selector: 'app-pharmacy',
  standalone: true,
  imports: [],
  template: `
    <section class="console">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('pharmacy.consoleTitle') }}</h1>
          <p class="page-subtitle">{{ i18n.t('pharmacy.consoleIntro') }}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn secondary" (click)="refresh()" [disabled]="store.loading()">
            {{ store.loading() ? i18n.t('common.loading') : i18n.t('pharmacy.refreshQueue') }}
          </button>
        </div>
      </header>

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.sorted().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">📦</span>
          <p>{{ i18n.t('pharmacy.queueEmpty') }}</p>
        </div>
      } @else {
        <ul class="list">
          @for (order of store.sorted(); track order.id) {
            <li class="card interactive">
              <div class="card-head">
                <h2 class="card-title">{{ i18n.t('pharmacy.orderTitle', { id: order.id }) }}</h2>
                <!-- The data-status attribute is the stable hook the E2E suite uses. -->
                <span
                  [class]="'badge ' + statusTone(order.status)"
                  [attr.data-status]="order.status"
                >
                  <span class="dot"></span>{{ statusLabel(order.status) }}
                </span>
              </div>

              <p class="meta">
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

              <div class="card-actions">
                @for (to of next(order); track to) {
                  <button
                    type="button"
                    class="btn sm"
                    [disabled]="store.actingId() === order.id"
                    (click)="advance(order, to)"
                  >
                    {{ statusLabel(to) }}
                  </button>
                }
                @if (next(order).length === 0) {
                  <span class="meta">{{ i18n.t('pharmacy.noActions') }}</span>
                }
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .meds {
      list-style: none;
      margin: var(--space-2) 0 0;
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
  `,
})
export class PharmacyPage {
  protected readonly i18n = inject(I18n);

  readonly store = inject(OrdersStore);

  /** Pipeline status in the active language. */
  statusLabel(status: PharmacyOrderStatus): string {
    return statusLabel(status, this.i18n.language());
  }

  constructor() {
    this.store.load().subscribe();
  }

  next(order: PharmacyOrder): PharmacyOrderStatus[] {
    return nextStatuses(order.status);
  }

  statusTone(status: PharmacyOrderStatus): string {
    return STATUS_TONES[status] ?? '';
  }

  refresh(): void {
    this.store.load().subscribe();
  }

  advance(order: PharmacyOrder, to: PharmacyOrderStatus): void {
    this.store.advance(order.id, to).subscribe();
  }
}
