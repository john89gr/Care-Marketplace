import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MarketplaceStore, CaregiverCard } from './marketplace.store';
import { BookingStore } from './booking.store';
import { ROLES } from '../../core/auth/roles';

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
          [value]="store.filters().query"
          (input)="onQuery($any($event.target).value)"
        />
        <label>
          <input
            type="checkbox"
            [checked]="store.filters().availableNowOnly"
            (change)="store.setFilters({ availableNowOnly: $any($event.target).checked })"
          />
          Available now
        </label>
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
        <button type="button" (click)="store.search()">Search</button>
        <button type="button" class="secondary" (click)="store.resetFilters()">Reset</button>
      </div>

      @if (store.loading()) {
        <p>Searching…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else if (!store.hasResults()) {
        <p>No caregivers match the current filters.</p>
      } @else {
        <ul class="results">
          @for (card of store.results(); track card.id) {
            <li class="card">
              <h3>{{ card.displayName }}</h3>
              <p class="roles">
                @for (role of card.roles; track role) {
                  <span class="chip">{{ roleLabel(role) }}</span>
                }
              </p>
              <p class="meta">
                ★ {{ card.rating }} · {{ card.distanceKm }} km · {{ card.hourlyRate }}/h
                @if (card.availableNow) {
                  <span class="chip now">available now</span>
                }
              </p>
              <p class="actions">
                <button type="button" (click)="book(card.id)">Request booking</button>
                <button type="button" class="secondary" (click)="chat(card)">Message</button>
              </p>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class MarketplacePage implements OnInit {
  readonly store = inject(MarketplaceStore);
  private readonly booking = inject(BookingStore);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.store.search();
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  book(caregiverId: string): void {
    this.booking.startDraft(caregiverId);
  }

  chat(card: CaregiverCard): void {
    this.router.navigate(['/chat'], { queryParams: { with: card.id, name: card.displayName } });
  }

  onQuery(query: string): void {
    this.store.setFilters({ query });
  }

  ratingOrNull(value: string): number | null {
    return value === '' ? null : Number(value);
  }
}
