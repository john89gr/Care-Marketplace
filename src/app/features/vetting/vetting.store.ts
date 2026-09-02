import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Licence vetting workflow (PLAN.md §5 Phase 2 — Nurse/Physio onboarding):
 * a provider submits their licence + specialties, an admin reviews it in the
 * review queue (approve/reject). providerId is filled server-side from the
 * session, like BookingStore.
 */
export type VettingStatus = 'pending' | 'approved' | 'rejected';

export interface LicenceSubmission {
  id: string;
  providerId: string;
  providerName: string;
  licenceNumber: string;
  specialties: string[];
  submittedAtMs: number;
  status: VettingStatus;
  reviewedAtMs: number | null;
  reviewedBy: string | null;
  note: string;
}

export interface LicenceDraft {
  licenceNumber: string;
  specialties: string[];
  note: string;
}

@Injectable({ providedIn: 'root' })
export class VettingStore {
  // Default-parameter injection keeps `new VettingStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _mine = signal<LicenceSubmission | null>(null);
  private readonly _queue = signal<LicenceSubmission[]>([]);
  private readonly _loading = signal(false);
  private readonly _submitting = signal(false);
  private readonly _error = signal('');

  readonly mine = this._mine.asReadonly();
  readonly queue = this._queue.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly submitting = this._submitting.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isApproved = computed(() => this._mine()?.status === 'approved');
  readonly isPending = computed(() => this._mine()?.status === 'pending');
  readonly isRejected = computed(() => this._mine()?.status === 'rejected');

  loadMine(): void {
    this._loading.set(true);
    this.api.get<LicenceSubmission | null>('/vetting/submissions/me').subscribe({
      next: (submission) => {
        this._mine.set(submission);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  submit(draft: LicenceDraft): Observable<boolean> {
    this._submitting.set(true);
    this._error.set('');
    return this.api.post<LicenceSubmission>('/vetting/submissions', draft).pipe(
      map((submission) => {
        this._mine.set(submission);
        this._submitting.set(false);
        return true;
      }),
      catchError((error) => {
        this._submitting.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not submit your licence. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Admin: load the full review queue. */
  loadQueue(): void {
    this._loading.set(true);
    this.api.get<LicenceSubmission[]>('/vetting/submissions').subscribe({
      next: (submissions) => {
        this._queue.set(submissions);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Admin: approve or reject a submission. */
  review(id: string, decision: 'approved' | 'rejected', note = ''): Observable<boolean> {
    this._error.set('');
    return this.api.post<LicenceSubmission>(`/vetting/submissions/${id}/review`, { decision, note }).pipe(
      map((updated) => {
        this._queue.update((list) => list.map((s) => (s.id === id ? updated : s)));
        return true;
      }),
      catchError((error) => {
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not review the submission.'
        );
        return of(false);
      })
    );
  }
}
