import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BookingStore } from './booking.store';
import {
  ReviewsStore,
  MIN_RATING,
  MAX_RATING,
  MAX_COMMENT_LENGTH,
} from './reviews.store';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * Review form (FEATURE_PLAN.md §1): rate a completed visit 1–5 stars with an
 * optional comment. One review per completed booking; the star picker is a
 * native radio group so it stays keyboard- and screen-reader-friendly. The
 * fields are signal-backed with explicit change handlers.
 *
 * Bilingual. The star radios are labelled "<n> star(s)" — English keeps that
 * exact wording because the E2E suite addresses them by accessible name.
 */
@Component({
  selector: 'app-review',
  standalone: true,
  imports: [],
  template: `
    <section class="review">
      <header class="page-header">
        <h1 class="page-title">{{ i18n.t('review.title') }}</h1>
        <p class="page-subtitle">{{ i18n.t('review.subtitle') }}</p>
      </header>

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else if (eligible().length === 0) {
        <p class="empty-state">{{ i18n.t('review.empty') }}</p>
      } @else {
        <form class="card" (submit)="submit($event)">
          <label class="field" for="booking-select">
            <span class="field-label">{{ i18n.t('review.visit') }}</span>
            <select
              id="booking-select"
              [value]="bookingId()"
              (change)="onBookingChange($any($event.target).value)"
            >
              @for (booking of eligible(); track booking.id) {
                <option [value]="booking.id">
                  {{ booking.caregiverName }} · {{ formatDate(booking.scheduledAtMs) }}
                </option>
              }
            </select>
          </label>

          <fieldset class="stars">
            <legend class="field-label">{{ i18n.t('review.yourRating') }}</legend>
            @for (star of stars; track star) {
              <label class="star" [attr.aria-label]="starLabel(star)">
                <input
                  type="radio"
                  [value]="star"
                  [checked]="rating() === star"
                  (change)="rating.set(star)"
                  [attr.aria-invalid]="showRatingError() ? true : null"
                />
                <span aria-hidden="true">{{ rating() >= star ? '★' : '☆' }}</span>
              </label>
            }
            <span class="rating-value" aria-hidden="true">
              {{ rating() }} / {{ MAX_RATING }}
            </span>
          </fieldset>
          @if (showRatingError()) {
            <p class="error" role="alert">{{ i18n.t('review.ratingError') }}</p>
          }

          <label class="field" for="comment">
            <span class="field-label">{{ i18n.t('review.comment') }}</span>
            <textarea
              id="comment"
              rows="4"
              [value]="comment()"
              (input)="comment.set($any($event.target).value)"
              [attr.maxlength]="MAX_COMMENT_LENGTH"
              aria-describedby="comment-count"
              [attr.aria-invalid]="showCommentError() ? true : null"
            ></textarea>
          </label>
          <p class="meta" id="comment-count" aria-hidden="true">
            {{ comment().length }} / {{ MAX_COMMENT_LENGTH }}
          </p>
          @if (showCommentError()) {
            <p class="error" role="alert">
              {{ i18n.t('review.commentError', { max: MAX_COMMENT_LENGTH }) }}
            </p>
          }

          <div class="card-actions">
            <button type="submit" class="btn" [disabled]="store.submitting()">
              {{ store.submitting() ? i18n.t('common.sending') : i18n.t('review.submit') }}
            </button>
          </div>
        </form>
      }

      <div aria-live="polite">
        @if (store.submitted()) {
          <p class="success" role="status">{{ i18n.t('review.thanks') }}</p>
        } @else if (store.validationError()) {
          <p class="error" role="alert">
            {{ i18n.message(store.validationErrorSource(), store.validationError()) }}
          </p>
        } @else if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .review form {
      max-width: 32rem;
      display: grid;
      gap: var(--space-2);
    }
    .stars {
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
    }
    .star {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      margin: 0;
      font-weight: var(--weight-normal);
    }
    .star input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
    }
    .star span {
      font-size: 1.6rem;
      cursor: pointer;
      line-height: 1;
    }
    .star input:focus-visible + span {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
    .rating-value {
      margin-left: var(--space-2);
      font-weight: var(--weight-normal);
      color: var(--text-muted);
    }
    .success {
      color: var(--success);
      font-weight: var(--weight-semibold);
    }
  `,
})
export class ReviewPage implements OnInit {
  readonly store = inject(ReviewsStore);
  protected readonly i18n = inject(I18n);
  private readonly bookings = inject(BookingStore);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);

  readonly MIN_RATING = MIN_RATING;
  readonly MAX_RATING = MAX_RATING;
  readonly MAX_COMMENT_LENGTH = MAX_COMMENT_LENGTH;
  readonly stars = Array.from(
    { length: MAX_RATING - MIN_RATING + 1 },
    (_, i) => MIN_RATING + i
  );

  /** Selected visit + rating + comment (signal-backed, like the export page). */
  readonly bookingId = signal('');
  readonly rating = signal(0);
  readonly comment = signal('');

  /** Set once the user attempts submit — drives inline error visibility. */
  private readonly submitAttempted = signal(false);
  /** Deep-link pre-selection (/review?booking=b-123) before options load. */
  private readonly preselectedId = signal('');

  readonly showRatingError = computed(
    () =>
      (this.rating() < MIN_RATING || this.rating() > MAX_RATING) &&
      (this.submitAttempted() || this.rating() > 0)
  );

  readonly showCommentError = computed(
    () => this.comment().length > MAX_COMMENT_LENGTH && this.submitAttempted()
  );

  /** "5 stars" / "1 star" — the accessible name the E2E suite addresses. */
  starLabel(star: number): string {
    return `${star} ${this.i18n.t(star > 1 ? 'review.stars' : 'review.star')}`;
  }

  /** My reviews (to exclude already-rated bookings). */
  private readonly myReviewedBookingIds = computed(() => {
    const me = this.session.session();
    if (!me) {
      return [];
    }
    return this.store
      .reviews()
      .filter((r) => r.authorId === me.userId)
      .map((r) => r.bookingId);
  });

  /** Completed, not-yet-reviewed bookings of the current client. */
  readonly eligible = computed(() => {
    const reviewed = new Set(this.myReviewedBookingIds());
    return this.bookings
      .myBookings()
      .filter((b) => b.status === 'completed' && !reviewed.has(b.id));
  });

  constructor() {
    // Default the visit picker to the deep-linked (or first eligible)
    // booking once the options are available.
    effect(() => {
      const list = this.eligible();
      if (list.length === 0) {
        return;
      }
      const current = this.bookingId();
      if (current && list.some((b) => b.id === current)) {
        return;
      }
      const preselected = this.preselectedId();
      const fallback =
        (preselected && list.some((b) => b.id === preselected) ? preselected : null) ??
        list[0].id;
      this.bookingId.set(fallback);
    });
  }

  ngOnInit(): void {
    // Deep link: /review?booking=b-123 pre-selects that visit.
    this.route.queryParamMap.subscribe((params) => {
      const bookingId = params.get('booking');
      if (bookingId) {
        this.preselectedId.set(bookingId);
        if (this.eligible().some((b) => b.id === bookingId)) {
          this.bookingId.set(bookingId);
        }
      }
    });
    this.bookings.load();
    // Load all reviews to resolve which of my bookings are already rated.
    this.store.loadAll();
  }

  onBookingChange(value: string): void {
    this.bookingId.set(value);
  }

  submit(event: Event): void {
    event.preventDefault();
    this.submitAttempted.set(true);
    if (this.comment().length > MAX_COMMENT_LENGTH) {
      return;
    }
    const booking = this.eligible().find((b) => b.id === this.bookingId());
    if (!booking) {
      return;
    }
    this.store
      .submit(
        {
          caregiverId: booking.caregiverId,
          bookingId: booking.id,
          rating: this.rating(),
          comment: this.comment().trim(),
        },
        {
          bookingIds: this.bookings.allBookingIds(),
          completedBookingIds: this.bookings.completedBookingIds(),
          reviewedBookingIds: this.myReviewedBookingIds(),
        }
      )
      .subscribe((ok) => {
        if (ok) {
          this.submitAttempted.set(false);
          this.bookingId.set('');
          this.rating.set(0);
          this.comment.set('');
          this.bookings.load();
        }
      });
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
