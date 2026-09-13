import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { translateStatic } from '../../core/i18n/i18n.service';
import { LocalizedMessage } from '../../core/i18n/localized-message';

/**
 * Reviews & ratings (FEATURE_PLAN.md §1 — trust backbone of the marketplace).
 * A review is authored by a client about one completed booking; the rule
 * "one review per completed booking" is enforced in the store (pre-check)
 * and by the backend (409 on duplicate). Ratings aggregate per caregiver.
 *
 * API contract:
 *   GET  /caregivers/:id/reviews           -> Review[]
 *   POST /bookings/:id/complete            -> Booking (marks a booking completed)
 *   POST /bookings/:id/review              -> Review (author, rating, comment)
 *   POST /reviews/:id/flag                 -> Review (flagged for moderation)
 *   POST /reviews/:id/moderate             -> Review (admin: publish | remove)
 */

export type ReviewStatus = 'published' | 'flagged' | 'removed';

export interface Review {
  id: string;
  /** The reviewed provider (caregiver card id, e.g. `cg-1`). */
  caregiverId: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  /** 1–5 stars. */
  rating: number;
  comment: string;
  createdAtMs: number;
  status: ReviewStatus;
}

export interface ReviewDraft {
  caregiverId: string;
  bookingId: string;
  rating: number;
  comment: string;
}

/** A completed-booking review target as shown on the review form. */
export interface CompletedBooking {
  id: string;
  caregiverId: string;
  caregiverName: string;
  completedAtMs: number | null;
  reviewed: boolean;
}

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_COMMENT_LENGTH = 500;

export interface ReviewValidation {
  ok: boolean;
  /** Dictionary key for the rejection, or '' when the review is acceptable. */
  reasonKey: string;
  /** English rendering of {@link reasonKey} (the reference locale). */
  reason: string;
}

function reject(reasonKey: string): ReviewValidation {
  return { ok: false, reasonKey, reason: translateStatic(reasonKey) };
}

/**
 * A review can be submitted only for a completed booking, by the booking's
 * client, once. Pure so the UI and tests share the exact rule. Returns a
 * dictionary key rather than English so callers can render it per locale.
 */
export function canSubmitReview(
  draft: Pick<ReviewDraft, 'caregiverId' | 'bookingId' | 'rating'>,
  opts: {
    bookingIds: readonly string[];
    completedBookingIds: readonly string[];
    reviewedBookingIds: readonly string[];
    isOwnProfile: boolean;
  }
): ReviewValidation {
  if (!draft.bookingId) {
    return reject('review.error.selectVisit');
  }
  if (!opts.bookingIds.includes(draft.bookingId)) {
    return reject('review.error.bookingMissing');
  }
  if (!opts.completedBookingIds.includes(draft.bookingId)) {
    return reject('review.error.notCompleted');
  }
  if (opts.reviewedBookingIds.includes(draft.bookingId)) {
    return reject('review.error.alreadyRated');
  }
  if (
    !Number.isInteger(draft.rating) ||
    draft.rating < MIN_RATING ||
    draft.rating > MAX_RATING
  ) {
    return reject('review.ratingError');
  }
  if (opts.isOwnProfile) {
    return reject('review.error.selfReview');
  }
  return { ok: true, reasonKey: '', reason: '' };
}

/** Mean rating over published reviews; null when there are none. */
export function aggregateRating(reviews: readonly Review[]): number | null {
  const published = reviews.filter((r) => r.status === 'published');
  if (published.length === 0) {
    return null;
  }
  const sum = published.reduce((total, r) => total + r.rating, 0);
  return Math.round((sum / published.length) * 10) / 10;
}

@Injectable({ providedIn: 'root' })
export class ReviewsStore {
  // Default-parameter injection keeps `new ReviewsStore(api, session)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly session: SessionStore = inject(SessionStore)
  ) {}

  private readonly _reviews = signal<Review[]>([]);
  /** Published reviews per caregiver id, for card-level review lists. */
  private readonly _byCaregiver = signal<Record<string, Review[]>>({});
  private readonly _loadingId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _submitting = signal(false);
  private readonly _submitted = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = new LocalizedMessage();
  /** Latest validation failure reason (e.g. duplicate review). */
  private readonly _validationError = new LocalizedMessage();

  readonly reviews = this._reviews.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly submitting = this._submitting.asReadonly();
  readonly submitted = this._submitted.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  /** Translatable sources (null when the message came from the server). */
  readonly errorSource = this._error.source;
  readonly validationErrorSource = this._validationError.source;
  readonly error = this._error.value;
  readonly validationError = this._validationError.value;

  /** Published reviews for the loaded caregiver, newest first. */
  readonly published = computed(() =>
    this._reviews()
      .filter((r) => r.status === 'published')
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  );

  /** Reviews pending moderation (flagged), for the admin console. */
  readonly flagged = computed(() =>
    this._reviews().filter((r) => r.status === 'flagged')
  );

  readonly averageRating = computed(() => aggregateRating(this._reviews()));
  readonly reviewCount = computed(
    () => this._reviews().filter((r) => r.status === 'published').length
  );

  /** Load one caregiver's published reviews (marketplace card expansion). */
  loadFor(caregiverId: string): void {
    this._loadingId.set(caregiverId);
    this.api
      .get<Review[]>(`/caregivers/${encodeURIComponent(caregiverId)}/reviews`)
      .subscribe({
        next: (reviews) => {
          this._byCaregiver.update((map) => ({ ...map, [caregiverId]: reviews }));
          this._loadingId.set(null);
        },
        error: () => this._loadingId.set(null),
      });
  }

  /** Published reviews of a caregiver previously loaded via loadFor(). */
  reviewsFor(caregiverId: string): Review[] {
    return (this._byCaregiver()[caregiverId] ?? []).filter(
      (r) => r.status === 'published'
    );
  }

  isLoadingFor(caregiverId: string): boolean {
    return this._loadingId() === caregiverId;
  }

  /** Load a caregiver's reviews. */
  load(caregiverId: string): void {
    this._loading.set(true);
    this._error.clear();
    this.api
      .get<Review[]>(`/caregivers/${encodeURIComponent(caregiverId)}/reviews`)
      .subscribe({
        next: (reviews) => {
          this._reviews.set(reviews);
          this._loading.set(false);
        },
        error: () => {
          this._error.set({ key: 'review.error.loadFailed' });
          this._loading.set(false);
        },
      });
  }

  /** Load all reviews (admin moderation queue). */
  loadAll(): void {
    this._loading.set(true);
    this._error.clear();
    this.api.get<Review[]>('/reviews').subscribe({
      next: (reviews) => {
        this._reviews.set(reviews);
        this._loading.set(false);
      },
      error: () => {
        this._error.set({ key: 'review.error.loadFailed' });
        this._loading.set(false);
      },
    });
  }

  /**
   * Submit a review for a completed booking. Fails (false + reason) when the
   * one-review-per-booking rule or the 1–5 range is violated.
   */
  submit(draft: ReviewDraft, context: {
    bookingIds: readonly string[];
    completedBookingIds: readonly string[];
    reviewedBookingIds: readonly string[];
  }): Observable<boolean> {
    this._error.clear();
    this._validationError.clear();
    const me = this.session.session();
    const check = canSubmitReview(draft, {
      ...context,
      isOwnProfile: me?.userId === draft.caregiverId,
    });
    if (!check.ok) {
      this._validationError.set({ key: check.reasonKey });
      return of(false);
    }
    this._submitting.set(true);
    this._submitted.set(false);
    return this.api.post<Review>(`/bookings/${encodeURIComponent(draft.bookingId)}/review`, draft).pipe(
      map((review) => {
        this._reviews.update((list) => [review, ...list]);
        this._byCaregiver.update((map) => ({
          ...map,
          [review.caregiverId]: [review, ...(map[review.caregiverId] ?? [])],
        }));
        this._submitting.set(false);
        this._submitted.set(true);
        return true;
      }),
      catchError((error) => {
        this._submitting.set(false);
        const message = (error as { error?: { message?: string } })?.error?.message;
        // 409 = duplicate; surface it as a validation message.
        if ((error as { status?: number })?.status === 409) {
          this._validationError.set({ key: 'review.error.alreadyRated' });
        } else {
          this._error.setFromServer(message, { key: 'review.error.submitFailed' });
        }
        return of(false);
      })
    );
  }

  /** Client: flag a review for moderation. */
  flag(reviewId: string): Observable<boolean> {
    return this.act(reviewId, `/reviews/${encodeURIComponent(reviewId)}/flag`, {});
  }

  /** Admin: publish or remove a flagged review. */
  moderate(reviewId: string, decision: 'published' | 'removed'): Observable<boolean> {
    return this.act(
      reviewId,
      `/reviews/${encodeURIComponent(reviewId)}/moderate`,
      { decision }
    );
  }

  private act(reviewId: string, path: string, body: unknown): Observable<boolean> {
    this._actingId.set(reviewId);
    this._error.clear();
    return this.api.post<Review>(path, body).pipe(
      map((review) => {
        this._reviews.update((list) =>
          list.map((r) => (r.id === review.id ? review : r))
        );
        this._byCaregiver.update((map) => {
          const list = map[review.caregiverId];
          if (!list) {
            return map;
          }
          return {
            ...map,
            [review.caregiverId]: list.map((r) => (r.id === review.id ? review : r)),
          };
        });
        this._actingId.set(null);
        return true;
      }),
      catchError((error) => {
        this._actingId.set(null);
        this._error.setFromServer(
          (error as { error?: { message?: string } })?.error?.message,
          { key: 'review.error.updateFailed' }
        );
        return of(false);
      })
    );
  }
}
