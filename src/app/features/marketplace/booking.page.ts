import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import { BookingStore, BookingRecord } from './booking.store';
import { ReviewsStore } from './reviews.store';
import { EscrowStore } from '../payments/escrow.store';
import {
  allowedActions,
  FREE_CANCEL_HOURS,
  rescheduleConfirmed,
  BookingAction,
} from './booking.model';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Booking request + lifecycle dashboard (FEATURE_PLAN.md §3). The action set
 * is role-aware (client vs provider) and follows the pure state machine in
 * `booking.model.ts`; cancelling previews the policy quote first, and every
 * booking shows its event timeline.
 */
@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [],
  template: `
    <section class="booking">
      <h1>Booking request</h1>
      <form (submit)="submit($event)">
        <label>Date & time
          <input
            type="datetime-local"
            [value]="isoValue()"
            (change)="onDate($any($event.target).value)"
          />
        </label>
        <label>Note
          <textarea rows="3" [value]="store.draft().note"
            (input)="store.updateDraft({ note: $any($event.target).value })"></textarea>
        </label>
        <button type="submit" [disabled]="store.submitting() || !store.draft().scheduledAtMs">
          {{ store.submitting() ? 'Sending…' : 'Send request' }}
        </button>
        @if (store.lastError()) {
          <p class="error" role="alert">{{ store.lastError() }}</p>
        }
      </form>

      <h2>Your bookings</h2>
      @if (store.conflict()) {
        <p class="error" role="alert">{{ store.conflict() }}</p>
      }
      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (visibleBookings().length === 0) {
        <p>No bookings yet. Request one from the marketplace.</p>
      } @else {
        <ul class="results">
          @for (booking of visibleBookings(); track booking.id) {
            <li class="card">
              <div class="row">
                <h3 id="booking-{{ booking.id }}-title" tabindex="-1">{{ booking.caregiverName }}</h3>
                <span class="chip" [class.ok]="booking.status === 'completed'"
                  [class.warn]="booking.status === 'disputed'">
                  {{ booking.status }}
                </span>
              </div>
              <p class="meta">
                {{ formatDate(booking.scheduledAtMs) }}@if (booking.note) {<span> · {{ booking.note }}</span>}
              </p>

              <p class="actions">
                @for (action of actionsFor(booking); track action) {
                  @if (action === 'accept') {
                    <button type="button" [disabled]="store.actingId() === booking.id"
                      (click)="run(booking, 'accept')">
                      Accept
                    </button>
                  } @else if (action === 'start') {
                    <button type="button" [disabled]="store.actingId() === booking.id"
                      (click)="run(booking, 'start')">
                      Start visit
                    </button>
                  } @else if (action === 'complete') {
                    <button type="button" [disabled]="store.actingId() === booking.id"
                      (click)="run(booking, 'complete')">
                      Complete (releases escrow)
                    </button>
                  } @else if (action === 'cancel') {
                    <button type="button" class="secondary" [disabled]="store.actingId() === booking.id"
                      (click)="cancelWithQuote(booking)">
                      Cancel
                    </button>
                  } @else if (action === 'reschedule') {
                    <button type="button" class="secondary" [disabled]="store.actingId() === booking.id"
                      (click)="rescheduleTomorrow(booking)">
                      Propose new time
                    </button>
                  } @else if (action === 'dispute') {
                    <button type="button" class="secondary" [disabled]="store.actingId() === booking.id"
                      (click)="run(booking, 'dispute')">
                      Open dispute
                    </button>
                  }
                }
                @if (booking.status === 'completed' && !reviewed(booking.id)) {
                  <button type="button" (click)="review(booking.id)">Rate this visit</button>
                }
              </p>

              @if (quote() && quote()?.id === booking.id) {
                <p class="meta policy" aria-live="polite">
                  @if (quote()!.free) {
                    Free cancellation ({{ FREE_CANCEL_HOURS }}h+ before start) — full refund.
                  } @else {
                    Late cancellation — fee {{ quote()!.feeCents / 100 }}€, refund {{ quote()!.refundCents / 100 }}€.
                  }
                </p>
              }

              @if (booking.pendingReschedule && !proposalAgreed(booking)) {
                <p class="meta policy" aria-live="polite">
                  New time proposed: {{ formatDate(booking.pendingReschedule.scheduledAtMs) }} —
                  awaiting {{ booking.pendingReschedule.proposedBy === 'client' ? 'provider' : 'client' }} confirmation.
                  <button type="button" class="secondary" [disabled]="store.actingId() === booking.id"
                    (click)="confirmProposal(booking)">
                    Confirm new time
                  </button>
                </p>
              } @else if (booking.pendingReschedule) {
                <p class="meta" aria-live="polite">
                  Rescheduled to {{ formatDate(booking.pendingReschedule.scheduledAtMs) }} — agreed by both parties.
                </p>
              }

              <details class="timeline">
                <summary>History</summary>
                <ul>
                  @for (event of store.eventsFor()(booking.id); track event.id) {
                    <li>
                      <span class="chip">{{ event.kind }}</span>
                      {{ event.detail }} · {{ event.byName }} · {{ formatDate(event.atMs) }}
                    </li>
                  }
                </ul>
              </details>
            </li>
          }
        </ul>
      }

      <div aria-live="polite" role="status" class="visually-hidden">
        {{ liveStatus() }}
      </div>
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success, #1d7a3d); color: #fff; }
    .chip.warn { background: var(--warning, #b45309); color: #fff; }
    .actions { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .policy { margin-top: 0.5rem; font-weight: 600; }
    .timeline { margin-top: 0.5rem; }
    .timeline ul { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.35rem; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class BookingPage implements OnInit, OnDestroy {
  readonly store = inject(BookingStore);
  private readonly reviews = inject(ReviewsStore);
  private readonly escrow = inject(EscrowStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly ws = inject(WebSocketClient);
  private wsSub: Subscription | null = null;

  readonly FREE_CANCEL_HOURS = FREE_CANCEL_HOURS;
  /** Booking id whose cancellation quote is displayed (null = none). */
  readonly quote = signal<{ id: string; free: boolean; feeCents: number; refundCents: number } | null>(null);

  /** Client + provider bookings merged (role-aware page). */
  readonly visibleBookings = computed(() => {
    const mine = this.store.myBookings();
    const provider = this.store.isProvider() ? this.store.providerBookings() : [];
    const all = [...mine, ...provider];
    const seen = new Set<string>();
    return all.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));
  });

  private readonly reviewedBookingIds = computed(() => {
    return new Set(
      this.reviews
        .reviews()
        .filter((r) => r.status !== 'removed')
        .map((r) => r.bookingId)
    );
  });

  readonly liveStatus = computed(() => {
    const list = this.visibleBookings();
    const completed = list.filter((b) => b.status === 'completed').length;
    return `${list.length} bookings shown, ${completed} completed.`;
  });

  ngOnInit(): void {
    this.store.load();
    this.reviews.loadAll();
    // Escrow ledger is needed for policy quotes + release/refund settlement.
    this.escrow.load();
    // Load timelines for the visible bookings.
    queueMicrotask(() => {
      this.visibleBookings().forEach((b) => this.store.loadEvents(b.id));
    });
    // Live completion (FEATURE_PLAN.md §1 subtask 17): when a visit completes
    // over the socket, refresh the list so the "Rate this visit" CTA appears
    // without a manual reload.
    this.wsSub = this.ws.messages$.subscribe((envelope) => {
      if (envelope.type === 'visit.status' && envelope.payload?.['status'] === 'completed') {
        this.store.load();
        this.reviews.loadAll();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.wsSub = null;
  }

  actionsFor(booking: BookingRecord): BookingAction[] {
    const myId = this.session.session()?.userId ?? '';
    const role =
      this.store.isProvider() && booking.providerUserId === myId
        ? ('provider' as const)
        : ('client' as const);
    return allowedActions(booking.status, role);
  }

  cancelWithQuote(booking: BookingRecord): void {
    const q = this.store.quoteFor(booking.id);
    if (!q) {
      this.store.cancel(booking.id);
      this.focusBooking(booking.id);
      return;
    }
    if (!this.quote() || this.quote()!.id !== booking.id) {
      // First click: show the policy preview; second click executes.
      this.quote.set({ id: booking.id, free: q.free, feeCents: q.feeCents, refundCents: q.refundCents });
      return;
    }
    this.quote.set(null);
    this.store.cancel(booking.id);
    this.focusBooking(booking.id);
  }

  /** Demo helper: proposes tomorrow same time (reschedule MVP). */
  rescheduleTomorrow(booking: BookingRecord): void {
    const next = booking.scheduledAtMs + 24 * 60 * 60 * 1000;
    this.store.reschedule(booking.id, { scheduledAtMs: next });
    this.focusBooking(booking.id);
  }

  /** Run a lifecycle action, then move focus to the booking heading (a11y). */
  run(booking: BookingRecord, action: BookingAction): void {
    switch (action) {
      case 'accept':
        this.store.accept(booking.id);
        break;
      case 'start':
        this.store.start(booking.id);
        break;
      case 'complete':
        this.store.complete(booking.id);
        break;
      case 'dispute':
        this.store.dispute(booking.id);
        break;
      case 'cancel':
        this.cancelWithQuote(booking);
        return;
      case 'reschedule':
        this.rescheduleTomorrow(booking);
        return;
    }
    this.focusBooking(booking.id);
  }

  /** Confirm the other party's reschedule proposal (dual-confirmation). */
  confirmProposal(booking: BookingRecord): void {
    this.store.confirmReschedule(booking.id);
    this.focusBooking(booking.id);
  }

  proposalAgreed(booking: BookingRecord): boolean {
    return rescheduleConfirmed(booking.pendingReschedule);
  }

  /**
   * Focus management (subtask 19): after an action, land focus on the booking
   * heading so keyboard/screen-reader users keep context; the `role=status`
   * live region announces the outcome.
   */
  private focusBooking(bookingId: string): void {
    if (typeof document === 'undefined') {
      return;
    }
    queueMicrotask(() => {
      document.getElementById(`booking-${bookingId}-title`)?.focus();
    });
  }

  reviewed(bookingId: string): boolean {
    return this.reviewedBookingIds().has(bookingId);
  }

  review(bookingId: string): void {
    void this.router.navigate(['/review'], { queryParams: { booking: bookingId } });
  }

  isoValue(): string {
    const ms = this.store.draft().scheduledAtMs;
    return ms === null ? '' : new Date(ms).toISOString().slice(0, 16);
  }

  onDate(value: string): void {
    const ms = value ? new Date(value).getTime() : null;
    this.store.updateDraft({ scheduledAtMs: Number.isNaN(ms) ? null : ms });
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.store.submit();
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
