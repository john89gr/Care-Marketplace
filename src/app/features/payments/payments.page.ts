import { Component, inject, OnInit } from '@angular/core';
import { EscrowStore, EscrowTransaction } from './escrow.store';
import { I18n } from '../../core/i18n/i18n.service';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Badge tone per escrow status (the label carries the meaning, not the colour). */
const STATUS_TONES: Record<string, string> = {
  held: 'warning',
  frozen: 'danger',
  released: 'success',
  refunded: 'info',
  partial_refunded: 'info',
};

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [],
  template: `
    <section class="payments">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('payments.title') }}</h1>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">{{ i18n.t('payments.heldBalance') }}</span>
          <span class="stat-value">{{ (store.heldTotalCents() / 100).toFixed(2) }} €</span>
        </div>
      </div>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.transactions().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">💳</span>
          <p>{{ i18n.t('payments.empty') }}</p>
        </div>
      } @else {
        <ul class="results">
          @for (tx of store.transactions(); track tx.id) {
            <li class="card interactive tx-card">
              <div class="tx-row">
                <div class="tx-main">
                  <span class="tx-amount">{{ (tx.amountCents / 100).toFixed(2) }} €</span>
                  <p class="meta">
                    {{ i18n.t('payments.bookingRef', { id: tx.bookingId }) }} ·
                    {{ formatDate(tx.createdAtMs) }}
                  </p>
                </div>
                <span [class]="'badge ' + statusTone(tx.status)">
                  <span class="dot"></span>{{ tx.status }}
                </span>
              </div>

              @if (tx.status === 'held') {
                <div class="card-actions">
                  <button type="button" class="btn sm"
                    [disabled]="store.actingId() === tx.id"
                    (click)="release(tx)">{{ i18n.t('payments.release') }}</button>
                  <button type="button" class="btn secondary sm"
                    [disabled]="store.actingId() === tx.id"
                    (click)="refund(tx)">{{ i18n.t('payments.refund') }}</button>
                </div>
              }
            </li>
          }
        </ul>
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }
    </section>
  `,
  styles: `
    .tx-card {
      display: grid;
      gap: var(--space-1);
    }
    .tx-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
    }
    .tx-main {
      min-width: 0;
    }
    .tx-amount {
      display: block;
      font-size: var(--text-xl);
      font-weight: var(--weight-bold);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .tx-main .meta {
      margin: 0;
    }
    .card-actions {
      margin-top: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
  `,
})
export class PaymentsPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(EscrowStore);

  ngOnInit(): void {
    this.store.load();
  }

  release(tx: EscrowTransaction): void {
    this.store.release(tx.id).subscribe();
  }

  refund(tx: EscrowTransaction): void {
    this.store.refund(tx.id).subscribe();
  }

  statusTone(status: string): string {
    return STATUS_TONES[status] ?? '';
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
