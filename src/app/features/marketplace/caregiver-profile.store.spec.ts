import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { CaregiverProfile, CaregiverProfileStore } from './caregiver-profile.store';
import { ApiClient } from '../../core/api/api.client';

/** An ApiClient whose `get` returns the given observable for each call, in order. */
function makeApi(...results: unknown[]) {
  const get = vi.fn();
  for (const result of results) {
    get.mockReturnValueOnce(result);
  }
  return { get } as unknown as ApiClient;
}

function profile(overrides: Partial<CaregiverProfile> = {}): CaregiverProfile {
  return {
    id: 'cg-1',
    displayName: 'Elena Papadaki',
    roles: ['nurse'],
    rating: 4.8,
    reviewCount: 4,
    distanceKm: 3,
    hourlyRate: 25,
    availableNow: true,
    ...overrides,
  };
}

describe('CaregiverProfileStore', () => {
  it('loads a provider profile by id and clears the loading flag', () => {
    const store = new CaregiverProfileStore(makeApi(of(profile())));

    store.load('cg-1');

    expect(store.profile()?.displayName).toBe('Elena Papadaki');
    expect(store.profile()?.services).toBeUndefined();
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe('');
  });

  it('requests the provider by id', () => {
    const api = makeApi(of(profile()));
    new CaregiverProfileStore(api).load('cg-1');
    expect(api.get).toHaveBeenCalledWith('/caregivers/cg-1');
  });

  it('encodes the id in the request path', () => {
    const api = makeApi(of(profile({ id: 'cg 1/2' })));
    new CaregiverProfileStore(api).load('cg 1/2');
    expect(api.get).toHaveBeenCalledWith('/caregivers/cg%201%2F2');
  });

  it('drops the previous provider while the next one is still loading', () => {
    const pending = new Subject<CaregiverProfile>();
    const store = new CaregiverProfileStore(makeApi(of(profile({ id: 'cg-1' })), pending));

    store.load('cg-1');
    expect(store.profile()?.id).toBe('cg-1');

    store.load('cg-2');
    expect(store.profile()).toBeNull();
    expect(store.loading()).toBe(true);
  });

  it('reports a missing provider as not-found', () => {
    const store = new CaregiverProfileStore(makeApi(throwError(() => ({ status: 404 }))));

    store.load('cg-404');

    expect(store.profile()).toBeNull();
    expect(store.loading()).toBe(false);
    expect(store.error()).toContain('could not be found');
  });

  it('reports any other failure as a load error', () => {
    const store = new CaregiverProfileStore(makeApi(throwError(() => ({ status: 500 }))));

    store.load('cg-1');

    expect(store.error()).toContain('Could not load this provider');
  });

  it('clears a previous error on the next successful load', () => {
    const store = new CaregiverProfileStore(
      makeApi(throwError(() => ({ status: 500 })), of(profile()))
    );

    store.load('cg-1');
    expect(store.error()).not.toBe('');

    store.load('cg-1');
    expect(store.error()).toBe('');
    expect(store.profile()?.id).toBe('cg-1');
  });
});
