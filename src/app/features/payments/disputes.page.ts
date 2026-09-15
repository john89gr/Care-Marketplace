import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DisputesStore, Dispute, DISPUTE_REASON_LABELS } from './disputes.store';
import { SessionStore } from '../../core/auth/session';
import { AdminQueueComponent } from './admin-queue.component';
import { DisputeDetailComponent } from './dispute-detail.component';
import { I18n } from '../../core/i18n/i18n.service';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimeDiff(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Badge tone per dispute state (the label carries the meaning, not the colour). */
const STATE_TONES: Record<string, string> = {
  open: 'warning',
  under_review: 'info',
  resolved_client: 'success',
  resolved_provider: 'success',
  rejected: 'danger',
};

@Component({
  selector: 'app-disputes',
  standalone: true,
  imports: [AdminQueueComponent, DisputeDetailComponent],
  template: `
    <section class="disputes">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('disputes.title') }}</h1>
        </div>
      </header>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      }

      @if (isAdmin()) {
        <admin-queue />
      }

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">{{ i18n.t('disputes.mine') }}</h2>
          @if (openCount() > 0) {
            <span class="badge warning">
              <span class="dot"></span>{{ openCount() }}
            </span>
          }
        </div>

        @if (store.disputes().length === 0) {
          <div class="empty-state">
            <span class="empty-icon" aria-hidden="true">⚖️</span>
            <p>{{ i18n.t('disputes.empty') }}</p>
            @if (isAdmin()) {
              <p class="meta">{{ i18n.t('disputes.adminHint') }}</p>
            }
          </div>
        } @else {
          <ul class="results">
            @for (dispute of store.disputes(); track dispute.id) {
              <li class="card interactive dispute-card" (click)="select(dispute)" tabindex="0">
                <div class="row">
                  <div>
                    <h3>{{ i18n.t('disputes.itemTitle', { id: dispute.id }) }}</h3>
                    <p class="meta">
                      {{ i18n.t('payments.bookingRef', { id: dispute.bookingId }) }} ·
                      {{ DISPUTE_REASON_LABELS[dispute.reason] }}
                    </p>
                  </div>
                  <span [class]="'badge ' + stateTone(dispute.state)">
                    <span class="dot"></span>{{ dispute.state }}
                  </span>
                </div>

                <p class="meta">
                  {{ formatDate(dispute.createdAtMs) }} ·
                  {{ i18n.t('disputes.openedBy', { name: dispute.openedByName }) }}
                </p>

                @if (dispute.resolution) {
                  <p class="meta resolved">
                    {{ i18n.t('disputes.resolved', { resolution: dispute.resolution }) }}
                    @if (dispute.refundCents) {
                      {{ i18n.t('disputes.refundToClient', { amount: (dispute.refundCents / 100).toFixed(2) }) }}
                    }
                  </p>
                }
              </li>
            }
          </ul>
        }
      </section>

      @if (selected()) {
        <dispute-detail [dispute]="selected()!" (close)="select(null)" />
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }
    </section>
  `,
  styles: `
    .section {
      margin-bottom: 0;
    }
    .section-title {
      text-transform: none;
    }
    .dispute-card {
      cursor: pointer;
    }
    .dispute-card .row {
      align-items: center;
    }
    .dispute-card h3 {
      margin: 0 0 0.15rem;
      font-size: var(--text-md);
    }
    .dispute-card .meta {
      margin: 0;
    }
    .resolved {
      color: var(--success);
    }
  `,
})
export class DisputesPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(DisputesStore);
  private readonly session = inject(SessionStore);
  readonly router = inject(Router);

  readonly isAdmin = computed(() => this.session.hasAnyRole(['admin']));
  readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  readonly selected = signal<Dispute | null>(null);

  readonly openCount = computed(() =>
    this.store.disputes().filter((d) => d.state === 'open' || d.state === 'under_review').length
  );

  ngOnInit(): void {
    this.store.loadMine();
    // The <admin-queue> component loads the full queue itself (owned data).
  }

  select(dispute: Dispute | null): void {
    this.selected.set(dispute);
  }

  stateTone(state: string): string {
    return STATE_TONES[state] ?? '';
  }

  /** Time a dispute has been open, for the SLA hint (admin queue owns the flag). */
  ageLabel(dispute: Dispute): string {
    return formatTimeDiff(Date.now() - dispute.createdAtMs);
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
