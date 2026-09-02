import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { VettingStore, LicenceSubmission } from './vetting.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of(null)),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function submission(overrides: Partial<LicenceSubmission> = {}): LicenceSubmission {
  return {
    id: 'v-1',
    providerId: 'u-nurse-1',
    providerName: 'Elena Papadaki',
    licenceNumber: 'ΝΟΣ-2024-Α123',
    specialties: ['Injections'],
    submittedAtMs: 1000,
    status: 'pending',
    reviewedAtMs: null,
    reviewedBy: null,
    note: '',
    ...overrides,
  };
}

describe('VettingStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads my submission', () => {
    const api = makeApi({ get: vi.fn(() => of(submission())) });
    const store = new VettingStore(api);
    store.loadMine();
    expect(store.mine()).toEqual(submission());
    expect(store.isPending()).toBe(true);
  });

  it('loadMine leaves mine null when there is no submission', () => {
    const api = makeApi({ get: vi.fn(() => of(null)) });
    const store = new VettingStore(api);
    store.loadMine();
    expect(store.mine()).toBeNull();
  });

  it('submit stores the returned submission', async () => {
    const api = makeApi({ post: vi.fn(() => of(submission({ status: 'pending' }))) });
    const store = new VettingStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.submit({ licenceNumber: 'ΝΟΣ-2024-Α123', specialties: ['Injections'], note: '' }).subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(store.isPending()).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/vetting/submissions', {
      licenceNumber: 'ΝΟΣ-2024-Α123',
      specialties: ['Injections'],
      note: '',
    });
  });

  it('submit reports failure and keeps state', async () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('nope'))) });
    const store = new VettingStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.submit({ licenceNumber: 'X', specialties: ['Elderly care'], note: '' }).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.mine()).toBeNull();
    expect(store.error()).toContain('Could not submit');
  });

  it('loads the admin review queue', () => {
    const api = makeApi({ get: vi.fn(() => of([submission(), submission({ id: 'v-2', status: 'approved' })])) });
    const store = new VettingStore(api);
    store.loadQueue();
    expect(store.queue()).toHaveLength(2);
  });

  it('review updates the submission in the queue', async () => {
    const api = makeApi({
      get: vi.fn(() => of([submission()])),
      post: vi.fn(() =>
        of(submission({ status: 'approved', reviewedAtMs: 2000, reviewedBy: 'u-admin' }))
      ),
    });
    const store = new VettingStore(api);
    store.loadQueue();
    const ok = await new Promise<boolean>((resolve) =>
      store.review('v-1', 'approved').subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(store.queue()[0].status).toBe('approved');
    expect(api.post).toHaveBeenCalledWith('/vetting/submissions/v-1/review', {
      decision: 'approved',
      note: '',
    });
  });

  it('review with a note passes it to the API', async () => {
    const api = makeApi({
      get: vi.fn(() => of([submission()])),
      post: vi.fn(() => of(submission({ status: 'rejected', note: 'Unreadable scan' }))),
    });
    const store = new VettingStore(api);
    store.loadQueue();
    await new Promise<void>((resolve) =>
      store.review('v-1', 'rejected', 'Unreadable scan').subscribe(() => resolve())
    );
    expect(api.post).toHaveBeenCalledWith('/vetting/submissions/v-1/review', {
      decision: 'rejected',
      note: 'Unreadable scan',
    });
  });
});
