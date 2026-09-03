import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  ReviewsStore,
  Review,
  ReviewDraft,
  canSubmitReview,
  aggregateRating,
  MAX_COMMENT_LENGTH,
} from './reviews.store';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeSession(): SessionStore {
  const session = {
    session: () => ({ userId: 'u-client', displayName: 'Maria', roles: ['client'], expiresAtMs: 0 }),
  };
  return session as unknown as SessionStore;
}

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rv-1',
    caregiverId: 'cg-1',
    bookingId: 'b-1',
    authorId: 'u-client',
    authorName: 'Maria',
    rating: 5,
    comment: '',
    createdAtMs: 1000,
    status: 'published',
    ...overrides,
  };
}

describe('canSubmitReview', () => {
  const base = {
    bookingIds: ['b-1', 'b-2'],
    completedBookingIds: ['b-1'],
    reviewedBookingIds: [] as string[],
    isOwnProfile: false,
  };
  const draft: ReviewDraft = { caregiverId: 'cg-1', bookingId: 'b-1', rating: 5, comment: '' };

  it('allows a valid review of a completed booking', () => {
    expect(canSubmitReview(draft, base).ok).toBe(true);
  });

  it('rejects a review of a booking that is not completed', () => {
    expect(
      canSubmitReview(draft, { ...base, completedBookingIds: [] }).reason
    ).toContain('completed');
  });

  it('rejects a second review for the same booking', () => {
    expect(
      canSubmitReview(draft, { ...base, reviewedBookingIds: ['b-1'] }).reason
    ).toContain('already');
  });

  it('rejects out-of-range ratings', () => {
    expect(canSubmitReview({ ...draft, rating: 0 }, base).ok).toBe(false);
    expect(canSubmitReview({ ...draft, rating: 6 }, base).ok).toBe(false);
    expect(canSubmitReview({ ...draft, rating: 4.5 }, base).ok).toBe(false);
  });

  it('rejects caregivers reviewing themselves', () => {
    expect(
      canSubmitReview(draft, { ...base, isOwnProfile: true }).reason
    ).toContain('themselves');
  });

  it('rejects an unknown booking', () => {
    expect(
      canSubmitReview({ ...draft, bookingId: 'b-x' }, base).ok
    ).toBe(false);
  });
});

describe('aggregateRating', () => {
  it('returns null when there are no reviews', () => {
    expect(aggregateRating([])).toBeNull();
  });

  it('returns null when all reviews are non-published', () => {
    expect(aggregateRating([review({ status: 'flagged' })])).toBeNull();
  });

  it('averages published reviews only', () => {
    const reviews = [
      review({ id: '1', rating: 5 }),
      review({ id: '2', rating: 4 }),
      review({ id: '3', rating: 3, status: 'flagged' }),
    ];
    expect(aggregateRating(reviews)).toBe(4.5);
  });

  it('rounds to one decimal', () => {
    const reviews = [review({ rating: 5 }), review({ rating: 4 }), review({ rating: 4 })];
    expect(aggregateRating(reviews)).toBe(4.3);
  });

  it('ignores removed reviews in the aggregate', () => {
    const reviews = [
      review({ id: '1', rating: 5 }),
      review({ id: '2', rating: 1, status: 'removed' }),
    ];
    expect(aggregateRating(reviews)).toBe(5);
  });

  it('rounds half-up to one decimal', () => {
    const reviews = [
      review({ id: '1', rating: 5 }),
      review({ id: '2', rating: 5 }),
      review({ id: '3', rating: 4 }),
    ];
    expect(aggregateRating(reviews)).toBe(4.7);
  });
});

describe('ReviewsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads reviews for a caregiver', () => {
    const api = makeApi({ get: vi.fn(() => of([review()])) });
    const store = new ReviewsStore(api, makeSession());
    store.load('cg-1');
    expect(store.reviews()).toHaveLength(1);
    expect(store.averageRating()).toBe(5);
    expect(store.reviewCount()).toBe(1);
  });

  it('exposes published reviews newest first', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of([review({ id: 'a', createdAtMs: 1000 }), review({ id: 'b', createdAtMs: 2000 })])
      ),
    });
    const store = new ReviewsStore(api, makeSession());
    store.load('cg-1');
    expect(store.published().map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('submits a review and prepends it', async () => {
    const api = makeApi({ post: vi.fn(() => of(review())) });
    const store = new ReviewsStore(api, makeSession());
    const ok = await new Promise<boolean>((resolve) =>
      store
        .submit(
          { caregiverId: 'cg-1', bookingId: 'b-1', rating: 5, comment: 'Great' },
          {
            bookingIds: ['b-1'],
            completedBookingIds: ['b-1'],
            reviewedBookingIds: [],
          }
        )
        .subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/bookings/b-1/review', {
      caregiverId: 'cg-1',
      bookingId: 'b-1',
      rating: 5,
      comment: 'Great',
    });
    expect(store.reviews()).toHaveLength(1);
    expect(store.submitted()).toBe(true);
  });

  it('blocks submission when validation fails (no request sent)', async () => {
    const api = makeApi({ post: vi.fn(() => of(review())) });
    const store = new ReviewsStore(api, makeSession());
    const ok = await new Promise<boolean>((resolve) =>
      store
        .submit(
          { caregiverId: 'cg-1', bookingId: 'b-1', rating: 5, comment: '' },
          {
            bookingIds: ['b-1'],
            completedBookingIds: [], // not completed yet
            reviewedBookingIds: [],
          }
        )
        .subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(store.validationError()).toContain('completed');
  });

  it('maps a 409 duplicate response to a validation message', async () => {
    const api = makeApi({
      post: vi.fn(() =>
        throwError(() => Object.assign(new Error('conflict'), { status: 409 }))
      ),
    });
    const store = new ReviewsStore(api, makeSession());
    const ok = await new Promise<boolean>((resolve) =>
      store
        .submit(
          { caregiverId: 'cg-1', bookingId: 'b-1', rating: 4, comment: '' },
          {
            bookingIds: ['b-1'],
            completedBookingIds: ['b-1'],
            reviewedBookingIds: [],
          }
        )
        .subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.validationError()).toContain('already');
    expect(store.error()).toBe('');
  });

  it('reports a generic error for other failures', async () => {
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('boom'))) });
    const store = new ReviewsStore(api, makeSession());
    const ok = await new Promise<boolean>((resolve) =>
      store
        .submit(
          { caregiverId: 'cg-1', bookingId: 'b-1', rating: 4, comment: '' },
          {
            bookingIds: ['b-1'],
            completedBookingIds: ['b-1'],
            reviewedBookingIds: [],
          }
        )
        .subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('Could not submit');
  });

  it('flags and moderates reviews', async () => {
    const api = makeApi({
      get: vi.fn(() => of([review()])),
      post: vi.fn((_path: string, body: unknown) =>
        of(review({ status: (body as { decision?: string })?.decision === 'removed' ? 'removed' : 'flagged' }))
      ),
    });
    const store = new ReviewsStore(api, makeSession());
    store.load('cg-1');

    await new Promise<boolean>((resolve) => store.flag('rv-1').subscribe(resolve));
    expect(store.reviews()[0].status).toBe('flagged');
    expect(api.post).toHaveBeenCalledWith('/reviews/rv-1/flag', {});

    await new Promise<boolean>((resolve) =>
      store.moderate('rv-1', 'removed').subscribe(resolve)
    );
    expect(store.reviews()[0].status).toBe('removed');
    expect(api.post).toHaveBeenCalledWith('/reviews/rv-1/moderate', { decision: 'removed' });
  });

  it('updates the per-caregiver map on flag/moderate', async () => {
    const api = makeApi({
      get: vi.fn(() => of([review()])),
      post: vi.fn(() => of(review({ status: 'removed' }))),
    });
    const store = new ReviewsStore(api, makeSession());
    store.loadFor('cg-1');
    await new Promise<boolean>((resolve) => store.moderate('rv-1', 'removed').subscribe(resolve));
    expect(store.reviewsFor('cg-1')).toHaveLength(0);
  });
});
