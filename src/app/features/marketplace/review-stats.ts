import { MAX_RATING, Review } from './reviews.store';

/**
 * Review aggregation + list shaping for a provider's detail page.
 *
 * Everything here is pure and works on the raw review list, so the summary
 * card (average, distribution bars) and the review list (filter by stars or
 * text, sort) are covered by unit tests without DI or HTTP.
 *
 * Only `published` reviews are ever counted or shown — flagged and removed
 * reviews must not influence a provider's public rating.
 */

/** One row of the rating histogram (5★ → 1★). */
export interface RatingBucket {
  stars: number;
  count: number;
  /** Share of the published reviews, 0–100, rounded to one decimal. */
  pct: number;
}

export type ReviewSort = 'recent' | 'highest' | 'lowest';

export interface ReviewQuery {
  /** Show only reviews with exactly this rating; null = every rating. */
  stars: number | null;
  sort: ReviewSort;
  /** Case-insensitive match on the author's name or the comment body. */
  search?: string;
}

/** Published reviews only, newest first (the page's canonical ordering). */
export function publishedReviews(reviews: readonly Review[]): Review[] {
  return reviews
    .filter((review) => review.status === 'published')
    .slice()
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/**
 * Histogram over the published reviews, from the highest rating down. Buckets
 * with no reviews are kept (count 0) so the bar chart keeps a stable height.
 */
export function ratingDistribution(
  reviews: readonly Review[],
  maxStars: number = MAX_RATING
): RatingBucket[] {
  const published = reviews.filter((review) => review.status === 'published');
  const total = published.length;
  const buckets: RatingBucket[] = [];
  for (let stars = maxStars; stars >= 1; stars--) {
    const count = published.filter((review) => review.rating === stars).length;
    buckets.push({
      stars,
      count,
      pct: total === 0 ? 0 : Math.round((count / total) * 1000) / 10,
    });
  }
  return buckets;
}

/** Apply the list controls (star filter, text search, ordering). */
export function applyReviewQuery(
  reviews: readonly Review[],
  query: ReviewQuery
): Review[] {
  const term = query.search?.trim().toLowerCase() ?? '';
  const filtered = publishedReviews(reviews).filter((review) => {
    if (query.stars !== null && review.rating !== query.stars) {
      return false;
    }
    if (term) {
      const haystack = `${review.authorName} ${review.comment}`.toLowerCase();
      if (!haystack.includes(term)) {
        return false;
      }
    }
    return true;
  });
  switch (query.sort) {
    case 'highest':
      // Newest first within the same score, so ordering stays deterministic.
      return filtered.sort((a, b) => b.rating - a.rating || b.createdAtMs - a.createdAtMs);
    case 'lowest':
      return filtered.sort((a, b) => a.rating - b.rating || b.createdAtMs - a.createdAtMs);
    case 'recent':
    default:
      return filtered;
  }
}

/** Share of published reviews that are 4★ or 5★, 0–100 (rounded). */
export function positiveShare(reviews: readonly Review[]): number {
  const published = reviews.filter((review) => review.status === 'published');
  if (published.length === 0) {
    return 0;
  }
  const positive = published.filter((review) => review.rating >= 4).length;
  return Math.round((positive / published.length) * 100);
}
