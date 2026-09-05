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
    <section class="admin-queue" aria-label="Admin dispute queue">
      <h2>Admin queue</h2>
      <p class="meta">
        {{ store.queue().length }} dispute(s) ·
        {{ store.slaBreaches().length }} past the 48h SLA
      </p>

      @if (store.loading()) {
        <p>Loading queue…</p>
      } @else if (store.queue().length === 0) {
        <p>No open disputes.</p>
      } @else {
        <ul class="queue">
          @for (d of store.queue(); track d.id) {
            <li class="card" [class.sla]="pastSla(d)">
              <div class="head">
                <h3>Dispute {{ d.id }}</h3>
                <span class="chip" [class.warn]="d.state === 'open'"
                  [class.info]="d.state === 'under_review'"
                  [class.ok]="d.state.startsWith('resolved')"
                  [class.bad]="d.state === 'rejected'">
                  {{ d.state }}
                </span>
                @if (pastSla(d)) {
                  <span class="chip warn" title="Open longer than 48 hours">SLA breach</span>
                }
              </div>
              <p class="meta">
                Booking {{ d.bookingId }} · {{ DISPUTE_REASON_LABELS[d.reason] }} ·
                opened by {{ d.openedByName }} · {{ formatDate(d.createdAtMs) }}
              </p>
              @if (d.description) {
                <p class="description">{{ d.description }}</p>
              }

              <div class="actions">
                @if (d.state === 'open') {
                  <button
                    type="button"
                    class="primary"
                    [disabled]="store.actingId() === d.id"
                    (click)="take(d)"
                  >
                    Take under review
                  </button>
                }
                @if (d.state === 'under_review') {
                  <button
                    type="button"
                    [disabled]="store.actingId() === d.id"
                    (click)="resolveRelease(d)"
                  >
                    Release to provider
                  </button>
                  <button
                    type="button"
                    [disabled]="store.actingId() === d.id"
                    (click)="togglePartial(d)"
                  >
                    {{ partialFor() === d.id ? 'Cancel partial refund' : 'Partial refund' }}
                  </button>
                  <button
                    type="button"
                    [disabled]="store.actingId() === d.id"
                    (click)="resolveFullRefund(d)"
                  >
                    Full refund
                  </button>
                  <button
                    type="button"
                    class="danger"
                    [disabled]="store.actingId() === d.id"
                    (click)="reject(d)"
                  >
                    Reject
                  </button>
                }
              </div>

              @if (partialFor() === d.id && d.state === 'under_review') {
                <form class="refund-form" (submit)="submitPartial($event, d)">
                  <label for="refund-cents">Refund amount (€)</label>
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
                  <button type="submit" [disabled]="store.actingId() === d.id">Confirm refund</button>
                  @if (partialError()) {
                    <p class="error" role="alert">{{ partialError() }}</p>
                  }
                </form>
                <p class="help" id="refund-help">
                  Cents-safe: the quote is validated before it is sent to the backend.
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `,
  styles: `
    .admin-queue { margin-top: 1rem; }
    .meta { color: var(--text-muted); font-size: 0.85rem; }
    .queue { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.75rem; }
    .card { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.75rem 1rem; }
    .card.sla { border-color: var(--warning, #f57f17); }
    .head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .head h3 { margin: 0; font-size: 1rem; }
    .chip { border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.8rem; background: var(--surface-2, #eef1f6); }
    .chip.ok { background: var(--success, #1d7a3d); color: #fff; }
    .chip.bad { background: var(--danger, #c62828); color: #fff; }
    .chip.warn { background: var(--warning, #f57f17); color: #fff; }
    .chip.info { background: var(--info, #0d6efd); color: #fff; }
    .description { margin: 0.4rem 0; border-left: 3px solid var(--border, #d9dee7); padding-left: 0.75rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
    button { min-height: 44px; padding: 0.4rem 1rem; cursor: pointer; }
    button.primary { background: var(--accent, #4f7cff); color: #fff; border-color: transparent; font-weight: 600; }
    button.danger { background: var(--danger, #c62828); color: #fff; border-color: transparent; }
    .refund-form { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; }
    .refund-form label { font-size: 0.85rem; }
    .refund-form input { min-height: 44px; width: 8rem; padding: 0 0.5rem; }
    .help { color: var(--text-muted); font-size: 0.8rem; margin: 0.25rem 0 0; }
    .error { color: var(--danger, #c62828); font-weight: 600; margin: 0.25rem 0 0; }
  `,
})
export class AdminQueueComponent implements OnInit {
  protected readonly store = inject(DisputesStore);
  protected readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  /** Id of the dispute with the partial-refund form open. */
  protected readonly partialFor = signal<string | null>(null);

  ngOnInit(): void {
    this.store.loadQueue();
  }
  protected readonly partialAmount = signal(0);
  protected readonly partialError = signal('');

  pastSla(d: Dispute): boolean {
    return isPastSla(d);
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
      this.partialError.set(
        refundCents <= 0
          ? 'Enter a refund amount greater than zero.'
          : quote.reason
      );
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