import { Component, input, output } from '@angular/core';
import { Dispute, DISPUTE_REASON_LABELS, isPastSla } from './disputes.store';

/**
 * Dispute detail viewer (FEATURE_PLAN.md §17 subtasks 8, 11, 14): the full
 * timeline/evidence for one dispute, with the SLA flag and resolution info.
 * Pure view — actions happen in the admin queue component.
 */
@Component({
  selector: 'dispute-detail',
  standalone: true,
  template: `
    @if (dispute(); as d) {
      <section class="detail" aria-label="Dispute details">
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

        <dl class="facts">
          <dt>Booking</dt>
          <dd>{{ d.bookingId }}</dd>
          <dt>Reason</dt>
          <dd>{{ DISPUTE_REASON_LABELS[d.reason] }}</dd>
          <dt>Opened by</dt>
          <dd>{{ d.openedByName }} ({{ d.openedBy }})</dd>
          <dt>Parties</dt>
          <dd>{{ d.clientName }} vs {{ d.providerName }}</dd>
          <dt>Opened</dt>
          <dd>{{ formatDate(d.createdAtMs) }}</dd>
          @if (d.resolution) {
            <dt>Resolution</dt>
            <dd>
              {{ d.resolution }}
              @if (d.refundCents) { · {{ (d.refundCents / 100).toFixed(2) }}€ refunded }
            </dd>
          }
        </dl>

        @if (d.description) {
          <p class="description">{{ d.description }}</p>
        }

        @if (d.evidence.length > 0) {
          <h4>Evidence</h4>
          <ul class="evidence">
            @for (ev of d.evidence; track ev.id) {
              <li>
                <span class="meta">{{ formatDate(ev.createdAtMs) }} · {{ ev.authorName }}</span>
                <span class="kind">{{ ev.kind }}</span>
                @if (ev.body) {
                  <p>{{ ev.body }}</p>
                }
              </li>
            }
          </ul>
        }

        <div class="actions">
          <button type="button" class="secondary" (click)="close.emit()">Close</button>
        </div>
      </section>
    }
  `,
  styles: `
    .detail { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 1rem; margin-top: 1rem; }
    .head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .head h3 { margin: 0; }
    .chip { border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.8rem; background: var(--surface-2, #eef1f6); }
    .chip.ok { background: var(--success, #1d7a3d); color: #fff; }
    .chip.bad { background: var(--danger, #c62828); color: #fff; }
    .chip.warn { background: var(--warning, #f57f17); color: #fff; }
    .chip.info { background: var(--info, #0d6efd); color: #fff; }
    .facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0.75rem 0; }
    .facts dt { font-weight: 600; color: var(--text-muted); }
    .facts dd { margin: 0; }
    .description { border-left: 3px solid var(--border, #d9dee7); padding-left: 0.75rem; }
    .evidence { list-style: none; margin: 0.5rem 0; padding: 0; display: grid; gap: 0.4rem; }
    .evidence li { border: 1px solid var(--border, #d9dee7); border-radius: 0.4rem; padding: 0.5rem 0.75rem; }
    .evidence .kind { float: right; font-size: 0.75rem; color: var(--text-muted); }
    .evidence p { margin: 0.25rem 0 0; }
    .meta { color: var(--text-muted); font-size: 0.85rem; }
    .actions { margin-top: 0.75rem; }
    button { min-height: 44px; padding: 0.4rem 1rem; }
  `,
})
export class DisputeDetailComponent {
  readonly dispute = input<Dispute | null>(null);
  readonly close = output<void>();

  protected readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  pastSla(d: Dispute): boolean {
    return isPastSla(d);
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