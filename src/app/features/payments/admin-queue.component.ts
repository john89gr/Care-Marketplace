import { Component, inject, OnInit, signal } from '@angular/core';
import {
  DisputesStore,
  Dispute,
  DisputeResolution,
  DisputeResolutionInput,
  DISPUTE_REASON_LABELS,
  isPastSla,
  quotePartialRefund,
} from './disputes.store';
import { I18n } from '../../core/i18n/i18n.service';

/** Badge tone per dispute state (the label carries the meaning, not the colour). */
const STATE_TONES: Record<string, string> = {
  open: 'warning',
  under_review: 'info',
  resolved_client: 'success',
  resolved_provider: 'success',
  rejected: 'danger',
};

/**
 * Admin dispute queue (FEATURE_PLAN.md §17 subtasks 7, 9, 11, 19): the full
 * open queue with SLA flags and the resolution actions — take under review,
 * release to provider, partial refund (with cents-safe validation), full
 * refund, or reject. Every action drives the store's state machine, which
 * settles the frozen escrow and notifies both parties.
 */
@Component({
  selector: 'admin-queue',
  standalone: true,
  imports: [],
  template: `
    <section class="admin-queue section" [attr.aria-label]="i18n.t('admin.queueLabel')">
      <div class="section-header">
        <div>
          <h2 class="section-title">{{ i18n.t('admin.queueTitle') }}</h2>
          <p class="section-hint">
            {{
              i18n.t('admin.queueSummary', {
                open: store.queue().length,
                late: store.slaBreaches().length,
              })
            }}
          </p>
        </div>
      </div>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.queue().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">✅</span>
          <p>{{ i18n.t('admin.queueEmpty') }}</p>
        </div>
      } @else {
        <ul class="queue">
          @for (d of store.queue(); track d.id) {
            <li class="card" [class.sla]="pastSla(d)">
              <div class="card-head">
                <h3 class="card-title">{{ i18n.t('disputes.itemTitle', { id: d.id }) }}</h3>
                <span class="chips">
                  <span [class]="'badge ' + stateTone(d.state)">
                    <span class="dot"></span>{{ d.state }}
                  </span>
                  @if (pastSla(d)) {
                    <span class="badge danger" [attr.title]="i18n.t('disputes.slaBreachTitle')">
                      ⏱ {{ i18n.t('disputes.slaBreach') }}
                    </span>
                  }
                </span>
              </div>

              <p class="meta">
                {{ i18n.t('payments.bookingRef', { id: d.bookingId }) }} ·
                {{ DISPUTE_REASON_LABELS[d.reason] }} ·
                {{ i18n.t('disputes.openedBy', { name: d.openedByName }) }} ·
                {{ formatDate(d.createdAtMs) }}
              </p>

              @if (d.description) {
                <p class="description">{{ d.description }}</p>
              }

              <div class="card-actions">
                @if (d.state === 'open') {
                  <button
                    type="button"
                    class="btn"
                    [disabled]="store.actingId() === d.id"
                    (click)="take(d)"
                  >
                    {{ i18n.t('admin.take') }}
                  </button>
                }
                @if (d.state === 'under_review') {
                  <button
                    type="button"
                    class="btn"
                    [disabled]="store.actingId() === d.id"
                    (click)="resolveRelease(d)"
                  >
                    {{ i18n.t('admin.releaseToProvider') }}
                  </button>
                  <button
                    type="button"
                    class="btn secondary"
                    [disabled]="store.actingId() === d.id"
                    (click)="togglePartial(d)"
                  >
                    {{
                      partialFor() === d.id ? i18n.t('admin.cancelPartial') : i18n.t('admin.partialRefund')
                    }}
                  </button>
                  <button
                    type="button"
                    class="btn secondary"
                    [disabled]="store.actingId() === d.id"
                    (click)="resolveFullRefund(d)"
                  >
                    {{ i18n.t('admin.fullRefund') }}
                  </button>
                  <button
                    type="button"
                    class="btn danger"
                    [disabled]="store.actingId() === d.id"
                    (click)="reject(d)"
                  >
                    {{ i18n.t('admin.reject') }}
                  </button>
                }
              </div>

              @if (partialFor() === d.id && d.state === 'under_review') {
                <form class="refund-form" (submit)="submitPartial($event, d)">
                  <label class="field" for="refund-cents">
                    <span class="field-label">{{ i18n.t('admin.refundAmount') }}</span>
                    <input
                      id="refund-cents"
                      type="number"
                      min="0"
                      step="0.01"
                      inputmode="decimal"
                      aria-describedby="refund-help"
                      [value]="partialAmount() || ''"
                      (input)="onRefundInput($any($event.target).value)"
                      name="refundAmount"
                    />
                  </label>
                  <button type="submit" class="btn" [disabled]="store.actingId() === d.id">
                    {{ i18n.t('admin.confirmRefund') }}
                  </button>
                </form>
                <p class="section-hint" id="refund-help">{{ i18n.t('admin.refundHelp') }}</p>
              }

              @if (partialError()) {
                <p class="error" role="alert">{{ i18n.t(partialError()) }}</p>
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
    .admin-queue {
      margin-bottom: var(--space-6);
    }
    .queue {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
    }
    .card.sla {
      border-color: var(--warning);
      box-shadow: var(--shadow-md);
    }
    .chips {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .description {
      margin: var(--space-2) 0;
      border-left: 3px solid var(--accent);
      padding-left: var(--space-3);
      color: var(--text-muted);
    }
    .refund-form {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      flex-wrap: wrap;
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
      max-width: none;
    }
    .refund-form input {
      width: 9rem;
    }
  `,
})
export class AdminQueueComponent implements OnInit {
  protected readonly i18n = inject(I18n);

  protected readonly store = inject(DisputesStore);
  protected readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  /** Id of the dispute with the partial-refund form open. */
  protected readonly partialFor = signal<string | null>(null);

  ngOnInit(): void {
    this.store.loadQueue();
  }
  protected readonly partialAmount = signal(0);
  /** Dictionary key of the last validation failure (rendered per locale). */
  protected readonly partialError = signal('');

  pastSla(d: Dispute): boolean {
    return isPastSla(d);
  }

  stateTone(state: string): string {
    return STATE_TONES[state] ?? '';
  }

  take(d: Dispute): void {
    this.store.take(d.id).subscribe();
  }

  resolveRelease(d: Dispute): void {
    this.store.resolve(d.id, { state: 'resolved_provider', resolution: 'release' }).subscribe();
  }

  resolveFullRefund(d: Dispute): void {
    this.store
      .resolve(d.id, { state: 'resolved_client', resolution: 'full_refund' })
      .subscribe();
  }

  reject(d: Dispute): void {
    this.store.reject(d.id).subscribe();
  }

  togglePartial(d: Dispute): void {
    this.partialFor.update((current) => (current === d.id ? null : d.id));
    this.partialError.set('');
  }

  protected onRefundInput(value: string): void {
    this.partialAmount.set(Number(value));
  }

  submitPartial(event: Event, d: Dispute): void {
    event.preventDefault();
    const refundCents = Math.round(this.partialAmount() * 100);
    const quote = quotePartialRefund(refundCents, Number.MAX_SAFE_INTEGER);
    if (!quote.ok || refundCents <= 0) {
      this.partialError.set(quote.ok ? 'store.escrow.refundNotPositive' : quote.reasonKey);
      return;
    }
    this.partialError.set('');
    const input: DisputeResolutionInput = {
      state: 'resolved_client',
      resolution: 'partial_refund' as DisputeResolution,
      refundCents,
    };
    this.store.resolve(d.id, input).subscribe(() => {
      this.partialFor.set(null);
      this.partialAmount.set(0);
    });
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
