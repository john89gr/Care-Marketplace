import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { EscrowStore, EscrowTransaction } from '../payments/escrow.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES } from '../../core/auth/roles';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import { LocalizedMessage } from '../../core/i18n/localized-message';
import { activeLocaleTag } from '../../core/i18n/i18n.service';
import {
  BookingStatus,
  BookingEvent,
  RescheduleProposal,
  canTransition,
  canAcceptBooking,
  isInvolvedParty,
  quoteCancellation,
  CancellationQuote,
} from './booking.model';

/**
 * Booking lifecycle state (PLAN.md §5 Phase 1/2 + FEATURE_PLAN.md §3). A
 * booking starts as `requested`; the provider accepts, the visit runs
 * (check-in moves it to `in_progress`), and completion releases the escrow.
 * Cancelling refunds the escrow (fee per the cancellation policy) and every
 * transition appends to an event timeline.
 *
 * Illegal transitions are rejected locally via the pure state machine in
 * `booking.model.ts`; the backend enforces the same rules and answers 409 on
 * races, which surfaces here as a friendly conflict error + reload.
 */
export type { BookingStatus };

export interface BookingRequest {
  caregiverId: string;
  clientId: string;
  scheduledAtMs: number;
  note: string;
}

export interface BookingDraft {
  caregiverId: string;
  scheduledAtMs: number | null;
  note: string;
}

export interface BookingRecord {
  id: string;
  caregiverId: string;
  caregiverName: string;
  clientId: string;
  clientName: string;
  providerUserId: string;
  scheduledAtMs: number;
  note: string;
  status: BookingStatus;
  createdAtMs: number;
  /** Pending reschedule proposal awaiting dual confirmation (null = none). */
  pendingReschedule?: RescheduleProposal | null;
}

export interface BookingCreated {
  id: string;
  caregiverId: string;
  clientId: string;
  amountCents: number;
}

export interface RescheduleRequest {
  scheduledAtMs: number;
  note?: string;
}

const EMPTY_DRAFT: BookingDraft = {
  caregiverId: '',
  scheduledAtMs: null,
  note: '',
};

@Injectable({ providedIn: 'root' })
export class BookingStore {
  // Default-parameter injection keeps `new BookingStore(api, escrow, session,
  // notifications)` possible in unit tests while remaining DI-friendly.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly escrow: EscrowStore = inject(EscrowStore),
    private readonly session: SessionStore = inject(SessionStore),
    private readonly notifications: NotificationsService = inject(NotificationsService)
 ) {}
  private readonly _draft = signal<BookingDraft>(EMPTY_DRAFT);
  private readonly _bookings = signal<BookingRecord[]>([]);
  private readonly _events = signal<Record<string, BookingEvent[]>>({});
  private readonly _loading = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _submitting = signal(false);
  private readonly _lastError = new LocalizedMessage();
  private readonly _conflict = new LocalizedMessage();

  readonly draft = this._draft.asReadonly();
  readonly bookings = this._bookings.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly submitting = this._submitting.asReadonly();
  /** Translatable sources (null when the message came from the server). */
  readonly lastErrorSource = this._lastError.source;
  readonly conflictSource = this._conflict.source;
  readonly lastError = this._lastError.value;
  /** Non-empty when a 409 was received; the page offers a reload. */
  readonly conflict = this._conflict.value;
  readonly isDraftReady = signal(false);

  /** Events of a booking, newest first. */
  readonly eventsFor = computed(() => {
    const map = this._events();
    return (bookingId: string): BookingEvent[] =>
      (map[bookingId] ?? []).slice().sort((a, b) => b.atMs - a.atMs);
  });

  /** Bookings where the current user is the client. */
  readonly myBookings = computed(() => {
    const me = this.session.session();
    if (!me) {
      return [];
    }
    return this._bookings()
      .filter((b) => b.clientId === me.userId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  });

  /** Bookings where the current user is the provider (role-aware page). */
  readonly providerBookings = computed(() => {
    const me = this.session.session();
    if (!me) {
      return [];
    }
    return this._bookings()
      .filter((b) => b.providerUserId === me.userId)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  });

  readonly isProvider = computed(() =>
    this.session.hasAnyRole([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])
  );

  load(): void {
    this._loading.set(true);
    this._lastError.clear();
    this.api.get<BookingRecord[]>('/bookings').subscribe({
      next: (bookings) => {
        this._bookings.set(bookings);
        this._loading.set(false);
        // Note: `conflict` deliberately survives load — the banner stays
        // visible until the next successful transition or a page reload.
      },
      error: () => {
        this._lastError.set({ key: 'booking.error.loadFailed' });
        this._loading.set(false);
      },
    });
  }

  loadEvents(bookingId: string): void {
    this.api
      .get<BookingEvent[]>(
        `/bookings/${encodeURIComponent(bookingId)}/events`
      )
      .subscribe({
        next: (events) =>
          this._events.update((map) => ({ ...map, [bookingId]: events })),
        error: () => {
          // Timeline is non-critical; leave whatever we have.
        },
      });
  }

  startDraft(caregiverId: string): void {
    this._draft.set({ ...EMPTY_DRAFT, caregiverId });
  }

  updateDraft(patch: Partial<BookingDraft>): void {
    this._draft.update((current) => ({ ...current, ...patch }));
  }

  clearDraft(): void {
    this._draft.set(EMPTY_DRAFT);
    this._lastError.clear();
  }

  /** Completed bookings the client has not reviewed yet (review targets). */
  completedBookingIds(): string[] {
    return this.myBookings()
      .filter((b) => b.status === 'completed')
      .map((b) => b.id);
  }

  /** All booking ids of the current client (existence check). */
  allBookingIds(): string[] {
    return this.myBookings().map((b) => b.id);
  }

  /** Find the escrow transaction held for a booking. */
  private heldFor(bookingId: string): EscrowTransaction | null {
    return (
      this.escrow.transactions().find(
        (t) => t.bookingId === bookingId && t.status === 'held'
      ) ?? null
    );
  }

  async submit(): Promise<boolean> {
    const draft = this._draft();
    if (!draft.caregiverId || draft.scheduledAtMs === null) {
      this._lastError.set({ key: 'booking.error.dateRequired' });
      return false;
    }
    this._submitting.set(true);
    this._lastError.clear();
    try {
      const payload: BookingRequest = {
        caregiverId: draft.caregiverId,
        clientId: '', // filled server-side from the session
        scheduledAtMs: draft.scheduledAtMs,
        note: draft.note,
      };
      const booking = await new Promise<BookingCreated>((resolve, reject) => {
        this.api.post<BookingCreated>('/bookings', payload).subscribe({ next: resolve, error: reject });
      });
      // Phase 2: hold the funds in escrow until the visit completes.
      this.escrow.hold({
        bookingId: booking.id,
        providerId: booking.caregiverId,
        amountCents: booking.amountCents,
      }).subscribe();
      this.load();
      this.clearDraft();
      return true;
    } catch (error) {
      this._lastError.set({ key: 'booking.error.sendFailed' });
      return false;
    } finally {
      this._submitting.set(false);
    }
  }

  /** Provider accepts a requested booking (role-guarded: providers only). */
  accept(bookingId: string): void {
    const me = this.session.session();
    if (!me || !canAcceptBooking(me.roles)) {
      this._lastError.set({ key: 'booking.error.onlyProviderAccepts' });
      return;
    }
    this.transition(bookingId, 'accepted', '/accept', {});
  }

  /** Mark a visit started (matches a GPS check-in; kept in sync by demo). */
  start(bookingId: string): void {
    this.transition(bookingId, 'in_progress', '/start', {});
  }

  /** Complete the visit (gate for reviews; releases escrow). */
  complete(bookingId: string): void {
    this.transition(bookingId, 'completed', '/complete', {});
  }

  /**
   * Cancel a booking. Quotes the policy first (free window vs fee), then
   * transitions and refunds the escrow accordingly. Role-guarded: only an
   * involved party (client or provider of this booking) may cancel.
   */
  cancel(bookingId: string, nowMs: number = Date.now()): void {
    const booking = this._bookings().find((b) => b.id === bookingId);
    const me = this.session.session();
    if (!booking || !isInvolvedParty(booking, me?.userId)) {
      this._lastError.set({ key: 'booking.error.notInvolvedParty' });
      return;
    }
    const held = this.heldFor(bookingId);
    if (booking && held) {
      const quote = quoteCancellation(booking, held.amountCents, nowMs);
      this.notifications.notify(
        'booking.cancelled',
        { key: 'notify.bookingCancelled' },
        quote.free
          ? { key: 'notify.cancelledFree' }
          : { key: 'notify.cancelledLate', params: { fee: quote.feeCents / 100 } },
        '/bookings'
      );
    }
    this.transition(bookingId, 'cancelled', '/cancel', {});
  }

  /**
   * Client or provider proposes a new time (both parties see the event;
   * status is unchanged). The proposal carries dual-confirmation flags —
   * the other party agrees via `confirmReschedule`.
   */
  reschedule(bookingId: string, request: RescheduleRequest): void {
    const current = this._bookings().find((b) => b.id === bookingId);
    if (!current) {
      this._lastError.set({ key: 'booking.error.notFound' });
      return;
    }
    if (current.status === 'completed' || current.status === 'cancelled' || current.status === 'disputed') {
      this._lastError.set({ key: 'booking.error.rescheduleNotAllowed' });
      return;
    }
    this._actingId.set(bookingId);
    this._lastError.clear();
    this.api
      .post<BookingRecord>(`/bookings/${encodeURIComponent(bookingId)}/reschedule`, request)
      .subscribe({
        next: (booking) => {
          this._bookings.update((list) =>
            list.map((b) => (b.id === booking.id ? booking : b))
          );
          this._actingId.set(null);
          this.notifications.notify(
            'booking.rescheduled',
            { key: 'notify.rescheduleProposed' },
            {
              key: 'notify.newTime',
              params: { when: new Date(booking.scheduledAtMs).toLocaleString(activeLocaleTag()) },
            },
            '/bookings'
          );
          this.loadEvents(bookingId);
        },
        error: (error: { status?: number; error?: { message?: string } }) => {
          this._actingId.set(null);
          if (error?.status === 409) {
            this._conflict.setFromServer(error?.error?.message, { key: 'booking.error.stale' });
            this.load();
          } else {
            this._lastError.setFromServer(error?.error?.message, {
              key: 'booking.error.rescheduleFailed',
            });
          }
        },
      });
  }

  /** Open a dispute (freezes the held escrow via the dispute flow, §17). */
  dispute(bookingId: string): void {
    this.transition(bookingId, 'disputed', '/dispute', {});
  }

  /**
   * Confirm the other party's reschedule proposal (dual-confirmation, subtask
   * 6). The backend records this user's confirmation flag; once both flags
   * are set the proposal counts as agreed (see `rescheduleConfirmed`).
   */
  confirmReschedule(bookingId: string): void {
    const current = this._bookings().find((b) => b.id === bookingId);
    if (!current) {
      this._lastError.set({ key: 'booking.error.notFound' });
      return;
    }
    if (!current.pendingReschedule) {
      this._lastError.set({ key: 'booking.error.noProposal' });
      return;
    }
    this._actingId.set(bookingId);
    this._lastError.clear();
    this.api
      .post<BookingRecord>(`/bookings/${encodeURIComponent(bookingId)}/reschedule/confirm`, {})
      .subscribe({
        next: (booking) => {
          this._bookings.update((list) =>
            list.map((b) => (b.id === booking.id ? booking : b))
          );
          this._actingId.set(null);
          this.notifications.notify(
            'booking.rescheduled',
            { key: 'notify.rescheduleConfirmed' },
            {
              key: 'notify.agreedTime',
              params: { when: new Date(booking.scheduledAtMs).toLocaleString(activeLocaleTag()) },
            },
            '/bookings'
          );
          this.loadEvents(bookingId);
        },
        error: (error: { status?: number; error?: { message?: string } }) => {
          this._actingId.set(null);
          if (error?.status === 409) {
            this._conflict.setFromServer(error?.error?.message, { key: 'booking.error.stale' });
            this.load();
          } else {
            this._lastError.setFromServer(error?.error?.message, {
              key: 'booking.error.confirmFailed',
            });
          }
        },
      });
  }

  /** Quote what a cancellation would cost right now (policy preview). */
  quoteFor(bookingId: string, nowMs: number = Date.now()): CancellationQuote | null {
    const booking = this._bookings().find((b) => b.id === bookingId);
    const held = this.heldFor(bookingId);
    if (!booking || !held) {
      return null;
    }
    return quoteCancellation(booking, held.amountCents, nowMs);
  }

  /**
   * Shared transition runner: validates against the pure state machine,
   * posts to the backend, updates local state, appends the event, notifies,
   * and settles escrow (release on complete, refund on cancel).
   */
  private transition(
    bookingId: string,
    to: BookingStatus,
    path: string,
    body: unknown
  ): void {
    const current = this._bookings().find((b) => b.id === bookingId);
    if (!current) {
      this._lastError.set({ key: 'booking.error.notFound' });
      return;
    }
    if (!canTransition(current.status, to)) {
      this._lastError.set({
        key: 'booking.error.invalidTransition',
        params: { from: current.status, to },
      });
      return;
    }
    this._actingId.set(bookingId);
    this._lastError.clear();
    this.api
      .post<BookingRecord>(
        `/bookings/${encodeURIComponent(bookingId)}${path}`,
        body
      )
      .subscribe({
        next: (booking) => {
          this._bookings.update((list) =>
            list.map((b) => (b.id === booking.id ? booking : b))
          );
          this._actingId.set(null);
          this._conflict.clear();
          this.notifyTransition(booking);
          this.settleEscrow(booking);
          this.loadEvents(bookingId);
        },
        error: (error: { status?: number; error?: { message?: string } }) => {
          this._actingId.set(null);
          if (error?.status === 409) {
            // Concurrent modification: surface + reload the truth.
            this._conflict.setFromServer(error?.error?.message, {
              key: 'booking.error.stale',
            });
            this.load();
          } else {
            this._lastError.setFromServer(error?.error?.message, {
              key: 'booking.error.updateFailed',
            });
          }
        },
      });
  }

  private notifyTransition(booking: BookingRecord): void {
    const kind: Parameters<NotificationsService['notify']>[0] =
      booking.status === 'accepted'
        ? 'booking.accepted'
        : booking.status === 'in_progress'
          ? 'booking.started'
          : booking.status === 'completed'
            ? 'booking.completed'
            : booking.status === 'cancelled'
              ? 'booking.cancelled'
              : booking.status === 'disputed'
                ? 'booking.disputed'
                : 'booking.rescheduled';
    const titles: Record<BookingStatus, string> = {
      requested: 'notify.status.requested',
      accepted: 'notify.status.accepted',
      in_progress: 'notify.status.inProgress',
      completed: 'notify.status.completed',
      // Shared with the dedicated emit sites — one wording per event.
      cancelled: 'notify.bookingCancelled',
      disputed: 'notify.disputeOpened',
    };
    this.notifications.notify(
      kind,
      { key: titles[booking.status] ?? 'notify.bookingUpdated' },
      {
        key: 'notify.bookingBody',
        params: {
          name: booking.caregiverName,
          when: new Date(booking.scheduledAtMs).toLocaleString(activeLocaleTag()),
        },
      },
      '/bookings'
    );
    if (booking.status === 'completed') {
      this.notifications.toast({ key: 'notify.escrowReleased' }, 'success');
    }
  }

  private settleEscrow(booking: BookingRecord): void {
    const held = this.heldFor(booking.id);
    if (!held) {
      return;
    }
    if (booking.status === 'completed') {
      this.escrow.release(held.id).subscribe();
    } else if (booking.status === 'cancelled') {
      this.escrow.refund(held.id).subscribe();
    }
  }
}
