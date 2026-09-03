import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  PaymentMethodsStore,
  PaymentMethod,
  TokenizedCard,
  CardBrand,
} from './payment-methods.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'post' | 'patch' | 'delete', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function pm(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'pm-1',
    token: 'tok_test_1',
    brand: 'visa' as CardBrand,
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2026,
    isDefault: true,
    createdAtMs: 1000,
    ...overrides,
  };
}

function tokenizedCard(overrides: Partial<TokenizedCard> = {}): TokenizedCard {
  return {
    token: 'tok_test_new',
    brand: 'visa' as CardBrand,
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2026,
    ...overrides,
  };
}

describe('PaymentMethodsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads payment methods', () => {
    const api = makeApi({ get: vi.fn(() => of([pm(), pm({ id: 'pm-2', isDefault: false })])) });
    const store = new PaymentMethodsStore(api);
    store.load();
    expect(store.methods()).toHaveLength(2);
  });

  it('tokenizes a valid card and returns the token', async () => {
    const api = makeApi({
      post: vi.fn(() => of(tokenizedCard())),
    });
    const store = new PaymentMethodsStore(api);
    const result = await new Promise<TokenizedCard | null>((resolve) =>
      store
        .tokenize({ cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2026, cvc: '123' })
        .subscribe(resolve)
    );
    expect(result).toEqual(tokenizedCard());
    expect(api.post).toHaveBeenCalledWith('/me/payment-methods/tokenize', {
      cardNumber: '4242424242424242',
      expiryMonth: 12,
      expiryYear: 2026,
      cvc: '123',
    });
    expect(store.tokenizing()).toBe(false);
  });

  it('handles a declined card', async () => {
    const api = makeApi({
      post: vi.fn(() => of({ declined: true })),
    });
    const store = new PaymentMethodsStore(api);
    const result = await new Promise<TokenizedCard | null>((resolve) =>
      store
        .tokenize({ cardNumber: '4001111111111111', expiryMonth: 12, expiryYear: 2026, cvc: '123' })
        .subscribe(resolve)
    );
    expect(result).toBeNull();
    expect(store.error()).toContain('declined');
    expect(store.tokenizing()).toBe(false);
  });

  it('adds a tokenised payment method', async () => {
    const api = makeApi({ post: vi.fn(() => of(pm({ token: 'tok_new', isDefault: false }))) });
    const store = new PaymentMethodsStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store
        .add({
          token: 'tok_new',
          brand: 'mastercard' as CardBrand,
          last4: '5555',
          expiryMonth: 11,
          expiryYear: 2025,
        })
        .subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/me/payment-methods', {
      token: 'tok_new',
      brand: 'mastercard',
      last4: '5555',
      expiryMonth: 11,
      expiryYear: 2025,
    });
    expect(store.methods()[0].token).toBe('tok_new');
  });

  it('does not send a raw PAN to the storage endpoint', async () => {
    const api = makeApi({ post: vi.fn(() => of(pm())) });
    const store = new PaymentMethodsStore(api);
    await new Promise<boolean>((resolve) =>
      store
        .add({
          token: 'tok_new',
          brand: 'visa' as CardBrand,
          last4: '4242',
          expiryMonth: 12,
          expiryYear: 2026,
        })
        .subscribe(resolve)
    );
    expect(api.post).toHaveBeenCalledWith(
      '/me/payment-methods',
      expect.not.objectContaining({ cardNumber: expect.anything() })
    );
  });

  it('sets a payment method as default', async () => {
    const api = makeApi({
      get: vi.fn(() => of([pm({ isDefault: true }), pm({ id: 'pm-2', isDefault: false })])),
      patch: vi.fn(() => of({ ok: true })),
    });
    const store = new PaymentMethodsStore(api);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.setDefault('pm-2').subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/me/payment-methods/pm-2/default', {});
    expect(store.methods().find((m) => m.id === 'pm-2')?.isDefault).toBe(true);
    expect(store.methods().find((m) => m.id === 'pm-1')?.isDefault).toBe(false);
  });

  it('removes a payment method', async () => {
    const api = makeApi({
      get: vi.fn(() => of([pm(), pm({ id: 'pm-2', isDefault: false })])),
      delete: vi.fn(() => of({ ok: true })),
    });
    const store = new PaymentMethodsStore(api);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.remove('pm-2').subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.delete).toHaveBeenCalledWith('/me/payment-methods/pm-2');
    expect(store.methods()).toHaveLength(1);
    expect(store.methods()[0].id).toBe('pm-1');
  });

  it('computes the default method', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of([pm({ isDefault: false }), pm({ id: 'pm-2', isDefault: true })])
      ),
    });
    const store = new PaymentMethodsStore(api);
    store.load();
    expect(store.defaultMethod()?.id).toBe('pm-2');
  });

  it('reports tokenization failure with an error message', async () => {
    const api = makeApi({
      post: vi.fn(() => throwError(() => ({ status: 500, error: { message: 'Network error' } }))),
    });
    const store = new PaymentMethodsStore(api);
    const result = await new Promise<TokenizedCard | null>((resolve) =>
      store
        .tokenize({ cardNumber: '4242424242424242', expiryMonth: 12, expiryYear: 2026, cvc: '123' })
        .subscribe(resolve)
    );
    expect(result).toBeNull();
    expect(store.error()).toBe('Network error');
  });

  it('reports add failure with an error message', async () => {
    const api = makeApi({
      post: vi.fn(() => throwError(() => ({ error: { message: 'Card already exists.' } }))),
    });
    const store = new PaymentMethodsStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store
        .add({
          token: 'tok_dup',
          brand: 'visa' as CardBrand,
          last4: '4242',
          expiryMonth: 12,
          expiryYear: 2026,
        })
        .subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toBe('Card already exists.');
  });
});
