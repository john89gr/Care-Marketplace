import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
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

/** Sunday-first, matching `Date.getDay()`. */
const WEEKDAY_KEYS: readonly string[] = [
  'rx.weekday.0',
  'rx.weekday.1',
  'rx.weekday.2',
  'rx.weekday.3',
  'rx.weekday.4',
  'rx.weekday.5',
  'rx.weekday.6',
];

/**
 * Pill-reminder wizard (FEATURE_PLAN.md Track 3): opens from an active
 * prescription, shows the parsed schedule + pre-filled instruction sheet,
 * lets the user adjust dose times/channels, then creates the medication and
 * persists the reminder channels. Nothing silent: the parsed confidence and a
 * human explanation are always shown.
 *
 * Bilingual: the parsed explanation comes from `planFromPrescription` with the
 * active locale, and the rest of the wizard copy is translated here.
 * Load-bearing for the E2E suite: the `role="dialog"` labelled by
 * `#rx-wizard-title` and the `p.prn` note.
 */
@Component({
  selector: 'app-prescription-reminder',
  standalone: true,
  imports: [],
  template: `
    @if (prescription(); as rx) {
      <div class="wizard" role="dialog" aria-modal="true" aria-labelledby="rx-wizard-title">
        <h3 id="rx-wizard-title">{{ i18n.t('rx.title', { drug: rx.drug }) }}</h3>

        <p class="note" role="status">
          {{ planNote() }}
          <span class="chip" [class.warn]="confidence() === 'defaulted'">
            {{
              confidence() === 'parsed'
                ? i18n.t('rx.confidence.parsed')
                : i18n.t('rx.confidence.defaulted')
            }}
          </span>
        </p>

        @if (isPrn()) {
          <p class="prn" role="note">{{ i18n.t('rx.prnNote') }}</p>
        }

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <fieldset [disabled]="!canWrite() || saving()">
          <legend>{{ i18n.t('rx.scheduleLegend') }}</legend>

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
                    <label class="field">
                      <span class="field-label">{{ i18n.t('rx.timeN', { n: $index + 1 }) }}</span>
                      <input
                        type="time"
                        [value]="clock(t)"
                        (change)="setTime($index, $any($event.target).value)"
                      />
                    </label>
                    <button type="button" class="link" (click)="removeTime($index)">
                      {{ i18n.t('rx.remove') }}
                    </button>
                  </span>
                }
                @if (times().length === 0) {
                  <p class="meta">{{ i18n.t('rx.addOneTime') }}</p>
                }
                <div class="add-time">
                  <label class="field">
                    <span class="field-label">{{ i18n.t('rx.newTime') }}</span>
                    <input
                      type="time"
                      [value]="newTime()"
                      (change)="newTime.set($any($event.target).value)"
                    />
                  </label>
                  <button type="button" class="btn secondary" (click)="addTime()">
                    {{ i18n.t('rx.addTime') }}
                  </button>
                </div>
              </div>
            }
            @case ('interval') {
              <label class="field">
                <span class="field-label">{{ i18n.t('rx.everyDays') }}</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  [value]="everyDays()"
                  (change)="everyDays.set(+$any($event.target).value || 1)"
                />
              </label>
              <label class="field">
                <span class="field-label">{{ i18n.t('rx.time') }}</span>
                <input
                  type="time"
                  [value]="clock(singleTime())"
                  (change)="singleTime.set(minutes($any($event.target).value))"
                />
              </label>
            }
            @case ('weekly') {
              <fieldset class="weekdays">
                <legend>{{ i18n.t('rx.weekdays') }}</legend>
                @for (day of weekdayKeys; track day; let i = $index) {
                  <label class="check">
                    <input
                      type="checkbox"
                      [checked]="weekdays().includes(i)"
                      (change)="toggleWeekday(i, $any($event.target).checked)"
                    />
                    {{ i18n.t(day) }}
                  </label>
                }
              </fieldset>
              <label class="field">
                <span class="field-label">{{ i18n.t('rx.time') }}</span>
                <input
                  type="time"
                  [value]="clock(singleTime())"
                  (change)="singleTime.set(minutes($any($event.target).value))"
                />
              </label>
            }
          }
        </fieldset>

        <fieldset class="channels" [disabled]="!canWrite() || saving()">
          <legend>{{ i18n.t('rx.channelsLegend') }}</legend>
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
          <p class="meta">
            {{ i18n.t('rx.instructions', { summary: instructionsSummaryText() }) }}
          </p>
        }

        @if (success()) {
          <p class="success" role="status">
            ✓ {{ success() }}
            @if (preview()) { · {{ preview() }} }
          </p>
        }

        <div class="actions">
          <button type="button" class="btn" [disabled]="!canConfirm()" (click)="confirm(rx)">
            {{ saving() ? i18n.t('common.saving') : i18n.t('rx.confirm') }}
          </button>
          <button type="button" class="btn secondary" (click)="close()">
            {{ i18n.t('common.close') }}
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .wizard {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      margin: var(--space-3) 0;
      background: var(--surface);
      box-shadow: var(--shadow-md);
    }
    fieldset {
      border: none;
      margin: var(--space-3) 0;
      padding: 0;
    }
    legend {
      font-weight: var(--weight-semibold);
      padding: 0;
    }
    .row,
    .times,
    .weekdays {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .time-row {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }
    .radio,
    .check {
      flex-direction: row;
      align-items: center;
      gap: 0.35rem;
      font-size: var(--text-base);
    }
    .radio input,
    .check input {
      width: auto;
    }
    .add-time {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }
    .chip {
      background: var(--accent);
      color: var(--accent-contrast);
      border-radius: var(--radius-full);
      padding: 0.05rem 0.5rem;
      font-size: var(--text-xs);
      margin-left: 0.4rem;
    }
    .chip.warn {
      background: var(--danger);
      color: #fff;
    }
    .note {
      margin: var(--space-1) 0;
    }
    .prn,
    .success {
      background: var(--surface-raised);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.7rem;
    }
    .success {
      color: var(--success);
    }
    .error {
      color: var(--danger);
    }
    .actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-3);
    }
    .link {
      background: none;
      border: none;
      color: var(--accent);
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
      font: inherit;
    }
    .link:hover:not(:disabled) {
      background: none;
      color: var(--accent-hover);
    }
  `,
})
export class PrescriptionReminderComponent {
  readonly prescription = input<PrescriptionRecord | null>(null);
  readonly closed = output<void>();

  protected readonly i18n = inject(I18n);
  private readonly history = inject(HistoryStore);
  private readonly reminders = inject(RemindersStore);
  private readonly session = inject(SessionStore);

  readonly kinds: ScheduleKind[] = ['daily', 'interval', 'weekly'];
  readonly channels: ReminderChannel[] = [...ALL_CHANNELS];
  readonly weekdayKeys = WEEKDAY_KEYS;

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
      // The parsed explanation follows the active language.
      const plan = planFromPrescription(rx, { locale: this.i18n.language() });
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
    return instructions ? instructionsSummary(instructions, this.i18n.language()) : '';
  });

  readonly smsVoiceHint = computed(() => {
    const status = smsVoiceStatus(this.reminders.prefs());
    return status.sms === 'pending' || status.voice === 'pending'
      ? this.i18n.t('rx.smsVoiceHint')
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
    return this.i18n.t(`reminders.channel.${channel}`);
  }

  canUse(channel: ReminderChannel): boolean {
    return canUseChannel(channel, this.reminders.prefs()).ok;
  }

  gateReason(channel: ReminderChannel): string {
    const gate = canUseChannel(channel, this.reminders.prefs());
    return gate.ok ? '' : gate.reason;
  }

  kindLabel(kind: ScheduleKind): string {
    return this.i18n.t(`rx.kind.${kind}`);
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
      this.error.set(this.i18n.t('rx.error.noTime'));
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
          this.error.set(
            this.history.error()
              ? this.i18n.message(this.history.errorSource(), this.history.error())
              : this.i18n.t('rx.error.failed')
          );
          return;
        }
        // Persist the chosen channels through the existing reminder prefs store
        // (the wizard owns no new endpoint).
        this.reminders.setChannels(created.medicationId, this.selectedChannels()).subscribe();
        this.success.set(this.i18n.t('rx.success', { drug: rx.drug }));
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
    return this.reminders.previewFor(pseudo, Date.now(), this.i18n.language());
  }
}
