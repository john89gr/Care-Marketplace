import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  canTransition,
  quoteCancellation,
  platformFeeCents,
  allowedActions,
  canAcceptBooking,
  isInvolvedParty,
  rescheduleConfirmed,
  BOOKING_TRANSITIONS,
  FREE_CANCEL_HOURS,
  CANCEL_FEE_PERCENT,
} from './booking.model';
import { BookingStore, BookingRecord } from './booking.store';
import { ApiClient } from '../../core/api/api.client';
import { EscrowStore, EscrowTransaction } from '../payments/escrow.store';
import { SessionStore } from '../../core/auth/session';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import { Subject } from 'rxjs';

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'b-1',
    caregiverId: 'cg-1',
    caregiverName: 'Elena Papadaki',
    clientId: 'u-client',
    clientName: 'Maria Papadopoulou',
    providerUserId: 'cg-1',
    scheduledAtMs: 10_000_000,
    note: '',
    status: 'requested',
    createdAtMs: 1_000,
    ...overrides,
  };
}

describe('booking state machine', () => {
  it('allows the happy path requested → accepted → in_progress → completed', () => {
    expect(canTransition('requested', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });

  it('allows cancellation before completion and disputes after', () => {
    expect(canTransition('requested', 'cancelled')).toBe(true);
    expect(canTransition('accepted', 'cancelled')).toBe(true);
    expect(canTransition('in_progress', 'disputed')).toBe(true);
    expect(canTransition('completed', 'disputed')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('requested', 'completed')).toBe(false);
    expect(canTransition('completed', 'accepted')).toBe(false);
    expect(canTransition('cancelled', 'accepted')).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
    expect(canTransition('disputed', 'completed')).toBe(false);
    expect(canTransition('completed', 'completed')).toBe(false);
  });

  it('terminal states transition to nothing', () => {
    expect(BOOKING_TRANSITIONS.cancelled).toEqual([]);
    expect(BOOKING_TRANSITIONS.disputed).toEqual([]);
  });
});

describe('cancellation policy', () => {
  const start = Date.now() + 48 * 3_600_000; // 48h out

  it('is free at or beyond the free window', () => {
    const q = quoteCancellation({ scheduledAtMs: start }, 10_000, Date.now());
    expect(q.free).toBe(true);
    expect(q.feeCents).toBe(0);
    expect(q.refundCents).toBe(10_000);
  });

  it('is free exactly at the boundary', () => {
    const now = start - FREE_CANCEL_HOURS * 3_600_000;
    expect(quoteCancellation({ scheduledAtMs: start }, 10_000, now).free).toBe(true);
  });

  it('charges a fee inside the window (cents-safe, never exceeds amount)', () => {
    const now = start - (FREE_CANCEL_HOURS - 1) * 3_600_000; // 1h inside
    const q = quoteCancellation({ scheduledAtMs: start }, 4_500, now);
    expect(q.free).toBe(false);
    expect(q.feeCents).toBe(Math.round((4_500 * CANCEL_FEE_PERCENT) / 100));
    expect(q.feeCents + q.refundCents).toBe(4_500);
  });

  it('handles already-started visits (negative window → fee, capped)', () => {
    const now = start + 3_600_000;
    const q = quoteCancellation({ scheduledAtMs: start }, 1_000, now);
    expect(q.free).toBe(false);
    expect(q.feeCents).toBeLessThanOrEqual(1_000);
  });
});

describe('platform fee', () => {
  it('is a percentage of the amount', () => {
    expect(platformFeeCents(10_000)).toBe(1_390);
  });

  it('never exceeds the amount', () => {
    expect(platformFeeCents(1)).toBeLessThanOrEqual(1);
  });
});

describe('allowedActions', () => {
  it('provider accepts; client can cancel/reschedule while requested', () => {
    expect(allowedActions('requested', 'provider')).toContain('accept');
    expect(allowedActions('requested', 'client')).not.toContain('accept');
    expect(allowedActions('requested', 'client')).toContain('cancel');
  });

  it('in-progress: provider completes, client disputes', () => {
    expect(allowedActions('in_progress', 'provider')).toEqual(['complete']);
    expect(allowedActions('in_progress', 'client')).toEqual(['dispute']);
  });

  it('terminal states have no actions', () => {
    expect(allowedActions('cancelled', 'client')).toEqual([]);
    expect(allowedActions('disputed', 'provider')).toEqual([]);
  });
});

describe('BookingStore lifecycle', () => {
  function makeDeps(
    apiOverrides: Partial<Record<'get' | 'post', unknown>> = {},
    sessionOverrides: { userId?: string; roles?: string[] } = {}
  ) {
    const api = {
      get: vi.fn(() => of([])),
      post: vi.fn(() => of(null)),
      patch: vi.fn(() => of(null)),
      delete: vi.fn(() => of(null)),
      ...apiOverrides,
    } as unknown as ApiClient;

    const escrowTxs: EscrowTransaction[] = [
      {
        id: 'e-1',
        bookingId: 'b-1',
        providerId: 'cg-1',
        clientId: 'u-client',
        amountCents: 4_500,
        status: 'held',
        createdAtMs: 1,
        settledAtMs: null,
      },
    ];
    const escrow = {
      transactions: () => escrowTxs,
      release: vi.fn(() => of(true)),
      refund: vi.fn(() => of(true)),
      hold: vi.fn(() => of(true)),
    } as unknown as EscrowStore;

    const session = {
      session: () => ({
        userId: sessionOverrides.userId ?? 'u-client',
        displayName: 'Maria',
        roles: sessionOverrides.roles ?? ['client'],
        expiresAtMs: 0,
      }),
      hasAnyRole: (required: readonly string[]) =>
        (sessionOverrides.roles ?? ['client']).some((r) => required.includes(r)),
    } as unknown as SessionStore;

    const notifications = {
      notify: vi.fn(),
      toast: vi.fn(),
    } as unknown as NotificationsService;

    return { api, escrow, session, notifications, escrowTxs };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('completes a booking and releases the escrow', async () => {
    const deps = makeDeps({
      get: vi.fn((_path: string) =>
        of(_path.endsWith('/events') ? [] : [booking({ status: 'in_progress' })])
      ),
      post: vi.fn(() => of(booking({ status: 'completed' }))),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.complete('b-1');
    await vi.waitFor(() => {
      expect(deps.escrow.release).toHaveBeenCalledWith('e-1');
    });
    expect(deps.notifications.toast).toHaveBeenCalledWith(
      'Visit completed — escrow released.',
      'success'
    );
  });

  it('cancels a booking and refunds the escrow', async () => {
    const deps = makeDeps({
      get: vi.fn((_path: string) =>
        of(_path.endsWith('/events') ? [] : [booking({ status: 'accepted' })])
      ),
      post: vi.fn(() => of(booking({ status: 'cancelled' }))),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.cancel('b-1');
    await vi.waitFor(() => {
      expect(deps.escrow.refund).toHaveBeenCalledWith('e-1');
    });
  });

  it('rejects illegal transitions locally without a request', () => {
    const deps = makeDeps({
      get: vi.fn(() => of([booking({ status: 'requested' })])),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.complete('b-1'); // requested → completed is illegal
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(store.lastError()).toContain('Cannot move');
  });

  it('handles 409 conflicts: surfaces message and reloads', async () => {
    const deps = makeDeps({
      get: vi.fn((_path: string) =>
        of(_path.endsWith('/events') ? [] : [booking({ status: 'in_progress' })])
      ),
      post: vi.fn(() =>
        throwError(() => Object.assign(new Error('conflict'), { status: 409, error: { message: 'Stale state.' } }))
      ),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.complete('b-1'); // in_progress → completed is legal, but the server 409s
    await vi.waitFor(() => {
      expect(store.conflict()).toBe('Stale state.');
    });
    expect(deps.api.get).toHaveBeenCalled(); // reload happened
  });

  it('quotes the cancellation policy from the held escrow', () => {
    const deps = makeDeps({
      get: vi.fn(() => of([booking({ scheduledAtMs: Date.now() + 48 * 3_600_000, status: 'accepted' })])),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    const q = store.quoteFor('b-1');
    expect(q).not.toBeNull();
    expect(q!.free).toBe(true);
    expect(q!.feeCents).toBe(0);
  });

  it('accepts and starts via the shared runner', async () => {
    const deps = makeDeps(
      {
        get: vi.fn((_path: string) =>
          of(_path.endsWith('/events') ? [] : [booking({ status: 'requested' })])
        ),
        post: vi.fn(() => of(booking({ status: 'accepted' }))),
      },
      { userId: 'cg-1', roles: ['nurse'] }
    );
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.accept('b-1');
    await vi.waitFor(() => {
      expect(deps.api.post).toHaveBeenCalledWith('/bookings/b-1/accept', {});
    });
  });

  it('blocks accept for non-provider roles without a request', () => {
    const deps = makeDeps({
      get: vi.fn(() => of([booking({ status: 'requested' })])),
    }); // default session is a client
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.accept('b-1');
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(store.lastError()).toContain('Only the provider');
  });

  it('blocks cancel for users not involved in the booking', () => {
    const deps = makeDeps(
      {
        get: vi.fn(() => of([booking({ status: 'accepted' })])),
      },
      { userId: 'u-stranger', roles: ['client'] }
    );
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.cancel('b-1');
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(store.lastError()).toContain('Only the client or provider');
  });

  it('proposes a reschedule and confirms the dual-confirmation flags', async () => {
    const proposed = booking({
      status: 'accepted',
      pendingReschedule: {
        scheduledAtMs: 99,
        proposedBy: 'client',
        clientConfirmed: true,
        providerConfirmed: false,
      },
    });
    const agreed = booking({
      status: 'accepted',
      scheduledAtMs: 99,
      pendingReschedule: {
        scheduledAtMs: 99,
        proposedBy: 'client',
        clientConfirmed: true,
        providerConfirmed: true,
      },
    });
    const deps = makeDeps({
      get: vi.fn((_path: string) =>
        of(_path.endsWith('/events') ? [] : [booking({ status: 'accepted' })])
      ),
      post: vi.fn((path: string) =>
        of(String(path).endsWith('/reschedule/confirm') ? agreed : proposed)
      ),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.reschedule('b-1', { scheduledAtMs: 99 });
    await vi.waitFor(() => {
      expect(deps.api.post).toHaveBeenCalledWith('/bookings/b-1/reschedule', {
        scheduledAtMs: 99,
      });
    });
    const pending = store.bookings().find((b) => b.id === 'b-1')?.pendingReschedule;
    expect(pending?.clientConfirmed).toBe(true);
    expect(rescheduleConfirmed(pending)).toBe(false);
    store.confirmReschedule('b-1');
    await vi.waitFor(() => {
      expect(deps.api.post).toHaveBeenCalledWith('/bookings/b-1/reschedule/confirm', {});
    });
    expect(
      rescheduleConfirmed(store.bookings().find((b) => b.id === 'b-1')?.pendingReschedule)
    ).toBe(true);
  });

  it('rejects confirming when no proposal is pending', () => {
    const deps = makeDeps({
      get: vi.fn(() => of([booking({ status: 'accepted' })])),
    });
    const store = new BookingStore(deps.api, deps.escrow, deps.session, deps.notifications);
    store.load();
    store.confirmReschedule('b-1');
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(store.lastError()).toContain('no reschedule proposal');
  });
});

describe('role guards', () => {
  it('only provider roles may accept', () => {
    expect(canAcceptBooking(['nurse'])).toBe(true);
    expect(canAcceptBooking(['caregiver'])).toBe(true);
    expect(canAcceptBooking(['physio'])).toBe(true);
    expect(canAcceptBooking(['client'])).toBe(false);
    expect(canAcceptBooking([])).toBe(false);
  });

  it('only involved parties may cancel', () => {
    const b = booking();
    expect(isInvolvedParty(b, 'u-client')).toBe(true);
    expect(isInvolvedParty(b, 'cg-1')).toBe(true);
    expect(isInvolvedParty(b, 'u-stranger')).toBe(false);
    expect(isInvolvedParty(b, null)).toBe(false);
    expect(isInvolvedParty(b, undefined)).toBe(false);
  });
});
