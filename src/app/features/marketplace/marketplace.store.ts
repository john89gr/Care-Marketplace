import { Injectable, inject, signal, computed } from '@angular/core';
import { Role } from '../../core/auth/roles';
import { ApiClient } from '../../core/api/api.client';
import { matchCandidates } from './matching';

/**
 * Marketplace search state (Phase 1, PLAN.md §5). search() fetches candidate
 * cards from the backend and runs the v1 matching engine
 * (geo + availability + rating) before exposing results.
 */
export interface CaregiverCard {
  id: string;
  displayName: string;
  roles: Role[];
  rating: number;
  distanceKm: number;
  hourlyRate: number;
  availableNow: boolean;
}

export interface SearchFilters {
  query: string;
  roles: Role[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  roles: [],
  maxDistanceKm: null,
  minRating: null,
  availableNowOnly: false,
};

@Injectable({ providedIn: 'root' })
export class MarketplaceStore {
  private readonly api = inject(ApiClient);
  private readonly _filters = signal<SearchFilters>(DEFAULT_FILTERS);
  private readonly _results = signal<CaregiverCard[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal('');

  readonly filters = this._filters.asReadonly();
  readonly results = this._results.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasResults = computed(() => this._results().length > 0);

  setFilters(patch: Partial<SearchFilters>): void {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters(): void {
    this._filters.set(DEFAULT_FILTERS);
  }

  /** Fetch candidates and run the v1 matching engine. */
  search(): void {
    const filters = this._filters();
    this._loading.set(true);
    this._error.set('');
    this.api
      .get<CaregiverCard[]>(`/caregivers/search?${this.toQuery(filters)}`)
      .subscribe({
        next: (candidates) => {
          this._results.set(matchCandidates(candidates, filters));
          this._loading.set(false);
        },
        error: () => {
          this._error.set('Search is unavailable right now. Please try again later.');
          this._loading.set(false);
        },
      });
  }

  setResults(results: CaregiverCard[]): void {
    this._results.set(results);
    this._loading.set(false);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  private toQuery(filters: SearchFilters): string {
    const params = new URLSearchParams();
    if (filters.query) {
      params.set('q', filters.query);
    }
    if (filters.roles.length > 0) {
      params.set('roles', filters.roles.join(','));
    }
    if (filters.maxDistanceKm !== null) {
      params.set('maxDistance', String(filters.maxDistanceKm));
    }
    if (filters.minRating !== null) {
      params.set('minRating', String(filters.minRating));
    }
    if (filters.availableNowOnly) {
      params.set('availableNow', 'true');
    }
    return params.toString();
  }
}
