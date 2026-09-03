import { Component, inject, input } from '@angular/core';
import { RemindersStore } from './reminders.store';
import type { Medication } from './medications.logic';
import {
  ALL_CHANNELS,
  ReminderChannel,
  ReminderPreferences,
  minutesToClock,
  clockToMinutes,
  describeQuietHours,
  smsVoiceStatus,
} from './reminders.logic';

const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  inapp: 'In-app inbox',
  push: 'Browser push',
  sms: 'SMS (server-side)',
  voice: 'Voice call (server-side)',
};

const CHANNEL_HELP: Record<ReminderChannel, string> = {
  inapp: 'Always available. Appears in the notification center.',
  push: 'Needs browser permission. Works when the tab is closed (PWA).',
  sms: 'Needs a phone number and SMS consent below.',
  voice: 'Needs a phone number and voice-call consent below.',
};

const TIMEZONES = ['Europe/Athens', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'UTC'];

/**
 * Per-reminder channel preferences (FEATURE_PLAN.md §8 subtask 2): the
 * channel checkboxes, the "next reminder … via …" preview (subtask 6) and
 * the "send test reminder now" button (subtask 9) for one medication.
 * A11y: real fieldset/legend + labelled checkboxes; the preview is a
 * `role="status"` live region.
 */
@Component({
  selector: 'app-reminder-channel-prefs',
  standalone: true,
  imports: [],
  template: `
    @if (medication(); as med) {
      <fieldset class="channel-prefs">
        <legend>Reminder channels for {{ med.name }}</legend>
        <div class="channels">
          @for (channel of channels; track channel) {
            <label [attr.for]="boxId(med.id, channel)">
              <input
                type="checkbox"
                [attr.id]="boxId(med.id, channel)"
                [checked]="store.channelsFor(med.id).includes(channel)"
                [attr.aria-describedby]="helpId(med.id, channel)"
                (change)="toggle(med, channel, $event)"
              />
              {{ labels[channel] }}
            </label>
            <p class="help" [attr.id]="helpId(med.id, channel)">{{ help[channel] }}</p>
          }
        </div>
        <p class="preview" role="status">{{ store.previewFor(med) }}</p>
        <button
          type="button"
          class="test-btn"
          [attr.aria-label]="'Send test reminder now for ' + med.name"
          (click)="store.sendTestReminder(med)"
        >
          Send test reminder now
        </button>
      </fieldset>
    }
  `,
  styles: `
    .channel-prefs { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.6rem 0.8rem; margin-top: 0.6rem; }
    .channels { display: grid; gap: 0.15rem; }
    .channels label { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; font-weight: 600; }
    .help { margin: 0 0 0.25rem 1.6rem; color: var(--text-muted); font-size: 0.85rem; }
    .preview { margin: 0.5rem 0; color: var(--text-muted); }
    .test-btn { min-height: 44px; }
  `,
})
export class ReminderChannelPrefsComponent {
  readonly store = inject(RemindersStore);
  readonly medication = input<Medication | null>(null);

  protected readonly channels = ALL_CHANNELS;
  protected readonly labels = CHANNEL_LABELS;
  protected readonly help = CHANNEL_HELP;

  boxId(medId: string, channel: ReminderChannel): string {
    return `reminder-ch-${medId}-${channel}`;
  }

  helpId(medId: string, channel: ReminderChannel): string {
    return `reminder-ch-${medId}-${channel}-help`;
  }

  toggle(med: Medication, channel: ReminderChannel, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.store.channelsFor(med.id);
    const next = checked ? [...current, channel] : current.filter((c) => c !== channel);
    this.store.setChannels(med.id, next).subscribe();
  }
}

/**
 * Global reminder settings (FEATURE_PLAN.md §8 subtasks 5, 7, 10, 12, 14,
 * 15, 19): quiet hours, IANA timezone, SMS/voice phone + pending/configured
 * states, GDPR consent capture, caregiver duplicate opt-in, browser-push
 * opt-in, and the sent/failed history log. Usable inline and as the
 * `/reminders` route component.
 */
@Component({
  selector: 'app-reminder-settings',
  standalone: true,
  imports: [],
  template: `
    <section class="reminder-settings" aria-labelledby="reminder-settings-title">
      <h2 id="reminder-settings-title">Reminder settings</h2>
      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      <fieldset>
        <legend>Quiet hours</legend>
        <p class="help" id="quiet-help">
          Non-critical reminders pause between these hours. Critical medication
          reminders always come through. Times are in your timezone below.
          Currently: {{ quietSummary() }}.
        </p>
        <label for="quiet-enabled">
          <input
            id="quiet-enabled"
            type="checkbox"
            [checked]="store.prefs().quietHours !== null"
            aria-describedby="quiet-help"
            (change)="toggleQuiet($event)"
          />
          Enable quiet hours
        </label>
        @if (store.prefs().quietHours; as quiet) {
          <div class="row">
            <label for="quiet-start">Starts at</label>
            <input
              id="quiet-start"
              type="time"
              [value]="clock(quiet.startMinutes)"
              (change)="setQuietBound('start', $event)"
            />
            <label for="quiet-end">Ends at</label>
            <input
              id="quiet-end"
              type="time"
              [value]="clock(quiet.endMinutes)"
              (change)="setQuietBound('end', $event)"
            />
          </div>
        }
      </fieldset>

      <div class="field">
        <label for="reminder-tz">Timezone</label>
        <input
          id="reminder-tz"
          type="text"
          list="reminder-tz-list"
          autocomplete="off"
          [value]="store.prefs().timezone"
          aria-describedby="reminder-tz-help reminder-tz-error"
          (change)="setTimezone($event)"
        />
        <datalist id="reminder-tz-list">
          @for (tz of timezones; track tz) {
            <option [value]="tz"></option>
          }
        </datalist>
        <p class="help" id="reminder-tz-help">IANA name, e.g. Europe/Athens. Dose times render in this zone.</p>
        @if (tzError()) {
          <p class="error" role="alert" id="reminder-tz-error">{{ tzError() }}</p>
        }
      </div>

      <fieldset>
        <legend>SMS &amp; voice calls</legend>
        <p class="help" id="telephony-help">
          SMS and voice reminders are sent server-side (stub in demo mode).
          Status: SMS {{ telephony().sms }}, voice {{ telephony().voice }}.
          Both need a phone number and your consent.
        </p>
        <div class="field">
          <label for="reminder-phone">Phone number</label>
          <input
            id="reminder-phone"
            type="tel"
            autocomplete="tel"
            [value]="store.prefs().phone"
            aria-describedby="telephony-help"
            (change)="setPhone($event)"
          />
        </div>
        <label for="consent-sms">
          <input
            id="consent-sms"
            type="checkbox"
            [checked]="store.prefs().consents.sms"
            aria-describedby="consent-help"
            (change)="setConsent('sms', $event)"
          />
          I consent to SMS medication reminders
        </label>
        <label for="consent-voice">
          <input
            id="consent-voice"
            type="checkbox"
            [checked]="store.prefs().consents.voice"
            aria-describedby="consent-help"
            (change)="setConsent('voice', $event)"
          />
          I consent to voice-call medication reminders
        </label>
        <p class="help" id="consent-help">
          Consent is recorded with a timestamp and can be withdrawn here at any
          time (GDPR; feeds the consent ledger). Withdrawing stops new
          reminders but keeps the history log.
        </p>
      </fieldset>

      <fieldset>
        <legend>Family copy</legend>
        <label for="caregiver-copy">
          <input
            id="caregiver-copy"
            type="checkbox"
            [checked]="store.prefs().caregiverCopy.enabled"
            aria-describedby="caregiver-copy-help"
            (change)="setCaregiverCopyEnabled($event)"
          />
          Also send critical reminders to my caregiver
        </label>
        <p class="help" id="caregiver-copy-help">
          Opt-in per relationship: your caregiver gets a duplicate inbox copy
          of critical-medication reminders.
        </p>
        @if (store.prefs().caregiverCopy.enabled) {
          <div class="field">
            <label for="caregiver-rel">Relationship</label>
            <input
              id="caregiver-rel"
              type="text"
              placeholder="e.g. daughter, nurse"
              [value]="store.prefs().caregiverCopy.relationship"
              (change)="setCaregiverRelationship($event)"
            />
          </div>
        }
      </fieldset>

      <div class="field">
        <button
          type="button"
          (click)="enablePush()"
          [attr.aria-label]="pushLabel()"
          aria-describedby="push-help"
        >
          Enable browser push
        </button>
        <p class="help" id="push-help">Current state: {{ pushLabel() }}.</p>
      </div>

      <section aria-labelledby="reminder-history-title">
        <h3 id="reminder-history-title">Reminder history</h3>
        @if (store.history().length === 0) {
          <p class="help">No reminders sent yet. Use “Send test reminder now” on a medication.</p>
        } @else {
          <ol class="history" aria-label="Reminder delivery attempts">
            @for (entry of store.history().slice(0, 20); track entry.id) {
              <li>
                <strong>{{ entry.medicationName }}</strong>
                <span> via {{ entry.channel }} — {{ entry.status }}</span>
                <span class="help">{{ when(entry.atMs) }} · {{ entry.detail }}</span>
              </li>
            }
          </ol>
        }
      </section>
    </section>
  `,
  styles: `
    .reminder-settings { border-top: 2px solid var(--border, #d9dee7); margin-top: 1.2rem; padding-top: 0.8rem; display: grid; gap: 0.9rem; }
    fieldset { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.6rem 0.8rem; }
    legend { font-weight: 700; padding: 0 0.3rem; }
    .field { display: grid; gap: 0.3rem; }
    .row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
    label { display: flex; align-items: center; gap: 0.5rem; min-height: 44px; }
    .field label { min-height: 0; font-weight: 600; }
    input[type='text'], input[type='tel'], input[type='time'] { min-height: 44px; font: inherit; padding: 0 0.5rem; }
    button { min-height: 44px; justify-self: start; }
    .help { margin: 0.15rem 0; color: var(--text-muted); font-size: 0.85rem; }
    .error { color: var(--danger, #c62828); font-weight: 600; }
    .history { margin: 0.4rem 0; padding-left: 1.2rem; display: grid; gap: 0.4rem; }
    .history li { display: grid; gap: 0.1rem; }
  `,
})
export class ReminderSettingsComponent {
  readonly store = inject(RemindersStore);
  protected readonly timezones = TIMEZONES;
  protected tzError = '';

  constructor() {
    this.store.load().subscribe();
  }

  quietSummary(): string {
    return describeQuietHours(this.store.prefs().quietHours);
  }

  telephony(): { sms: string; voice: string } {
    return smsVoiceStatus(this.store.prefs());
  }

  pushLabel(): string {
    const state = this.store.pushState();
    if (state === 'granted' || this.store.prefs().pushEnabled) {
      return 'push enabled';
    }
    if (state === 'denied') {
      return 'push blocked in the browser';
    }
    if (state === 'unsupported') {
      return 'push not supported here';
    }
    return 'push not enabled';
  }

  clock(minutes: number): string {
    return minutesToClock(minutes);
  }

  when(atMs: number): string {
    try {
      return new Date(atMs).toLocaleString();
    } catch {
      return '';
    }
  }

  toggleQuiet(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    const fallback: ReminderPreferences['quietHours'] = { startMinutes: 22 * 60, endMinutes: 7 * 60 };
    this.store.setQuietHours(enabled ? (this.store.prefs().quietHours ?? fallback) : null).subscribe();
  }

  setQuietBound(which: 'start' | 'end', event: Event): void {
    const minutes = clockToMinutes((event.target as HTMLInputElement).value);
    if (minutes === null) {
      return;
    }
    const current = this.store.prefs().quietHours ?? { startMinutes: 22 * 60, endMinutes: 7 * 60 };
    this.store
      .setQuietHours(
        which === 'start'
          ? { ...current, startMinutes: minutes }
          : { ...current, endMinutes: minutes }
      )
      .subscribe();
  }

  setTimezone(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.tzError = '';
    this.store.setTimezone(value).subscribe((ok) => {
      if (!ok) {
        this.tzError = `Unknown timezone "${value}". Use an IANA name like Europe/Athens.`;
      }
    });
  }

  setPhone(event: Event): void {
    this.store.setPhone((event.target as HTMLInputElement).value).subscribe();
  }

  setConsent(kind: 'sms' | 'voice', event: Event): void {
    this.store.setConsent(kind, (event.target as HTMLInputElement).checked).subscribe();
  }

  setCaregiverCopyEnabled(event: Event): void {
    const prefs = this.store.prefs();
    this.store
      .setCaregiverCopy({ ...prefs.caregiverCopy, enabled: (event.target as HTMLInputElement).checked })
      .subscribe();
  }

  setCaregiverRelationship(event: Event): void {
    const prefs = this.store.prefs();
    this.store
      .setCaregiverCopy({ ...prefs.caregiverCopy, relationship: (event.target as HTMLInputElement).value })
      .subscribe();
  }

  async enablePush(): Promise<void> {
    await this.store.requestPush();
  }
}
