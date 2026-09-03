import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Client-side payment-method state (FEATURE_PLAN.md §13).
 *
 * Token-based: a card PAN is tokenized by the PSP (e.g. Stripe.js) before it
 * ever reaches this store. We keep only the token + display metadata — the
 * PAN is never stored in state or sent to the storage endpoint (contract
 * enforced by rejecting any request that carries a `cardNumber` field).
 */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'other';

export interface PaymentMethod {
  id: string;
  /** Card token from the PSP (e.g. tok_…). NEVER the PAN. */
  token: string;
  brand: CardBrand;
  /** Last 4 digits — display only. */
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAtMs: number;
}

export interface AddPaymentMethodRequest {
  token: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

export interface CardDetails {
  /** Full PAN — consumed only by the tokenization step, never persisted. */
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
}

export interface TokenizedCard {
  token: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

/** Platform commission: 15% on escrow releases (§13.10). */
export const PLATFORM_FEE_FRACTION = 0.15;

@Injectable({ providedIn: 'root' })
export class PaymentMethodsStore {
  // Default-parameter injection keeps `new PaymentMethodsStore(api)` possible
  // in unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _methods = signal<PaymentMethod[]>([]);
  private readonly _loading = signal(false);
  private readonly _tokenizing = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = signal('');

  readonly methods = this._methods.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly tokenizing = this._tokenizing.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly error = this._error.asReadonly();

  readonly defaultMethod = computed(() => this._methods().find((m) => m.isDefault));

  load(): void {
    this._loading.set(true);
    this._error.set('');
    this.api.get<PaymentMethod[]>('/me/payment-methods').subscribe({
      next: (methods) => {
        this._methods.set(methods);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
        this._error.set('Could not load your payment methods.');
      },
    });
  }

  /**
   * Tokenize a card via the PSP. In production this would be
   * `stripe.createToken(cardElement)` (a client-side call to Stripe.js).
   * The demo backend simulates tokenization at POST /me/payment-methods/tokenize.
   */
  tokenize(card: CardDetails): Observable<TokenizedCard | null> {
    this._error.set('');
    this._tokenizing.set(true);
    return this.api
      .post<TokenizedCard | { declined: true }>('/me/payment-methods/tokenize', card)
      .pipe(
        map((result) => {
          this._tokenizing.set(false);
          if ('declined' in result) {
            this._error.set('Your card was declined. Please try another.');
            return null;
          }
          return result;
        }),
        catchError((error) => {
          this._tokenizing.set(false);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not tokenize your card. Please try again.'
          );
          return of(null);
        })
      );
  }

  /** Add a tokenised payment method. The PAN never enters this call. */
  add(request: AddPaymentMethodRequest): Observable<boolean> {
    this._error.set('');
    return this.api.post<PaymentMethod>('/me/payment-methods', request).pipe(
      map((method) => {
        this._methods.update((list) => [method, ...list]);
        return true;
      }),
      catchError((error) => {
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save your payment method. Please try again.'
        );
        return of(false);
      })
    );
  }

  setDefault(id: string): Observable<boolean> {
    this._actingId.set(id);
    this._error.set('');
    return this.api
      .patch<{ ok: boolean }>(`/me/payment-methods/${id}/default`, {})
      .pipe(
        map(() => {
          this._methods.update((list) =>
            list.map((m) => ({ ...m, isDefault: m.id === id }))
          );
          this._actingId.set(null);
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not set this as your default payment method.'
          );
          return of(false);
        })
      );
  }

  remove(id: string): Observable<boolean> {
    this._actingId.set(id);
    this._error.set('');
    return this.api.delete<{ ok: boolean }>(`/me/payment-methods/${id}`).pipe(
      map(() => {
        this._methods.update((list) => list.filter((m) => m.id !== id));
        this._actingId.set(null);
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not remove this payment method.'
        );
        return of(false);
      })
    );
  }
}
