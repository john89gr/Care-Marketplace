import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { EscrowStore } from '../payments/escrow.store';

/**
 * Booking request state (PLAN.md §5). Booking is the bridge to Phase 2
 * escrow: a hold is placed when the booking is submitted and released when
 * the visit completes.
 */
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

export interface BookingCreated {
  id: string;
  caregiverId: string;
  clientId: string;
  amountCents: number;
}

const EMPTY_DRAFT: BookingDraft = {
  caregiverId: '',
  scheduledAtMs: null,
  note: '',
};

@Injectable({ providedIn: 'root' })
export class BookingStore {
  private readonly api = inject(ApiClient);
  private readonly escrow = inject(EscrowStore);
  private readonly _draft = signal<BookingDraft>(EMPTY_DRAFT);
  private readonly _submitting = signal(false);
  private readonly _lastError = signal('');

  readonly draft = this._draft.asReadonly();
  readonly submitting = this._submitting.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  readonly isDraftReady = signal(false);

  startDraft(caregiverId: string): void {
    this._draft.set({ ...EMPTY_DRAFT, caregiverId });
  }

  updateDraft(patch: Partial<BookingDraft>): void {
    this._draft.update((current) => ({ ...current, ...patch }));
  }

  clearDraft(): void {
    this._draft.set(EMPTY_DRAFT);
    this._lastError.set('');
  }

  async submit(): Promise<boolean> {
    const draft = this._draft();
    if (!draft.caregiverId || draft.scheduledAtMs === null) {
      this._lastError.set('Complétez la date avant envoi.');
      return false;
    }
    this._submitting.set(true);
    this._lastError.set('');
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
      this.clearDraft();
      return true;
    } catch (error) {
      this._lastError.set('Échec de la demande. Réessayez.');
      return false;
    } finally {
      this._submitting.set(false);
    }
  }
}
