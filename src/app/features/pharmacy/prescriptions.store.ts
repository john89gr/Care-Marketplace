/**
 * Prescriptions store (FEATURE_PLAN.md §9 subtask 4): barcode scan → parsed
 * prescription + auto-routed order (subtask 3 contract).
 *
 *   POST /prescriptions/scan  { barcode, prescriber?, deliveryAddress?, lat?, lng? }
 *     → { prescription, order } | 422 { message } (unreadable barcode)
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import type {
  Prescription,
  PrescriptionScanResult,
} from './pharmacy.models';

export interface ScanRequest {
  barcode: string;
  prescriber?: string;
  deliveryAddress?: string;
  lat?: number;
  lng?: number;
}

@Injectable({ providedIn: 'root' })
export class PrescriptionsStore {
  // Default-parameter injection keeps `new PrescriptionsStore(api)` possible
  // in unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _items = signal<Prescription[]>([]);
  private readonly _scanning = signal(false);
  private readonly _error = signal('');
  private readonly _lastResult = signal<PrescriptionScanResult | null>(null);

  readonly items = this._items.asReadonly();
  readonly scanning = this._scanning.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastResult = this._lastResult.asReadonly();

  clearError(): void {
    this._error.set('');
  }

  clearResult(): void {
    this._lastResult.set(null);
  }

  /**
   * Scan a barcode/QR payload (or the manual-entry text). The backend parses
   * + auto-routes; an unreadable payload surfaces as a 422 error message with
   * the form kept for retry (subtask 13).
   */
  scanBarcode(request: ScanRequest): Observable<boolean> {
    this._scanning.set(true);
    this._error.set('');
    return this.api.post<PrescriptionScanResult>('/prescriptions/scan', request).pipe(
      map((result) => {
        this._items.update((items) => [result.prescription, ...items]);
        this._lastResult.set(result);
        this._scanning.set(false);
        return true;
      }),
      catchError((error) => {
        this._scanning.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'The barcode could not be read. Please try again or enter the details manually.'
        );
        return of(false);
      })
    );
  }
}
