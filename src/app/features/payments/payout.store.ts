import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { LocalizedMessage } from '../../core/i18n/localized-message';

/**
 * Provider-side payout-state (FEATURE_PLAN.md §13.4, §13.9). Tracks the
 * Connect-account onboarding lifecycle and the provider's earnings balance,
 * which is derived from released escrow transactions server-side.
 */
export type PayoutStatus = 'not_started' | 'pending' | 'active';

export interface PayoutAccount {
  id: string;
  status: PayoutStatus;
  /** Pseudonymised PSP account id (e.g. acct_…). */
  accountId: string;
  /** IBAN / bank-account last 4 — display only. */
  accountLast4: string | null;
  /** ISO currency code (EUR-only for now, §13.11). */
  currency: 'EUR';
  /** Sum of released escrow for this provider in cents. */
  balanceCents: number;
  country: string | null;
  payoutSchedule: 'weekly' | 'manual';
  updatedAtMs: number;
  /** Stripe-style onboarding link when status is `pending`. */
  onboardingUrl: string | null;
}

export interface PayoutAccountPatch {
  status?: PayoutStatus;
  accountLast4?: string | null;
  country?: string | null;
  payoutSchedule?: 'weekly' | 'manual';
  onboardingUrl?: string | null;
}

/** Platform commission: 15% applied to each escrow release (§13.10). */
export const PLATFORM_FEE_FRACTION = 0.15;

@Injectable({ providedIn: 'root' })
export class PayoutStore {
  // Default-parameter injection keeps `new PayoutStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _account = signal<PayoutAccount | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = new LocalizedMessage();
  private readonly _saved = signal(false);

  readonly account = this._account.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  /** Translatable source of the message (null for server-provided text). */
  readonly errorSource = this._error.source;
  readonly error = this._error.value;
  readonly saved = this._saved.asReadonly();

  readonly status = computed(() => this._account()?.status ?? 'not_started');
  readonly balanceCents = computed(() => this._account()?.balanceCents ?? 0);

  load(): void {
    this._loading.set(true);
    this._error.clear();
    this.api.get<PayoutAccount>('/me/payout-account').subscribe({
      next: (account) => {
        this._account.set(account);
        this._loading.set(false);
      },
      error: (err) => {
        this._loading.set(false);
        if (err?.status !== 404) {
          this._error.setFromServer((err as { error?: { message?: string } })?.error?.message, {
              key: 'store.payout.loadFailed',
            });
        }
      },
    });
  }

  save(patch: PayoutAccountPatch): Observable<boolean> {
    this._saving.set(true);
    this._saved.set(false);
    this._error.clear();
    return this.api.put<PayoutAccount>('/me/payout-account', patch).pipe(
      map((account) => {
        this._account.set(account);
        this._saving.set(false);
        this._saved.set(true);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._error.setFromServer((error as { error?: { message?: string } })?.error?.message, {
            key: 'store.payout.saveFailed',
          });
        return of(false);
      })
    );
  }

  /** Convenience: begin the Stripe Connect onboarding flow (§13.4). */
  startOnboarding(): Observable<boolean> {
    return this.save({ status: 'pending' });
  }
}
