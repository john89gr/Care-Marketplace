import { Component, inject, signal } from '@angular/core';
import {
  MedicationsStore,
} from './medications.store';
import {
  ReminderChannelPrefsComponent,
  ReminderSettingsComponent,
} from './reminders-settings.component';
import { SessionStore } from '../../core/auth/session';
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
 */
@Component({
  selector: 'app-medications',
  standalone: true,
  imports: [ReminderChannelPrefsComponent, ReminderSettingsComponent],
  template: `
    <section class="medications">
      <h1>Medications</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }

        @if (store.missedToday().length > 0) {
          <div class="alert-strip" role="alert">
            ⚠️ {{ store.missedToday().length }} medication{{ store.missedToday().length > 1 ? 's' : '' }}
            with a missed dose today:
            {{ store.missedToday().map((m) => m.med.name).join(', ') }}
          </div>
        }

        @if (store.refillNeeded().length > 0) {
          <div class="refill-strip" role="status">
            💊 Refill needed soon:
            {{ store.refillNeeded().map((m) => refillLabel(m)).join(', ') }}
          </div>
        }

        <h2>Today's schedule</h2>
        @if (store.today().length === 0) {
          <p class="meta">No active medications. Add them with your care team.</p>
        }
        <ul class="timeline">
          @for (entry of store.today(); track entry.med.id) {
            <li class="med" [class.critical]="entry.med.critical">
              <div class="med-head">
                <h3>{{ entry.med.name }}</h3>
                @if (entry.med.critical) {
                  <span class="chip critical-chip">critical</span>
                }
                <span class="meta">{{ entry.med.dose }} @if (entry.med.prescriber) { · {{ entry.med.prescriber }} }</span>
              </div>
              @for (slot of entry.slots; track slot.timeMinutes) {
                <div class="slot" [class.missed]="slot.state === 'missed'" [class.done]="slot.state === 'taken'">
                  <span class="time">{{ time(slot.timeMinutes) }}</span>
                  <span class="state">
                    @switch (slot.state) {
                      @case ('taken') { ✓ taken }
                      @case ('skipped') { ⊘ skipped }
                      @case ('missed') { ✗ missed (grace {{ GRACE_MINUTES }} min passed) }
                      @case ('pending') { ○ due }
                    }
                  </span>
                  @if (slot.state === 'pending' || slot.state === 'missed') {
                    <span class="slot-actions">
                      <button
                        type="button"
                        class="big"
                        [disabled]="store.actingId() === entry.med.id"
                        (click)="log(entry.med, slot, 'taken')"
                      >
                        ✓ Taken
                      </button>
                      <button
                        type="button"
                        class="big secondary"
                        [disabled]="store.actingId() === entry.med.id"
                        (click)="log(entry.med, slot, 'skipped')"
                      >
                        Skip
                      </button>
                    </span>
                  }
                  @if (slot.log) {
                    <span class="meta">Logged by {{ slot.log.loggedBy }}</span>
                  }
                </div>
              }
              <div class="adherence">
                <span class="meta">7-day adherence</span>
                <span
                  class="bar"
                  role="img"
                  [attr.aria-label]="adherenceLabel(entry.med)"
                >
                  <span class="fill" [style.width.%]="pct(entry.med)"></span>
                </span>
                <span class="meta">{{ adherencePct(entry.med) }} · 30-day {{ adherencePct30(entry.med) }}</span>
              </div>
              <div class="med-actions">
                <button type="button" class="link" (click)="check(entry.med.id)">
                  Check interactions
                </button>
                <button
                  type="button"
                  class="link"
                  [disabled]="store.actingId() === entry.med.id"
                  (click)="archive(entry.med)"
                >
                  Archive {{ entry.med.name }}
                </button>
              </div>
              @if (store.interaction()?.medicationId === entry.med.id) {
                <p class="meta" role="status">{{ store.interaction()!.message }}</p>
              }
              <app-reminder-channel-prefs [medication]="entry.med" />
            </li>
          }
        </ul>

        <app-reminder-settings />

        <h2>Adherence overview</h2>
        <p>
          Overall (7 days):
          <strong>{{ overallPct() }}</strong> of scheduled doses taken
          @if (store.overallAdherence().scheduled > 0) {
            ({{ store.overallAdherence().taken }}/{{ store.overallAdherence().scheduled }})
          }
        </p>
        <p>
          Overall (30 days):
          <strong>{{ overallPct30() }}</strong> of scheduled doses taken
          @if (store.overallAdherence30().scheduled > 0) {
            ({{ store.overallAdherence30().taken }}/{{ store.overallAdherence30().scheduled }})
          }
        </p>
        <details class="add">
          <summary>Add a medication</summary>
          <div class="add-form">
            <label>Name <input #addName type="text" autocomplete="off" /></label>
            <label>Dose <input #addDose type="text" placeholder="e.g. 10 mg" autocomplete="off" /></label>
            <label>Daily time <input #addTime type="time" value="08:00" /></label>
            <label class="check"><input #addCritical type="checkbox" /> Critical medication</label>
            <button
              type="button"
              class="big"
              (click)="add(addName.value, addDose.value, addTime.value, addCritical.checked)"
            >
              Add medication
            </button>
          </div>
        </details>
        <p class="meta" aria-live="polite">{{ status() }}</p>
      }
    </section>
  `,
  styles: `
    .alert-strip {
      background: var(--danger-soft, #fdecea);
      color: var(--danger, #c62828);
      border-radius: 0.5rem;
      padding: 0.6rem 0.9rem;
      margin-bottom: 0.75rem;
      font-weight: 600;
    }
    .refill-strip {
      background: var(--surface-2, #eef1f6);
      border-radius: 0.5rem;
      padding: 0.6rem 0.9rem;
      margin-bottom: 0.75rem;
    }
    .timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem; }
    .med { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.8rem 1rem; }
    .med.critical { border-width: 2px; border-color: var(--danger, #c62828); }
    .med-head { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .med-head h3 { margin: 0; font-size: 1.05rem; }
    .chip.critical-chip { background: var(--danger, #c62828); color: #fff; border-radius: 999px; padding: 0.05rem 0.55rem; font-size: 0.75rem; }
    .slot { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0; flex-wrap: wrap; }
    .slot.missed .state { color: var(--danger, #c62828); font-weight: 600; }
    .slot.done .state { color: var(--success, #1d7a3d); font-weight: 600; }
    .time { font-variant-numeric: tabular-nums; font-weight: 600; min-width: 4rem; }
    .slot-actions { display: flex; gap: 0.5rem; margin-left: auto; }
    /* Elderly-first: large tap targets (subtask 19). */
    button.big { min-width: 5.5rem; min-height: 44px; font-size: 1rem; }
    .med-actions { display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.35rem; }
    .adherence { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem; }
    .bar { flex: 1; max-width: 16rem; height: 0.6rem; background: var(--surface-2, #eef1f6); border-radius: 999px; overflow: hidden; display: inline-block; }
    .fill { display: block; height: 100%; background: var(--success, #1d7a3d); }
    .link { background: none; border: none; color: var(--accent, #4f7cff); cursor: pointer; padding: 0.35rem 0; font: inherit; text-decoration: underline; margin-top: 0.35rem; min-height: 44px; }
    .meta { color: var(--text-muted); }
    .add { margin-top: 1rem; }
    .add-form { display: grid; gap: 0.5rem; max-width: 22rem; margin-top: 0.5rem; }
    .add-form label { display: grid; gap: 0.2rem; }
    .add-form input[type="text"], .add-form input[type="time"] { min-height: 44px; font-size: 1rem; }
    .add-form .check { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; }
    .add-form input[type="checkbox"] { width: 1.4rem; height: 1.4rem; }
  `,
})
export class MedicationsPage {
  readonly store = inject(MedicationsStore);
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
          ? `${med.name} at ${this.time(slot.timeMinutes)} marked ${action}.`
          : `Could not update ${med.name}.`
      );
    });
  }

  add(name: string, dose: string, time: string, critical: boolean): void {
    const trimmedName = name.trim();
    const trimmedDose = dose.trim();
    const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
    if (!trimmedName || !trimmedDose || !match) {
      this.status.set('Enter a name, a dose and a daily time (HH:MM) to add a medication.');
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
        this.status.set(ok ? `${trimmedName} added to today's schedule.` : `Could not add ${trimmedName}.`);
      });
  }

  archive(med: Medication): void {
    this.store.archive(med.id).subscribe((ok) => {
      this.status.set(ok ? `${med.name} archived. History is preserved.` : `Could not archive ${med.name}.`);
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
    return days < 0 ? `${med.name} (overdue)` : `${med.name} (${days}d left)`;
  }

  adherenceLabel(med: Medication): string {
    const stats = this.stats(med);
    return `7-day adherence ${Math.round((stats.rate ?? 0) * 100)} percent, ${stats.taken} of ${stats.scheduled} doses taken`;
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
