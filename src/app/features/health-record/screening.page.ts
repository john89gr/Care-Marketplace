import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';
import { ScreeningStore } from './screening.store';
import { ScreeningStatus } from './screening.rules';
import { SessionStore } from '../../core/auth/session';

/**
 * Screening page (FEATURE_PLAN.md §6 subtasks 7, 9, 12, 13, 18, 19): due /
 * upcoming / history tabs, done/waive/snooze actions, "Book visit" deep link
 * into the marketplace filtered by speciality, medical disclaimer, and
 * neutral a11y-friendly copy.
 *
 * Rule names are translated by `ScreeningType` key rather than read off the
 * rule object, so the shared rule set stays locale-free; an unknown type
 * falls back to the rule's own English label.
 */
@Component({
  selector: 'app-screening',
  standalone: true,
  imports: [],
  template: `
    <section class="screening">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('screening.title') }}</h1>
        </div>
      </header>

      <p class="card disclaimer" role="note">
        {{ i18n.t('screening.disclaimerLead') }}
        <strong>{{ i18n.t('screening.disclaimerStrong') }}</strong>
        {{ i18n.t('screening.disclaimerRest') }}
      </p>

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else {
        @if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        }
        @if (!canWrite()) {
          <p class="meta" role="note">{{ i18n.t('screening.readOnly') }}</p>
        }

        <div class="tabs" role="tablist" [attr.aria-label]="i18n.t('screening.tablist')">
          <button
            type="button"
            role="tab"
            class="tab"
            [attr.aria-selected]="tab() === 'due'"
            [class.active]="tab() === 'due'"
            (click)="tab.set('due')"
          >
            {{ i18n.t('screening.tabDue', { count: due().length }) }}
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            [attr.aria-selected]="tab() === 'upcoming'"
            [class.active]="tab() === 'upcoming'"
            (click)="tab.set('upcoming')"
          >
            {{ i18n.t('screening.tabUpcoming', { count: upcoming().length }) }}
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            [attr.aria-selected]="tab() === 'history'"
            [class.active]="tab() === 'history'"
            (click)="tab.set('history')"
          >
            {{ i18n.t('screening.tabHistory', { count: history().length }) }}
          </button>
        </div>

        @if (tab() === 'due') {
          @if (due().length === 0) {
            <p class="empty-state">{{ i18n.t('screening.nothingDue') }}</p>
          }
          <ul class="list">
            @for (status of due(); track status.rule.type) {
              <li class="card" [class.overdue]="status.overdue">
                <div class="row">
                  <div>
                    <h3 class="card-title">
                      {{ label(status.rule.type) }}
                      @if (status.overdue) {
                        <span class="badge danger">{{ i18n.t('screening.overdue') }}</span>
                      }
                    </h3>
                    <p class="meta">
                      {{ i18n.t('screening.recommendedEvery', { count: status.rule.intervalMonths }) }}
                    </p>
                  </div>
                  <div class="actions">
                    <button type="button" class="btn secondary sm" (click)="book(status)">
                      {{ i18n.t('screening.bookVisit') }}
                    </button>
                    @if (canWrite()) {
                      <button
                        type="button"
                        class="btn sm"
                        [disabled]="store.actingType() === status.rule.type"
                        (click)="markDone(status)"
                      >
                        {{ i18n.t('screening.markDone') }}
                      </button>
                      <label class="schedule">
                        <span class="field-label">{{ i18n.t('screening.scheduleDate') }}</span>
                        <input
                          type="date"
                          [attr.aria-label]="i18n.t('screening.scheduleDate')"
                          [value]="scheduleDate()"
                          (input)="scheduleDate.set($any($event.target).value)"
                        />
                      </label>
                      <button
                        type="button"
                        class="btn secondary sm"
                        [disabled]="store.actingType() === status.rule.type"
                        (click)="schedule(status)"
                      >
                        {{ i18n.t('screening.schedule') }}
                      </button>
                      <button
                        type="button"
                        class="btn secondary sm"
                        [disabled]="status.rule.type === snoozedType()"
                        (click)="snooze(status)"
                      >
                        {{ i18n.t('screening.snooze') }}
                      </button>
                      @if (waivingType() === status.rule.type) {
                        <form class="waive-form" (submit)="submitWaive($event, status)">
                          <label class="field">
                            <span class="field-label">{{ i18n.t('screening.reason') }}</span>
                            <input
                              type="text"
                              [attr.aria-label]="i18n.t('screening.reasonForWaiving')"
                              [value]="waiveReason()"
                              (input)="waiveReason.set($any($event.target).value)"
                            />
                          </label>
                          <button type="submit" class="btn sm">
                            {{ i18n.t('screening.waive') }}
                          </button>
                          <button
                            type="button"
                            class="btn secondary sm"
                            (click)="waivingType.set(null)"
                          >
                            {{ i18n.t('common.cancel') }}
                          </button>
                        </form>
                      } @else {
                        <button type="button" class="link" (click)="startWaive(status)">
                          {{ i18n.t('screening.waiveEllipsis') }}
                        </button>
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
            <p class="empty-state">{{ i18n.t('screening.noUpcoming') }}</p>
          }
          <ul class="list">
            @for (status of upcoming(); track status.rule.type) {
              <li class="card">
                <h3 class="card-title">{{ label(status.rule.type) }}</h3>
                <p class="meta">
                  {{
                    i18n.t('screening.nextDue', {
                      date: date(status.dueAtMs),
                      count: status.rule.intervalMonths
                    })
                  }}
                </p>
              </li>
            }
          </ul>
        }

        @if (tab() === 'history') {
          @if (history().length === 0) {
            <p class="empty-state">{{ i18n.t('screening.noHistory') }}</p>
          }
          <ul class="list">
            @for (item of history(); track item.type) {
              <li class="card">
                <h3 class="card-title">{{ label(item.type) }}</h3>
                <p class="meta">
                  @if (item.status === 'waived') {
                    {{ i18n.t('screening.waivedOn', { date: date(item.atMs) }) }}
                    @if (item.reason) {
                      — “{{ item.reason }}”
                    }
                  } @else {
                    {{ i18n.t('screening.completedOn', { date: date(item.atMs) }) }}
                  }
                </p>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .card.disclaimer {
      background: var(--surface-raised);
      border-color: var(--border);
      color: var(--text-muted);
      font-size: var(--text-sm);
      margin-bottom: var(--space-4);
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .row .card-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .card.overdue {
      border-left: 3px solid var(--danger);
    }
    .actions {
      display: flex;
      gap: var(--space-2);
      flex-wrap: wrap;
      align-items: center;
    }
    .schedule {
      display: inline-flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .schedule input {
      width: auto;
      padding: 0.3rem 0.5rem;
      font-size: var(--text-sm);
    }
    .waive-form {
      display: flex;
      gap: var(--space-2);
      align-items: flex-end;
      flex-wrap: wrap;
      max-width: none;
    }
    .waive-form input {
      width: auto;
    }
  `,
})
export class ScreeningPage {
  readonly store = inject(ScreeningStore);
  protected readonly i18n = inject(I18n);
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

  /**
   * Localized rule name. Falls back to the rule's own English label if a rule
   * type ships without a translation key.
   */
  label(type: string): string {
    const key = `screening.rule.${type}`;
    const translated = this.i18n.t(key);
    if (translated !== key) {
      return translated;
    }
    return this.store.statuses().find((s) => s.rule.type === type)?.rule.label ?? type;
  }

  date(ms: number | null | undefined): string {
    if (!ms) {
      return '—';
    }
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
