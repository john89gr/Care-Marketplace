import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScreeningStore } from './screening.store';
import { HistoryStore } from './history.store';
import { ContactsStore } from './contacts.store';
import { safetyAllergies } from './history.models';

/**
 * PHR dashboard (FEATURE_PLAN.md §6 subtask 11 + §21 subtask 9): entry point
 * to the health record surfaces with a live due-screenings badge and a
 * persistent allergy safety banner (drug / severe allergies — never
 * color-only, icon + text).
 */
@Component({
  selector: 'app-health-record',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="health-record">
      <h1>Personal Health Record</h1>

      @if (allergyWarning().length > 0) {
        <div class="allergy-banner" role="alert">
          <span aria-hidden="true">⚠️</span>
          <div>
            <strong>Επικίνδυνες αλλεργίες</strong> — αναφερθείτε σε αυτές σε κάθε
            επίσκεψη ή συνταγογράφηση:
            {{ allergySummary() }}
          </div>
        </div>
      }

      <ul class="links">
        <li>
          <a routerLink="/history">Ιατρικό ιστορικό</a>
          <span class="meta"> — παθήσεις (ICD-11), αλλεργίες, εμβόλια, συμβάντα, συμπτώματα και συνταγές</span>
        </li>
        <li>
          <a routerLink="/vitals">Vitals</a>
          <span class="meta"> — log and track blood pressure, glucose and more</span>
        </li>
        <li>
          <a routerLink="/medications">Medications</a>
          <span class="meta"> — today's schedule and adherence</span>
        </li>
        <li>
          <a routerLink="/contacts">Επαφές &amp; Τηλέφωνα</a>
          @if (emergencyContact(); as ice) {
            <span class="badge">ICE: {{ ice.name }}</span>
          }
          <span class="meta"> — επαφές έκτακτης ανάγκης (ICE) και ομάδα φροντίδας</span>
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
    .allergy-banner {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      background: #fdecea;
      border: 1px solid var(--danger, #c62828);
      color: #7f1d1d;
      border-radius: 0.6rem;
      padding: 0.7rem 1rem;
      margin: 1rem 0;
    }
    .allergy-banner strong { display: block; }
  `,
})
export class HealthRecordPage {
  readonly screening = inject(ScreeningStore);
  readonly history = inject(HistoryStore);
  readonly contacts = inject(ContactsStore);

  /** First-to-call ICE contact (contact phone manager). */
  readonly emergencyContact = computed(() => this.contacts.primaryEmergency());

  /** Safety allergies (drug or severe) — §21 subtask 9 banner source. */
  readonly allergyWarning = computed(() =>
    safetyAllergies(this.history.records('allergies'))
  );

  readonly allergySummary = computed(() =>
    this.allergyWarning().map((a) => `${a.substance} (${a.severity})`).join(', ')
  );

  constructor() {
    this.screening.load().subscribe();
    this.history.load('allergies').subscribe();
    this.contacts.load().subscribe();
  }
}