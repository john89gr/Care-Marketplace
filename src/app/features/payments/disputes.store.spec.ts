import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  DisputesStore,
  Dispute,
  DisputeResolutionInput,
  canTransitionDispute,
  DISPUTE_SLA_MS,
  DISPUTE_TRANSITIONS,
  isPastSla,
  quotePartialRefund,
} from './disputes.store';
import { EscrowStore } from './escrow.store';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { NotificationsService } from '../../core/services/notifications/notifications.service';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeEscrow() {
  return {
    freeze: vi.fn(() => of(true)),
    release: vi.fn(() => of(true)),
    refund: vi.fn(() => of(true)),
    partialRefund: vi.fn(() => of(true)),
  } as unknown as EscrowStore;
}

function makeSession() {
  return { hasAnyRole: vi.fn(() => false) } as unknown as SessionStore;
}

function makeNotifications() {
  return { notify: vi.fn() } as unknown as NotificationsService;
}

function dispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'd-1',
    bookingId: 'b-1',
    clientId: 'u-client',
    clientName: 'Maria Papadopoulou',
    providerId: 'u-nurse',
    providerName: 'Elena Papadaki',
    openedBy: 'u-client',
    openedByName: 'Maria Papadopoulou',
    reason: 'not_delivered',
    description: 'The visit never happened.',
    state: 'open',
    resolution: null,
    refundCents: null,
    escrowTransactionId: 'e-1',
    createdAtMs: 1000,
    updatedAtMs: 1000,
    evidence: [],
    ...overrides,
  };
}

describe('DisputesStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads my disputes', () => {
    const api = makeApi({ get: vi.fn(() => of([dispute()])) });
    const store = new DisputesStore(api, makeEscrow(), makeSession(), makeNotifications());
    store.loadMine();
    expect(api.get).toHaveBeenCalledWith('/me/disputes');
    expect(store.disputes()).toHaveLength(1);
  });

  it('loads the admin queue', () => {
    const api = makeApi({ get: vi.fn(() => of([dispute()])) });
    const store = new DisputesStore(api, makeEscrow(), makeSession(), makeNotifications());
    store.loadQueue();
    expect(api.get).toHaveBeenCalledWith('/disputes');
    expect(store.queue()).toHaveLength(1);
  });

  it('opens a dispute: posts, prepends, freezes escrow, notifies', () => {
    const escrow = makeEscrow();
    const notifications = makeNotifications();
    const api = makeApi({ post: vi.fn(() => of(dispute())) });
    const store = new DisputesStore(api, escrow, makeSession(), notifications);

    let ok = false;
    store
      .open({ bookingId: 'b-1', reason: 'not_delivered', description: 'The visit never happened.' })
      .subscribe((value) => (ok = value));

    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/disputes', {
      bookingId: 'b-1',
      reason: 'not_delivered',
      description: 'The visit never happened.',
    });
    expect(store.disputes()[0].id).toBe('d-1');
    expect(escrow.freeze).toHaveBeenCalledWith('e-1');
    expect(notifications.notify).toHaveBeenCalledWith(
      'dispute.opened',
      expect.any(String),
      expect.any(String),
      '/disputes'
    );
  });

  it('take moves open → under_review', () => {
    const api = makeApi({
      get: vi.fn(() => of([dispute()])),
      post: vi.fn(() => of(dispute({ state: 'under_review' }))),
    });
    const store = new DisputesStore(api, makeEscrow(), makeSession(), makeNotifications());
    store.loadQueue();

    let ok = false;
    store.take('d-1').subscribe((value) => (ok = value));

    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/disputes/d-1/state', { state: 'under_review' });
    expect(store.queue()[0].state).toBe('under_review');
  });

  it('resolve with release settles escrow to the provider', () => {
    const escrow = makeEscrow();
    const api = makeApi({
      post: vi.fn(() => of(dispute({ state: 'resolved_provider', resolution: 'release' }))),
    });
    const store = new DisputesStore(api, escrow, makeSession(), makeNotifications());
    store.loadQueue();

    let ok = false;
    store.resolve('d-1', { state: 'resolved_provider', resolution: 'release' }).subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(escrow.release).toHaveBeenCalledWith('e-1');
  });

  it('resolve with full_refund refunds the client', () => {
    const escrow = makeEscrow();
    const api = makeApi({
      post: vi.fn(() => of(dispute({ state: 'resolved_client', resolution: 'full_refund' }))),
    });
    const store = new DisputesStore(api, escrow, makeSession(), makeNotifications());
    store.loadQueue();

    let ok = false;
    store
      .resolve('d-1', { state: 'resolved_client', resolution: 'full_refund' })
      .subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(escrow.refund).toHaveBeenCalledWith('e-1');
  });

  it('resolve with partial_refund passes cents to the escrow store', () => {
    const escrow = makeEscrow();
    const api = makeApi({
      post: vi.fn(() =>
        of(dispute({ state: 'resolved_client', resolution: 'partial_refund', refundCents: 1500 }))
      ),
    });
    const store = new DisputesStore(api, escrow, makeSession(), makeNotifications());
    store.loadQueue();

    let ok = false;
    const input: DisputeResolutionInput = {
      state: 'resolved_client',
      resolution: 'partial_refund',
      refundCents: 1500,
    };
    store.resolve('d-1', input).subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(escrow.partialRefund).toHaveBeenCalledWith('e-1', 1500);
  });

  it('reject posts the rejection transition', () => {
    const escrow = makeEscrow();
    const api = makeApi({
      post: vi.fn(() => of(dispute({ state: 'rejected', resolution: 'release' }))),
    });
    const store = new DisputesStore(api, escrow, makeSession(), makeNotifications());
    store.loadQueue();

    let ok = false;
    store.reject('d-1').subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/disputes/d-1/state', {
      state: 'rejected',
      resolution: 'release',
    });
    expect(escrow.release).toHaveBeenCalledWith('e-1');
  });

  it('reports a failure with a friendly error', () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('nope'))) });
    const store = new DisputesStore(api, makeEscrow(), makeSession(), makeNotifications());

    let ok = true;
    store
      .open({ bookingId: 'b-1', reason: 'other', description: 'x' })
      .subscribe((v) => (ok = v));

    expect(ok).toBe(false);
    expect(store.error()).toContain('Could not open the dispute');
  });

  it('flags non-resolved disputes past the SLA', () => {
    const old = dispute({ state: 'open', createdAtMs: 1000 });
    const fresh = dispute({ id: 'd-2', state: 'under_review', createdAtMs: Date.now() });
    const api = makeApi({ get: vi.fn(() => of([old, fresh])) });
    const store = new DisputesStore(api, makeEscrow(), makeSession(), makeNotifications());
    store.loadQueue();
    expect(store.slaBreaches().map((d) => d.id)).toEqual(['d-1']);
  });
});

describe('state machine', () => {
  it('lists the legal transitions per state', () => {
    expect(DISPUTE_TRANSITIONS.open).toEqual(['under_review', 'rejected']);
    expect(DISPUTE_TRANSITIONS.under_review).toEqual([
      'resolved_client',
      'resolved_provider',
      'rejected',
    ]);
    expect(DISPUTE_TRANSITIONS.resolved_client).toEqual([]);
  });

  it('accepts only legal transitions', () => {
    expect(canTransitionDispute('open', 'under_review')).toBe(true);
    expect(canTransitionDispute('under_review', 'resolved_client')).toBe(true);
    expect(canTransitionDispute('open', 'resolved_client')).toBe(false);
    expect(canTransitionDispute('resolved_client', 'open')).toBe(false);
  });
});

describe('isPastSla', () => {
  const now = 10_000_000;

  it('flags an open dispute opened longer than the SLA ago', () => {
    expect(isPastSla(dispute({ state: 'open', createdAtMs: now - DISPUTE_SLA_MS - 1 }), now)).toBe(true);
  });

  it('does not flag exactly at the SLA boundary', () => {
    expect(isPastSla(dispute({ state: 'open', createdAtMs: now - DISPUTE_SLA_MS }), now)).toBe(false);
  });

  it('never flags resolved or rejected disputes', () => {
    expect(
      isPastSla(dispute({ state: 'resolved_client', createdAtMs: now - DISPUTE_SLA_MS - 1000 }), now)
    ).toBe(false);
    expect(
      isPastSla(dispute({ state: 'rejected', createdAtMs: now - DISPUTE_SLA_MS - 1000 }), now)
    ).toBe(false);
  });
});

describe('quotePartialRefund (cents-safe)', () => {
  it('accepts a whole-cent refund inside the held amount', () => {
    const quote = quotePartialRefund(1500, 4500);
    expect(quote.ok).toBe(true);
    expect(quote.refundCents).toBe(1500);
    expect(quote.providerCents).toBe(3000);
  });

  it('rejects a refund larger than the held amount', () => {
    const quote = quotePartialRefund(5000, 4500);
    expect(quote.ok).toBe(false);
    expect(quote.reason).toContain('cannot exceed');
  });

  it('rejects fractional cents', () => {
    expect(quotePartialRefund(1500.5, 4500).ok).toBe(false);
    expect(quotePartialRefund(-10, 4500).ok).toBe(false);
  });
});