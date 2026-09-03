import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DisputesStore, Dispute, DisputeDraft, DisputeResolutionInput, DISPUTE_REASON_LABELS, DISPUTE_REASONS, DISPUTE_SLA_MS, quotePartialRefund } from './disputes.store';
import { EscrowStore } from './escrow.store';
import { SessionStore } from '../../core/auth/session';
import { BookingStore } from '../../core/marketplace/booking.store';

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

@Component({
  selector: 'app-disputes',
  standalone: true,
  imports: [FormsFormsModule],
  template: `
    <section class="disputes">
      <h1>Dispute resolution</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      @if (isAdmin()) {
        <admin-queue />
      }

      <h2>My disputes</h2>
      @if (store.disputes().length === 0) {
        <p>No disputes yet.</p>
        @if (isAdmin()) {
          <p>The admin queue above shows all open disputes.</p>
        }
      } @else {
        <ul class="results">
          @for (dispute of store.disputes(); track dispute.id) {
            <li class="card" (click)="select(dispute)" tabindex="0">
              <div class="row">
                <h3>Dispute {{ dispute.id }}</h3>
                <span class="chip" [class.warn]="dispute.state === 'open'"
                  [class.info]="dispute.state === 'under_review'"
                  [class.ok]="dispute.state.startsWith('resolved')"
                  [class.bad]="dispute.state === 'rejected'">
                  {{ dispute.state }}
                </span>
              </div>
              <p class="meta">Booking {{ dispute.bookingId }} · {{ DISPUTE_REASON_LABELS[dispute.reason] }}</p>
              <p class="meta">{{ formatDate(dispute.createdAtMs) }} · opened by {{ dispute.openedByName }}</p>
              @if (dispute.resolution) {
                <p class="meta">
                  Resolved: {{ dispute.resolution }}
                  @if (dispute.refundCents) { · −{{ (dispute.refundCents / 100).toFixed(2) }}€ to client }
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (selected()) {
        <dispute-detail [dispute]="selected()!" (close)="select(null)" />
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success); color: #fff; }
    .chip.bad { background: var(--danger); color: #fff; }
    .chip.warn { background: var(--warning); color: #fff; }
    .chip.info { background: var(--info, #0d6efd); color: #fff; }
    .results li.card { cursor: pointer; }
    .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
    .policy { margin-top: 0.5rem; font-weight: 600; }
  `,
})
export class DisputesPage implements OnInit {
  readonly store = inject(DisputesStore);
  private readonly escrow = inject(EscrowStore);
  private readonly session = inject(SessionStore);
  readonly router = inject(Router);

  readonly isAdmin = computed(() => this.session.hasAnyRole(['admin']));
  readonly DISPUTE_REASON_LABELS = DISPUTE_REASON_LABELS;

  readonly selectedDispute = signal<Dispute | null>(null);

  readonly openCount = computed(() =>
    this.store.disputes().filter((d) => d.state === 'open' || d.state === 'under_review').length
  );

  ngOnInit(): void {
    this.store.loadMine();
    if (this.isAdmin()) {
      this.store.loadQueue();
    }
  }

  select(dispute: Dispute | null): void {
    this.selectedDispute.set(dispute);
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
