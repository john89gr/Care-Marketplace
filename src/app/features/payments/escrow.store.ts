import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Escrow payment state (PLAN.md §5 Phase 2 — Payments): funds are held when a
 * booking is created and released automatically when the visit completes.
 */
export type EscrowStatus = 'held' | 'released' | 'refunded';

export interface EscrowTransaction {
  id: string;
  bookingId: string;
  providerId: string;
  clientId: string;
  amountCents: number;
  status: EscrowStatus;
  createdAtMs: number;
  settledAtMs: number | null;
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
      .filter((t) => t.status === 'held')
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

  /** Release a held transaction (automatic on completed visit). */
  release(transactionId: string): Observable<boolean> {
    return this.settle(transactionId, '/release', 'released');
  }

  /** Refund a held transaction (cancelled booking). */
  refund(transactionId: string): Observable<boolean> {
    return this.settle(transactionId, '/refund', 'refunded');
  }

  private settle(
    transactionId: string,
    path: '/release' | '/refund',
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
