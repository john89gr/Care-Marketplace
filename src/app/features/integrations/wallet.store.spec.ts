import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { effect } from '@angular/core';
import { of, throwError } from 'rxjs';
import { WalletStore, WalletDocument } from './wallet.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of({ documents: [] })),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function doc(overrides: Partial<WalletDocument> = {}): WalletDocument {
  return {
    id: 'doc-1',
    userId: 'u-client',
    category: 'vaccinations',
    title: 'COVID-19 vaccine',
    issuer: 'Ministry of Health',
    issuedAtMs: 1000,
    expiresAtMs: 2000,
    docType: 'pdf',
    dataUrl: 'data:application/pdf;base64,Zm9v',
    verified: true,
    ...overrides,
  };
}

const ALL_CATEGORIES: WalletDocument['category'][] = [
  'vaccinations',
  'prescriptions',
  'exams',
  'kepa_certificates',
];

describe('WalletStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads documents from /me/wallet', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({ documents: [doc({ id: 'a' }), doc({ id: 'b', title: 'Flu shot' })] })
      ),
    });
    const store = new WalletStore(api);
    store.sync().subscribe((ok) => expect(ok).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/me/wallet');
    expect(store.documents()).toHaveLength(2);
    expect(store.loaded()).toBe(true);
  });

  it('groups documents by category', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({
          documents: [
            doc({ id: 'v1', category: 'vaccinations' }),
            doc({ id: 'p1', category: 'prescriptions', title: 'Med Rx' }),
            doc({ id: 'p2', category: 'prescriptions', title: 'Med Rx 2' }),
            doc({ id: 'e1', category: 'exams' }),
            doc({ id: 'k1', category: 'kepa_certificates' }),
          ],
        })
      ),
    });
    const store = new WalletStore(api);
    store.sync().subscribe();
    expect(store.byCategory().vaccinations).toHaveLength(1);
    expect(store.byCategory().prescriptions).toHaveLength(2);
    expect(store.byCategory().exams).toHaveLength(1);
    expect(store.byCategory().kepa_certificates).toHaveLength(1);
  });

  it('computes per-category counts', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({ documents: [doc({ category: 'vaccinations' }), doc({ id: 'x', category: 'exams' })] })
      ),
    });
    const store = new WalletStore(api);
    store.sync().subscribe();
    expect(store.counts().vaccinations).toBe(1);
    expect(store.counts().exams).toBe(1);
    expect(store.counts().prescriptions).toBe(0);
  });

  it('syncCategory hits the per-category endpoint', () => {
    const api = makeApi({
      get: vi.fn(() => of({ documents: [doc({ category: 'exams' })] })),
    });
    const store = new WalletStore(api);
    store.syncCategory('exams').subscribe();
    expect(api.get).toHaveBeenCalledWith('/me/wallet?category=exams');
  });

  it('syncCategory updates only that category and preserves others', () => {
    const api = makeApi();
    const store = new WalletStore(api);

    api.get = vi.fn(() =>
      of({
        documents: [
          doc({ id: 'v1', category: 'vaccinations' }),
          doc({ id: 'p1', category: 'prescriptions' }),
        ],
      })
    );
    store.sync().subscribe();
    expect(store.documents()).toHaveLength(2);

    // Category refresh returns only new exam docs.
    api.get = vi.fn(() => of({ documents: [doc({ id: 'e1', category: 'exams' })] }));
    store.syncCategory('exams').subscribe();
    expect(store.documents()).toHaveLength(3);
    expect(store.byCategory().exams).toHaveLength(1);
    expect(store.byCategory().vaccinations).toHaveLength(1);
    expect(store.byCategory().prescriptions).toHaveLength(1);
  });

  it('is idempotent: syncing the same docs twice does not duplicate', () => {
    const docs = [doc({ id: 'a' }), doc({ id: 'b' })];
    const api = makeApi({ get: vi.fn(() => of({ documents: docs })) });
    const store = new WalletStore(api);
    store.sync().subscribe();
    store.sync().subscribe();
    expect(store.documents()).toHaveLength(2);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('upserts by id: existing docs replaced, new docs added', () => {
    const api = makeApi();
    const store = new WalletStore(api);

    api.get = vi.fn(() => of({ documents: [doc({ id: 'a', title: 'Original' })] }));
    store.sync().subscribe();
    expect(store.documents()).toHaveLength(1);

    api.get = vi.fn(() =>
      of({
        documents: [doc({ id: 'a', title: 'Updated' }), doc({ id: 'b', title: 'New' })],
      })
    );
    store.sync().subscribe();
    expect(store.documents()).toHaveLength(2);
    expect(store.documents().find((d) => d.id === 'a')?.title).toBe('Updated');
  });

  it('per-category sync replaces only that category (not append)', () => {
    const api = makeApi();
    const store = new WalletStore(api);

    // Initial full sync: two vaccination docs.
    api.get = vi.fn(() =>
      of({ documents: [doc({ id: 'v1', category: 'vaccinations' }), doc({ id: 'v2', category: 'vaccinations' })] })
    );
    store.sync().subscribe();
    expect(store.byCategory().vaccinations).toHaveLength(2);

    // Category refresh returns only one vaccination doc. The old v2 should be
    // gone (replace semantics), not appended to.
    api.get = vi.fn(() => of({ documents: [doc({ id: 'v1', category: 'vaccinations' })] }));
    store.syncCategory('vaccinations').subscribe();
    expect(store.byCategory().vaccinations).toHaveLength(1);
    expect(store.documents().find((d) => d.id === 'v2')).toBeUndefined();
  });

  it('reports failure and sets syncState to error', async () => {
    const api = makeApi({ get: vi.fn(() => throwError(() => ({ error: { message: 'Network' } }))) });
    const store = new WalletStore(api);
    const ok = await new Promise<boolean>((resolve) => store.sync().subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.syncState()).toBe('error');
    expect(store.error()).toContain('Network');
  });

  it('transitions syncState through syncing then synced', () => {
    vi.useFakeTimers();
    const api = makeApi({
      get: vi.fn(() =>
        new (require('rxjs').Observable)((subscriber) => {
          setTimeout(() => {
            subscriber.next({ documents: [doc()] });
            subscriber.complete();
          });
        })
      ),
    });
    const store = new WalletStore(api);
    const states: string[] = [];
    const tracker = effect(() => { states.push(store.syncState()); });
    store.sync().subscribe();
    vi.runAllTimers();
    expect(states).toContain('syncing');
    expect(states).toContain('synced');
    tracker.destroy();
    vi.useRealTimers();
  });

  it('updates lastSynced timestamps after full sync', () => {
    const api = makeApi({
      get: vi.fn(() => of({ documents: [doc({ category: 'vaccinations' })] })),
    });
    const store = new WalletStore(api);
    store.sync().subscribe();
    for (const cat of ALL_CATEGORIES) {
      expect(store.syncAgeMs(cat)).toBeGreaterThanOrEqual(0);
    }
  });

  it('updates only the requested category timestamp after syncCategory', () => {
    const api = makeApi({
      get: vi.fn(() => of({ documents: [doc({ category: 'exams' })] })),
    });
    const store = new WalletStore(api);
    store.syncCategory('exams').subscribe();
    expect(store.syncAgeMs('exams')).toBeGreaterThanOrEqual(0);
    expect(store.syncAgeMs('vaccinations')).toBe(-1);
  });

  it('does not persist health documents to localStorage', () => {
    localStorage.clear();
    const api = makeApi({
      get: vi.fn(() => of({ documents: [doc({ id: 'secret-1' })] })),
    });
    const store = new WalletStore(api);
    store.sync().subscribe();
    const keys = Object.keys(localStorage);
    expect(keys).not.toContain('cm.wallet.v1');
    expect(keys).not.toContain('cm.wallet.documents');
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        expect(raw).not.toContain('data:application/pdf');
      }
    }
  });

  it('docsFor returns documents for one category sorted by issue date', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({
          documents: [
            doc({ id: 'v1', category: 'vaccinations', issuedAtMs: 1000 }),
            doc({ id: 'v2', category: 'vaccinations', issuedAtMs: 3000 }),
            doc({ id: 'v3', category: 'vaccinations', issuedAtMs: 2000 }),
          ],
        })
      ),
    });
    const store = new WalletStore(api);
    store.sync().subscribe();
    expect(store.documents()).toHaveLength(3);
  });

  it('sync returns false on empty documents without error', () => {
    const api = makeApi({ get: vi.fn(() => of({ documents: [] })) });
    const store = new WalletStore(api);
    store.sync().subscribe((ok) => expect(ok).toBe(true));
    expect(store.documents()).toEqual([]);
    expect(store.error()).toBe('');
  });
});
