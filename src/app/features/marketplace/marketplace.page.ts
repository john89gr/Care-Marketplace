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
import { SearchFilters } from './marketplace.store';
import { ROLES, Role } from '../../core/auth/roles';

const ROLE_LABELS: Record<string, string> = {
  [ROLES.CAREGIVER]: 'Caregiver',
  [ROLES.NURSE]: 'Nurse',
  [ROLES.PHYSIO]: 'Physiotherapist',
  [ROLES.PHARMACY]: 'Pharmacy',
  [ROLES.CLIENT]: 'Family',
  [ROLES.ADMIN]: 'Admin',
};

@Component({
  selector: 'app-marketplace',
  standalone: true,
  imports: [],
  template: `
    <section class="marketplace">
      <h1>Marketplace</h1>

      <div class="filters">
        <input
          type="search"
          placeholder="Search caregivers…"
          aria-label="Search caregivers"
          [value]="store.filters().query"
          (input)="onQuery($any($event.target).value)"
        />
        <label>
          <input
            type="checkbox"
            [checked]="store.filters().availableNowOnly"
            (change)="
              store.setFilters({ availableNowOnly: $any($event.target).checked })
            "
          />
          Available now
        </label>
        <label>
          Sort by
          <select
            [value]="store.filters().sort ?? 'relevance'"
            (change)="onSortChange($any($event.target).value)"
          >
            <option value="relevance">Best match</option>
            <option value="distance">Distance</option>
            <option value="rating">Rating</option>
            <option value="price">Price (low → high)</option>
          </select>
        </label>
        <label>
          Max €/h
          <input
            type="number"
            min="0"
            step="1"
            class="budget"
            aria-label="Maximum hourly rate in euros"
            placeholder="Budget"
            [value]="store.filters().maxHourlyRate ?? ''"
            (change)="onBudgetChange($any($event.target).value)"
            (keydown.enter)="onBudgetChange($any($event.target).value)"
          />
        </label>
        <button
          type="button"
          class="link geo"
          [attr.aria-pressed]="!!store.origin()"
          (click)="toggleGeo()"
        >
          {{ store.origin() ? '📍 Using my location' : 'Use my location' }}
        </button>
        <label>
          Min rating
          <select
            [value]="store.filters().minRating ?? ''"
            (change)="store.setFilters({ minRating: ratingOrNull($any($event.target).value) })"
          >
            <option value="">Any</option>
            <option value="3">3+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            [checked]="store.filters().favoritesOnly ?? false"
            (change)="toggleFavoritesOnly($any($event.target).checked)"
          />
          Favorites only
        </label>
        <button type="button" (click)="onSearch()">Search</button>
        <button type="button" class="secondary" (click)="reset()">Reset</button>
        @if (savingSearch()) {
          <form class="save-form" (submit)="submitSave($event)">
            <label>
              Search name
              <input
                type="text"
                aria-label="Search name"
                [value]="saveName()"
                (input)="saveName.set($any($event.target).value)"
              />
            </label>
            <button type="submit">Save</button>
            <button type="button" class="secondary" (click)="savingSearch.set(false)">Cancel</button>
          </form>
        } @else {
          <button
            type="button"
            class="secondary"
            [disabled]="!isClient()"
            [attr.title]="!isClient() ? 'Sign in as a family to save searches' : null"
            (click)="startSave()"
          >
            Save search
          </button>
        }
      </div>

      <div class="saved" aria-label="Saved searches">
        @if (saved.loading()) {
          <p class="meta">Loading saved searches…</p>
        } @else if (saved.savedSearches().length === 0 && saved.favorites().length === 0) {
          <p class="meta">
            No saved searches yet — set some filters and click “Save search”.
          </p>
        } @else {
          <ul class="saved-list" (keydown)="onSavedListKeydown($event)">
            @for (search of saved.savedSearches(); track search.id) {
              <li>
                @if (renamingId() === search.id) {
                  <form class="rename-form" (submit)="submitRename($event, search.id)">
                    <input
                      aria-label="New name"
                      [value]="renameValue()"
                      (input)="renameValue.set($any($event.target).value)"
                    />
                    <button type="submit">Save name</button>
                    <button type="button" class="secondary" (click)="renamingId.set(null)">
                      Cancel
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
                  <button
                    type="button"
                    class="link"
                    (click)="startRename(search.name, search.id)"
                  >
                    rename
                  </button>
                  <button
                    type="button"
                    class="link"
                    (click)="removeSearch(search.id)"
                  >
                    delete
                  </button>
                }
              </li>
            }
          </ul>
        }
        @if (saved.error()) {
          <p class="error" role="alert">{{ saved.error() }}</p>
        }
      </div>

      @if (availableFavorites().length > 0 && !(store.filters().favoritesOnly ?? false)) {
        <p class="meta watch">
          ♥ {{ availableFavorites().length }} favorite{{ availableFavorites().length > 1 ? 's' : '' }}
          available now: {{ availableFavorites().map((c) => c.displayName).join(', ') }}
        </p>
      }

      @if (store.loading()) {
        <p>Searching…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else if (!store.hasResults()) {
        @if (store.filters().favoritesOnly) {
          <p>
            No favorites match the current filters. Remove the “Favorites only”
            filter or add caregivers to your favorites with the ♡ button.
          </p>
        } @else {
          <p>No caregivers match the current filters.</p>
        }
      } @else {
        <ul class="results">
          @for (card of store.results(); track card.id) {
            <li class="card">
              <div class="card-head">
                <h3>{{ card.displayName }}</h3>
                <button
                  type="button"
                  class="heart"
                  [class.active]="saved.isFavorite(card.id)"
                  [attr.aria-pressed]="saved.isFavorite(card.id)"
                  [attr.aria-label]="
                    (saved.isFavorite(card.id) ? 'Remove ' : 'Add ') +
                    card.displayName +
                    (saved.isFavorite(card.id) ? ' from favorites' : ' to favorites')
                  "
                  [disabled]="saved.togglingId() === card.id || !isClient()"
                  [attr.title]="!isClient() ? 'Sign in as a family to save favorites' : null"
                  (click)="toggleFavorite(card.id)"
                >
                  {{ saved.isFavorite(card.id) ? '♥' : '♡' }}
                </button>
              </div>
              <p class="roles">
                @for (role of card.roles; track role) {
                  <span class="chip">{{ roleLabel(role) }}</span>
                }
              </p>
              <p class="meta">
                <span [attr.aria-label]="'Rated ' + card.rating + ' out of 5 from ' + (card.reviewCount ?? 0) + ' reviews'">
                  ★ {{ card.rating }}
                </span>
                <span class="chip count">{{ card.reviewCount ?? 0 }} reviews</span>
                · {{ card.distanceKm }} km · {{ card.hourlyRate }}/h
                @if (card.availableNow) {
                  <span class="chip now">available now</span>
                }
                @if (store.filters().sort === 'relevance') {
                  <button
                    type="button"
                    class="link why"
                    [attr.aria-expanded]="whyCard() === card.id"
                    (click)="toggleWhy(card.id)"
                  >
                    why these results?
                  </button>
                }
              </p>
              @if (whyCard() === card.id) {
                <ul class="why" aria-label="Score breakdown">
                  @for (line of breakdownLines(card.id); track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              }
              <p class="actions">
                <button type="button" (click)="book(card.id)">Request booking</button>
                <button type="button" class="secondary" (click)="chat(card)">Message</button>
                <button
                  type="button"
                  class="secondary"
                  [attr.aria-expanded]="expandedCard() === card.id"
                  (click)="toggleReviews(card)"
                >
                  {{ expandedCard() === card.id ? 'Hide reviews' : 'Reviews (' + (card.reviewCount ?? 0) + ')' }}
                </button>
              </p>
              @if (expandedCard() === card.id) {
                <div class="reviews">
                  @if (reviews.isLoadingFor(card.id)) {
                    <p class="meta">Loading reviews…</p>
                  } @else if (reviews.reviewsFor(card.id).length === 0) {
                    <p class="meta">No reviews yet.</p>
                  } @else {
                    <ul>
                      @for (review of reviews.reviewsFor(card.id); track review.id) {
                        <li>
                          <p class="meta">
                            <strong>{{ review.authorName }}</strong> · ★ {{ review.rating }} ·
                            {{ reviewDate(review.createdAtMs) }} · visit {{ review.bookingId }}
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
                            Report
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
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
    .saved { margin: 0.75rem 0 1rem; }
    .saved-list { list-style: none; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0; padding: 0; }
    .saved-list li { display: flex; gap: 0.5rem; align-items: baseline; }
    .link { background: none; border: none; color: var(--accent, #4f7cff); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
    .link.strong { font-weight: 600; }
    .rename-form { display: flex; gap: 0.5rem; }
    .rename-form input { max-width: 14rem; }
    .save-form { display: flex; gap: 0.5rem; align-items: end; }
    .save-form input { max-width: 14rem; }
    .card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .heart { font-size: 1.35rem; line-height: 1; background: none; border: none; cursor: pointer; padding: 0.25rem 0.5rem; color: var(--accent, #4f7cff); }
    .heart.active { color: var(--danger, #c62828); }
    .reviews { margin-top: 0.5rem; border-top: 1px solid var(--border, #d9dee7); padding-top: 0.5rem; }
    .reviews ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .reviews li { padding: 0.5rem 0; }
    .chip.count { background: var(--surface-2, #eef1f6); color: inherit; }
    .watch { color: var(--success, #1d7a3d); }
    .budget { width: 5.5rem; }
    .geo { text-decoration: none; }
    .why { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--text-muted); }
    .why.why-lines { display: grid; gap: 0.1rem; }
    button.link.why { text-decoration: underline; font-size: 0.8rem; }
  `,
})
export class MarketplacePage implements OnInit, OnDestroy {
  readonly store = inject(MarketplaceStore);
  readonly reviews = inject(ReviewsStore);
  readonly saved = inject(SavedSearchStore);
  private readonly booking = inject(BookingStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly geo = inject(GeolocationService);
  private readonly session = inject(SessionStore);

  /**
   * Per-user client guard (subtask 11): saved searches & favorites belong to
   * a signed-in family. The marketplace route itself stays public so anyone
   * can browse; only the mutations below are gated. The demo backend isolates
   * both collections by userId.
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
      `Rating ★: ${pct(b.rating)}`,
      `Available now: ${pct(b.availableNow)}`,
      `Distance band: ${pct(b.distance)}`,
      `Price fit: ${pct(b.price)}`,
      `Speciality match: ${pct(b.speciality)}`,
      `Completed visits: ${pct(b.history)}`,
    ];
    if (b.cancellationPenalty < 0) {
      lines.push(`Recent cancellations: −${pct(-b.cancellationPenalty)}`);
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
    return new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
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
