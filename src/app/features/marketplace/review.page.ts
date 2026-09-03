import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BookingStore } from './booking.store';
import {
  ReviewsStore,
  MIN_RATING,
  MAX_RATING,
  MAX_COMMENT_LENGTH,
} from './reviews.store';
import { SessionStore } from '../../core/auth/session';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Review form (FEATURE_PLAN.md §1): rate a completed visit 1–5 stars with an
 * optional comment. One review per completed booking; the star picker is a
 * native radio group bound to a typed reactive form control so it stays
 * keyboard- and screen-reader-friendly.
 */
@Component({
  selector: 'app-review',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="review">
      <h1>Rate your visit</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (eligible().length === 0) {
        <p>
          Nothing to review yet. You can rate a visit once its booking is
          completed, and each visit can be rated once.
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit($event)">
          <label for="booking-select">Visit</label>
          <select
            id="booking-select"
            formControlName="bookingId"
          >
            @for (booking of eligible(); track booking.id) {
              <option [value]="booking.id">
                {{ booking.caregiverName }} · {{ formatDate(booking.scheduledAtMs) }}
              </option>
            }
          </select>

          <fieldset class="stars">
            <legend>Your rating</legend>
            @for (star of stars; track star) {
              <label class="star" [attr.aria-label]="star + ' star' + (star > 1 ? 's' : '')">
                <input
                  type="radio"
                  formControlName="rating"
                  [value]="star"
                  [attr.aria-invalid]="showRatingError() ? true : null"
                />
                <span aria-hidden="true">{{ ratingValue() >= star ? '★' : '☆' }}</span>
              </label>
            }
            <span class="rating-value" aria-hidden="true">{{ ratingValue() }} / {{ MAX_RATING }}</span>
          </fieldset>
          @if (showRatingError()) {
            <p class="error" role="alert">Choose a rating between 1 and 5 stars.</p>
          }

          <label for="comment">Comment (optional)</label>
          <textarea
            id="comment"
            rows="4"
            formControlName="comment"
            [attr.maxlength]="MAX_COMMENT_LENGTH"
            aria-describedby="comment-count"
            [attr.aria-invalid]="showCommentError() ? true : null"
          ></textarea>
          <p class="meta" id="comment-count" aria-hidden="true">
            {{ commentLength() }} / {{ MAX_COMMENT_LENGTH }}
          </p>
          @if (showCommentError()) {
            <p class="error" role="alert">
              Keep your comment under {{ MAX_COMMENT_LENGTH }} characters.
            </p>
          }

          <button type="submit" [disabled]="store.submitting()">
            {{ store.submitting() ? 'Sending…' : 'Submit review' }}
          </button>
        </form>
      }

      <div aria-live="polite">
        @if (store.submitted()) {
          <p class="success" role="status">Thank you — your review is published.</p>
        } @else if (store.validationError()) {
          <p class="error" role="alert">{{ store.validationError() }}</p>
        } @else if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    label, legend { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    select, textarea { width: 100%; max-width: 28rem; }
    .stars { border: none; padding: 0; display: flex; align-items: center; gap: 0.25rem; }
    .star input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .star span { font-size: 1.6rem; cursor: pointer; }
    .star input:focus-visible + span { outline: 2px solid var(--accent, #4f7cff); outline-offset: 2px; }
    .rating-value { margin-left: 0.5rem; font-weight: 400; }
    .success { color: var(--success, #1d7a3d); }
    .error { color: var(--danger, #c62828); }
    button[type='submit'] { margin-top: 0.75rem; }
  `,
})
export class ReviewPage implements OnInit {
  readonly store = inject(ReviewsStore);
  private readonly bookings = inject(BookingStore);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  readonly MIN_RATING = MIN_RATING;
  readonly MAX_RATING = MAX_RATING;
  readonly MAX_COMMENT_LENGTH = MAX_COMMENT_LENGTH;
  readonly stars = Array.from(
    { length: MAX_RATING - MIN_RATING + 1 },
    (_, i) => MIN_RATING + i
  );

  /** Typed reactive form: booking + 1–5 star rating + maxlength comment. */
  protected readonly form = this.fb.nonNullable.group({
    bookingId: ['', Validators.required],
    rating: [0, [Validators.required, Validators.min(MIN_RATING), Validators.max(MAX_RATING)]],
    comment: ['', Validators.maxLength(MAX_COMMENT_LENGTH)],
  });

  /** Set once the user attempts submit — drives inline error visibility. */
  private readonly submitAttempted = signal(false);
  /** Deep-link pre-selection (/review?booking=b-123) before options load. */
  private readonly preselectedId = signal('');

  /** Numeric rating (radio inputs report strings at runtime). */
  readonly ratingValue = computed(() => Number(this.form.controls.rating.value) || 0);
  readonly commentLength = computed(() => this.form.controls.comment.value.length);

  readonly showRatingError = computed(() => {
    const control = this.form.controls.rating;
    return control.invalid && (control.touched || control.dirty || this.submitAttempted());
  });

  readonly showCommentError = computed(() => {
    const control = this.form.controls.comment;
    return control.invalid && (control.touched || control.dirty || this.submitAttempted());
  });

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
      const current = this.form.controls.bookingId.value;
      if (current && list.some((b) => b.id === current)) {
        return;
      }
      const preselected = this.preselectedId();
      const fallback =
        (preselected && list.some((b) => b.id === preselected) ? preselected : null) ??
        list[0].id;
      this.form.controls.bookingId.setValue(fallback);
    });
  }

  ngOnInit(): void {
    // Deep link: /review?booking=b-123 pre-selects that visit.
    this.route.queryParamMap.subscribe((params) => {
      const bookingId = params.get('booking');
      if (bookingId) {
        this.preselectedId.set(bookingId);
        if (this.eligible().some((b) => b.id === bookingId)) {
          this.form.controls.bookingId.setValue(bookingId);
        }
      }
    });
    this.bookings.load();
    // Load all reviews to resolve which of my bookings are already rated.
    this.store.loadAll();
  }

  submit(event: Event): void {
    event.preventDefault();
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { bookingId, comment } = this.form.getRawValue();
    const booking = this.eligible().find((b) => b.id === bookingId);
    if (!booking) {
      return;
    }
    this.store
      .submit(
        {
          caregiverId: booking.caregiverId,
          bookingId,
          rating: this.ratingValue(),
          comment: comment.trim(),
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
          this.form.reset({ bookingId: '', rating: 0, comment: '' });
          this.bookings.load();
        }
      });
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
