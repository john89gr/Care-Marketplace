import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { EscrowStore, EscrowTransaction } from './escrow.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function tx(overrides: Partial<EscrowTransaction> = {}): EscrowTransaction {
  return {
    id: 'e-1',
    bookingId: 'b-1',
    providerId: 'u-nurse',
    clientId: 'u-client',
    amountCents: 4500,
    status: 'held',
    createdAtMs: 1000,
    settledAtMs: null,
    ...overrides,
  };
}

describe('EscrowStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads transactions', () => {
    const api = makeApi({ get: vi.fn(() => of([tx(), tx({ id: 'e-2', status: 'released' })])) });
    const store = new EscrowStore(api);
    store.load();
    expect(store.transactions()).toHaveLength(2);
  });

  it('holds funds when a booking is created', async () => {
    const api = makeApi({ post: vi.fn(() => of(tx())) });
    const store = new EscrowStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.hold({ bookingId: 'b-1', providerId: 'u-nurse', amountCents: 4500 }).subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/payments/escrow', {
      bookingId: 'b-1',
      providerId: 'u-nurse',
      amountCents: 4500,
    });
    expect(store.transactions()[0].status).toBe('held');
  });

  it('releases a held transaction', async () => {
    const api = makeApi({
      get: vi.fn(() => of([tx()])),
      post: vi.fn(() => of(tx({ status: 'released', settledAtMs: 2000 }))),
    });
    const store = new EscrowStore(api);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.release('e-1').subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/payments/escrow/e-1/release', {});
    expect(store.transactions()[0].status).toBe('released');
  });

  it('refunds a held transaction', async () => {
    const api = makeApi({
      get: vi.fn(() => of([tx()])),
      post: vi.fn(() => of(tx({ status: 'refunded', settledAtMs: 2000 }))),
    });
    const store = new EscrowStore(api);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.refund('e-1').subscribe(resolve));
    expect(ok).toBe(true);
    expect(store.transactions()[0].status).toBe('refunded');
  });

  it('computes the held balance', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of([
          tx({ id: 'e-1', amountCents: 1000 }),
          tx({ id: 'e-2', amountCents: 2500 }),
          tx({ id: 'e-3', amountCents: 5000, status: 'released' }),
        ])
      ),
    });
    const store = new EscrowStore(api);
    store.load();
    expect(store.heldTotalCents()).toBe(3500);
  });

  it('reports failure with an error message', async () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('nope'))) });
    const store = new EscrowStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.hold({ bookingId: 'b-1', providerId: 'u-nurse', amountCents: 100 }).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('escrow');
  });
});
