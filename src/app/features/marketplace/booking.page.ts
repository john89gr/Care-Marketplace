import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import { reloadOnLanguageChange } from '../../core/i18n/content-locale';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import { PushService } from '../../core/services/push/push.service';
import { BookingStore, BookingRecord } from './booking.store';
import { ReviewsStore } from './reviews.store';
import { EscrowStore } from '../payments/escrow.store';
import {
  allowedActions,
  FREE_CANCEL_HOURS,
  rescheduleConfirmed,
  BookingAction,
  BookingEventKind,
  BookingStatus,
} from './booking.model';

/** One-time prompt key (§20 subtask 9: after the first completed booking). */
const PUSH_PROMPT_KEY = 'cm.push.prompted.v1';

/**
 * Booking request + lifecycle dashboard (FEATURE_PLAN.md §3). The action set
 * is role-aware (client vs provider) and follows the pure state machine in
 * `booking.model.ts`; cancelling previews the policy quote first, and every
 * booking shows its event timeline.
 *
 * Bilingual. Status and event-kind chips read from the server as machine
 * tokens (`in_progress`, `rescheduled`) and are translated per locale; the
 * English labels deliberately stay the raw tokens so the existing English
 * specs and the export keep their contract.
 */
@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [],
  template: `
    <section class="booking">
      <header class="page-header">
        <h1 class="page-title">{{ i18n.t('booking.title') }}</h1>
        <p class="page-subtitle">{{ i18n.t('booking.subtitle') }}</p>
      </header>

      <form class="card request" (submit)="submit($event)">
        <label class="field">
          <span class="field-label">{{ i18n.t('booking.dateTime') }}</span>
          <input
            type="datetime-local"
            [value]="isoValue()"
            (change)="onDate($any($event.target).value)"
          />
        </label>
        <label class="field">
          <span class="field-label">{{ i18n.t('booking.note') }}</span>
          <textarea
            rows="3"
            [value]="store.draft().note"
            (input)="store.updateDraft({ note: $any($event.target).value })"
          ></textarea>
        </label>
        <div class="card-actions">
          <button type="submit" class="btn" [disabled]="store.submitting() || !store.draft().scheduledAtMs">
            {{ store.submitting() ? i18n.t('common.sending') : i18n.t('booking.send') }}
          </button>
        </div>
        @if (store.lastError()) {
          <p class="error" role="alert">
            {{ i18n.message(store.lastErrorSource(), store.lastError()) }}
          </p>
        }
      </form>

      @if (showPushPrompt()) {
        <div class="push-prompt" role="status">
          <p>
            <strong>{{ i18n.t('booking.pushTitle') }}</strong>
            {{ i18n.t('booking.pushBody') }}
          </p>
          <p class="actions">
            <button type="button" class="btn" (click)="acceptPushPrompt()">
              {{ i18n.t('booking.enableNotifications') }}
            </button>
            <button type="button" class="btn secondary" (click)="dismissPushPrompt()">
              {{ i18n.t('booking.notNow') }}
            </button>
          </p>
        </div>
      }

      <h2 class="section-title">{{ i18n.t('booking.yourBookings') }}</h2>
      @if (store.conflict()) {
        <p class="error" role="alert">
          {{ i18n.message(store.conflictSource(), store.conflict()) }}
        </p>
      }
      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else if (visibleBookings().length === 0) {
        <p class="empty-state">{{ i18n.t('booking.empty') }}</p>
      } @else {
        <ul class="results">
          @for (booking of visibleBookings(); track booking.id) {
            <li class="card">
              <div class="row">
                <h3 id="booking-{{ booking.id }}-title" tabindex="-1">
                  {{ booking.caregiverName }}
                </h3>
                <span
                  class="badge"
                  [class.success]="booking.status === 'completed'"
                  [class.warning]="booking.status === 'disputed'"
                >
                  {{ statusLabel(booking.status) }}
                </span>
              </div>
              <p class="meta">
                {{ formatDate(booking.scheduledAtMs) }}@if (booking.note) {<span> · {{ booking.note }}</span>}
              </p>

              <p class="actions">
                @for (action of actionsFor(booking); track action) {
                  @switch (action) {
                    @case ('accept') {
                      <button
                        type="button"
                        class="btn"
                        [disabled]="store.actingId() === booking.id"
                        (click)="run(booking, 'accept')"
                      >
                        {{ i18n.t('booking.accept') }}
                      </button>
                    }
                    @case ('start') {
                      <button
                        type="button"
                        class="btn"
                        [disabled]="store.actingId() === booking.id"
                        (click)="run(booking, 'start')"
                      >
                        {{ i18n.t('booking.start') }}
                      </button>
                    }
                    @case ('complete') {
                      <button
                        type="button"
                        class="btn"
                        [disabled]="store.actingId() === booking.id"
                        (click)="run(booking, 'complete')"
                      >
                        {{ i18n.t('booking.complete') }}
                      </button>
                    }
                    @case ('cancel') {
                      <button
                        type="button"
                        class="btn secondary"
                        [disabled]="store.actingId() === booking.id"
                        (click)="cancelWithQuote(booking)"
                      >
                        {{ i18n.t('booking.cancel') }}
                      </button>
                    }
                    @case ('reschedule') {
                      <button
                        type="button"
                        class="btn secondary"
                        [disabled]="store.actingId() === booking.id"
                        (click)="rescheduleTomorrow(booking)"
                      >
                        {{ i18n.t('booking.reschedule') }}
                      </button>
                    }
                    @case ('dispute') {
                      <button
                        type="button"
                        class="btn secondary"
                        [disabled]="store.actingId() === booking.id"
                        (click)="run(booking, 'dispute')"
                      >
                        {{ i18n.t('booking.dispute') }}
                      </button>
                    }
                  }
                }
                @if (booking.status === 'completed' && !reviewed(booking.id)) {
                  <button type="button" class="btn" (click)="review(booking.id)">
                    {{ i18n.t('booking.rateVisit') }}
                  </button>
                }
              </p>

              @if (quote() && quote()?.id === booking.id) {
                <p class="meta policy" aria-live="polite">
                  @if (quote()!.free) {
                    {{ i18n.t('booking.freeCancel', { hours: FREE_CANCEL_HOURS }) }}
                  } @else {
                    {{
                      i18n.t('booking.lateCancel', {
                        fee: quote()!.feeCents / 100,
                        refund: quote()!.refundCents / 100
                      })
                    }}
                  }
                </p>
              }

              @if (booking.pendingReschedule && !proposalAgreed(booking)) {
                <p class="meta policy" aria-live="polite">
                  {{
                    i18n.t('booking.proposedAt', {
                      when: formatDate(booking.pendingReschedule.scheduledAtMs),
                      role:
                        booking.pendingReschedule.proposedBy === 'client'
                          ? i18n.t('booking.roleProvider')
                          : i18n.t('booking.roleClient')
                    })
                  }}
                  <button
                    type="button"
                    class="btn secondary sm"
                    [disabled]="store.actingId() === booking.id"
                    (click)="confirmProposal(booking)"
                  >
                    {{ i18n.t('booking.confirmNewTime') }}
                  </button>
                </p>
              } @else if (booking.pendingReschedule) {
                <p class="meta" aria-live="polite">
                  {{ i18n.t('booking.rescheduled', { when: formatDate(booking.pendingReschedule.scheduledAtMs) }) }}
                </p>
              }

              <details class="timeline">
                <summary>{{ i18n.t('booking.history') }}</summary>
                <ul class="list">
                  @for (event of store.eventsFor()(booking.id); track event.id) {
                    <li>
                      <span class="badge">{{ eventKindLabel(event.kind) }}</span>
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
    .section-title {
      margin: var(--space-5) 0 var(--space-3);
      font-size: var(--text-lg);
    }
    .request {
      max-width: 32rem;
      display: grid;
      gap: var(--space-3);
    }
    .push-prompt {
      border: 1px solid var(--accent-soft-strong);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      background: var(--accent-soft);
      margin: var(--space-4) 0;
    }
    .push-prompt p {
      margin: 0;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .actions {
      margin-top: var(--space-3);
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .policy {
      margin-top: var(--space-2);
      font-weight: var(--weight-semibold);
    }
    .timeline {
      margin-top: var(--space-2);
    }
    .timeline summary {
      cursor: pointer;
      font-weight: var(--weight-semibold);
    }
    .timeline ul {
      margin-top: var(--space-2);
    }
  `,
})
export class BookingPage implements OnInit, OnDestroy {
  readonly store = inject(BookingStore);
  protected readonly i18n = inject(I18n);
  private readonly reviews = inject(ReviewsStore);
  private readonly escrow = inject(EscrowStore);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly ws = inject(WebSocketClient);
  private readonly push = inject(PushService);
  private wsSub: Subscription | null = null;

  /** One-time push opt-in prompt after the first completed booking (§20 subtask 9). */
  protected readonly showPushPrompt = signal(false);

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

  readonly liveStatus = computed(() =>
    this.i18n.t('booking.liveStatus', {
      total: this.visibleBookings().length,
      completed: this.visibleBookings().filter((b) => b.status === 'completed').length,
    })
  );

  constructor() {
    // Booking notes and review comments are backend content, so a language
    // switch re-fetches them rather than leaving the old wording on screen.
    reloadOnLanguageChange(() => {
      this.store.load();
      this.reviews.loadAll();
    });
  }

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
        this.maybePromptPush();
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.wsSub = null;
  }

  statusLabel(status: BookingStatus): string {
    return this.i18n.t(`booking.status.${status}`);
  }

  eventKindLabel(kind: BookingEventKind): string {
    return this.i18n.t(`booking.event.${kind}`);
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
        this.maybePromptPush();
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

  /**
   * Push opt-in (§20 subtask 9): prompt once, only after the first completed
   * booking, and only while the browser permission is still undecided — never
   * on load. Accepting goes through PushService (permission → subscription).
   */
  private maybePromptPush(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }
    if (Notification.permission !== 'default') {
      return;
    }
    try {
      if (localStorage.getItem(PUSH_PROMPT_KEY)) {
        return;
      }
    } catch {
      // Storage unavailable — still allow the prompt this session.
    }
    this.showPushPrompt.set(true);
  }

  protected async acceptPushPrompt(): Promise<void> {
    this.showPushPrompt.set(false);
    try {
      localStorage.setItem(PUSH_PROMPT_KEY, '1');
    } catch {
      // Storage unavailable — prompt just won't re-arm next session.
    }
    await this.push.requestPush();
  }

  protected dismissPushPrompt(): void {
    this.showPushPrompt.set(false);
    try {
      localStorage.setItem(PUSH_PROMPT_KEY, '1');
    } catch {
      // Storage unavailable.
    }
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
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
