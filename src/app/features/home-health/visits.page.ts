import { Component, computed, inject, OnInit } from '@angular/core';
import { VisitStore, Visit } from './visit.store';
import { I18n } from '../../core/i18n/i18n.service';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Badge tone per visit status (the label carries the meaning, not the colour). */
const STATUS_TONES: Record<string, string> = {
  scheduled: 'info',
  'in-progress': 'warning',
  completed: 'success',
};

@Component({
  selector: 'app-visits',
  standalone: true,
  imports: [],
  template: `
    <section class="visits">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('visits.title') }}</h1>
        </div>
      </header>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.visits().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🏠</span>
          <p>{{ i18n.t('visits.empty') }}</p>
        </div>
      } @else {
        <ul class="results">
          @for (visit of store.visits(); track visit.id) {
            <li class="card interactive">
              <div class="row">
                <div>
                  <h3>{{ visit.act }}</h3>
                  <p class="meta">
                    {{ visit.clientName }} · {{ formatDate(visit.scheduledAtMs) }}
                  </p>
                </div>
                <span [class]="'badge ' + statusTone(visit.status)">
                  <span class="dot"></span>{{ visit.status }}
                </span>
              </div>

              @if (visit.checkIn || visit.checkOut) {
                <div class="geo-rows">
                  @if (visit.checkIn) {
                    <p class="geo">
                      <span class="geo-icon" aria-hidden="true">📍</span>
                      {{ i18n.t('visits.checkInLabel', { position: position(visit.checkIn) }) }}
                    </p>
                  }
                  @if (visit.checkOut) {
                    <p class="geo">
                      <span class="geo-icon" aria-hidden="true">🏁</span>
                      {{ i18n.t('visits.checkOutLabel', { position: position(visit.checkOut) }) }}
                    </p>
                  }
                </div>
              }

              <div class="card-actions">
                @if (visit.status === 'scheduled') {
                  <button type="button" class="btn"
                    [disabled]="store.busyId() === visit.id"
                    (click)="checkIn(visit)">
                    {{
                      store.busyId() === visit.id
                        ? i18n.t('visits.checkingIn')
                        : i18n.t('visits.checkInGps')
                    }}
                  </button>
                } @else if (visit.status === 'in-progress') {
                  <button type="button" class="btn secondary" (click)="startTracking(visit)">
                    {{ i18n.t('visits.startTracking') }}
                  </button>
                  <button type="button" class="btn" (click)="checkOut(visit)">
                    {{ i18n.t('visits.checkOutGps') }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>

        @if (store.activeVisit()) {
          <section class="card live-panel">
            <h2 class="section-title">{{ i18n.t('visits.liveTracking') }}</h2>
            @if (store.positionError()) {
              <p class="error" role="alert">{{ i18n.message(store.positionErrorSource(), store.positionError()) }}</p>
            } @else if (livePoint()) {
              <div class="track">
                <span class="icon-bubble" aria-hidden="true">📍</span>
                <div>
                  <span class="track-coords">{{ position(livePoint()!) }}</span>
                  <p class="meta">accuracy ±{{ livePoint()!.accuracyM.toFixed(0) }} m</p>
                </div>
              </div>
            } @else {
              <p class="meta waiting">
                <span class="spinner" aria-hidden="true"></span>
                {{ i18n.t('visits.waitingGps') }}
              </p>
            }
          </section>
        }
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }
    </section>
  `,
  styles: `
    .row {
      align-items: center;
    }
    .row h3 {
      margin: 0 0 0.15rem;
      font-size: var(--text-md);
    }
    .row .meta {
      margin: 0;
    }
    .geo-rows {
      display: grid;
      gap: var(--space-1);
      margin-top: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .geo {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-muted);
    }
    .geo-icon {
      flex: none;
    }
    .card-actions {
      margin-top: var(--space-3);
    }
    .live-panel {
      margin-top: var(--space-5);
      border-color: var(--accent);
      box-shadow: var(--shadow-md);
      animation: page-enter var(--dur) var(--ease) both;
    }
    .live-panel .section-title {
      margin-bottom: var(--space-3);
    }
    .track {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .track-coords {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .track .meta {
      margin: 0;
    }
    .waiting {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
    }
    .spinner {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: var(--radius-full);
      border: 2px solid var(--border-strong);
      border-top-color: var(--accent);
      animation: visits-spin 800ms linear infinite;
    }
    @keyframes visits-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
  `,
})
export class VisitsPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(VisitStore);

  readonly livePoint = computed(() => {
    const active = this.store.activeVisit();
    return active ? this.store.positionOf(active.id) : null;
  });

  ngOnInit(): void {
    this.store.connect();
    this.store.load();
  }

  statusTone(status: string): string {
    return STATUS_TONES[status] ?? '';
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
