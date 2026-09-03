import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScreeningStore } from './screening.store';
import { ScreeningStatus } from './screening.rules';
import { SessionStore } from '../../core/auth/session';

/**
 * Screening page (FEATURE_PLAN.md §6 subtasks 7, 9, 12, 13, 18, 19): due /
 * upcoming / history tabs, done/waive/snooze actions, "Book visit" deep link
 * into the marketplace filtered by speciality, medical disclaimer, and
 * neutral a11y-friendly copy.
 */
@Component({
  selector: 'app-screening',
  standalone: true,
  imports: [],
  template: `
    <section class="screening">
      <h1>Preventive care</h1>
      <p class="disclaimer" role="note">
        These reminders follow general preventive-care guidelines based on age
        and sex. They are <strong>not medical advice</strong> — always follow
        the recommendation of your treating physician.
      </p>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }
        @if (!canWrite()) {
          <p class="meta" role="note">You are viewing this record read-only (family access).</p>
        }
        <div class="tabs" role="tablist" aria-label="Screening views">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === 'due'"
            [class.active]="tab() === 'due'"
            (click)="tab.set('due')"
          >
            Due ({{ due().length }})
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === 'upcoming'"
            [class.active]="tab() === 'upcoming'"
            (click)="tab.set('upcoming')"
          >
            Upcoming ({{ upcoming().length }})
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === 'history'"
            [class.active]="tab() === 'history'"
            (click)="tab.set('history')"
          >
            History ({{ history().length }})
          </button>
        </div>

        @if (tab() === 'due') {
          @if (due().length === 0) {
            <p class="meta">Nothing is due right now. 🎉</p>
          }
          <ul class="items">
            @for (status of due(); track status.rule.type) {
              <li [class.overdue]="status.overdue">
                <div class="row">
                  <div>
                    <h3>{{ status.rule.label }}</h3>
                    <p class="meta">
                      Recommended every {{ status.rule.intervalMonths }} months
                      @if (status.overdue) { · <strong>overdue</strong> }
                    </p>
                  </div>
                  <div class="actions">
                    <button type="button" class="secondary" (click)="book(status)">Book visit</button>
                    @if (canWrite()) {
                      <button
                        type="button"
                        [disabled]="store.actingType() === status.rule.type"
                        (click)="markDone(status)"
                      >
                        Mark done
                      </button>
                      <label class="schedule">
                        <span class="meta">Schedule date</span>
                        <input
                          type="date"
                          aria-label="Schedule date"
                          [value]="scheduleDate()"
                          (input)="scheduleDate.set($any($event.target).value)"
                        />
                      </label>
                      <button
                        type="button"
                        class="secondary"
                        [disabled]="store.actingType() === status.rule.type"
                        (click)="schedule(status)"
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        class="secondary"
                        [disabled]="status.rule.type === snoozedType()"
                        (click)="snooze(status)"
                      >
                        Snooze 30d
                      </button>
                      @if (waivingType() === status.rule.type) {
                        <form class="waive-form" (submit)="submitWaive($event, status)">
                          <label>
                            Reason
                            <input
                              type="text"
                              aria-label="Reason for waiving"
                              [value]="waiveReason()"
                              (input)="waiveReason.set($any($event.target).value)"
                            />
                          </label>
                          <button type="submit">Waive</button>
                          <button type="button" class="secondary" (click)="waivingType.set(null)">Cancel</button>
                        </form>
                      } @else {
                        <button type="button" class="link" (click)="startWaive(status)">Waive…</button>
                      }
                    }
                  </div>
                </div>
              </li>
            }
          </ul>
        }

        @if (tab() === 'upcoming') {
          @if (upcoming().length === 0) {
            <p class="meta">No upcoming screenings yet — they appear here once you complete one.</p>
          }
          <ul class="items">
            @for (status of upcoming(); track status.rule.type) {
              <li>
                <div class="row">
                  <div>
                    <h3>{{ status.rule.label }}</h3>
                    <p class="meta">
                      Next due {{ date(status.dueAtMs) }} · every {{ status.rule.intervalMonths }} months
                    </p>
                  </div>
                </div>
              </li>
            }
          </ul>
        }

        @if (tab() === 'history') {
          @if (history().length === 0) {
            <p class="meta">No completed or waived screenings yet.</p>
          }
          <ul class="items">
            @for (item of history(); track item.type) {
              <li>
                <div class="row">
                  <div>
                    <h3>{{ label(item.type) }}</h3>
                    <p class="meta">
                      @if (item.status === 'waived') {
                        Waived {{ date(item.atMs) }}@if (item.reason) { — “{{ item.reason }}” }
                      } @else {
                        Completed {{ date(item.atMs) }}
                      }
                    </p>
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .disclaimer {
      background: var(--surface-2, #eef1f6);
      border-radius: 0.5rem;
      padding: 0.6rem 0.9rem;
      font-size: 0.9rem;
    }
    .tabs { display: flex; gap: 0.5rem; margin: 1rem 0; }
    .tabs button { border: 1px solid var(--border, #d9dee7); background: none; padding: 0.4rem 0.9rem; border-radius: 999px; cursor: pointer; }
    .tabs button.active { background: var(--accent, #4f7cff); color: #fff; }
    .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .items li { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.75rem 1rem; }
    .items li.overdue { border-color: var(--danger, #c62828); }
    .row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: start; }
    .row h3 { margin: 0 0 0.25rem; font-size: 1rem; }
    .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
    .schedule { display: inline-flex; gap: 0.3rem; align-items: center; }
    .waive-form { display: flex; gap: 0.4rem; align-items: end; width: 100%; }
    .link { background: none; border: none; color: var(--accent, #4f7cff); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
  `,
})
export class ScreeningPage {
  readonly store = inject(ScreeningStore);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);

  readonly tab = signal<'due' | 'upcoming' | 'history'>('due');
  readonly waivingType = signal<string | null>(null);
  readonly waiveReason = signal('');
  readonly snoozedType = signal<string | null>(null);
  readonly scheduleDate = signal('');

  /**
   * RBAC (subtask 10): only the record owner (client) can mutate.
   * Family roles (caregiver/nurse) get a read-only view. Empty session
   * (e.g. early boot) stays writable so the demo flow keeps working.
   */
  readonly canWrite = computed(() => {
    const roles = this.session.roles();
    return roles.length === 0 || roles.includes('client');
  });

  readonly due = computed(() => this.store.statuses().filter((s) => s.state === 'due'));
  readonly upcoming = computed(() =>
    this.store.statuses().filter((s) => s.state === 'not_due' && s.dueAtMs !== null)
  );
  readonly history = computed(() =>
    [...this.store.records()].sort((a, b) => b.atMs - a.atMs)
  );

  constructor() {
    this.store.setReadOnly(!this.canWrite());
    this.store.load().subscribe();
  }

  markDone(status: ScreeningStatus): void {
    if (!this.canWrite()) {
      return;
    }
    this.store.markDone(status.rule.type).subscribe();
  }

  schedule(status: ScreeningStatus): void {
    if (!this.canWrite()) {
      return;
    }
    const raw = this.scheduleDate().trim();
    const atMs = raw ? Date.parse(`${raw}T00:00:00Z`) : Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.store.schedule(status.rule.type, atMs).subscribe();
  }

  snooze(status: ScreeningStatus): void {
    if (!this.canWrite()) {
      return;
    }
    this.store.snooze(status.rule.type).subscribe((ok) => {
      if (ok) {
        this.snoozedType.set(status.rule.type);
      }
    });
  }

  startWaive(status: ScreeningStatus): void {
    if (!this.canWrite()) {
      return;
    }
    this.waivingType.set(status.rule.type);
    this.waiveReason.set('');
  }

  submitWaive(event: Event, status: ScreeningStatus): void {
    event.preventDefault();
    if (!this.canWrite()) {
      return;
    }
    this.store.waive(status.rule.type, this.waiveReason()).subscribe((ok) => {
      if (ok) {
        this.waivingType.set(null);
      }
    });
  }

  /** Deep link: screening → marketplace filtered by speciality (subtask 9). */
  book(status: ScreeningStatus): void {
    void this.router.navigate(['/marketplace'], {
      queryParams: { roles: status.rule.speciality },
    });
  }

  label(type: string): string {
    return (
      this.store
        .statuses()
        .find((s) => s.rule.type === type)?.rule.label ??
      type
    );
  }

  date(ms: number | null | undefined): string {
    if (!ms) {
      return '—';
    }
    return new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
