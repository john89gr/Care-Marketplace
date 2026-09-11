import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { HistoryStore } from './history.store';
import { RemindersStore } from './reminders.store';
import {
  ALL_CHANNELS,
  ReminderChannel,
  canUseChannel,
  clockToMinutes,
  minutesToClock,
  smsVoiceStatus,
} from './reminders.logic';
import { MedicineInstructions, instructionsSummary } from './medicine.info';
import { PlanConfidence, planFromPrescription, scheduleFromEditor } from './prescription.schedule';
import type { Medication, MedicationSchedule } from './medications.logic';
import type { PrescriptionRecord } from './history.models';

type ScheduleKind = 'daily' | 'interval' | 'weekly';

const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  inapp: 'In-app',
  push: 'Push',
  sms: 'SMS',
  voice: 'Voice',
};

const WEEKDAY_LABELS: readonly string[] = ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'];

/**
 * Pill-reminder wizard (FEATURE_PLAN.md Track 3): opens from an active
 * prescription, shows the parsed schedule + pre-filled instruction sheet,
 * lets the user adjust dose times/channels, then creates the medication and
 * persists the reminder channels. Nothing silent: the parsed confidence and a
 * human explanation are always shown.
 */
@Component({
  selector: 'app-prescription-reminder',
  standalone: true,
  imports: [],
  template: `
    @if (prescription(); as rx) {
      <div class="wizard" role="dialog" aria-modal="true" aria-labelledby="rx-wizard-title">
        <h3 id="rx-wizard-title">Υπενθύμιση για {{ rx.drug }}</h3>

        <p class="note" role="status">
          {{ planNote() }}
          <span class="chip" [class.warn]="confidence() === 'defaulted'">
            {{ confidence() === 'parsed' ? 'από τη συνταγή' : 'προεπιλογή — ελέγξτε το' }}
          </span>
        </p>

        @if (isPrn()) {
          <p class="prn" role="note">
            Η συνταγή είναι «κατά περίπτωση» (SOS). Δεν δημιουργείται σταθερό
            πρόγραμμα εκτός αν ορίσετε ώρες παρακάτω.
          </p>
        }

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <fieldset [disabled]="!canWrite() || saving()">
          <legend>Πρόγραμμα δόσεων</legend>

          <div class="row">
            @for (option of kinds; track option) {
              <label class="radio">
                <input
                  type="radio"
                  name="rx-schedule-kind"
                  [value]="option"
                  [checked]="kind() === option"
                  (change)="kind.set(option)"
                />
                {{ kindLabel(option) }}
              </label>
            }
          </div>

          @switch (kind()) {
            @case ('daily') {
              <div class="times">
                @for (t of times(); track $index) {
                  <span class="time-row">
                    <label>
                      Ώρα {{ $index + 1 }}
                      <input
                        type="time"
                        [value]="clock(t)"
                        (change)="setTime($index, $any($event.target).value)"
                      />
                    </label>
                    <button type="button" class="link" (click)="removeTime($index)">Αφαίρεση</button>
                  </span>
                }
                @if (times().length === 0) {
                  <p class="meta">Προσθέστε τουλάχιστον μία ώρα.</p>
                }
                <div class="add-time">
                  <label>
                    Νέα ώρα
                    <input type="time" [value]="newTime()"
                      (change)="newTime.set($any($event.target).value)" />
                  </label>
                  <button type="button" class="secondary" (click)="addTime()">+ Προσθήκη ώρας</button>
                </div>
              </div>
            }
            @case ('interval') {
              <label>
                Κάθε πόσες ημέρες
                <input
                  type="number"
                  min="1"
                  max="30"
                  [value]="everyDays()"
                  (change)="everyDays.set(+$any($event.target).value || 1)"
                />
              </label>
              <label>
                Ώρα
                <input type="time" [value]="clock(singleTime())"
                  (change)="singleTime.set(minutes($any($event.target).value))" />
              </label>
            }
            @case ('weekly') {
              <fieldset class="weekdays">
                <legend>Ημέρες</legend>
                @for (day of weekdayLabels; track $index) {
                  <label class="check">
                    <input
                      type="checkbox"
                      [checked]="weekdays().includes($index)"
                      (change)="toggleWeekday($index, $any($event.target).checked)"
                    />
                    {{ day }}
                  </label>
                }
              </fieldset>
              <label>
                Ώρα
                <input type="time" [value]="clock(singleTime())"
                  (change)="singleTime.set(minutes($any($event.target).value))" />
              </label>
            }
          }
        </fieldset>

        <fieldset class="channels" [disabled]="!canWrite() || saving()">
          <legend>Κανάλια υπενθύμισης</legend>
          @for (channel of channels; track channel) {
            <label class="check" [attr.title]="gateReason(channel)">
              <input
                type="checkbox"
                [checked]="selectedChannels().includes(channel)"
                [disabled]="!canUse(channel)"
                (change)="toggleChannel(channel, $any($event.target).checked)"
              />
              {{ label(channel) }}
            </label>
          }
          @if (smsVoiceHint()) {
            <p class="meta">{{ smsVoiceHint() }}</p>
          }
        </fieldset>

        @if (instructionsSummaryText()) {
          <p class="meta">Οδηγίες λήψης: {{ instructionsSummaryText() }}</p>
        }

        @if (success()) {
          <p class="success" role="status">
            ✓ {{ success() }}
            @if (preview()) { · {{ preview() }} }
          </p>
        }

        <div class="actions">
          <button type="button" [disabled]="!canConfirm()" (click)="confirm(rx)">
            {{ saving() ? 'Αποθήκευση…' : 'Δημιουργία φαρμάκου & υπενθύμισης' }}
          </button>
          <button type="button" class="secondary" (click)="close()">Κλείσιμο</button>
        </div>
      </div>
    }
  `,
  styles: `
    .wizard {
      border: 1px solid var(--border, #d9dee7);
      border-radius: 0.7rem;
      padding: 0.9rem 1.1rem;
      margin: 0.7rem 0;
      background: var(--surface, #fff);
    }
    fieldset { border: none; margin: 0.6rem 0; padding: 0; }
    legend { font-weight: 600; padding: 0; }
    .row, .times, .weekdays { display: flex; flex-wrap: wrap; gap: 0.7rem; }
    .time-row { display: flex; align-items: flex-end; gap: 0.4rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
    .radio, .check { flex-direction: row; align-items: center; gap: 0.35rem; font-size: 0.95rem; }
    input, select { min-height: 44px; font: inherit; }
    .add-time { display: flex; align-items: flex-end; gap: 0.4rem; }
    .chip {
      background: var(--accent, #4f7cff);
      color: #fff;
      border-radius: 999px;
      padding: 0.05rem 0.5rem;
      font-size: 0.75rem;
      margin-left: 0.4rem;
    }
    .chip.warn { background: var(--danger, #c62828); }
    .note { margin: 0.3rem 0; }
    .prn, .success { background: var(--surface-2, #eef1f6); border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
    .success { color: var(--success, #1d7a3d); }
    .error { color: var(--danger, #c62828); }
    .meta { color: var(--text-muted); }
    .actions { display: flex; gap: 0.6rem; margin-top: 0.7rem; }
    button { min-height: 44px; padding: 0.4rem 0.9rem; cursor: pointer; }
    .secondary { background: var(--surface-2, #eef1f6); }
    .link { background: none; border: none; color: var(--accent, #4f7cff); text-decoration: underline; cursor: pointer; }
  `,
})
export class PrescriptionReminderComponent {
  readonly prescription = input<PrescriptionRecord | null>(null);
  readonly closed = output<void>();

  private readonly history = inject(HistoryStore);
  private readonly reminders = inject(RemindersStore);
  private readonly session = inject(SessionStore);

  readonly kinds: ScheduleKind[] = ['daily', 'interval', 'weekly'];
  readonly channels: ReminderChannel[] = [...ALL_CHANNELS];
  readonly weekdayLabels = WEEKDAY_LABELS;

  readonly kind = signal<ScheduleKind>('daily');
  readonly times = signal<number[]>([8 * 60]);
  readonly newTime = signal('08:00');
  readonly everyDays = signal<number>(2);
  readonly singleTime = signal<number>(8 * 60);
  readonly weekdays = signal<number[]>([1]);
  readonly selectedChannels = signal<ReminderChannel[]>(['inapp', 'push']);
  readonly instructions = signal<MedicineInstructions | null>(null);
  readonly note = signal('');
  readonly confidence = signal<PlanConfidence>('defaulted');
  readonly isPrn = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly preview = signal('');

  readonly canWrite = computed(() => {
    const roles = this.session.roles();
    return roles.length === 0 || roles.includes('client');
  });

  constructor() {
    this.reminders.load().subscribe();
    effect(() => {
      const rx = this.prescription();
      if (!rx) {
        return;
      }
      const plan = planFromPrescription(rx);
      this.note.set(plan.note);
      this.confidence.set(plan.confidence);
      this.isPrn.set(plan.isPrn);
      this.instructions.set(plan.instructions);
      this.selectedChannels.set([...plan.channels]);
      this.success.set('');
      this.error.set('');
      const schedule = plan.schedule;
      if (schedule?.kind === 'daily') {
        this.kind.set('daily');
        this.times.set([...schedule.timesMinutes]);
      } else if (schedule?.kind === 'interval') {
        this.kind.set('interval');
        this.everyDays.set(schedule.everyDays);
        this.singleTime.set(schedule.timeMinutes);
      } else if (schedule?.kind === 'weekly') {
        this.kind.set('weekly');
        this.weekdays.set([...schedule.weekdays]);
        this.singleTime.set(schedule.timeMinutes);
      } else {
        // PRN / unrecognized: the user must set the schedule explicitly.
        this.kind.set('daily');
        this.times.set([]);
      }
    });
  }

  readonly planNote = computed(() => this.note());
  readonly instructionsSummaryText = computed(() => {
    const instructions = this.instructions();
    return instructions ? instructionsSummary(instructions) : '';
  });

  readonly smsVoiceHint = computed(() => {
    const status = smsVoiceStatus(this.reminders.prefs());
    return status.sms === 'pending' || status.voice === 'pending'
      ? 'Τα SMS/φωνητικά χρειάζονται αριθμό τηλεφώνου και συγκατάθεση στις ρυθμίσεις υπενθυμίσεων.'
      : '';
  });

  readonly canConfirm = computed(() => {
    if (!this.canWrite() || this.saving()) {
      return false;
    }
    if (this.kind() === 'daily') {
      return this.times().length > 0;
    }
    if (this.kind() === 'weekly') {
      return this.weekdays().length > 0;
    }
    return this.everyDays() >= 1;
  });

  label(channel: ReminderChannel): string {
    return CHANNEL_LABELS[channel];
  }

  canUse(channel: ReminderChannel): boolean {
    return canUseChannel(channel, this.reminders.prefs()).ok;
  }

  gateReason(channel: ReminderChannel): string {
    const gate = canUseChannel(channel, this.reminders.prefs());
    return gate.ok ? '' : gate.reason;
  }

  kindLabel(kind: ScheduleKind): string {
    return kind === 'daily' ? 'Καθημερινά' : kind === 'interval' ? 'Κάθε N ημέρες' : 'Εβδομαδιαία';
  }

  clock(minutes: number): string {
    return minutesToClock(minutes);
  }

  minutes(value: string): number {
    return clockToMinutes(value) ?? this.singleTime();
  }

  setTime(index: number, value: string): void {
    const minutes = clockToMinutes(value);
    if (minutes === null) {
      return;
    }
    this.times.update((times) => times.map((t, i) => (i === index ? minutes : t)));
  }

  addTime(): void {
    const minutes = clockToMinutes(this.newTime());
    if (minutes === null || this.times().includes(minutes)) {
      return;
    }
    this.times.update((times) => [...times, minutes].sort((a, b) => a - b));
  }

  removeTime(index: number): void {
    this.times.update((times) => times.filter((_, i) => i !== index));
  }

  toggleWeekday(day: number, checked: boolean): void {
    this.weekdays.update((days) =>
      checked ? [...new Set([...days, day])].sort((a, b) => a - b) : days.filter((d) => d !== day)
    );
  }

  toggleChannel(channel: ReminderChannel, checked: boolean): void {
    this.selectedChannels.update((channels) =>
      checked ? [...new Set([...channels, channel])] : channels.filter((c) => c !== channel)
    );
  }

  /** Schedule from the current editor state, or null when invalid. */
  buildSchedule(): MedicationSchedule | null {
    return scheduleFromEditor({
      kind: this.kind(),
      timesMinutes: this.times(),
      everyDays: this.everyDays(),
      singleTimeMinutes: this.singleTime(),
      weekdays: this.weekdays(),
    });
  }

  confirm(rx: PrescriptionRecord): void {
    if (!this.canConfirm()) {
      return;
    }
    const schedule = this.buildSchedule();
    if (!schedule) {
      this.error.set('Ορίστε τουλάχιστον μία ώρα λήψης.');
      return;
    }
    const instructions = this.instructions();
    this.saving.set(true);
    this.error.set('');
    this.history
      .setPillReminder(rx.id, { schedule, instructions: instructions ?? undefined })
      .subscribe((created) => {
        this.saving.set(false);
        if (!created) {
          this.error.set(this.history.error() || 'Δεν ήταν δυνατή η δημιουργία της υπενθύμισης.');
          return;
        }
        // Persist the chosen channels through the existing reminder prefs store
        // (the wizard owns no new endpoint).
        this.reminders.setChannels(created.medicationId, this.selectedChannels()).subscribe();
        this.success.set(`${rx.drug} προστέθηκε στα φάρμακα με πρόγραμμα.`);
        this.preview.set(this.previewFor(rx, schedule, instructions));
      });
  }

  close(): void {
    this.closed.emit();
  }

  private previewFor(
    rx: PrescriptionRecord,
    schedule: MedicationSchedule,
    instructions: MedicineInstructions | null
  ): string {
    const pseudo: Medication = {
      id: 'preview',
      name: rx.drug,
      dose: rx.dose ?? '',
      schedule,
      critical: false,
      instructions: instructions ?? undefined,
      createdAtMs: Date.now(),
    };
    return this.reminders.previewFor(pseudo);
  }
}
