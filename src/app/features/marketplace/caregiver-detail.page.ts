import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CaregiverProfileStore } from './caregiver-profile.store';
import { BookingStore } from './booking.store';
import {
  ReviewsStore,
  Review,
  MAX_RATING,
  MAX_COMMENT_LENGTH,
  MIN_RATING,
  aggregateRating,
} from './reviews.store';
import {
  applyReviewQuery,
  positiveShare,
  publishedReviews,
  ratingDistribution,
  ReviewSort,
} from './review-stats';
import { certificationStatus } from '../../core/services/integrations/certification-status';
import { SessionStore } from '../../core/auth/session';
import { ROLES } from '../../core/auth/roles';
import { I18n } from '../../core/i18n/i18n.service';
import { reloadOnLanguageChange } from '../../core/i18n/content-locale';

/**
 * Public provider profile (`/caregivers/:id`) — the page a family lands on when
 * it opens a result: who the provider is, what they charge, and the review
 * record behind the rating.
 *
 * The reviews system here has three parts:
 *   1. a summary — average, total, and a 5★→1★ distribution;
 *   2. a review list with star filtering, free-text search and ordering;
 *   3. a write-a-review panel, offered only for a completed visit with this
 *      provider that the signed-in family has not rated yet.
 *
 * The one-review-per-completed-booking rule is enforced by `canSubmitReview`
 * in the store (and by the backend, which answers 409 on a duplicate), so the
 * panel here is a convenience guard rather than the source of truth.
 */
@Component({
  selector: 'app-caregiver-detail',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="provider page-enter">
      <a class="back-link" routerLink="/marketplace">
        <span aria-hidden="true">←</span> {{ i18n.t('provider.back') }}
      </a>

      @if (store.loading()) {
        <p class="meta" role="status">{{ i18n.t('common.loading') }}</p>
      } @else if (store.error()) {
        <div class="alert danger" role="alert">
          <span class="alert-icon" aria-hidden="true">!</span>
          <p>{{ i18n.message(store.errorSource(), store.error()) }}</p>
        </div>
      } @else if (profile(); as p) {
        <header class="hero card provider-hero">
          <div class="hero-identity">
            <span class="avatar xl" aria-hidden="true">{{ initials(p.displayName) }}</span>
            <div class="hero-text">
              <p class="page-eyebrow">{{ i18n.t('provider.eyebrow') }}</p>
              <h1 class="page-title">
                {{ p.displayName }}
                @if (p.verified) {
                  <span class="badge success">
                    <span class="dot"></span>{{ i18n.t('provider.verified') }}
                  </span>
                }
              </h1>

              <p class="hero-roles">
                @for (role of p.roles; track role) {
                  <span class="badge accent">{{ i18n.t('market.role.' + role) }}</span>
                }
                @if (p.availableNow) {
                  <span class="chip now">{{ i18n.t('provider.availableNow') }}</span>
                } @else {
                  <span class="chip muted">{{ i18n.t('provider.unavailable') }}</span>
                }
              </p>

              <p class="hero-rating">
                <span class="stars static" aria-hidden="true">{{ starRow(averageRating()) }}</span>
                <strong class="rating-number">{{ averageRating() }}</strong>
                <span class="meta">
                  {{
                    i18n.t(
                      reviewCount() === 1 ? 'provider.basedOn.one' : 'provider.basedOn.other',
                      { count: reviewCount() }
                    )
                  }}
                </span>
              </p>

              <ul class="facts">
                @if (p.city) {
                  <li class="chip muted">📍 {{ p.city }}</li>
                }
                <li class="chip muted">📏 {{ p.distanceKm }} km</li>
                <li class="chip muted">💶 {{ p.hourlyRate }}€/h</li>
                <li
                  class="chip"
                  [class.muted]="licenceStatus() === 'valid'"
                  [class.warn]="licenceStatus() === 'expiring_soon'"
                  [class.danger]="licenceStatus() === 'expired'"
                >
                  🛡 {{ i18n.t(licenceKey()) }}
                </li>
              </ul>
            </div>
          </div>

          <div class="hero-actions">
            <button type="button" class="btn lg" (click)="book()">
              {{ i18n.t('market.requestBooking') }}
            </button>
            <button type="button" class="btn secondary" (click)="message()">
              {{ i18n.t('market.message') }}
            </button>
          </div>
        </header>

        <ul class="stats-grid">
          <li class="stat-card">
            <span class="stat-label">{{ i18n.t('provider.stat.visits') }}</span>
            <span class="stat-value">{{ p.completedVisits ?? 0 }}</span>
          </li>
          <li class="stat-card">
            <span class="stat-label">{{ i18n.t('provider.stat.repeatClients') }}</span>
            <span class="stat-value">{{ p.repeatClients ?? 0 }}</span>
          </li>
          <li class="stat-card info">
            <span class="stat-label">{{ i18n.t('provider.stat.response') }}</span>
            <span class="stat-value">
              {{ i18n.t('provider.minutes', { minutes: p.responseMinutes ?? 0 }) }}
            </span>
          </li>
          <li class="stat-card info">
            <span class="stat-label">{{ i18n.t('provider.stat.experience') }}</span>
            <span class="stat-value">
              {{ i18n.t('provider.years', { years: p.experienceYears ?? 0 }) }}
            </span>
          </li>
        </ul>

        <div class="grid-2 profile-grid">
          <section class="card">
            <h2 class="card-title">{{ i18n.t('provider.about') }}</h2>
            @if (p.bio) {
              <p class="bio">{{ p.bio }}</p>
            }
            <dl class="detail-list">
              @if (p.languages?.length) {
                <div>
                  <dt>{{ i18n.t('provider.languages') }}</dt>
                  <dd>{{ p.languages!.join(' · ') }}</dd>
                </div>
              }
              @if (p.education) {
                <div>
                  <dt>{{ i18n.t('provider.education') }}</dt>
                  <dd>{{ p.education }}</dd>
                </div>
              }
            </dl>
            @if (p.memberSinceMs) {
              <p class="meta member-since">
                {{ i18n.t('provider.memberSince', { date: formatMonth(p.memberSinceMs) }) }}
              </p>
            }
            @if (p.specialties?.length) {
              <p class="subhead">{{ i18n.t('provider.specialties') }}</p>
              <ul class="chip-row">
                @for (specialty of p.specialties; track specialty) {
                  <li class="badge outline">{{ specialty }}</li>
                }
              </ul>
            }
          </section>

          <section class="card">
            <h2 class="card-title">{{ i18n.t('provider.services') }}</h2>
            @if (p.services?.length) {
              <ul class="list services">
                @for (service of p.services; track service.name) {
                  <li class="list-item">
                    <span class="service-name">{{ service.name }}</span>
                    <span class="meta">
                      {{ i18n.t('provider.minutes', { minutes: service.durationMin }) }}
                    </span>
                    <span class="service-price">{{ service.price }}€</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="meta">{{ i18n.t('provider.servicesEmpty') }}</p>
            }
          </section>
        </div>

        <section class="card reviews-section" aria-labelledby="provider-reviews">
          <h2 class="card-title" id="provider-reviews">{{ i18n.t('provider.reviewsTitle') }}</h2>

          <div class="summary">
            <div class="summary-score">
              <span class="score">{{ averageRating() }}</span>
              <span class="stars static" aria-hidden="true">{{ starRow(averageRating()) }}</span>
              <!-- The hero already states "Based on N reviews"; here the section
                   just states its own size, so the page never repeats a line. -->
              <p class="meta">
                {{
                  i18n.t(
                    reviewCount() === 1 ? 'market.reviewsCount.one' : 'market.reviewsCount.other',
                    { count: reviewCount() }
                  )
                }}
              </p>
              @if (reviewCount() > 0) {
                <p class="meta positive">
                  {{ i18n.t('provider.positiveShare', { pct: positive() }) }}
                </p>
              }
            </div>

            <ul class="distribution" [attr.aria-label]="i18n.t('provider.distributionLabel')">
              @for (bucket of distribution(); track bucket.stars) {
                <li
                  [attr.aria-label]="
                    i18n.t('provider.starRowAria', { stars: bucket.stars, count: bucket.count })
                  "
                >
                  <span class="bucket-label" aria-hidden="true">{{ bucket.stars }}★</span>
                  <span class="progress" aria-hidden="true">
                    <span [style.width.%]="bucket.pct"></span>
                  </span>
                  <span class="bucket-count" aria-hidden="true">{{ bucket.count }}</span>
                </li>
              }
            </ul>
          </div>

          @if (reviewsLoading()) {
            <p class="meta" role="status">{{ i18n.t('market.loadingReviews') }}</p>
          } @else {
            <div class="filters review-filters">
              <label class="field">
                <span class="field-label">{{ i18n.t('provider.searchLabel') }}</span>
                <input
                  type="search"
                  [attr.placeholder]="i18n.t('provider.searchPlaceholder')"
                  [value]="search()"
                  (input)="search.set($any($event.target).value)"
                />
              </label>
              <label class="field">
                <span class="field-label">{{ i18n.t('provider.filterLabel') }}</span>
                <select
                  [value]="starsFilter() ?? ''"
                  (change)="onFilterChange($any($event.target).value)"
                >
                  <option value="">{{ i18n.t('provider.filterAll') }}</option>
                  @for (star of starOptions; track star) {
                    <option [value]="star">{{ star }}★</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field-label">{{ i18n.t('provider.sortLabel') }}</span>
                <select [value]="sort()" (change)="onSortChange($any($event.target).value)">
                  <option value="recent">{{ i18n.t('provider.sort.recent') }}</option>
                  <option value="highest">{{ i18n.t('provider.sort.highest') }}</option>
                  <option value="lowest">{{ i18n.t('provider.sort.lowest') }}</option>
                </select>
              </label>
            </div>

            @if (canReview()) {
              <form class="card sunken write-review" (submit)="submitReview($event)">
                <h3 class="card-title">{{ i18n.t('provider.writeTitle') }}</h3>
                <p class="meta">{{ i18n.t('provider.writeHint') }}</p>

                @if (eligibleBookings().length > 1) {
                  <label class="field">
                    <span class="field-label">{{ i18n.t('provider.yourVisit') }}</span>
                    <select
                      [value]="reviewBookingId()"
                      (change)="reviewBookingId.set($any($event.target).value)"
                    >
                      @for (booking of eligibleBookings(); track booking.id) {
                        <option [value]="booking.id">
                          {{ formatDate(booking.scheduledAtMs) }}
                        </option>
                      }
                    </select>
                  </label>
                }

                <fieldset class="rating-picker">
                  <legend class="field-label">{{ i18n.t('review.yourRating') }}</legend>
                  @for (star of starOptions; track star) {
                    <label class="star" [attr.aria-label]="starLabel(star)">
                      <input
                        type="radio"
                        [value]="star"
                        [checked]="rating() === star"
                        (change)="rating.set(star)"
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

                <label class="field">
                  <span class="field-label">{{ i18n.t('review.comment') }}</span>
                  <textarea
                    rows="4"
                    [attr.maxlength]="MAX_COMMENT_LENGTH"
                    [value]="comment()"
                    (input)="comment.set($any($event.target).value)"
                  ></textarea>
                </label>

                <div class="card-actions">
                  <button type="submit" class="btn" [disabled]="reviews.submitting()">
                    {{ reviews.submitting() ? i18n.t('common.sending') : i18n.t('review.submit') }}
                  </button>
                </div>
              </form>
            } @else if (isClient() && hasCompletedVisit()) {
              <p class="meta">{{ i18n.t('provider.alreadyRated') }}</p>
            } @else if (isClient()) {
              <p class="meta">{{ i18n.t('provider.writeHint') }}</p>
            } @else {
              <p class="meta">{{ i18n.t('provider.signInToReview') }}</p>
            }

            <div aria-live="polite">
              @if (reviews.submitted()) {
                <p class="success" role="status">{{ i18n.t('review.thanks') }}</p>
              } @else if (reviews.validationError()) {
                <p class="error" role="alert">
                  {{ i18n.message(reviews.validationErrorSource(), reviews.validationError()) }}
                </p>
              } @else if (reviews.error()) {
                <p class="error" role="alert">
                  {{ i18n.message(reviews.errorSource(), reviews.error()) }}
                </p>
              }
            </div>

            @if (visibleReviews().length === 0) {
              <div class="empty-state">
                <span class="empty-icon" aria-hidden="true">★</span>
                <p>
                  {{
                    hasReviewFilters()
                      ? i18n.t('provider.noFiltered')
                      : i18n.t('provider.noReviews')
                  }}
                </p>
              </div>
            } @else {
              <ul class="review-list">
                @for (review of visibleReviews(); track review.id) {
                  <li class="review">
                    <span class="avatar review-avatar" aria-hidden="true">
                      {{ initials(review.authorName) }}
                    </span>
                    <div class="review-body">
                      <p class="review-head">
                        <strong>{{ review.authorName }}</strong>
                        <span class="stars static" aria-hidden="true">
                          {{ starRow(review.rating) }}
                        </span>
                        <span class="meta">{{ formatDate(review.createdAtMs) }}</span>
                      </p>
                      @if (review.comment) {
                        <p>{{ review.comment }}</p>
                      }
                      <button
                        type="button"
                        class="link"
                        [disabled]="reviews.actingId() === review.id"
                        (click)="flag(review)"
                      >
                        {{ i18n.t('market.report') }}
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          }
        </section>
      }
    </section>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: var(--space-3);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      color: var(--text-muted);
      text-decoration: none;
    }
    .back-link:hover {
      color: var(--accent);
    }
    .provider-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-5);
      flex-wrap: wrap;
      padding: var(--space-5);
    }
    .hero-identity {
      display: flex;
      align-items: flex-start;
      gap: var(--space-4);
      min-width: 0;
    }
    .hero-text {
      min-width: 0;
    }
    .provider-hero .page-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin: 0;
    }
    .hero-roles {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin: var(--space-2) 0;
    }
    .hero-rating {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin: 0;
    }
    .rating-number {
      font-size: var(--text-lg);
      font-variant-numeric: tabular-nums;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      list-style: none;
      margin: var(--space-3) 0 0;
      padding: 0;
    }
    .facts .chip {
      margin-right: 0;
    }
    .chip.warn {
      background: var(--warning-soft);
      color: var(--warning);
    }
    .chip.danger {
      background: var(--danger-soft);
      color: var(--danger);
    }
    .hero-actions {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    /* Star rating: presentational glyphs, always paired with a numeric label. */
    .stars {
      letter-spacing: 0.08em;
      color: var(--warning);
      font-size: var(--text-md);
      line-height: 1;
    }
    .profile-grid {
      margin-bottom: var(--space-5);
    }
    .bio {
      margin-top: var(--space-3);
      line-height: var(--leading-relaxed);
    }
    .subhead {
      margin: var(--space-4) 0 var(--space-2);
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-subtle);
    }
    .detail-list {
      margin: var(--space-4) 0 0;
      display: grid;
      gap: var(--space-2);
    }
    .detail-list dt {
      font-size: var(--text-xs);
      font-weight: var(--weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-subtle);
    }
    .detail-list dd {
      margin: 0;
    }
    .member-since {
      margin: var(--space-3) 0 0;
    }
    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .services .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .service-name {
      font-weight: var(--weight-semibold);
    }
    .service-price {
      font-weight: var(--weight-bold);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .summary {
      display: flex;
      align-items: center;
      gap: var(--space-6);
      flex-wrap: wrap;
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--border);
    }
    .summary-score {
      display: grid;
      gap: 0.2rem;
      min-width: 12rem;
    }
    .summary-score p {
      margin: 0;
    }
    .summary-score .score {
      font-size: var(--text-3xl);
      font-weight: var(--weight-bold);
      line-height: 1;
      letter-spacing: -0.02em;
    }
    .positive {
      color: var(--success);
    }
    .distribution {
      flex: 1 1 18rem;
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-2);
      min-width: 0;
    }
    .distribution li {
      display: grid;
      grid-template-columns: 2.4rem 1fr 2.2rem;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--text-sm);
    }
    .bucket-label,
    .bucket-count {
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
    }
    .bucket-count {
      text-align: right;
    }
    .review-filters {
      margin: var(--space-4) 0;
    }
    .review-filters input[type='search'],
    .review-filters select {
      width: auto;
    }
    .write-review {
      margin-bottom: var(--space-4);
      border: 1px solid var(--border);
      display: grid;
      gap: var(--space-2);
    }
    .rating-picker {
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
      color: var(--warning);
    }
    .star input:focus-visible + span {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      border-radius: var(--radius-sm);
    }
    .rating-value {
      margin-left: var(--space-2);
      color: var(--text-muted);
    }
    .review-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
    }
    .review {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3) 0;
      border-top: 1px solid var(--border);
    }
    .review-avatar {
      width: 2.4rem;
      height: 2.4rem;
      font-size: var(--text-xs);
      flex: none;
    }
    .review-body {
      min-width: 0;
    }
    .review-body p {
      margin: 0 0 var(--space-1);
    }
    .review-head {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .success {
      color: var(--success);
      font-weight: var(--weight-semibold);
    }
    @media (max-width: 40rem) {
      .provider-hero {
        padding: var(--space-4);
      }
      .hero-actions .btn {
        flex: 1 1 auto;
      }
      .summary {
        gap: var(--space-4);
      }
    }
  `,
})
export class CaregiverDetailPage implements OnInit, OnDestroy {
  readonly store = inject(CaregiverProfileStore);
  readonly reviews = inject(ReviewsStore);
  protected readonly i18n = inject(I18n);
  private readonly bookings = inject(BookingStore);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private paramSub: Subscription | null = null;

  readonly MIN_RATING = MIN_RATING;
  readonly MAX_RATING = MAX_RATING;
  readonly MAX_COMMENT_LENGTH = MAX_COMMENT_LENGTH;
  readonly starOptions = Array.from(
    { length: MAX_RATING - MIN_RATING + 1 },
    (_, i) => MIN_RATING + i
  );

  /** Provider id from the route; drives both fetches. */
  readonly id = signal('');
  readonly profile = this.store.profile;

  /** Review list controls. */
  readonly sort = signal<ReviewSort>('recent');
  readonly starsFilter = signal<number | null>(null);
  readonly search = signal('');

  /** Write-a-review form state. */
  readonly reviewBookingId = signal('');
  readonly rating = signal(0);
  readonly comment = signal('');
  private readonly submitAttempted = signal(false);

  readonly isClient = computed(() => this.session.hasAnyRole([ROLES.CLIENT]));

  /** Published reviews of this provider, newest first. */
  readonly published = computed(() => publishedReviews(this.reviews.reviewsFor(this.id())));

  readonly distribution = computed(() => ratingDistribution(this.published()));

  /**
   * The backend aggregate and the loaded list should agree; taking the larger
   * keeps the header honest if only one of the two arrived.
   */
  readonly reviewCount = computed(() =>
    Math.max(this.published().length, this.profile()?.reviewCount ?? 0)
  );

  /** Prefer the live aggregate; fall back to the card's stored rating. */
  readonly averageRating = computed(
    () => aggregateRating(this.published()) ?? this.profile()?.rating ?? 0
  );

  readonly positive = computed(() => positiveShare(this.published()));

  readonly visibleReviews = computed(() =>
    applyReviewQuery(this.published(), {
      stars: this.starsFilter(),
      sort: this.sort(),
      search: this.search(),
    })
  );

  readonly hasReviewFilters = computed(
    () => this.starsFilter() !== null || this.search().trim() !== ''
  );

  readonly showRatingError = computed(
    () =>
      this.submitAttempted() &&
      (this.rating() < MIN_RATING || this.rating() > MAX_RATING)
  );

  /** Reviews of this provider are in flight (`loadFor` tracks one id at a time). */
  readonly reviewsLoading = computed(() => this.reviews.isLoadingFor(this.id()));

  /** A completed visit of mine with this provider. */
  readonly hasCompletedVisit = computed(() =>
    this.bookings
      .myBookings()
      .some((b) => b.caregiverId === this.id() && b.status === 'completed')
  );

  /** Completed visits of mine with this provider that I have not rated yet. */
  readonly eligibleBookings = computed(() => {
    const rated = new Set(this.myRatedBookingIds());
    return this.bookings
      .myBookings()
      .filter(
        (b) => b.caregiverId === this.id() && b.status === 'completed' && !rated.has(b.id)
      );
  });

  readonly canReview = computed(() => this.isClient() && this.eligibleBookings().length > 0);

  readonly licenceStatus = computed(() => certificationStatus(this.profile()?.expiresAtMs));

  /** Bookings I already reviewed — hides the panel (the server enforces it too). */
  private myRatedBookingIds(): string[] {
    const me = this.session.session();
    if (!me) {
      return [];
    }
    return this.reviews
      .reviewsFor(this.id())
      .filter((r) => r.authorId === me.userId)
      .map((r) => r.bookingId);
  }

  constructor() {
    // Keep the visit picker pinned to a real target as bookings/reviews land.
    effect(() => {
      const list = this.eligibleBookings();
      if (list.length === 0) {
        return;
      }
      const current = this.reviewBookingId();
      if (!current || !list.some((b) => b.id === current)) {
        this.reviewBookingId.set(list[0].id);
      }
    });
    // The bio, specialities, services and review comments all come from the
    // backend, so switching language has to re-fetch this provider's record.
    reloadOnLanguageChange(() => {
      const id = this.id();
      if (!id) {
        return;
      }
      this.store.load(id);
      this.reviews.loadFor(id);
    });
  }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id') ?? '';
      this.id.set(id);
      // Reset per-provider UI state so filters never leak across profiles.
      this.sort.set('recent');
      this.starsFilter.set(null);
      this.search.set('');
      this.reviewBookingId.set('');
      this.rating.set(0);
      this.comment.set('');
      this.submitAttempted.set(false);
      if (!id) {
        return;
      }
      this.store.load(id);
      this.reviews.loadFor(id);
    });
    // Review eligibility is derived from my own bookings.
    this.bookings.load();
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.paramSub = null;
  }

  /** Decorative initials for an avatar bubble. */
  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  /** Filled/empty star glyphs for a rating (always paired with a text label). */
  protected starRow(rating: number): string {
    const filled = Math.max(0, Math.min(MAX_RATING, Math.round(rating)));
    return '★'.repeat(filled) + '☆'.repeat(MAX_RATING - filled);
  }

  /** "5 stars" / "1 star" — matches the accessible name used elsewhere. */
  starLabel(star: number): string {
    return `${star} ${this.i18n.t(star > 1 ? 'review.stars' : 'review.star')}`;
  }

  licenceKey(): string {
    switch (this.licenceStatus()) {
      case 'expired':
        return 'provider.licenceExpired';
      case 'expiring_soon':
        return 'provider.licenceExpiring';
      default:
        return 'provider.licenceActive';
    }
  }

  onFilterChange(value: string): void {
    this.starsFilter.set(value === '' ? null : Number(value));
  }

  onSortChange(value: string): void {
    this.sort.set(value as ReviewSort);
  }

  book(): void {
    const p = this.profile();
    if (!p) {
      return;
    }
    this.bookings.startDraft(p.id);
    void this.router.navigate(['/bookings']);
  }

  message(): void {
    const p = this.profile();
    if (!p) {
      return;
    }
    void this.router.navigate(['/chat'], {
      queryParams: { with: p.id, name: p.displayName },
    });
  }

  flag(review: Review): void {
    this.reviews.flag(review.id).subscribe();
  }

  submitReview(event: Event): void {
    event.preventDefault();
    this.submitAttempted.set(true);
    const booking = this.eligibleBookings().find((b) => b.id === this.reviewBookingId());
    if (!booking || this.rating() < MIN_RATING || this.comment().length > MAX_COMMENT_LENGTH) {
      return;
    }
    this.reviews
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
          reviewedBookingIds: this.myRatedBookingIds(),
        }
      )
      .subscribe((ok) => {
        if (ok) {
          this.submitAttempted.set(false);
          this.rating.set(0);
          this.comment.set('');
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

  formatMonth(ms: number): string {
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      month: 'long',
      year: 'numeric',
    });
  }
}
