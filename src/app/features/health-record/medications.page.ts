import { Component, inject, signal } from '@angular/core';
import {
  MedicationsStore,
} from './medications.store';
import {
  ReminderChannelPrefsComponent,
  ReminderSettingsComponent,
} from './reminders-settings.component';
import { MedicineInstructionsComponent } from './medicine-instructions.component';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import {
  Medication,
  DoseSlot,
  AdherenceLog,
  dateKey,
  daysSupplyRemaining,
  GRACE_MINUTES,
} from './medications.logic';

/**
 * Medications page (FEATURE_PLAN.md §7 subtasks 7–8, 14, 18–19): today's
 * dose timeline with large tap targets (elderly-first), taken/skip logging
 * (clients and caregivers on behalf, subtask 11), 7/30-day adherence strips
 * per med + overall (subtask 5), refill warnings with days remaining
 * (subtask 14), archive (subtask 13), add-medication (subtask 2), and the
 * missed-dose alert strip. A11y: high-contrast states never color-only,
 * aria-live on logging.
 *
 * Bilingual. Load-bearing for the E2E suite: `li.med` (per-drug card),
 * the first `role="alert"` (missed-dose strip) and the first `role="status"`
 * (refill strip).
 */
@Component({
  selector: 'app-medications',
  standalone: true,
  imports: [
    ReminderChannelPrefsComponent,
    ReminderSettingsComponent,
    MedicineInstructionsComponent,
  ],
  template: `
    <section class="medications">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('medications.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('medications.subtitle') }}</p>
        </div>
      </header>

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else {
        @if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        }

        @if (store.missedToday().length > 0) {
          <div class="alert-strip" role="alert">
            {{
              i18n.t('medications.missedAlert', { count: store.missedToday().length })
            }}
            {{ store.missedToday().map((m) => m.med.name).join(', ') }}
          </div>
        }

        @if (store.refillNeeded().length > 0) {
          <div class="refill-strip" role="status">
            {{ i18n.t('medications.refillNeeded') }}
            {{ store.refillNeeded().map((m) => refillLabel(m)).join(', ') }}
          </div>
        }

        <h2 class="section-title">{{ i18n.t('medications.todaySchedule') }}</h2>
        @if (store.today().length === 0) {
          <p class="empty-state">{{ i18n.t('medications.none') }}</p>
        }
        <ul class="timeline">
          @for (entry of store.today(); track entry.med.id) {
            <li class="card med" [class.critical]="entry.med.critical">
              <div class="med-head">
                <h3 class="card-title">{{ entry.med.name }}</h3>
                @if (entry.med.critical) {
                  <span class="badge danger">{{ i18n.t('medications.critical') }}</span>
                }
                <span class="meta">
                  {{ entry.med.dose }}
                  @if (entry.med.prescriber) {
                    · {{ entry.med.prescriber }}
                  }
                </span>
              </div>
              @for (slot of entry.slots; track slot.timeMinutes) {
                <div
                  class="slot"
                  [class.missed]="slot.state === 'missed'"
                  [class.done]="slot.state === 'taken'"
                >
                  <span class="time">{{ time(slot.timeMinutes) }}</span>
                  <span class="state">
                    @switch (slot.state) {
                      @case ('taken') {
                        {{ i18n.t('medications.slot.taken') }}
                      }
                      @case ('skipped') {
                        {{ i18n.t('medications.slot.skipped') }}
                      }
                      @case ('missed') {
                        {{ i18n.t('medications.slot.missed', { minutes: GRACE_MINUTES }) }}
                      }
                      @case ('pending') {
                        {{ i18n.t('medications.slot.pending') }}
                      }
                    }
                  </span>
                  @if (slot.state === 'pending' || slot.state === 'missed') {
                    <span class="slot-actions">
                      <button
                        type="button"
                        class="btn big"
                        [disabled]="store.actingId() === entry.med.id"
                        (click)="log(entry.med, slot, 'taken')"
                      >
                        {{ i18n.t('medications.taken') }}
                      </button>
                      <button
                        type="button"
                        class="btn secondary big"
                        [disabled]="store.actingId() === entry.med.id"
                        (click)="log(entry.med, slot, 'skipped')"
                      >
                        {{ i18n.t('medications.skip') }}
                      </button>
                    </span>
                  }
                  @if (slot.log) {
                    <span class="meta">
                      {{ i18n.t('medications.loggedBy', { name: slot.log.loggedBy }) }}
                    </span>
                  }
                </div>
              }
              <div class="adherence">
                <span class="meta">{{ i18n.t('medications.adherence7') }}</span>
                <span class="bar" role="img" [attr.aria-label]="adherenceLabel(entry.med)">
                  <span class="fill" [style.width.%]="pct(entry.med)"></span>
                </span>
                <span class="meta">
                  <span>{{ adherencePct(entry.med) }}</span>
                  · {{ i18n.t('medications.days30') }}
                  <span>{{ adherencePct30(entry.med) }}</span>
                </span>
              </div>
              <div class="med-actions">
                <button type="button" class="link" (click)="check(entry.med.id)">
                  {{ i18n.t('medications.checkInteractions') }}
                </button>
                <button
                  type="button"
                  class="link"
                  [disabled]="store.actingId() === entry.med.id"
                  (click)="archive(entry.med)"
                >
                  {{ i18n.t('medications.archive', { name: entry.med.name }) }}
                </button>
              </div>
              @if (store.interaction()?.medicationId === entry.med.id) {
                <p class="meta" role="status">{{ store.interaction()!.message }}</p>
              }
              <app-medicine-instructions [medication]="entry.med" />
              <app-reminder-channel-prefs [medication]="entry.med" />
            </li>
          }
        </ul>

        <app-reminder-settings />

        <h2 class="section-title">{{ i18n.t('medications.adherenceOverview') }}</h2>
        <div class="card overview">
          <p>
            {{ i18n.t('medications.overall7') }}
            <strong>{{ overallPct() }}</strong> {{ i18n.t('medications.ofScheduled') }}
            @if (store.overallAdherence().scheduled > 0) {
              ({{ store.overallAdherence().taken }}/{{ store.overallAdherence().scheduled }})
            }
          </p>
          <p>
            {{ i18n.t('medications.overall30') }}
            <strong>{{ overallPct30() }}</strong> {{ i18n.t('medications.ofScheduled') }}
            @if (store.overallAdherence30().scheduled > 0) {
              ({{ store.overallAdherence30().taken }}/{{ store.overallAdherence30().scheduled }})
            }
          </p>
        </div>

        <details class="add">
          <summary>{{ i18n.t('medications.addMedication') }}</summary>
          <div class="add-form">
            <label class="field">
              <span class="field-label">{{ i18n.t('medications.name') }}</span>
              <input #addName type="text" autocomplete="off" />
            </label>
            <label class="field">
              <span class="field-label">{{ i18n.t('medications.dose') }}</span>
              <input
                #addDose
                type="text"
                [attr.placeholder]="i18n.t('medications.dosePlaceholder')"
                autocomplete="off"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ i18n.t('medications.dailyTime') }}</span>
              <input #addTime type="time" value="08:00" />
            </label>
            <label class="check">
              <input #addCritical type="checkbox" />
              {{ i18n.t('medications.criticalMedication') }}
            </label>
            <button
              type="button"
              class="btn big"
              (click)="add(addName.value, addDose.value, addTime.value, addCritical.checked)"
            >
              {{ i18n.t('medications.addButton') }}
            </button>
          </div>
        </details>
        <p class="meta" aria-live="polite">{{ status() }}</p>
      }
    </section>
  `,
  styles: `
    .section-title {
      margin: var(--space-5) 0 var(--space-3);
      font-size: var(--text-lg);
    }
    .alert-strip {
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
      border-radius: var(--radius-md);
      padding: 0.6rem 0.9rem;
      margin-bottom: var(--space-3);
      font-weight: var(--weight-semibold);
    }
    .refill-strip {
      background: var(--warning-soft);
      color: var(--warning);
      border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
      border-radius: var(--radius-md);
      padding: 0.6rem 0.9rem;
      margin-bottom: var(--space-3);
    }
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
    }
    .med.critical {
      border: 2px solid color-mix(in srgb, var(--danger) 65%, transparent);
    }
    .med-head {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .slot {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.4rem 0;
      flex-wrap: wrap;
    }
    .slot.missed .state {
      color: var(--danger);
      font-weight: var(--weight-semibold);
    }
    .slot.done .state {
      color: var(--success);
      font-weight: var(--weight-semibold);
    }
    .time {
      font-variant-numeric: tabular-nums;
      font-weight: var(--weight-semibold);
      min-width: 4rem;
    }
    .slot-actions {
      display: flex;
      gap: var(--space-2);
      margin-left: auto;
    }
    /* Elderly-first: large tap targets (subtask 19). */
    .big {
      min-width: 5.5rem;
      min-height: 44px;
      font-size: var(--text-md);
    }
    .med-actions {
      display: flex;
      gap: var(--space-4);
      flex-wrap: wrap;
      margin-top: 0.35rem;
    }
    .adherence {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: 0.4rem;
    }
    .bar {
      flex: 1;
      max-width: 16rem;
      height: 0.6rem;
      background: var(--surface-raised);
      border-radius: var(--radius-full);
      overflow: hidden;
      display: inline-block;
    }
    .fill {
      display: block;
      height: 100%;
      background: var(--success);
    }
    .overview p {
      margin: 0.25rem 0;
    }
    .add {
      margin-top: var(--space-4);
    }
    .add-form {
      display: grid;
      gap: var(--space-2);
      max-width: 22rem;
      margin-top: var(--space-2);
    }
    .add-form .check {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      min-height: 44px;
      color: var(--text);
    }
    .add-form input[type='checkbox'] {
      width: 1.4rem;
      height: 1.4rem;
    }
  `,
})
export class MedicationsPage {
  readonly store = inject(MedicationsStore);
  protected readonly i18n = inject(I18n);
  private readonly session = inject(SessionStore);
  protected readonly GRACE_MINUTES = GRACE_MINUTES;
  readonly status = signal('');

  constructor() {
    this.store.load().subscribe();
  }

  log(med: Medication, slot: DoseSlot, action: 'taken' | 'skipped'): void {
    // Caregiver log-on-behalf (subtask 11): record who logged the dose.
    const loggedBy = this.session.displayName() || 'me';
    this.store.logDose(med.id, dateKey(Date.now()), slot.timeMinutes, action, loggedBy).subscribe((ok) => {
      this.status.set(
        ok
          ? this.i18n.t(
              action === 'taken'
                ? 'medications.status.markedTaken'
                : 'medications.status.markedSkipped',
              { name: med.name, time: this.time(slot.timeMinutes) }
            )
          : this.i18n.t('medications.status.logFailed', { name: med.name })
      );
    });
  }

  add(name: string, dose: string, time: string, critical: boolean): void {
    const trimmedName = name.trim();
    const trimmedDose = dose.trim();
    const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
    if (!trimmedName || !trimmedDose || !match) {
      this.status.set(this.i18n.t('medications.status.addInvalid'));
      return;
    }
    const minutes = Number(match[1]) * 60 + Number(match[2]);
    this.store
      .add({
        name: trimmedName,
        dose: trimmedDose,
        schedule: { kind: 'daily', timesMinutes: [minutes] },
        critical,
        prescriber: undefined,
      })
      .subscribe((ok) => {
        this.status.set(
          ok
            ? this.i18n.t('medications.status.added', { name: trimmedName })
            : this.i18n.t('medications.status.addFailed', { name: trimmedName })
        );
      });
  }

  archive(med: Medication): void {
    this.store.archive(med.id).subscribe((ok) => {
      this.status.set(
        ok
          ? this.i18n.t('medications.status.archived', { name: med.name })
          : this.i18n.t('medications.status.archiveFailed', { name: med.name })
      );
    });
  }

  check(medicationId: string): void {
    this.store.checkInteractions(medicationId);
  }

  time(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private stats(med: Medication) {
    return this.store.adherence(med, 7);
  }

  pct(med: Medication): number {
    const stats = this.stats(med);
    return stats.rate === null ? 0 : Math.round(stats.rate * 100);
  }

  adherencePct(med: Medication): string {
    const stats = this.stats(med);
    return stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`;
  }

  adherencePct30(med: Medication): string {
    const stats = this.store.adherence(med, 30);
    return stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`;
  }

  refillLabel(med: Medication): string {
    const days = daysSupplyRemaining(med, Date.now());
    if (days === null) {
      return med.name;
    }
    return days < 0
      ? this.i18n.t('medications.refillOverdue', { name: med.name })
      : this.i18n.t('medications.refillDays', { name: med.name, days });
  }

  adherenceLabel(med: Medication): string {
    const stats = this.stats(med);
    return this.i18n.t('medications.adherenceAriaLabel', {
      pct: Math.round((stats.rate ?? 0) * 100),
      taken: stats.taken,
      scheduled: stats.scheduled,
    });
  }

  overallPct(): string {
    const stats = this.store.overallAdherence();
    return stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`;
  }

  overallPct30(): string {
    const stats = this.store.overallAdherence30();
    return stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`;
  }
}
