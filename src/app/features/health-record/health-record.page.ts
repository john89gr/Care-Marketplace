import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScreeningStore } from './screening.store';

/**
 * PHR dashboard (FEATURE_PLAN.md §6 subtask 11): entry point to the health
 * record surfaces with a live due-screenings badge.
 */
@Component({
  selector: 'app-health-record',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="health-record">
      <h1>Personal Health Record</h1>
      <ul class="links">
        <li>
          <a routerLink="/vitals">Vitals</a>
          <span class="meta"> — log and track blood pressure, glucose and more</span>
        </li>
        <li>
          <a routerLink="/medications">Medications</a>
          <span class="meta"> — today's schedule and adherence</span>
        </li>
        <li>
          <a routerLink="/health-summary">Health summary export</a>
          <span class="meta"> — PDF for your physician (30/90/365 days or all)</span>
        </li>
        <li>
          <a routerLink="/consents">Consent settings</a>
          <span class="meta"> — manage data-sharing and reminder consents</span>
        </li>
        <li>
          <a routerLink="/screenings">Preventive care</a>
          @if (screening.dueCount() > 0) {
            <span class="badge" [class.overdue]="screening.overdueCount() > 0">
              {{ screening.dueCount() }} due
            </span>
          }
          <span class="meta"> — age-based check reminders</span>
        </li>
      </ul>
    </section>
  `,
  styles: `
    .links { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: 0.6rem; }
    .links a { font-weight: 600; }
    .badge {
      display: inline-block;
      margin-left: 0.5rem;
      background: var(--accent, #4f7cff);
      color: #fff;
      border-radius: 999px;
      padding: 0.05rem 0.6rem;
      font-size: 0.8rem;
    }
    .badge.overdue { background: var(--danger, #c62828); }
    .meta { color: var(--text-muted); }
  `,
})
export class HealthRecordPage {
  readonly screening = inject(ScreeningStore);

  constructor() {
    this.screening.load().subscribe();
  }
}
