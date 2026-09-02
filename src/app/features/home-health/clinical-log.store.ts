import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { ROLES } from '../../core/auth/roles';

/**
 * Clinical documentation (PLAN.md §3.A / §5 Phase 2 — Clinical log):
 * standardised per-specialty forms signed by the therapist. Vitals belong to
 * nurses, rehab/mobility to physiotherapists.
 */
export type ClinicalSpecialty = 'nurse' | 'physio';

export interface Vitals {
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  spo2: number | null;
}

export interface RehabAssessment {
  rangeOfMotion: string;
  painLevel: number | null; // 0-10
  exercisesPrescribed: string;
}

export interface ClinicalLogEntry {
  id: string;
  visitId: string;
  authorId: string;
  authorName: string;
  specialty: ClinicalSpecialty;
  observations: string;
  vitals: Vitals | null;
  rehab: RehabAssessment | null;
  signatureDataUrl: string | null;
  signedAtMs: number | null;
}

export interface ClinicalLogDraft {
  visitId: string;
  observations: string;
  vitals?: Vitals | null;
  rehab?: RehabAssessment | null;
}

@Injectable({ providedIn: 'root' })
export class ClinicalLogStore {
  // Default-parameter injection keeps `new ClinicalLogStore(api, session)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly session: SessionStore = inject(SessionStore)
  ) {}

  private readonly _entries = signal<ClinicalLogEntry[]>([]);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal('');
  private readonly _saved = signal(false);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();
  readonly saved = this._saved.asReadonly();

  /** Whether the current user is a nurse (physio otherwise). */
  readonly specialty = (): ClinicalSpecialty =>
    this.session.hasAnyRole([ROLES.NURSE]) ? 'nurse' : 'physio';

  load(visitId?: string): void {
    this._loading.set(true);
    this.api.get<ClinicalLogEntry[]>('/clinical-log').subscribe({
      next: (entries) => {
        this._entries.set(visitId ? entries.filter((e) => e.visitId === visitId) : entries);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Saves a signed clinical log entry. Pass null to save without a signature. */
  save(draft: ClinicalLogDraft, signatureDataUrl: string | null): Observable<boolean> {
    this._saving.set(true);
    this._saved.set(false);
    this._error.set('');
    const me = this.session.session();
    const entry: ClinicalLogEntry = {
      id: crypto.randomUUID(),
      visitId: draft.visitId,
      authorId: me?.userId ?? '',
      authorName: me?.displayName ?? '',
      specialty: this.specialty(),
      observations: draft.observations,
      vitals: draft.vitals ?? null,
      rehab: draft.rehab ?? null,
      signatureDataUrl,
      signedAtMs: signatureDataUrl ? Date.now() : null,
    };
    return this.api.post<ClinicalLogEntry>('/clinical-log', entry).pipe(
      map((saved) => {
        this._entries.update((list) => [saved, ...list]);
        this._saving.set(false);
        this._saved.set(true);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save the clinical log. Please try again.'
        );
        return of(false);
      })
    );
  }
}