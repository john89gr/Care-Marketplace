import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SearchFilters } from './marketplace.store';

/**
 * Saved searches & favorite caregivers (FEATURE_PLAN.md §2). A saved search
 * is a named snapshot of the search filters; a favorite is a bookmarked
 * caregiver. Both live under `/me/*` and are per-user.
 *
 * Favorites toggle optimistically: the local state flips immediately and
 * rolls back if the API call fails, so the heart never feels laggy.
 */

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAtMs: number;
}

export interface FavoriteCaregiver {
  caregiverId: string;
  savedAtMs: number;
}

/** Human-readable name from the active filters (save-time auto-naming). */
export function autoSearchName(filters: SearchFilters): string {
  const parts: string[] = [];
  if (filters.query) {
    parts.push(`“${filters.query}”`);
  }
  if (filters.roles.length > 0) {
    parts.push(filters.roles.join(', '));
  }
  if (filters.maxDistanceKm !== null) {
    parts.push(`≤ ${filters.maxDistanceKm} km`);
  }
  if (filters.minRating !== null) {
    parts.push(`★ ${filters.minRating}+`);
  }
  if (filters.availableNowOnly) {
    parts.push('available now');
  }
  if (parts.length === 0) {
    return 'All caregivers';
  }
  return parts.join(' · ');
}

@Injectable({ providedIn: 'root' })
export class SavedSearchStore {
  // Default-parameter injection keeps `new SavedSearchStore(api)` possible
  // in unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _savedSearches = signal<SavedSearch[]>([]);
  private readonly _favorites = signal<FavoriteCaregiver[]>([]);
  private readonly _loading = signal(false);
  private readonly _togglingId = signal<string | null>(null);
  private readonly _error = signal('');

  readonly savedSearches = this._savedSearches.asReadonly();
  readonly favorites = this._favorites.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly togglingId = this._togglingId.asReadonly();
  readonly error = this._error.asReadonly();

  readonly favoriteIds = computed(
    () => new Set(this._favorites().map((f) => f.caregiverId))
  );

  isFavorite(caregiverId: string): boolean {
    return this.favoriteIds().has(caregiverId);
  }

  /** One backend round-trip fetches both collections. */
  load(): void {
    this._loading.set(true);
    this._error.set('');
    this.api
      .get<{ savedSearches: SavedSearch[]; favorites: FavoriteCaregiver[] }>(
        '/me/saved-searches'
      )
      .subscribe({
        next: ({ savedSearches, favorites }) => {
          this._savedSearches.set(savedSearches);
          this._favorites.set(favorites);
          this._loading.set(false);
        },
        error: () => {
          this._error.set('Could not load your saved searches. Please try again.');
          this._loading.set(false);
        },
      });
  }

  /** Persist the current filters as a named search. */
  save(name: string, filters: SearchFilters): Observable<boolean> {
    this._error.set('');
    return this.api
      .post<SavedSearch>('/me/saved-searches', {
        name: name.trim() || autoSearchName(filters),
        filters,
      })
      .pipe(
        map((saved) => {
          this._savedSearches.update((list) => [saved, ...list]);
          return true;
        }),
        catchError(() => {
          this._error.set('Could not save the search. Please try again.');
          return of(false);
        })
      );
  }

  rename(id: string, name: string): Observable<boolean> {
    this._error.set('');
    return this.api
      .patch<SavedSearch>(`/me/saved-searches/${encodeURIComponent(id)}`, { name })
      .pipe(
        map((saved) => {
          this._savedSearches.update((list) =>
            list.map((s) => (s.id === saved.id ? saved : s))
          );
          return true;
        }),
        catchError(() => {
          this._error.set('Could not rename the search. Please try again.');
          return of(false);
        })
      );
  }

  remove(id: string): Observable<boolean> {
    this._error.set('');
    return this.api
      .delete<{ ok: boolean }>(`/me/saved-searches/${encodeURIComponent(id)}`)
      .pipe(
        map(() => {
          this._savedSearches.update((list) => list.filter((s) => s.id !== id));
          return true;
        }),
        catchError(() => {
          this._error.set('Could not delete the search. Please try again.');
          return of(false);
        })
      );
  }

  /**
   * Optimistically toggle a favorite. Local state flips immediately; the
   * API error path rolls it back and surfaces the store error.
   */
  toggleFavorite(caregiverId: string): Observable<boolean> {
    this._error.set('');
    const isFav = this.isFavorite(caregiverId);
    // Optimistic flip.
    if (isFav) {
      this._favorites.update((list) =>
        list.filter((f) => f.caregiverId !== caregiverId)
      );
    } else {
      this._favorites.update((list) => [
        { caregiverId, savedAtMs: Date.now() },
        ...list,
      ]);
    }
    this._togglingId.set(caregiverId);

    const request$: Observable<unknown> = isFav
      ? this.api.delete(`/me/favorites/${encodeURIComponent(caregiverId)}`)
      : this.api.post('/me/favorites', { caregiverId });

    return request$.pipe(
      map(() => {
        this._togglingId.set(null);
        return true;
      }),
      catchError(() => {
        // Roll back the optimistic flip.
        if (isFav) {
          this._favorites.update((list) => [
            { caregiverId, savedAtMs: Date.now() },
            ...list,
          ]);
        } else {
          this._favorites.update((list) =>
            list.filter((f) => f.caregiverId !== caregiverId)
          );
        }
        this._togglingId.set(null);
        this._error.set('Could not update favorites. Please try again.');
        return of(false);
      })
    );
  }
}
