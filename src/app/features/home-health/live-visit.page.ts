import { Component, inject, OnInit } from '@angular/core';
import { VisitStore } from './visit.store';

@Component({
  selector: 'app-live-visit',
  standalone: true,
  imports: [],
  template: `
    <section class="live-visit">
      <h1>Live visit tracking</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.liveVisits().length === 0) {
        <p>No visits in progress right now.</p>
      } @else {
        <ul class="results">
          @for (visit of store.liveVisits(); track visit.id) {
            <li class="card">
              <h3>{{ visit.act }} — {{ visit.providerName }}</h3>
              <p class="meta">
                <span class="chip now">in progress</span>
                started {{ formatDate(visit.scheduledAtMs) }}
              </p>
              @if (store.positionOf(visit.id); as point) {
                <p class="meta">📍 {{ position(point) }} · accuracy ±{{ point.accuracyM.toFixed(0) }} m · {{ timeAgo(point.atMs) }}</p>
                <a [href]="mapsUrl(point)" target="_blank" rel="noopener">Open in Maps</a>
              } @else {
                <p class="meta">Waiting for a live position update…</p>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class LiveVisitPage implements OnInit {
  readonly store = inject(VisitStore);

  ngOnInit(): void {
    this.store.connect();
    this.store.load();
  }

  position(point: { lat: number; lng: number }): string {
    return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  }

  mapsUrl(point: { lat: number; lng: number }): string {
    return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  }

  timeAgo(atMs: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
    if (seconds < 60) {
      return `${seconds}s ago`;
    }
    return `${Math.round(seconds / 60)}m ago`;
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
