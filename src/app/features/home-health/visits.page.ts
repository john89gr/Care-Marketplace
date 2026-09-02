import { Component, computed, inject, OnInit } from '@angular/core';
import { VisitStore, Visit } from './visit.store';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

@Component({
  selector: 'app-visits',
  standalone: true,
  imports: [],
  template: `
    <section class="visits">
      <h1>My visits</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.visits().length === 0) {
        <p>No visits yet.</p>
      } @else {
        <ul class="results">
          @for (visit of store.visits(); track visit.id) {
            <li class="card">
              <div class="row">
                <h3>{{ visit.act }}</h3>
                <span class="chip" [class.ok]="visit.status === 'completed'"
                  [class.now]="visit.status === 'in-progress'">
                  {{ visit.status }}
                </span>
              </div>
              <p class="meta">{{ visit.clientName }} · {{ formatDate(visit.scheduledAtMs) }}</p>

              @if (visit.checkIn) {
                <p class="meta">Check-in: {{ position(visit.checkIn) }}</p>
              }
              @if (visit.checkOut) {
                <p class="meta">Check-out: {{ position(visit.checkOut) }}</p>
              }

              @if (visit.status === 'scheduled') {
                <button type="button"
                  [disabled]="store.busyId() === visit.id"
                  (click)="checkIn(visit)">
                  {{ store.busyId() === visit.id ? 'Checking in…' : 'Check in (GPS)' }}
                </button>
              } @else if (visit.status === 'in-progress') {
                <button type="button" class="secondary" (click)="startTracking(visit)">Start live tracking</button>
                <button type="button" (click)="checkOut(visit)">Check out (GPS)</button>
              }
            </li>
          }
        </ul>

        @if (store.activeVisit()) {
          <h2>Live tracking</h2>
          @if (store.positionError()) {
            <p class="error" role="alert">{{ store.positionError() }}</p>
          } @else if (livePoint()) {
            <p class="meta">📍 {{ position(livePoint()!) }} · accuracy ±{{ livePoint()!.accuracyM.toFixed(0) }} m</p>
          } @else {
            <p class="meta">Waiting for GPS fix…</p>
          }
        }
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `,
  styles: `
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success); color: #fff; }
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
  `,
})
export class VisitsPage implements OnInit {
  readonly store = inject(VisitStore);

  readonly livePoint = computed(() => {
    const active = this.store.activeVisit();
    return active ? this.store.positionOf(active.id) : null;
  });

  ngOnInit(): void {
    this.store.connect();
    this.store.load();
  }

  checkIn(visit: Visit): void {
    this.store.checkIn(visit.id).subscribe();
  }

  checkOut(visit: Visit): void {
    this.store.checkOut(visit.id).subscribe((ok) => {
      if (ok) {
        this.store.stopTracking();
      }
    });
  }

  startTracking(visit: Visit): void {
    this.store.startTracking(visit.id);
  }

  position(point: { lat: number; lng: number }): string {
    return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
