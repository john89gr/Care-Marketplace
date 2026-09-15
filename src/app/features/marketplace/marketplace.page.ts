import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MarketplaceStore, CaregiverCard } from './marketplace.store';
import { BookingStore } from './booking.store';
import { ReviewsStore, Review } from './reviews.store';
import {
  SavedSearchStore,
  autoSearchName,
} from './saved-search.store';
import {
  encodeFilters,
  parseFilters,
  isDefaultFilters,
} from './search-params';
import { AnalyticsService } from '../../core/services/analytics.service';
import { GeolocationService } from '../../core/services/geo/geolocation.service';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import { SearchFilters } from './marketplace.store';
import { ROLES, Role } from '../../core/auth/roles';

/**
 * Marketplace search + caregiver cards (FEATURE_PLAN.md §2, §5).
 *
 * Bilingual. Load-bearing for the E2E suite: `.results .card` with an `h3`
 * title, `.reviews` for the expanded reviews, `.favorites`-style heart buttons
 * addressed by their "Add/Remove <name> to/from favorites" accessible name,
 * the "Search caregivers…" placeholder, and the "Save search"/"delete"/
 * "rename" controls — all kept in their original English wording.
 */
@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [],
  template: `
    <section class="marketplace">
      <header class="hero market-hero">
        <p class="page-eyebrow">{{ i18n.t('market.eyebrow') }}</p>
        <h1 class="page-title">{{ i18n.t('market.title') }}</h1>
        <p class="page-subtitle">{{ i18n.t('market.subtitle') }}</p>
      </header>

      <div class="filter-bar">
        <label class="field search-field">
          <span class="visually-hidden">{{ i18n.t('market.searchLabel') }}</span>
          <input
            type="search"
            [attr.placeholder]="i18n.t('market.searchPlaceholder')"
            [attr.aria-label]="i18n.t('market.searchLabel')"
            [value]="store.filters().query"
            (input)="onQuery($any($event.target).value)"
          />
        </label>

        <label class="check">
          <input
            type="checkbox"
            [checked]="store.filters().availableNowOnly"
            (change)="store.setFilters({ availableNowOnly: $any($event.target).checked })"
          />
          {{ i18n.t('market.availableNow') }}
        </label>

        <label class="field">
          <span class="field-label">{{ i18n.t('market.sortBy') }}</span>
          <select
            [value]="store.filters().sort ?? 'relevance'"
            (change)="onSortChange($any($event.target).value)"
          >
            <option value="relevance">{{ i18n.t('market.sort.relevance') }}</option>
            <option value="distance">{{ i18n.t('market.sort.distance') }}</option>
            <option value="rating">{{ i18n.t('market.sort.rating') }}</option>
            <option value="price">{{ i18n.t('market.sort.price') }}</option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">{{ i18n.t('market.maxRate') }}</span>
          <input
            type="number"
            min="0"
            step="1"
            class="budget"
            [attr.aria-label]="i18n.t('market.maxRateLabel')"
            [attr.placeholder]="i18n.t('market.budgetPlaceholder')"
            [value]="store.filters().maxHourlyRate ?? ''"
            (change)="onBudgetChange($any($event.target).value)"
            (keydown.enter)="onBudgetChange($any($event.target).value)"
          />
        </label>

        <button
          type="button"
          class="btn ghost sm"
          [attr.aria-pressed]="!!store.origin()"
          (click)="toggleGeo()"
        >
          {{ store.origin() ? i18n.t('market.usingLocation') : i18n.t('market.useLocation') }}
        </button>

        <label class="field">
          <span class="field-label">{{ i18n.t('market.minRating') }}</span>
          <select
            [value]="store.filters().minRating ?? ''"
            (change)="store.setFilters({ minRating: ratingOrNull($any($event.target).value) })"
          >
            <option value="">{{ i18n.t('market.any') }}</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </label>

        <label class="check">
          <input
            type="checkbox"
            [checked]="store.filters().favoritesOnly ?? false"
            (change)="toggleFavoritesOnly($any($event.target).checked)"
          />
          {{ i18n.t('market.favoritesOnly') }}
        </label>

        <div class="filter-actions">
          <button type="button" class="btn" (click)="onSearch()">
            {{ i18n.t('market.search') }}
          </button>
          <button type="button" class="btn secondary" (click)="reset()">
          {{ i18n.t('market.reset') }}
        </button>

        @if (savingSearch()) {
          <form class="save-form" (submit)="submitSave($event)">
            <label class="field">
              <span class="field-label">{{ i18n.t('market.searchName') }}</span>
              <input
                type="text"
                [attr.aria-label]="i18n.t('market.searchName')"
                [value]="saveName()"
                (input)="saveName.set($any($event.target).value)"
              />
            </label>
            <button type="submit" class="btn">{{ i18n.t('common.save') }}</button>
            <button type="button" class="btn secondary" (click)="savingSearch.set(false)">
              {{ i18n.t('common.cancel') }}
            </button>
          </form>
        } @else {
          <button
            type="button"
            class="btn secondary"
            [disabled]="!isClient()"
            [attr.title]="!isClient() ? i18n.t('market.saveSearchTitle') : null"
            (click)="startSave()"
          >
            {{ i18n.t('market.saveSearch') }}
          </button>
          }
        </div>
      </div>

      <div class="saved" [attr.aria-label]="i18n.t('market.savedSearches')">
        @if (saved.loading()) {
          <p class="meta">{{ i18n.t('market.loadingSaved') }}</p>
        } @else if (saved.savedSearches().length === 0 && saved.favorites().length === 0) {
          <p class="meta">{{ i18n.t('market.savedEmpty') }}</p>
        } @else {
          <ul class="saved-list" (keydown)="onSavedListKeydown($event)">
            @for (search of saved.savedSearches(); track search.id) {
              <li>
                @if (renamingId() === search.id) {
                  <form class="rename-form" (submit)="submitRename($event, search.id)">
                    <input
                      [attr.aria-label]="i18n.t('market.newName')"
                      [value]="renameValue()"
                      (input)="renameValue.set($any($event.target).value)"
                    />
                    <button type="submit" class="btn sm">{{ i18n.t('market.saveName') }}</button>
                    <button type="button" class="btn secondary sm" (click)="renamingId.set(null)">
                      {{ i18n.t('common.cancel') }}
                    </button>
                  </form>
                } @else {
                  <button
                    type="button"
                    class="link strong"
                    (click)="applySearch(search.filters, search.name)"
                  >
                    {{ search.name }}
                  </button>
                  <button type="button" class="link" (click)="startRename(search.name, search.id)">
                    {{ i18n.t('market.rename') }}
                  </button>
                  <button type="button" class="link" (click)="removeSearch(search.id)">
                    {{ i18n.t('market.delete') }}
                  </button>
                }
              </li>
            }
          </ul>
        }
        @if (saved.error()) {
          <p class="error" role="alert">{{ i18n.message(saved.errorSource(), saved.error()) }}</p>
        }
      </div>

      @if (availableFavorites().length > 0 && !(store.filters().favoritesOnly ?? false)) {
        <p class="meta watch">
          ♥
          {{
            i18n.t('market.favoritesAvailable', {
              count: availableFavorites().length,
              names: availableFavorites().map((c) => c.displayName).join(', ')
            })
          }}
        </p>
      }

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('market.searching') }}</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      } @else if (!store.hasResults()) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🔍</span>
          <p>
            {{ store.filters().favoritesOnly ? i18n.t('market.noFavoritesMatch') : i18n.t('market.noMatch') }}
          </p>
        </div>
      } @else {
        <ul class="results">
          @for (card of store.results(); track card.id) {
            <li class="card interactive">
              <div class="card-head">
                <div class="cg-id">
                  <span class="avatar" aria-hidden="true">{{ initials(card.displayName) }}</span>
                  <h3>{{ card.displayName }}</h3>
                </div>
                <button
                  type="button"
                  class="heart"
                  [class.active]="saved.isFavorite(card.id)"
                  [attr.aria-pressed]="saved.isFavorite(card.id)"
                  [attr.aria-label]="
                    i18n.t(saved.isFavorite(card.id) ? 'market.removeFavorite' : 'market.addFavorite', {
                      name: card.displayName
                    })
                  "
                  [disabled]="saved.togglingId() === card.id || !isClient()"
                  [attr.title]="!isClient() ? i18n.t('market.favoriteTitle') : null"
                  (click)="toggleFavorite(card.id)"
                >
                  {{ saved.isFavorite(card.id) ? '♥' : '♡' }}
                </button>
              </div>

              <div class="cg-facts">
                <span class="fact">
                  <span class="fact-icon" aria-hidden="true">★</span>
                  <span
                    class="fact-value"
                    [attr.aria-label]="
                      i18n.t('market.ratedAria', { rating: card.rating, count: card.reviewCount ?? 0 })
                    "
                  >
                    {{ card.rating }}
                  </span>
                </span>
                <span class="fact">
                  <span class="fact-icon" aria-hidden="true">📍</span>
                  <span class="fact-value">{{ card.distanceKm }} km</span>
                </span>
                <span class="fact">
                  <span class="fact-icon" aria-hidden="true">💶</span>
                  <span class="fact-value">{{ card.hourlyRate }}€/h</span>
                </span>
                <span class="badge info">
                  {{ i18n.t('market.reviewsCount', { count: card.reviewCount ?? 0 }) }}
                </span>
                @if (card.availableNow) {
                  <span class="badge success">
                    <span class="dot"></span>{{ i18n.t('market.availableNowChip') }}
                  </span>
                }
              </div>

              <p class="roles">
                @for (role of card.roles; track role) {
                  <span class="badge accent">{{ roleLabel(role) }}</span>
                }
                @if (store.filters().sort === 'relevance') {
                  <button
                    type="button"
                    class="link why"
                    [attr.aria-expanded]="whyCard() === card.id"
                    (click)="toggleWhy(card.id)"
                  >
                    {{ i18n.t('market.why') }}
                  </button>
                }
              </p>

              @if (whyCard() === card.id) {
                <ul class="why-lines" [attr.aria-label]="i18n.t('market.scoreBreakdown')">
                  @for (line of breakdownLines(card.id); track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              }

              <p class="card-actions">
                <button type="button" class="btn" (click)="book(card.id)">
                  {{ i18n.t('market.requestBooking') }}
                </button>
                <button type="button" class="btn secondary" (click)="chat(card)">
                  {{ i18n.t('market.message') }}
                </button>
                <button
                  type="button"
                  class="btn secondary"
                  [attr.aria-expanded]="expandedCard() === card.id"
                  (click)="toggleReviews(card)"
                >
                  {{
                    expandedCard() === card.id
                      ? i18n.t('market.hideReviews')
                      : i18n.t('market.reviews', { count: card.reviewCount ?? 0 })
                  }}
                </button>
              </p>

              @if (expandedCard() === card.id) {
                <div class="reviews">
                  @if (reviews.isLoadingFor(card.id)) {
                    <p class="meta">{{ i18n.t('market.loadingReviews') }}</p>
                  } @else if (reviews.reviewsFor(card.id).length === 0) {
                    <p class="meta">{{ i18n.t('market.noReviews') }}</p>
                  } @else {
                    <ul class="list">
                      @for (review of reviews.reviewsFor(card.id); track review.id) {
                        <li>
                          <p class="meta">
                            <strong>{{ review.authorName }}</strong> · ★ {{ review.rating }} ·
                            {{ reviewDate(review.createdAtMs) }} ·
                            {{ i18n.t('market.visit', { id: review.bookingId }) }}
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
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .market-hero {
      margin-bottom: var(--space-5);
    }
    .market-hero .page-subtitle {
      font-size: var(--text-md);
    }
    /* Search panel: the query takes a full-width row, filters wrap beneath. */
    .filter-bar {
      align-items: flex-end;
      box-shadow: var(--shadow-md);
    }
    .filter-bar .search-field {
      flex: 1 1 100%;
    }
    .filter-bar input[type='search'] {
      border-radius: var(--radius-full);
      font-size: var(--text-md);
      padding: 0.7rem 1.2rem;
    }
    .filter-actions {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .check {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      font-weight: var(--weight-normal);
    }
    .check input[type='checkbox'] {
      width: auto;
    }
    .saved {
      margin: var(--space-3) 0 var(--space-4);
    }
    /* Saved searches read as removable chips. */
    .saved-list {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
    }
    .saved-list li {
      display: flex;
      align-items: center;
      gap: var(--space-1) var(--space-2);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      padding: 0.3rem 0.9rem;
      box-shadow: var(--shadow-xs);
    }
    /* Base link look comes from the global .link class. */
    .link.strong {
      font-weight: var(--weight-semibold);
    }
    .rename-form,
    .save-form {
      display: flex;
      gap: var(--space-2);
      align-items: flex-end;
    }
    .rename-form input,
    .save-form input {
      max-width: 14rem;
    }
    /* Caregiver cards: roomier surface, gradient identity, tiled facts. */
    .results .card {
      padding: var(--space-5);
    }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2);
    }
    .cg-id {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-width: 0;
    }
    .cg-id .avatar {
      width: 3rem;
      height: 3rem;
      font-size: var(--text-md);
      box-shadow: var(--shadow-sm), var(--shadow-accent);
    }
    .cg-id h3 {
      margin: 0;
      font-size: var(--text-md);
    }
    .cg-facts {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: var(--space-3) 0;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    .fact {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: var(--surface-raised);
      border-radius: var(--radius-sm);
      padding: 0.3rem 0.65rem;
    }
    .fact-icon {
      font-size: var(--text-sm);
      line-height: 1;
    }
    .fact-value {
      font-weight: var(--weight-semibold);
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }
    .heart {
      display: inline-grid;
      place-items: center;
      min-width: 2.5rem;
      min-height: 2.5rem;
      font-size: 1.35rem;
      line-height: 1;
      background: none;
      border: 1px solid transparent;
      border-radius: var(--radius-full);
      cursor: pointer;
      padding: 0.25rem;
      color: var(--accent);
      box-shadow: none;
      transition:
        background-color var(--dur-fast) ease,
        color var(--dur-fast) ease,
        border-color var(--dur-fast) ease,
        transform var(--dur-fast) var(--ease);
    }
    .heart:hover:not(:disabled) {
      background: var(--accent-soft);
      border-color: color-mix(in srgb, var(--accent) 25%, transparent);
    }
    .heart:active:not(:disabled) {
      transform: scale(1.12);
    }
    .heart.active {
      color: var(--danger);
    }
    .heart.active:hover:not(:disabled) {
      background: var(--danger-soft);
      border-color: color-mix(in srgb, var(--danger) 25%, transparent);
    }
    .reviews {
      margin-top: var(--space-3);
      border-top: 1px solid var(--border);
      padding-top: var(--space-3);
    }
    .reviews .list {
      gap: var(--space-2);
    }
    .reviews .list > li {
      background: var(--surface-raised);
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
    }
    .watch {
      color: var(--success);
    }
    .budget {
      width: 5.5rem;
    }
    .roles {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin: var(--space-1) 0;
    }
    .why-lines {
      margin: var(--space-1) 0;
      padding-left: 1.1rem;
      font-size: var(--text-sm);
      color: var(--text-muted);
      display: grid;
      gap: 0.1rem;
    }
    button.link.why {
      font-size: var(--text-xs);
    }
    .card-actions .btn {
      flex: 1 1 auto;
    }
    @media (min-width: 60rem) {
      .results {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 34rem) {
      .results .card {
        padding: var(--space-4);
      }
      .rename-form,
      .save-form {
        flex-wrap: wrap;
      }
      .rename-form input,
      .save-form input {
        max-width: none;
        flex: 1 1 100%;
      }
    }
  `,
})
export class MarketplacePage implements OnInit, OnDestroy {
  readonly store = inject(MarketplaceStore);
  readonly reviews = inject(ReviewsStore);
  readonly saved = inject(SavedSearchStore);
  protected readonly i18n = inject(I18n);
  private readonly booking = inject(BookingStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly geo = inject(GeolocationService);
  private readonly session = inject(SessionStore);

  /**
   * Per-user client guard (subtask 11): saved searches & favorites belong to
   * a signed-in family. The marketplace route itself stays public so anyone
   * can browse; only the mutations below are gated.
   */
  readonly isClient = computed(() => this.session.hasAnyRole([ROLES.CLIENT]));

  /** Id of the card whose reviews are expanded (null = none). */
  readonly expandedCard = signal<string | null>(null);
  /** Id of the card whose score breakdown is expanded (null = none). */
  readonly whyCard = signal<string | null>(null);
  readonly renamingId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly savingSearch = signal(false);
  readonly saveName = signal('');

  /** Initials for a caregiver card's avatar (decorative). */
  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  /** Debounce handle for free-text query input (subtask 12). */
  private queryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Favorites that are available now (watcher strip). */
  readonly availableFavorites = computed(() => {
    const favorites = this.saved.favoriteIds();
    return this.store
      .results()
      .filter((card) => favorites.has(card.id) && card.availableNow);
  });

  constructor() {
    // Keep the marketplace favorites filter in sync once the async
    // saved.load() resolves (and on every later toggle).
    effect(() => {
      this.store.setFavoriteIds(new Set(this.saved.favoriteIds()));
    });
  }

  ngOnInit(): void {
    this.saved.load();
    // Restore filters from URL (deep-linkable searches). Favorites-only is
    // session-scoped but still readable from the URL.
    const params = this.route.snapshot.queryParamMap;
    const parsed = parseFilters({
      q: params.get('q'),
      roles: params.get('roles'),
      maxDistance: params.get('maxDistance'),
      minRating: params.get('minRating'),
      availableNow: params.get('availableNow'),
      sort: params.get('sort'),
      maxRate: params.get('maxRate'),
      favoritesOnly: params.get('favoritesOnly'),
    });
    this.store.setFilters(parsed);
    this.syncFavoriteIds();
    this.store.search();
  }

  ngOnDestroy(): void {
    if (this.queryTimer !== null) {
      clearTimeout(this.queryTimer);
      this.queryTimer = null;
    }
  }

  onSearch(): void {
    this.syncUrl();
    this.store.search();
  }

  onSortChange(sort: string): void {
    this.store.setFilters({ sort: sort as SearchFilters['sort'] });
    this.syncUrl();
    this.store.search();
  }

  onBudgetChange(value: string): void {
    const parsed = value === '' ? null : Number(value);
    this.store.setFilters({
      maxHourlyRate: parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    });
    this.syncUrl();
    this.store.search();
  }

  /** Toggle real-geo ranking via the geolocation service. */
  toggleGeo(): void {
    if (this.store.origin()) {
      this.store.setOrigin(null);
      this.store.search();
      return;
    }
    this.geo.currentPosition().subscribe({
      next: (point) => {
        this.store.setOrigin(point);
        this.store.search();
      },
      error: () => {
        this.analytics.track('geo_denied', {});
      },
    });
  }

  toggleWhy(cardId: string): void {
    this.whyCard.update((current) => (current === cardId ? null : cardId));
  }

  /** Human-readable score breakdown for the explainer. */
  breakdownLines(cardId: string): string[] {
    const b = this.store.breakdowns()[cardId];
    if (!b) {
      return [];
    }
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const lines = [
      this.i18n.t('market.breakdown.rating', { pct: pct(b.rating) }),
      this.i18n.t('market.breakdown.availableNow', { pct: pct(b.availableNow) }),
      this.i18n.t('market.breakdown.distance', { pct: pct(b.distance) }),
      this.i18n.t('market.breakdown.price', { pct: pct(b.price) }),
      this.i18n.t('market.breakdown.speciality', { pct: pct(b.speciality) }),
      this.i18n.t('market.breakdown.history', { pct: pct(b.history) }),
    ];
    if (b.cancellationPenalty < 0) {
      lines.push(this.i18n.t('market.breakdown.cancellations', { pct: pct(-b.cancellationPenalty) }));
    }
    return lines;
  }

  reset(): void {
    if (this.queryTimer !== null) {
      clearTimeout(this.queryTimer);
      this.queryTimer = null;
    }
    this.store.resetFilters();
    this.syncUrl();
    this.store.search();
  }

  applySearch(filters: SearchFiltersLike, name: string): void {
    // Old saved searches predate v2 ranking fields — default them so
    // applying a legacy save resets sort/budget instead of keeping stale UI state.
    this.store.setFilters({
      ...filters,
      sort: filters.sort ?? 'relevance',
      maxHourlyRate: filters.maxHourlyRate ?? null,
    });
    this.analytics.track('saved_search_applied', { name });
    this.syncUrl();
    this.store.search();
  }

  startSave(): void {
    this.saveName.set(autoSearchName(this.store.filters()));
    this.savingSearch.set(true);
  }

  submitSave(event: Event): void {
    event.preventDefault();
    const filters = this.store.filters();
    const name = this.saveName().trim() || autoSearchName(filters);
    this.saved.save(name, filters).subscribe((ok) => {
      if (ok) {
        this.savingSearch.set(false);
        this.analytics.track('saved_search_created', { name });
      }
    });
  }

  startRename(name: string, id: string): void {
    this.renamingId.set(id);
    this.renameValue.set(name);
  }

  submitRename(event: Event, id: string): void {
    event.preventDefault();
    const name = this.renameValue().trim();
    if (!name) {
      return;
    }
    this.saved.rename(id, name).subscribe((ok) => {
      if (ok) {
        this.renamingId.set(null);
      }
    });
  }

  removeSearch(id: string): void {
    this.saved.remove(id).subscribe();
  }

  /**
   * Roving-focus navigation for the saved-searches list (subtask 18): arrow
   * keys move between items, Home/End jump to the first/last. Focus lands on
   * the item's primary action (apply search) so the whole list is operable
   * from the keyboard without tabbing through every inline button.
   */
  onSavedListKeydown(event: KeyboardEvent): void {
    const item = (event.target as HTMLElement | null)?.closest('li');
    const list = (event.target as HTMLElement | null)?.closest('.saved-list');
    if (!item || !list) {
      return;
    }
    const items = Array.from(list.querySelectorAll<HTMLElement>('li'));
    const index = items.indexOf(item);
    let target: HTMLElement | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      target = items[index + 1];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      target = items[index - 1];
    } else if (event.key === 'Home') {
      target = items[0];
    } else if (event.key === 'End') {
      target = items[items.length - 1];
    } else {
      return;
    }
    event.preventDefault();
    const focusable = target?.querySelector<HTMLElement>('button');
    focusable?.focus();
  }

  toggleFavorite(caregiverId: string): void {
    this.saved.toggleFavorite(caregiverId).subscribe((ok) => {
      if (ok) {
        this.syncFavoriteIds();
        // Re-run client-side filtering when favoritesOnly is active.
        if (this.store.filters().favoritesOnly) {
          this.store.search();
        }
      }
    });
  }

  toggleFavoritesOnly(checked: boolean): void {
    this.store.setFilters({ favoritesOnly: checked });
    this.syncUrl();
    this.store.search();
  }

  toggleReviews(card: CaregiverCard): void {
    if (this.expandedCard() === card.id) {
      this.expandedCard.set(null);
    } else {
      this.expandedCard.set(card.id);
      this.reviews.loadFor(card.id);
    }
  }

  flag(review: Review): void {
    this.reviews.flag(review.id).subscribe();
  }

  reviewDate(ms: number): string {
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  roleLabel(role: string): string {
    return this.i18n.t(`market.role.${role}`);
  }

  book(caregiverId: string): void {
    this.booking.startDraft(caregiverId);
  }

  chat(card: CaregiverCard): void {
    this.router.navigate(['/chat'], {
      queryParams: { with: card.id, name: card.displayName },
    });
  }

  onQuery(query: string): void {
    this.store.setFilters({ query });
  }

  ratingOrNull(value: string): number | null {
    return value === '' ? null : Number(value);
  }

  /** Push favorite ids into the marketplace store for favoritesOnly filtering. */
  private syncFavoriteIds(): void {
    this.store.setFavoriteIds(new Set(this.saved.favoriteIds()));
  }

  /** Reflect current filters into the URL (clean URL when defaults). */
  private syncUrl(): void {
    const filters = this.store.filters();
    if (isDefaultFilters(filters) && !filters.favoritesOnly) {
      this.router.navigate([], { queryParams: {} });
      return;
    }
    this.router.navigate([], {
      queryParams: {
        ...encodeFilters(filters),
        ...(filters.favoritesOnly ? { favoritesOnly: 'true' } : {}),
      },
    });
  }
}

interface SearchFiltersLike {
  query: string;
  roles: Role[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
  favoritesOnly?: boolean;
  /** v2 ranking fields; optional so pre-v2 saved searches still apply. */
  sort?: SearchFilters['sort'];
  maxHourlyRate?: SearchFilters['maxHourlyRate'];
}
