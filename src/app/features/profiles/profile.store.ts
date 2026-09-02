import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * User profile state (PLAN.md §5 Phase 1 — Profiles). The fields are
 * role-dependent: clients carry AMKA/AFM, providers carry a licence number.
 */
export interface UserProfile {
  userId: string;
  displayName: string;
  phone: string;
  amka: string;
  afm: string;
  licenceNumber: string;
  hourlyRate: number | null;
}

const EMPTY_PROFILE: UserProfile = {
  userId: '',
  displayName: '',
  phone: '',
  amka: '',
  afm: '',
  licenceNumber: '',
  hourlyRate: null,
};

@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly api = inject(ApiClient);
  private readonly _profile = signal<UserProfile>(EMPTY_PROFILE);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _saveError = signal('');
  private readonly _saved = signal(false);

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly saveError = this._saveError.asReadonly();
  readonly saved = this._saved.asReadonly();

  load(): Observable<boolean> {
    this._loading.set(true);
    return this.api.get<UserProfile>('/profiles/me').pipe(
      map((profile) => {
        this._profile.set({ ...EMPTY_PROFILE, ...profile });
        this._loading.set(false);
        return true;
      }),
      catchError(() => {
        this._loading.set(false);
        return of(false);
      })
    );
  }

  save(patch: Partial<UserProfile>): Observable<boolean> {
    this._saving.set(true);
    this._saved.set(false);
    this._saveError.set('');
    return this.api.patch<UserProfile>('/profiles/me', patch).pipe(
      map((profile) => {
        this._profile.set({ ...EMPTY_PROFILE, ...profile });
        this._saving.set(false);
        this._saved.set(true);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._saveError.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save your profile. Please try again.'
        );
        return of(false);
      })
    );
  }
}
