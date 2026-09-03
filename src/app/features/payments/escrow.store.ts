import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Escrow payment state (PLAN.md §5 Phase 2 — Payments): funds are held when a
 * booking is created and released automatically when the visit completes.
 */
export type EscrowStatus = 'held' | 'released' | 'refunded' | 'frozen';

export interface EscrowTransaction {
  id: string;
  bookingId: string;
  providerId: string;
  clientId: string;
  amountCents: number;
  status: EscrowStatus;
  createdAtMs: number;
  settledAtMs: number | null;
  /** Cents returned to the client on a partial refund (null = full release/refund). */
  refundedCents?: number | null;
}

export interface HoldRequest {
  bookingId: string;
  providerId: string;
  amountCents: number;
}

@Injectable({ providedIn: 'root' })
export class EscrowStore {
  // Default-parameter injection keeps `new EscrowStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}
  private readonly _transactions = signal<EscrowTransaction[]>([]);
  private readonly _loading = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = signal('');

  readonly transactions = this._transactions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly error = this._error.asReadonly();

  readonly heldTotalCents = computed(() =>
    this._transactions()
      .filter((t) => t.status === 'held' || t.status === 'frozen')
      .reduce((sum, t) => sum + t.amountCents, 0)
  );

  /** Funds frozen by an open dispute — still held but not releasable. */
  readonly frozenTotalCents = computed(() =>
    this._transactions()
      .filter((t) => t.status === 'frozen')
      .reduce((sum, t) => sum + t.amountCents, 0)
  );

  load(): void {
    this._loading.set(true);
    this.api.get<EscrowTransaction[]>('/payments/escrow').subscribe({
      next: (transactions) => {
        this._transactions.set(transactions);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Hold funds when a booking is created. */
  hold(request: HoldRequest): Observable<boolean> {
    this._error.set('');
    return this.api.post<EscrowTransaction>('/payments/escrow', request).pipe(
      map((transaction) => {
        this._transactions.update((list) => [transaction, ...list]);
        return true;
      }),
      catchError((error) => {
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not place the escrow hold.'
        );
        return of(false);
      })
    );
  }

  /** Release a held/frozen transaction (automatic on completed visit or provider win). */
  release(transactionId: string): Observable<boolean> {
    return this.settle(transactionId, '/release', 'released');
  }

  /** Refund a held/frozen transaction (cancelled booking or client win). */
  refund(transactionId: string): Observable<boolean> {
    return this.settle(transactionId, '/refund', 'refunded');
  }

  /** Freeze a held transaction when a dispute opens (§17). */
  freeze(transactionId: string): Observable<boolean> {
    return this.settle(transactionId, '/freeze', 'frozen');
  }

  /**
   * Partially refund a frozen/held transaction: `refundCents` returns to the
   * client, the remainder is released to the provider. Cents-safe — the
   * backend enforces 0 ≤ refundCents ≤ amountCents.
   */
  partialRefund(transactionId: string, refundCents: number): Observable<boolean> {
    this._actingId.set(transactionId);
    this._error.set('');
    return this.api
      .post<EscrowTransaction>(`/payments/escrow/${transactionId}/partial-refund`, {
        amountCents: refundCents,
      })
      .pipe(
        map((transaction) => {
          this._transactions.update((list) =>
            list.map((t) => (t.id === transaction.id ? transaction : t))
          );
          this._actingId.set(null);
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not process the partial refund.'
          );
          return of(false);
        })
      );
  }

  private settle(
    transactionId: string,
    path: '/release' | '/refund' | '/freeze',
    status: EscrowStatus
  ): Observable<boolean> {
    this._actingId.set(transactionId);
    this._error.set('');
    return this.api.post<EscrowTransaction>(`/payments/escrow/${transactionId}${path}`, {}).pipe(
      map((transaction) => {
        this._transactions.update((list) =>
          list.map((t) => (t.id === transaction.id ? transaction : t))
        );
        this._actingId.set(null);
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            (status === 'released' ? 'Could not release the escrow.' : 'Could not refund the escrow.')
        );
        return of(false);
      })
    );
  }
}
