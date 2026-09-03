import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { SavedSearchStore, autoSearchName } from './saved-search.store';
import { encodeFilters, parseFilters, isDefaultFilters } from './search-params';
import { SearchFilters } from './marketplace.store';
import { ApiClient } from '../../core/api/api.client';

const FILTERS: SearchFilters = {
  query: 'nurse',
  roles: ['nurse'],
  maxDistanceKm: 10,
  minRating: 4,
  availableNowOnly: true,
  sort: 'relevance',
  maxHourlyRate: null,
};

function makeApi(overrides: Partial<Record<'get' | 'post' | 'patch' | 'delete', unknown>> = {}) {
  return {
    get: vi.fn(() => of({ savedSearches: [], favorites: [] })),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function saved(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ss-1',
    name: 'Nurses near me',
    filters: { ...FILTERS },
    createdAtMs: 1000,
    ...overrides,
  };
}

describe('search-params encode/parse round-trip', () => {
  it('round-trips full filters losslessly', () => {
    const encoded = encodeFilters(FILTERS);
    const parsed = parseFilters(encoded);
    expect(parsed).toEqual({ ...FILTERS, favoritesOnly: false });
  });

  it('round-trips empty filters', () => {
    const empty: SearchFilters = {
      query: '',
      roles: [],
      maxDistanceKm: null,
      minRating: null,
      availableNowOnly: false,
      sort: 'relevance',
      maxHourlyRate: null,
    };
    expect(encodeFilters(empty)).toEqual({});
    expect(parseFilters({})).toEqual({ ...empty, favoritesOnly: false });
  });

  it('round-trips sort and budget (v2) losslessly', () => {
    const parsed = parseFilters(encodeFilters({ ...FILTERS, sort: 'price', maxHourlyRate: 25 }));
    expect(parsed.sort).toBe('price');
    expect(parsed.maxHourlyRate).toBe(25);
  });

  it('falls back to relevance on an unknown sort value', () => {
    expect(parseFilters({ sort: 'shiniest' }).sort).toBe('relevance');
  });

  it('round-trips partial filters (no query, no roles)', () => {
    const partial: SearchFilters = {
      query: '',
      roles: [],
      maxDistanceKm: null,
      minRating: 4.5,
      availableNowOnly: false,
    };
    const parsed = parseFilters(encodeFilters(partial));
    expect(parsed.minRating).toBe(4.5);
    expect(parsed.query).toBe('');
    expect(parsed.roles).toEqual([]);
  });

  it('parses roles and drops unknown role values', () => {
    const parsed = parseFilters({ roles: 'nurse,physio,hacker' });
    expect(parsed.roles).toEqual(['nurse', 'physio']);
  });

  it('falls back to defaults on garbage numbers/bools', () => {
    const parsed = parseFilters({
      maxDistance: 'abc',
      minRating: '4.5',
      availableNow: '1',
      favoritesOnly: 'true',
    });
    expect(parsed.maxDistanceKm).toBeNull();
    expect(parsed.minRating).toBe(4.5);
    expect(parsed.availableNowOnly).toBe(true);
    expect(parsed.favoritesOnly).toBe(true);
  });

  it('isDefaultFilters detects defaults (used to keep URL clean)', () => {
    expect(isDefaultFilters({ ...FILTERS, query: '', roles: [], maxDistanceKm: null, minRating: null, availableNowOnly: false })).toBe(true);
    expect(isDefaultFilters(FILTERS)).toBe(false);
  });

  it('parseFilters accepts URLSearchParams too', () => {
    const params = new URLSearchParams('q=elena&minRating=4');
    const parsed = parseFilters(params);
    expect(parsed.query).toBe('elena');
    expect(parsed.minRating).toBe(4);
  });
});

describe('autoSearchName', () => {
  it('builds a name from all filter parts', () => {
    expect(autoSearchName(FILTERS)).toBe('“nurse” · nurse · ≤ 10 km · ★ 4+ · available now');
  });

  it('falls back to a default name for empty filters', () => {
    expect(
      autoSearchName({
        query: '',
        roles: [],
        maxDistanceKm: null,
        minRating: null,
        availableNowOnly: false,
      })
    ).toBe('All caregivers');
  });
});

describe('SavedSearchStore — saved searches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads both collections in one call', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({ savedSearches: [saved()], favorites: [{ caregiverId: 'cg-1', savedAtMs: 1 }] })
      ),
    });
    const store = new SavedSearchStore(api);
    store.load();
    expect(store.savedSearches()).toHaveLength(1);
    expect(store.favoriteIds().has('cg-1')).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/me/saved-searches');
  });

  it('save → apply → delete round-trip', async () => {
    const api = makeApi({
      post: vi.fn(() => of(saved())),
      delete: vi.fn(() => of({ ok: true })),
    });
    const store = new SavedSearchStore(api);

    const okSave = await new Promise<boolean>((resolve) =>
      store.save('Nurses near me', FILTERS).subscribe(resolve)
    );
    expect(okSave).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/me/saved-searches', {
      name: 'Nurses near me',
      filters: FILTERS,
    });
    expect(store.savedSearches()).toHaveLength(1);

    // "Apply" is pure store state: filters go back to the marketplace store.
    const applied = store.savedSearches()[0].filters;
    expect(applied).toEqual(FILTERS);

    const okDelete = await new Promise<boolean>((resolve) =>
      store.remove('ss-1').subscribe(resolve)
    );
    expect(okDelete).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/me/saved-searches/ss-1');
    expect(store.savedSearches()).toHaveLength(0);
  });

  it('auto-names a saved search when the name is blank', async () => {
    const api = makeApi({ post: vi.fn(() => of(saved({ name: 'All caregivers' }))) });
    const store = new SavedSearchStore(api);
    await new Promise<boolean>((resolve) =>
      store.save('   ', { ...FILTERS, query: '', roles: [], maxDistanceKm: null, minRating: null, availableNowOnly: false }).subscribe(resolve)
    );
    expect(api.post).toHaveBeenCalledWith(
      '/me/saved-searches',
      expect.objectContaining({ name: 'All caregivers' })
    );
  });

  it('renames a saved search', async () => {
    const api = makeApi({
      get: vi.fn(() => of({ savedSearches: [saved()], favorites: [] })),
      patch: vi.fn(() => of(saved({ name: 'Renamed' }))),
    });
    const store = new SavedSearchStore(api);
    store.load();
    const ok = await new Promise<boolean>((resolve) =>
      store.rename('ss-1', 'Renamed').subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/me/saved-searches/ss-1', { name: 'Renamed' });
    expect(store.savedSearches()[0].name).toBe('Renamed');
  });

  it('reports save errors', async () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('boom'))) });
    const store = new SavedSearchStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.save('X', FILTERS).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('Could not save');
  });
});

describe('SavedSearchStore — favorites (optimistic)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles favorite on optimistically and confirms', async () => {
    const api = makeApi({ post: vi.fn(() => of({ ok: true })) });
    const store = new SavedSearchStore(api);

    let observedDuringFlight: boolean | null = null;
    const promise = new Promise<boolean>((resolve) =>
      store.toggleFavorite('cg-1').subscribe((ok) => {
        observedDuringFlight = store.isFavorite('cg-1');
        resolve(ok);
      })
    );
    // Optimistic flip happened before the response arrived.
    expect(store.isFavorite('cg-1')).toBe(true);
    const ok = await promise;
    expect(ok).toBe(true);
    expect(observedDuringFlight).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/me/favorites', { caregiverId: 'cg-1' });
  });

  it('rolls back the optimistic add when the API fails', async () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('boom'))) });
    const store = new SavedSearchStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.toggleFavorite('cg-1').subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.isFavorite('cg-1')).toBe(false);
    expect(store.error()).toContain('Could not update favorites');
  });

  it('rolls back the optimistic remove when the API fails', async () => {
    const api = makeApi({
      get: vi.fn(() => of({ savedSearches: [], favorites: [{ caregiverId: 'cg-1', savedAtMs: 1 }] })),
      delete: vi.fn(() => throwError(() => new Error('boom'))),
    });
    const store = new SavedSearchStore(api);
    store.load();
    expect(store.isFavorite('cg-1')).toBe(true);

    const ok = await new Promise<boolean>((resolve) =>
      store.toggleFavorite('cg-1').subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.isFavorite('cg-1')).toBe(true);
  });

  it('toggles favorite off via DELETE', async () => {
    const api = makeApi({
      get: vi.fn(() => of({ savedSearches: [], favorites: [{ caregiverId: 'cg-1', savedAtMs: 1 }] })),
      delete: vi.fn(() => of({ ok: true })),
    });
    const store = new SavedSearchStore(api);
    store.load();
    await new Promise<boolean>((resolve) => store.toggleFavorite('cg-1').subscribe(resolve));
    expect(api.delete).toHaveBeenCalledWith('/me/favorites/cg-1');
    expect(store.isFavorite('cg-1')).toBe(false);
  });
});
