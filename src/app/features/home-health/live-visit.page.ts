import { Component, inject, OnInit } from '@angular/core';
import { VisitStore } from './visit.store';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-live-visit',
  standalone: true,
  imports: [],
  template: `
    <section class="live-visit">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('liveVisit.title') }}</h1>
        </div>
        @if (store.liveVisits().length > 0) {
          <div class="page-actions">
            <span class="badge success live-badge">
              <span class="pulse" aria-hidden="true"></span>
              {{ i18n.t('liveVisit.inProgress') }}
            </span>
          </div>
        }
      </header>

      @if (store.loading()) {
        <div class="grid grid-2" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else if (store.liveVisits().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">📍</span>
          <p>{{ i18n.t('liveVisit.empty') }}</p>
        </div>
      } @else {
        <ul class="results">
          @for (visit of store.liveVisits(); track visit.id) {
            <li class="card interactive">
              <div class="card-head">
                <h3 class="card-title">{{ visit.act }} — {{ visit.providerName }}</h3>
                <span class="chip now">{{ i18n.t('liveVisit.inProgress') }}</span>
              </div>

              <p class="meta">
                {{ i18n.t('liveVisit.started', { date: formatDate(visit.scheduledAtMs) }) }}
              </p>

              @if (store.positionOf(visit.id); as point) {
                <div class="track">
                  <span class="icon-bubble" aria-hidden="true">📍</span>
                  <div class="track-body">
                    <span class="track-coords">{{ position(point) }}</span>
                    <p class="meta">
                      accuracy ±{{ point.accuracyM.toFixed(0) }} m · {{ timeAgo(point.atMs) }}
                    </p>
                  </div>
                  <a
                    class="btn secondary sm"
                    [href]="mapsUrl(point)"
                    target="_blank"
                    rel="noopener"
                  >
                    {{ i18n.t('liveVisit.openInMaps') }}
                  </a>
                </div>
              } @else {
                <p class="meta waiting">
                  <span class="spinner" aria-hidden="true"></span>
                  {{ i18n.t('liveVisit.waitingPosition') }}
                </p>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    .live-badge {
      padding-inline: var(--space-3);
    }
    .pulse {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: var(--radius-full);
      background: currentColor;
      box-shadow: 0 0 0 0 currentColor;
      animation: live-pulse 1.8s ease-out infinite;
    }
    @keyframes live-pulse {
      0% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 55%, transparent);
      }
      100% {
        box-shadow: 0 0 0 0.6rem transparent;
      }
    }
    .track {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
      margin-top: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .track-body {
      flex: 1 1 12rem;
      min-width: 0;
    }
    .track-coords {
      display: block;
      font-family: var(--font-mono);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .track-body .meta {
      margin: 0;
    }
    .waiting {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
    .spinner {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: var(--radius-full);
      border: 2px solid var(--border-strong);
      border-top-color: var(--accent);
      animation: live-spin 800ms linear infinite;
    }
    @keyframes live-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .pulse,
      .spinner {
        animation: none;
      }
    }
  `,
})
export class LiveVisitPage implements OnInit {
  protected readonly i18n = inject(I18n);

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
    return seconds < 60
      ? this.i18n.t('liveVisit.secondsAgo', { n: seconds })
      : this.i18n.t('liveVisit.minutesAgo', { n: Math.round(seconds / 60) });
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
