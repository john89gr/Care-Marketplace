import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { Role } from '../../core/auth/roles';
import { LocalizedMessage } from '../../core/i18n/localized-message';

/**
 * Public provider profile (the page behind `/caregivers/:id`).
 *
 * Kept apart from `MarketplaceStore` on purpose: search state is a list with
 * filters and ranking, whereas this is one record fetched by id. The review
 * list itself lives in `ReviewsStore` — this store only owns the profile, so
 * the detail page composes the two.
 */
export interface CaregiverService {
  name: string;
  /** Euro per session. */
  price: number;
  durationMin: number;
}

export interface CaregiverProfile {
  id: string;
  displayName: string;
  roles: Role[];
  rating: number;
  /** Published review count (backend-computed). */
  reviewCount?: number;
  distanceKm: number;
  hourlyRate: number;
  availableNow: boolean;
  specialties?: string[];
  lat?: number;
  lng?: number;
  completedVisits?: number;
  recentCancellations?: number;
  /** §14: most-urgent licence/certificate expiry; null = lifetime/unknown. */
  expiresAtMs?: number | null;
  bio?: string;
  city?: string;
  languages?: string[];
  experienceYears?: number;
  /** Typical first-response time, in minutes. */
  responseMinutes?: number;
  repeatClients?: number;
  verified?: boolean;
  education?: string;
  memberSinceMs?: number;
  services?: CaregiverService[];
}

@Injectable({ providedIn: 'root' })
export class CaregiverProfileStore {
  // Default-parameter injection keeps `new CaregiverProfileStore(api)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _profile = signal<CaregiverProfile | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = new LocalizedMessage();

  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** Translatable source of the error (null for a server-provided message). */
  readonly errorSource = this._error.source;
  readonly error = this._error.value;

  /**
   * Load one provider. Clearing first means the page never shows another
   * provider's name while the new fetch is in flight.
   */
  load(id: string): void {
    if (this._profile()?.id !== id) {
      this._profile.set(null);
    }
    this._loading.set(true);
    this._error.clear();
    this.api.get<CaregiverProfile>(`/caregivers/${encodeURIComponent(id)}`).subscribe({
      next: (profile) => {
        this._profile.set(profile);
        this._loading.set(false);
      },
      error: (error: { status?: number }) => {
        if (error?.status === 404) {
          this._error.set({ key: 'provider.notFound' });
        } else {
          this._error.set({ key: 'provider.error.loadFailed' });
        }
        this._loading.set(false);
      },
    });
  }
}
