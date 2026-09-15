import { Component, inject, input, output } from '@angular/core';
import { Dispute, DISPUTE_REASON_LABELS, isPastSla } from './disputes.store';
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
 * Dispute detail viewer (FEATURE_PLAN.md §17 subtasks 8, 11, 14): the full
 * timeline/evidence for one dispute, with the SLA flag and resolution info.
 * Pure view — actions happen in the admin queue component.
 */
@Component({
  selector: 'dispute-detail',
  standalone: true,
  template: `
    @if (dispute(); as d) {
      <section class="card detail" [attr.aria-label]="i18n.t('disputes.detailLabel')">
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

        <dl class="facts">
          <dt>{{ i18n.t('disputes.field.booking') }}</dt>
          <dd>{{ d.bookingId }}</dd>
          <dt>{{ i18n.t('disputes.field.reason') }}</dt>
          <dd>{{ DISPUTE_REASON_LABELS[d.reason] }}</dd>
          <dt>{{ i18n.t('disputes.field.openedBy') }}</dt>
          <dd>{{ d.openedByName }} ({{ d.openedBy }})</dd>
          <dt>{{ i18n.t('disputes.field.parties') }}</dt>
          <dd>{{ d.clientName }} vs {{ d.providerName }}</dd>
          <dt>{{ i18n.t('disputes.field.opened') }}</dt>
          <dd>{{ formatDate(d.createdAtMs) }}</dd>
          @if (d.resolution) {
            <dt>{{ i18n.t('disputes.field.resolution') }}</dt>
            <dd>
              {{ d.resolution }}
              @if (d.refundCents) {
                {{ i18n.t('disputes.refunded', { amount: (d.refundCents / 100).toFixed(2) }) }}
              }
            </dd>
          }
        </dl>

        @if (d.description) {
          <p class="description">{{ d.description }}</p>
        }

        @if (d.evidence.length > 0) {
          <h4 class="evidence-title">{{ i18n.t('disputes.evidence') }}</h4>
          <ul class="evidence">
            @for (ev of d.evidence; track ev.id) {
              <li class="list-item">
                <span class="kind">{{ ev.kind }}</span>
                <span class="meta">{{ formatDate(ev.createdAtMs) }} · {{ ev.authorName }}</span>
                @if (ev.body) {
                  <p>{{ ev.body }}</p>
                }
              </li>
            }
          </ul>
        }

        <div class="card-actions">
          <button type="button" class="btn secondary" (click)="close.emit()">
            {{ i18n.t('common.close') }}
          </button>
        </div>
      </section>
    }
  `,
  styles: `
    .detail {
      margin-top: var(--space-4);
      box-shadow: var(--shadow-md);
      animation: page-enter var(--dur) var(--ease) both;
    }
    .chips {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-2) var(--space-5);
      margin: var(--space-3) 0;
      font-size: var(--text-sm);
    }
    .facts dt {
      font-weight: var(--weight-semibold);
      color: var(--text-muted);
    }
    .facts dd {
      margin: 0;
    }
    .description {
      border-left: 3px solid var(--accent);
      padding-left: var(--space-3);
      color: var(--text-muted);
    }
    .evidence-title {
      margin: var(--space-4) 0 var(--space-2);
    }
    .evidence {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-2);
    }
    .evidence .kind {
      float: right;
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-subtle);
    }
    .evidence p {
      margin: var(--space-1) 0 0;
    }
    .card-actions {
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    @media (max-width: 34rem) {
      .facts {
        grid-template-columns: 1fr;
        gap: var(--space-1);
      }
      .facts dd {
        margin-bottom: var(--space-2);
      }
    }
  `,
})
export class DisputeDetailComponent {
  protected readonly i18n = inject(I18n);

  readonly dispute = input<Dispute | null>(null);
  readonly close = output<void>();

  protected readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  pastSla(d: Dispute): boolean {
    return isPastSla(d);
  }

  stateTone(state: string): string {
    return STATE_TONES[state] ?? '';
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
