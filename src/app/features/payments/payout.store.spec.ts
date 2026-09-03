import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { PayoutStore, PayoutAccount } from './payout.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'post' | 'patch' | 'put' | 'delete', unknown>> = {}) {
  return {
    get: vi.fn(() => of(null)),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    put: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function account(overrides: Partial<PayoutAccount> = {}): PayoutAccount {
  return {
    id: 'pa-1',
    status: 'active',
    accountId: 'acct_seed_1',
    accountLast4: '1234',
    currency: 'EUR',
    balanceCents: 4500,
    country: 'GR',
    payoutSchedule: 'weekly',
    updatedAtMs: 1000,
    onboardingUrl: null,
    ...overrides,
  };
}

describe('PayoutStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the payout account', () => {
    const api = makeApi({ get: vi.fn(() => of(account())) });
    const store = new PayoutStore(api);
    store.load();
    expect(store.account()?.id).toBe('pa-1');
    expect(store.loading()).toBe(false);
  });

  it('computes status from the loaded account', () => {
    const api = makeApi({ get: vi.fn(() => of(account({ status: 'pending', onboardingUrl: 'https://connect.stripe.com/demo' }))) });
    const store = new PayoutStore(api);
    store.load();
    expect(store.status()).toBe('pending');
    expect(store.account()?.onboardingUrl).toBe('https://connect.stripe.com/demo');
  });

  it('defaults to not_started when no account is loaded', () => {
    const api = makeApi();
    const store = new PayoutStore(api);
    expect(store.status()).toBe('not_started');
    expect(store.balanceCents()).toBe(0);
  });

  it('computes balance from the loaded account', () => {
    const api = makeApi({ get: vi.fn(() => of(account({ balanceCents: 12500 }))) });
    const store = new PayoutStore(api);
    store.load();
    expect(store.balanceCents()).toBe(12500);
  });

  it('saves a payout-account patch', async () => {
    const api = makeApi({ put: vi.fn(() => of(account({ status: 'pending' }))) });
    const store = new PayoutStore(api);
    const ok = await new Promise<boolean>((resolve) => store.save({ status: 'pending' }).subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/me/payout-account', { status: 'pending' });
    expect(store.status()).toBe('pending');
    expect(store.saved()).toBe(true);
  });

  it('starts onboarding (sets status to pending)', async () => {
    const api = makeApi({
      put: vi.fn(() =>
        of(account({ status: 'pending', accountId: 'acct_new', onboardingUrl: 'https://connect.stripe.com/o/123' }))
      ),
    });
    const store = new PayoutStore(api);
    const ok = await new Promise<boolean>((resolve) => store.startOnboarding().subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/me/payout-account', { status: 'pending' });
    expect(store.status()).toBe('pending');
    expect(store.account()?.onboardingUrl).toBe('https://connect.stripe.com/o/123');
  });

  it('reports save failure with an error message', async () => {
    const api = makeApi({
      put: vi.fn(() => throwError(() => ({ error: { message: 'IBAN validation failed.' } }))),
    });
    const store = new PayoutStore(api);
    const ok = await new Promise<boolean>((resolve) => store.save({ accountLast4: '9999' }).subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.error()).toBe('IBAN validation failed.');
  });

  it('reports load failure with an error message', () => {
    const api = makeApi({
      get: vi.fn(() => throwError(() => ({ status: 500, error: { message: 'Service unavailable.' } }))),
    });
    const store = new PayoutStore(api);
    store.load();
    expect(store.error()).toBe('Service unavailable.');
    expect(store.loading()).toBe(false);
  });

  it('treats 404 on load as no-account (not an error)', () => {
    const api = makeApi({
      get: vi.fn(() => throwError(() => ({ status: 404, error: { message: 'Not found.' } }))),
    });
    const store = new PayoutStore(api);
    store.load();
    expect(store.error()).toBe('');
    expect(store.status()).toBe('not_started');
    expect(store.balanceCents()).toBe(0);
  });
});
