import { SearchFilters, SearchSort } from './marketplace.store';
import { Role, isRole } from '../../core/auth/roles';

/**
 * Lossless filters ↔ URL query-param encoding (FEATURE_PLAN.md §2 subtasks
 * 12–13): every filter has a canonical param name, and parsing validates the
 * shape (unknown params ignored, bad values fall back to defaults) so a
 * hand-edited URL can never poison the search state.
 */

export const FILTER_PARAMS = {
  q: 'q',
  roles: 'roles',
  maxDistance: 'maxDistance',
  minRating: 'minRating',
  availableNow: 'availableNow',
  sort: 'sort',
  maxRate: 'maxRate',
} as const;

const VALID_SORTS: readonly string[] = ['relevance', 'distance', 'rating', 'price'];

export interface FiltersWithFavorites extends SearchFilters {
  favoritesOnly: boolean;
}

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBool(value: string | null): boolean {
  return value === 'true' || value === '1';
}

/** Encode filters (minus favorites, which is a UI-scoped toggle) to params. */
export function encodeFilters(filters: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.query) {
    params[FILTER_PARAMS.q] = filters.query;
  }
  if (filters.roles.length > 0) {
    params[FILTER_PARAMS.roles] = filters.roles.join(',');
  }
  if (filters.maxDistanceKm !== null) {
    params[FILTER_PARAMS.maxDistance] = String(filters.maxDistanceKm);
  }
  if (filters.minRating !== null) {
    params[FILTER_PARAMS.minRating] = String(filters.minRating);
  }
  if (filters.availableNowOnly) {
    params[FILTER_PARAMS.availableNow] = 'true';
  }
  if (filters.sort && filters.sort !== 'relevance') {
    params[FILTER_PARAMS.sort] = filters.sort;
  }
  if (filters.maxHourlyRate !== null) {
    params[FILTER_PARAMS.maxRate] = String(filters.maxHourlyRate);
  }
  return params;
}

/**
 * Parse params into filters. `favoritesOnly` is read from the URL too, but
 * never persisted into saved searches (it is session-scoped UI state).
 */
export function parseFilters(
  params: Record<string, string | null> | URLSearchParams
): FiltersWithFavorites {
  const get = (key: string): string | null =>
    params instanceof URLSearchParams ? params.get(key) : (params[key] ?? null);

  const rolesRaw = get(FILTER_PARAMS.roles);
  const roles = (rolesRaw ? rolesRaw.split(',') : []).filter(isRole);

  const favoritesRaw = get('favoritesOnly');
  const sortRaw = get(FILTER_PARAMS.sort);
  const sort: SearchSort =
    sortRaw && VALID_SORTS.includes(sortRaw) ? (sortRaw as SearchSort) : 'relevance';
  return {
    query: get(FILTER_PARAMS.q) ?? '',
    roles,
    maxDistanceKm: parseNumber(get(FILTER_PARAMS.maxDistance)),
    minRating: parseNumber(get(FILTER_PARAMS.minRating)),
    availableNowOnly: parseBool(get(FILTER_PARAMS.availableNow)),
    sort,
    maxHourlyRate: parseNumber(get(FILTER_PARAMS.maxRate)),
    favoritesOnly: parseBool(favoritesRaw),
  };
}

/** True when nothing is set — used to keep the URL clean for default searches. */
export function isDefaultFilters(filters: SearchFilters): boolean {
  return (
    filters.query === '' &&
    filters.roles.length === 0 &&
    filters.maxDistanceKm === null &&
    filters.minRating === null &&
    filters.availableNowOnly === false &&
    (filters.sort ?? 'relevance') === 'relevance' &&
    filters.maxHourlyRate === null
  );
}
