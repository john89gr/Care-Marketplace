import { Injectable, inject, signal, computed, InjectionToken } from '@angular/core';
import { Role } from '../../core/auth/roles';
import { ApiClient } from '../../core/api/api.client';
import {
  matchCandidatesWithScores,
  MatchQuery,
  MatchingWeights,
  MATCHING_WEIGHTS,
  DEFAULT_WEIGHTS,
  SortOption,
  ScoreBreakdown,
  distanceOf,
} from './matching';
import { AnalyticsService } from '../../core/services/analytics.service';
import { GeoPoint } from '../../core/services/geo/geolocation.service';

/**
 * Marketplace search state (Phase 1, PLAN.md §5). search() fetches candidate
 * cards from the backend and runs the v2 matching engine (weighted scoring:
 * geo + availability + rating + price + speciality + history) before
 * exposing results with per-card score breakdowns.
 */
export interface CaregiverCard {
  id: string;
  displayName: string;
  roles: Role[];
  rating: number;
  /** Published review count (backend-computed; optional for older payloads). */
  reviewCount?: number;
  distanceKm: number;
  hourlyRate: number;
  availableNow: boolean;
  /** Speciality tags for speciality matching (v2). */
  specialties?: string[];
  /** Real coordinates for haversine distance when the user shares location. */
  lat?: number;
  lng?: number;
  /** Completed-visit history (v2 history boost; feature 3 data). */
  completedVisits?: number;
  /** Recent cancellations (v2 penalty). */
  recentCancellations?: number;
}

export type SearchSort = SortOption;

export interface SearchFilters {
  query: string;
  roles: Role[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
  /** Result ordering (v2). */
  sort: SearchSort;
  /** Budget filter (v2 price fit). */
  maxHourlyRate: number | null;
  /** Session-scoped UI toggle: show only favorited caregivers. */
  favoritesOnly?: boolean;
}

const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  roles: [],
  maxDistanceKm: null,
  minRating: null,
  availableNowOnly: false,
  sort: 'relevance',
  maxHourlyRate: null,
};

@Injectable({ providedIn: 'root' })
export class MarketplaceStore {
  private readonly api = inject(ApiClient);
  private readonly analytics = inject(AnalyticsService);
  /** Weights are injectable for tuning (FEATURE_PLAN.md §5 subtask 5). */
  private readonly weights: MatchingWeights = inject(MATCHING_WEIGHTS, { optional: true }) ?? DEFAULT_WEIGHTS;
  private readonly _filters = signal<SearchFilters>(DEFAULT_FILTERS);
  private readonly _results = signal<CaregiverCard[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal('');

  readonly filters = this._filters.asReadonly();
  readonly results = this._results.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly hasResults = computed(() => this._results().length > 0);

  /** Per-card score breakdowns aligned with results() (explainable results). */
  private readonly _breakdowns = signal<Record<string, ScoreBreakdown>>({});
  readonly breakdowns = this._breakdowns.asReadonly();
  /** Optional real user position (v2 real geo). */
  private readonly _origin = signal<GeoPoint | null>(null);
  readonly origin = this._origin.asReadonly();

  setOrigin(origin: GeoPoint | null): void {
    this._origin.set(origin);
  }

  setFilters(patch: Partial<SearchFilters>): void {
    this._filters.update((current) => ({ ...current, ...patch }));
  }

  resetFilters(): void {
    this._filters.set(DEFAULT_FILTERS);
  }

  /** Fetch candidates and run the v2 matching engine. */
  search(): void {
    const filters = this._filters();
    this._loading.set(true);
    this._error.set('');
    this.analytics.track('search_run', {
      query: filters.query,
      roles: filters.roles.join(','),
      maxDistanceKm: filters.maxDistanceKm,
      minRating: filters.minRating,
      availableNowOnly: filters.availableNowOnly,
      sort: filters.sort,
      maxHourlyRate: filters.maxHourlyRate,
      favoritesOnly: filters.favoritesOnly ?? false,
      hasGeo: this._origin() !== null,
    });
    this.api
      .get<CaregiverCard[]>(`/caregivers/search?${this.toQuery(filters)}`)
      .subscribe({
        next: (candidates) => {
          this._results.set(this.applyClientFilters(candidates, filters));
          this._loading.set(false);
        },
        error: () => {
          this._error.set('Search is unavailable right now. Please try again later.');
          this._loading.set(false);
        },
      });
  }

  /** Matching engine + session-scoped favorites filter. */
  private applyClientFilters(
    candidates: CaregiverCard[],
    filters: SearchFilters
  ): CaregiverCard[] {
    const query: MatchQuery = {
      ...filters,
      sort: filters.sort,
      maxHourlyRate: filters.maxHourlyRate,
      origin: this._origin(),
    };
    const scored = matchCandidatesWithScores(candidates, query, this.weights);
    this._breakdowns.set(
      Object.fromEntries(scored.map((entry) => [entry.card.id, entry.breakdown]))
    );
    // Reflect haversine-computed distances onto the cards for display.
    const withDistance = scored.map((entry) => ({
      ...entry.card,
      distanceKm: entry.distanceKm,
    }));
    if (!filters.favoritesOnly) {
      return withDistance;
    }
    const ids = this._favoriteIds();
    return withDistance.filter((card) => ids.has(card.id));
  }

  /**
   * Favorite ids injected at page level (avoids a store cycle with
   * SavedSearchStore); applied as a client-side filter when favoritesOnly.
   */
  private readonly _favoriteIds = signal<Set<string>>(new Set());

  setFavoriteIds(ids: Set<string>): void {
    this._favoriteIds.set(ids);
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
    if (filters.sort && filters.sort !== 'relevance') {
      params.set('sort', filters.sort);
    }
    if (filters.maxHourlyRate !== null) {
      params.set('maxRate', String(filters.maxHourlyRate));
    }
    return params.toString();
  }
}
