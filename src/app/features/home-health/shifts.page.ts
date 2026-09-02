import { Component, inject, OnInit } from '@angular/core';
import { ShiftsStore, WEEKDAYS, TIME_SEGMENTS } from './shifts.store';

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
      <h1>Shifts & visits</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <h2>Weekly availability</h2>
        <table class="grid" aria-label="Weekly availability grid">
          <thead>
            <tr>
              <th scope="col">Day</th>
              @for (segment of TIME_SEGMENTS; track segment.label) {
                <th scope="col">{{ segment.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (weekday of WEEKDAYS; track weekday; let i = $index) {
              <tr>
                <th scope="row">{{ weekday }}</th>
                @for (segment of TIME_SEGMENTS; track segment.label) {
                  <td>
                    <input
                      type="checkbox"
                      [checked]="store.hasSegment(i, segment.startMinutes, segment.endMinutes)"
                      (change)="store.toggleSegment(i, segment.startMinutes, segment.endMinutes)"
                      [attr.aria-label]="weekday + ' ' + segment.label"
                    />
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>

        <label class="on-demand">
          <input
            type="checkbox"
            [checked]="store.onDemand()"
            (change)="store.setOnDemand($any($event.target).checked)"
          />
          Accept on-demand requests
        </label>

        <button type="button" (click)="save()" [disabled]="store.saving()">
          {{ store.saving() ? 'Saving…' : 'Save availability' }}
        </button>
        @if (store.saveError()) {
          <p class="error" role="alert">{{ store.saveError() }}</p>
        }

        <h2>Upcoming shifts</h2>
        @if (store.upcomingShifts().length === 0) {
          <p>No upcoming shifts.</p>
        } @else {
          <ul class="results">
            @for (shift of store.upcomingShifts(); track shift.id) {
              <li class="card">
                <h3>{{ shift.act }}</h3>
                <p class="meta">{{ shift.clientName }} · {{ formatDate(shift.scheduledAtMs) }} · {{ shift.durationMinutes }} min</p>
                <span class="chip">{{ shift.status }}</span>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
    .grid {
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .grid th, .grid td {
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 0.9rem;
      text-align: left;
    }
    .grid th { color: var(--text-muted); font-weight: 600; }
    .grid input[type='checkbox'] { width: auto; }
    .on-demand {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      color: var(--text);
      margin-bottom: 1rem;
    }
    .on-demand input { width: auto; }
  `,
})
export class ShiftsPage implements OnInit {
  readonly store = inject(ShiftsStore);

  readonly WEEKDAYS = WEEKDAYS;
  readonly TIME_SEGMENTS = TIME_SEGMENTS;

  ngOnInit(): void {
    this.store.load();
  }

  save(): void {
    this.store.save().subscribe();
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
