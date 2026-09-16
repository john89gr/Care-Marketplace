import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect } from 'vitest';
import {
  applyReviewQuery,
  positiveShare,
  publishedReviews,
  ratingDistribution,
} from './review-stats';
import { Review } from './reviews.store';

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'rv-1',
    caregiverId: 'cg-1',
    bookingId: 'b-1',
    authorId: 'u-reviewer-1',
    authorName: 'Anna',
    rating: 5,
    comment: '',
    createdAtMs: 1000,
    status: 'published',
    ...overrides,
  };
}

describe('publishedReviews', () => {
  it('keeps only published reviews, newest first', () => {
    const list = [
      review({ id: 'a', createdAtMs: 100 }),
      review({ id: 'b', createdAtMs: 300 }),
      review({ id: 'c', createdAtMs: 200, status: 'flagged' }),
      review({ id: 'd', createdAtMs: 400, status: 'removed' }),
    ];
    expect(publishedReviews(list).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the caller’s array', () => {
    const list = [review({ id: 'a', createdAtMs: 100 }), review({ id: 'b', createdAtMs: 300 })];
    publishedReviews(list);
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('ratingDistribution', () => {
  it('returns a 5 → 1 bucket per star, even when a bucket is empty', () => {
    const buckets = ratingDistribution([]);
    expect(buckets.map((b) => b.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(buckets.every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });

  it('counts published reviews per star and computes rounded shares', () => {
    const buckets = ratingDistribution([
      review({ id: 'a', rating: 5 }),
      review({ id: 'b', rating: 5 }),
      review({ id: 'c', rating: 4 }),
      review({ id: 'd', rating: 2 }),
    ]);
    expect(buckets.map((b) => b.count)).toEqual([2, 1, 0, 1, 0]);
    expect(buckets[0].pct).toBe(50);
    expect(buckets[1].pct).toBe(25);
    expect(buckets[3].pct).toBe(25);
  });

  it('ignores flagged and removed reviews', () => {
    const buckets = ratingDistribution([
      review({ id: 'a', rating: 5 }),
      review({ id: 'b', rating: 1, status: 'flagged' }),
      review({ id: 'c', rating: 1, status: 'removed' }),
    ]);
    expect(buckets[0].count).toBe(1);
    expect(buckets[0].pct).toBe(100);
    expect(buckets[4].count).toBe(0);
  });
});

describe('applyReviewQuery', () => {
  const list = [
    review({ id: 'a', rating: 5, authorName: 'Maria', comment: 'Excellent care', createdAtMs: 100 }),
    review({ id: 'b', rating: 3, authorName: 'Petros', comment: 'Late but kind', createdAtMs: 200 }),
    review({ id: 'c', rating: 5, authorName: 'Ioanna', comment: 'Thorough', createdAtMs: 300 }),
  ];

  it('defaults to the newest first across all ratings', () => {
    expect(applyReviewQuery(list, { stars: null, sort: 'recent' }).map((r) => r.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('sorts highest rated first, newest first within the same score', () => {
    expect(applyReviewQuery(list, { stars: null, sort: 'highest' }).map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('sorts lowest rated first', () => {
    expect(applyReviewQuery(list, { stars: null, sort: 'lowest' }).map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('filters by an exact star rating', () => {
    expect(applyReviewQuery(list, { stars: 5, sort: 'recent' }).map((r) => r.id)).toEqual(['c', 'a']);
    expect(applyReviewQuery(list, { stars: 3, sort: 'recent' }).map((r) => r.id)).toEqual(['b']);
    expect(applyReviewQuery(list, { stars: 4, sort: 'recent' })).toEqual([]);
  });

  it('matches the search term against the comment and the author', () => {
    expect(applyReviewQuery(list, { stars: null, sort: 'recent', search: 'kind' }).map((r) => r.id)).toEqual(['b']);
    expect(applyReviewQuery(list, { stars: null, sort: 'recent', search: 'ioanna' }).map((r) => r.id)).toEqual(['c']);
    expect(applyReviewQuery(list, { stars: null, sort: 'recent', search: '  ' })).toHaveLength(3);
  });

  it('combines a star filter with a search term', () => {
    expect(
      applyReviewQuery(list, { stars: 5, sort: 'recent', search: 'care' }).map((r) => r.id)
    ).toEqual(['a']);
  });

  it('never surfaces non-published reviews', () => {
    const withFlagged = [...list, review({ id: 'z', status: 'flagged', rating: 5 })];
    expect(
      applyReviewQuery(withFlagged, { stars: null, sort: 'recent' }).some((r) => r.id === 'z')
    ).toBe(false);
  });
});

describe('positiveShare', () => {
  it('is 0 with no published reviews', () => {
    expect(positiveShare([])).toBe(0);
    expect(positiveShare([review({ status: 'flagged', rating: 5 })])).toBe(0);
  });

  it('counts the 4★ and 5★ share as a rounded percentage', () => {
    const list = [
      review({ id: 'a', rating: 5 }),
      review({ id: 'b', rating: 4 }),
      review({ id: 'c', rating: 3 }),
    ];
    expect(positiveShare(list)).toBe(67);
  });
});
