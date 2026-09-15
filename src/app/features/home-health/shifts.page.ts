import { Component, inject, OnInit } from '@angular/core';
import { ShiftsStore, WEEKDAYS, TIME_SEGMENTS } from './shifts.store';
import { I18n } from '../../core/i18n/i18n.service';

/** Weekday keys in `WEEKDAYS` order, so the grid header follows the locale. */
const WEEKDAY_KEYS: readonly string[] = [
  'shifts.weekday.0',
  'shifts.weekday.1',
  'shifts.weekday.2',
  'shifts.weekday.3',
  'shifts.weekday.4',
  'shifts.weekday.5',
  'shifts.weekday.6',
];

/** Segment keys by the store's stable English segment id. */
const SEGMENT_KEYS: Record<string, string> = {
  Morning: 'shifts.segment.morning',
  Afternoon: 'shifts.segment.afternoon',
  Evening: 'shifts.segment.evening',
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

@Component({
  selector: 'app-shifts',
  standalone: true,
  imports: [],
  template: `
    <section class="shifts">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('shifts.title') }}</h1>
        </div>
      </header>

      @if (store.loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else {
        <section class="card availability">
          <h2 class="section-title">{{ i18n.t('shifts.weeklyAvailability') }}</h2>

          <div class="table-wrap shift-scroll">
            <table class="shift-grid" [attr.aria-label]="i18n.t('shifts.gridLabel')">
              <thead>
                <tr>
                  <th scope="col">{{ i18n.t('shifts.day') }}</th>
                  @for (segment of TIME_SEGMENTS; track segment.label) {
                    <th scope="col">{{ segmentLabel(segment.label) }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (weekday of WEEKDAYS; track weekday; let i = $index) {
                  <tr>
                    <th scope="row">{{ weekdayLabel(i) }}</th>
                    @for (segment of TIME_SEGMENTS; track segment.label) {
                      <td>
                        <input
                          type="checkbox"
                          [checked]="store.hasSegment(i, segment.startMinutes, segment.endMinutes)"
                          (change)="store.toggleSegment(i, segment.startMinutes, segment.endMinutes)"
                          [attr.aria-label]="weekdayLabel(i) + ' ' + segmentLabel(segment.label)"
                        />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <label class="pref-row on-demand">
            <input
              type="checkbox"
              [checked]="store.onDemand()"
              (change)="store.setOnDemand($any($event.target).checked)"
            />
            <span>{{ i18n.t('shifts.onDemand') }}</span>
          </label>

          <div class="card-actions">
            <button type="button" class="btn" (click)="save()" [disabled]="store.saving()">
              {{ store.saving() ? i18n.t('common.saving') : i18n.t('shifts.save') }}
            </button>
          </div>

          @if (store.saveError()) {
            <p class="error" role="alert">{{ i18n.message(store.saveErrorSource(), store.saveError()) }}</p>
          }
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('shifts.upcoming') }}</h2>
          </div>

          @if (store.upcomingShifts().length === 0) {
            <div class="empty-state">
              <span class="empty-icon" aria-hidden="true">🗓️</span>
              <p>{{ i18n.t('shifts.empty') }}</p>
            </div>
          } @else {
            <ul class="results">
              @for (shift of store.upcomingShifts(); track shift.id) {
                <li class="card interactive shift-card">
                  <div class="row">
                    <div>
                      <h3>{{ shift.act }}</h3>
                      <p class="meta">
                        {{ shift.clientName }} · {{ formatDate(shift.scheduledAtMs) }} ·
                        {{ shift.durationMinutes }} min
                      </p>
                    </div>
                    <span class="badge accent">{{ shift.status }}</span>
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }
    </section>
  `,
  styles: `
    .availability {
      display: grid;
      gap: var(--space-3);
      align-content: start;
      max-width: 40rem;
    }
    .availability .section-title {
      margin: 0;
    }
    .shift-scroll {
      padding: 0;
    }
    table.shift-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }
    table.shift-grid th,
    table.shift-grid td {
      padding: var(--space-2) var(--space-3);
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    table.shift-grid thead th {
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-subtle);
      background: var(--surface-raised);
    }
    table.shift-grid tbody tr:last-child th,
    table.shift-grid tbody tr:last-child td {
      border-bottom: none;
    }
    table.shift-grid tbody th {
      font-weight: var(--weight-medium);
      color: var(--text-muted);
    }
    table.shift-grid input[type='checkbox'] {
      width: 1.1rem;
      height: 1.1rem;
    }
    .on-demand {
      margin: 0;
    }
    .shift-card .row {
      align-items: center;
    }
    .shift-card h3 {
      margin: 0 0 0.15rem;
      font-size: var(--text-md);
    }
    .shift-card .meta {
      margin: 0;
    }
  `,
})
export class ShiftsPage implements OnInit {
  protected readonly i18n = inject(I18n);
  readonly store = inject(ShiftsStore);

  readonly WEEKDAYS = WEEKDAYS;
  readonly TIME_SEGMENTS = TIME_SEGMENTS;

  ngOnInit(): void {
    this.store.load();
  }

  save(): void {
    this.store.save().subscribe();
  }

  /** Weekday name in the active language (`WEEKDAYS` index). */
  weekdayLabel(index: number): string {
    return this.i18n.t(WEEKDAY_KEYS[index] ?? '');
  }

  /** Time segment label in the active language (store id stays English). */
  segmentLabel(label: string): string {
    return this.i18n.t(SEGMENT_KEYS[label] ?? label);
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
