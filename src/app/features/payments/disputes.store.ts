import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { EscrowStore } from '../payments/escrow.store';
import { SessionStore } from '../../core/auth/session';
import { NotificationsService, NotificationKind } from '../../core/services/notifications/notifications.service';

/**
 * Dispute resolution workflow (FEATURE_PLAN.md §17).
 *
 * State machine:
 *   open → under_review → resolved_client | resolved_provider | rejected
 *                ↘ rejected
 *
 * Opening a dispute freezes the held escrow (`EscrowStatus.frozen` — §17 subtask 4).
 * Resolving settles the escrow via the existing release/refund endpoints plus a
 * new partial-refund path (§17 subtask 9).
 */
export type DisputeReason = 'not_delivered' | 'quality' | 'overcharged' | 'other';

export type DisputeState =
  | 'open'
  | 'under_review'
  | 'resolved_client'
  | 'resolved_provider'
  | 'rejected';

export type DisputeResolution = 'release' | 'partial_refund' | 'full_refund';

export interface DisputeEvidence {
  id: string;
  disputeId: string;
  authorId: string;
  authorName: string;
  kind: 'message' | 'photo' | 'visit_gps';
  body?: string;
  url?: string;
  createdAtMs: number;
}

export interface Dispute {
  id: string;
  bookingId: string;
  clientId: string;
  clientName: string;
  providerId: string;
  providerName: string;
  openedBy: string;
  openedByName: string;
  reason: DisputeReason;
  description: string;
  state: DisputeState;
  resolution: DisputeResolution | null;
  /** Cents refunded to the client on a partial refund (null unless partial_refund). */
  refundCents: number | null;
  escrowTransactionId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  evidence: DisputeEvidence[];
}

export interface DisputeDraft {
  bookingId: string;
  reason: DisputeReason;
  description: string;
}

export interface DisputeResolutionInput {
  state: 'resolved_client' | 'resolved_provider' | 'rejected';
  resolution: DisputeResolution;
  /** Required for partial_refund. */
  refundCents?: number;
}

/** Allowed state transitions per state. */
export const DISPUTE_STATES: readonly DisputeState[] = [
  'open',
  'under_review',
  'resolved_client',
  'resolved_provider',
  'rejected',
];

export const DISPUTE_TRANSITIONS: Record<DisputeState, readonly DisputeState[]> = {
  open: ['under_review', 'rejected'],
  under_review: ['resolved_client', 'resolved_provider', 'rejected'],
  resolved_client: [],
  resolved_provider: [],
  rejected: [],
};

export const DISPUTE_REASONS: readonly DisputeReason[] = [
  'not_delivered',
  'quality',
  'overcharged',
  'other',
];

export function canTransitionDispute(from: DisputeState, to: DisputeState): boolean {
  return (DISPUTE_TRANSITIONS[from] ?? []).includes(to);
}

/** SLA: disputes open longer than this are flagged in the admin queue (§17 subtask 11). */
export const DISPUTE_SLA_MS = 48 * 60 * 60 * 1000;

/**
 * Human-readable reason labels for the UI.
 */
export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_delivered: 'Service not delivered',
  quality: 'Quality of service',
  overcharged: 'Billing / overcharged',
  other: 'Other',
};

/**
 * Validate a partial-refund amount (cents-safe, no floats — §17 subtask 16).
 * Returns the quote (refund + provider share) so the UI can confirm before
 * sending it to the backend.
 */
export interface PartialRefundQuote {
  ok: boolean;
  reason: string;
  refundCents: number;
  providerCents: number;
}

export function quotePartialRefund(refundCents: number, amountCents: number): PartialRefundQuote {
  if (!Number.isInteger(refundCents) || refundCents < 0) {
    return { ok: false, reason: 'Refund amount must be a non-negative integer (cents).', refundCents: 0, providerCents: 0 };
  }
  if (refundCents > amountCents) {
    return {
      ok: false,
      reason: 'Refund amount cannot exceed the held amount.',
      refundCents: amountCents,
      providerCents: 0,
    };
  }
  return {
    ok: true,
    reason: '',
    refundCents,
    providerCents: amountCents - refundCents,
  };
}

function resolveNotification(dispute: Dispute): { kind: NotificationKind; title: string; body: string } {
  if (dispute.state === 'resolved_client') {
    if (dispute.resolution === 'partial_refund' && dispute.refundCents) {
      return {
        kind: 'dispute.resolved',
        title: 'Dispute resolved in your favour',
        body: `Partial refund of ${(dispute.refundCents / 100).toFixed(2)}€ processed.`,
      };
    }
    return {
      kind: 'dispute.resolved',
      title: 'Dispute resolved in your favour',
      body: 'Full refund processed.',
    };
  }
  if (dispute.state === 'resolved_provider') {
    return {
      kind: 'dispute.resolved',
      title: 'Dispute resolved in favour of the provider',
      body: 'Escrow released to the provider.',
    };
  }
  return { kind: 'dispute.rejected', title: 'Dispute rejected', body: 'The dispute was rejected — escrow released.' };
}

@Injectable({ providedIn: 'root' })
export class DisputesStore {
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly escrow: EscrowStore = inject(EscrowStore),
    private readonly session: SessionStore = inject(SessionStore),
    private readonly notifications: NotificationsService = inject(NotificationsService)
  ) {}

  private readonly _mine = signal<Dispute[]>([]);
  private readonly _queue = signal<Dispute[]>([]);
  private readonly _loading = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = signal('');

  readonly disputes = this._mine.asReadonly();
  readonly queue = this._queue.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isAdmin = computed(() => this.session.hasAnyRole(['admin']));

  /** Disputes awaiting action, newest first. */
  readonly openDisputes = computed(() =>
    this._mine()
      .filter((d) => d.state === 'open' || d.state === 'under_review')
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  );

  /** Non-resolved disputes flagged past the SLA (admin only). */
  readonly slaBreaches = computed(() =>
    this._queue().filter(
      (d) => (d.state === 'open' || d.state === 'under_review') &&
        d.createdAtMs < Date.now() - DISPUTE_SLA_MS
    )
  );

  loadMine(): void {
    this._loading.set(true);
    this._error.set('');
    this.api.get<Dispute[]>('/me/disputes').subscribe({
      next: (disputes) => {
        this._mine.set(disputes);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load your disputes. Please try again.');
        this._loading.set(false);
      },
    });
  }

  /** Admin: load the full dispute queue. */
  loadQueue(): void {
    this._loading.set(true);
    this._error.set('');
    this.api.get<Dispute[]>('/disputes').subscribe({
      next: (disputes) => {
        this._queue.set(disputes);
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Could not load the dispute queue. Please try again.');
        this._loading.set(false);
      },
    });
  }

  /** Open a new dispute (client/provider side — freezes the held escrow). */
  open(draft: DisputeDraft): Observable<boolean> {
    this._error.set('');
    this._actingId.set(draft.bookingId);
    return this.api.post<Dispute>('/disputes', draft).pipe(
      map((dispute) => {
        this._mine.update((list) => [dispute, ...list]);
        this._actingId.set(null);
        // Sync local escrow so the payments view shows the frozen status immediately.
        if (dispute.escrowTransactionId) {
          this.escrow.freeze(dispute.escrowTransactionId).subscribe();
        }
        this.notifications.notify(
          'dispute.opened',
          'Dispute opened',
          `A dispute has been opened for booking ${draft.bookingId}.`,
          '/disputes'
        );
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not open the dispute. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Admin: take a case (open → under_review). */
  take(id: string): Observable<boolean> {
    return this.transition(id, 'under_review');
  }

  /** Admin: resolve with release, partial refund, or full refund. */
  resolve(id: string, input: DisputeResolutionInput): Observable<boolean> {
    this._error.set('');
    this._actingId.set(id);
    return this.api
      .post<Dispute>(`/disputes/${encodeURIComponent(id)}/state`, input)
      .pipe(
        map((dispute) => {
          this._queue.update((list) => list.map((d) => (d.id === id ? dispute : d)));
          this._mine.update((list) => list.map((d) => (d.id === id ? dispute : d)));
          this._actingId.set(null);
          this.settleEscrow(dispute);
          this.notifyResolution(dispute);
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not resolve the dispute. Please try again.'
          );
          return of(false);
        })
      );
  }

  /** Admin: reject a dispute (escrow released back to the provider). */
  reject(id: string): Observable<boolean> {
    return this.resolve(id, { state: 'rejected', resolution: 'release' });
  }

  private transition(id: string, to: DisputeState): Observable<boolean> {
    this._error.set('');
    this._actingId.set(id);
    return this.api
      .post<Dispute>(`/disputes/${encodeURIComponent(id)}/state`, { state: to })
      .pipe(
        map((dispute) => {
          this._queue.update((list) => list.map((d) => (d.id === id ? dispute : d)));
          this._mine.update((list) => list.map((d) => (d.id === id ? dispute : d)));
          this._actingId.set(null);
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not update the dispute. Please try again.'
          );
          return of(false);
        })
      );
  }

  private settleEscrow(dispute: Dispute): void {
    if (!dispute.escrowTransactionId) {
      return;
    }
    switch (dispute.resolution) {
      case 'release':
        this.escrow.release(dispute.escrowTransactionId).subscribe();
        break;
      case 'full_refund':
        this.escrow.refund(dispute.escrowTransactionId).subscribe();
        break;
      case 'partial_refund':
        if (dispute.refundCents) {
          this.escrow.partialRefund(dispute.escrowTransactionId, dispute.refundCents).subscribe();
        }
        break;
    }
  }

  private notifyResolution(dispute: Dispute): void {
    const msg = resolveNotification(dispute);
    this.notifications.notify(msg.kind, msg.title, msg.body, '/disputes');
  }
}
