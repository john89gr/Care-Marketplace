import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import type { Medication } from './medications.logic';
import {
  ReminderChannel,
  ReminderPreferences,
  DEFAULT_PREFERENCES,
  normalizePreferences,
  normalizeChannels,
  channelsForMed,
  escalationLadder,
  isSuppressed,
  canUseChannel,
  minutesInTimeZone,
  reminderPreview,
  isValidTimeZone,
} from './reminders.logic';

/**
 * Smart Reminders store (FEATURE_PLAN.md §8): per-medication channel prefs,
 * quiet hours, IANA timezone, SMS/voice stub state + GDPR consent, caregiver
 * duplicate copies, delivery with the escalation ladder, a sent/failed history
 * log, and a "send test reminder now" path over the demo socket.
 *
 * Delivery fan-out per reminder:
 * - `inapp` → notification center (feature 4 store, kept local-only).
 * - `push` → browser Notification API when permission is granted.
 * - `sms` / `voice` → server-side stub: recorded in the history log as
 *   queued server-side once phone + consent are configured (subtask 5).
 * Quiet hours suppress non-critical channels; critical meds bypass and walk
 * the full `inapp → push → sms` ladder (subtasks 7–8).
 */

/** One delivery attempt for support debugging (subtask 14). */
export interface ReminderHistoryEntry {
  id: string;
  medicationId: string;
  medicationName: string;
  channel: ReminderChannel;
  status: 'sent' | 'failed' | 'suppressed-quiet-hours' | 'blocked-no-consent';
  atMs: number;
  detail: string;
}

/** One step of a computed delivery plan (pure view over prefs + schedule). */
export interface DeliveryStep {
  channel: ReminderChannel;
  status: 'ready' | 'suppressed-quiet-hours' | 'blocked-no-consent';
  detail: string;
}

const HISTORY_CAP = 100;
let seq = 0;
const nextId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const PREFS_PATH = '/me/reminders/preferences';

declare const Notification: undefined | {
  new (title: string, options?: { body?: string }): unknown;
  permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
};

function browserNotification(): typeof Notification {
  try {
    return (globalThis as unknown as { Notification?: typeof Notification }).Notification;
  } catch {
    return undefined;
  }
}

@Injectable({ providedIn: 'root' })
export class RemindersStore {
  // Default-parameter injection keeps direct construction possible in tests.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly notifications?: NotificationsService,
    private readonly ws?: WebSocketClient
  ) {}

  private readonly _prefs = signal<ReminderPreferences>(structuredClone(DEFAULT_PREFERENCES));
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  private readonly _history = signal<ReminderHistoryEntry[]>([]);
  private readonly _pushState = signal<NotificationPermission | 'unsupported' | 'unknown'>('unknown');

  readonly prefs = this._prefs.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly history = this._history.asReadonly();
  readonly pushState = this._pushState.asReadonly();

  /** Enabled channels for one medication (subtask 2). */
  channelsFor(medicationId: string): ReminderChannel[] {
    return channelsForMed(this._prefs(), medicationId);
  }

  /** Preview line "next reminder fires Tue 08:00 via push" (subtask 6). */
  previewFor(med: Medication, nowMs: number = Date.now()): string {
    const prefs = this._prefs();
    return reminderPreview(med, nowMs, prefs.timezone, this.channelsFor(med.id));
  }

  /** Quiet-hours state right now in the user's timezone (subtask 7). */
  isQuietNow(nowMs: number = Date.now()): boolean {
    const prefs = this._prefs();
    if (!prefs.quietHours) {
      return false;
    }
    const { startMinutes, endMinutes } = prefs.quietHours;
    const nowMinutes = minutesInTimeZone(nowMs, prefs.timezone);
    if (startMinutes === endMinutes) {
      return false;
    }
    if (startMinutes < endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }

  /**
   * Ordered delivery plan: the escalation ladder filtered to the channels
   * enabled for this medication, with any extra enabled channels (voice)
   * appended; each step annotated with suppression/consent gating.
   */
  planDelivery(med: Medication, nowMs: number = Date.now()): DeliveryStep[] {
    const prefs = this._prefs();
    const enabled = this.channelsFor(med.id);
    const ladder = escalationLadder(med.critical);
    const ordered: ReminderChannel[] = [
      ...ladder,
      ...enabled.filter((c) => !ladder.includes(c)),
    ];
    const nowMinutes = minutesInTimeZone(nowMs, prefs.timezone);
    return ordered.map((channel) => {
      if (isSuppressed(med.critical, nowMinutes, prefs.quietHours)) {
        return {
          channel,
          status: 'suppressed-quiet-hours' as const,
          detail: `Suppressed by quiet hours (${med.name} is not critical).`,
        };
      }
      const gate = canUseChannel(channel, prefs);
      if (!gate.ok) {
        return { channel, status: 'blocked-no-consent' as const, detail: gate.reason };
      }
      return { channel, status: 'ready' as const, detail: '' };
    });
  }

  load(): Observable<boolean> {
    this._loading.set(true);
    return this.api.get<ReminderPreferences>(PREFS_PATH).pipe(
      map((prefs) => {
        this._prefs.set(normalizePreferences(prefs));
        this._loading.set(false);
        this._loaded.set(true);
        return true;
      }),
      catchError(() => {
        this._loading.set(false);
        return of(false);
      })
    );
  }

  /** Persist a patch (merged client-side, PUT as a full resource). */
  save(patch: Partial<ReminderPreferences>): Observable<boolean> {
    this._saving.set(true);
    this._error.set('');
    const merged: ReminderPreferences = normalizePreferences({ ...this._prefs(), ...patch });
    return this.api.put<ReminderPreferences>(PREFS_PATH, merged).pipe(
      map((saved) => {
        this._prefs.set(normalizePreferences(saved));
        this._saving.set(false);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save reminder preferences. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Per-reminder channel prefs (subtask 2). */
  setChannels(medicationId: string, channels: ReminderChannel[]): Observable<boolean> {
    const prefs = this._prefs();
    return this.save({
      channelsByMedication: {
        ...prefs.channelsByMedication,
        [medicationId]: normalizeChannels(channels),
      },
    });
  }

  setQuietHours(quiet: ReminderPreferences['quietHours']): Observable<boolean> {
    return this.save({ quietHours: quiet });
  }

  /** IANA timezone per user (subtask 10); rejects unknown zone names. */
  setTimezone(timezone: string): Observable<boolean> {
    if (!isValidTimeZone(timezone)) {
      this._error.set(`Unknown timezone "${timezone}". Use an IANA name like Europe/Athens.`);
      return of(false);
    }
    return this.save({ timezone });
  }

  setPhone(phone: string): Observable<boolean> {
    return this.save({ phone: phone.slice(0, 32) });
  }

  /** Consent capture for SMS/voice (subtask 15, GDPR hook). */
  setConsent(kind: 'sms' | 'voice', granted: boolean): Observable<boolean> {
    const prefs = this._prefs();
    return this.save({
      consents: {
        ...prefs.consents,
        [kind]: granted,
        consentedAtMs: granted ? Date.now() : prefs.consents.consentedAtMs,
      },
    });
  }

  /** Caregiver duplicate copy opt-in, per relationship (subtask 12). */
  setCaregiverCopy(copy: ReminderPreferences['caregiverCopy']): Observable<boolean> {
    return this.save({ caregiverCopy: { ...copy } });
  }

  /**
   * Browser push opt-in (subtask 4): asks the Notification API for permission
   * and mirrors the grant in prefs so the preview/gating logic stays local.
   */
  async requestPush(): Promise<NotificationPermission | 'unsupported'> {
    const Native = browserNotification();
    if (!Native) {
      this._pushState.set('unsupported');
      return 'unsupported';
    }
    const permission = await Native.requestPermission();
    this._pushState.set(permission);
    if (permission === 'granted') {
      this.save({ pushEnabled: true }).subscribe();
    }
    return permission;
  }

  /**
   * Deliver a reminder now: walks the delivery plan, performs the side effect
   * for every ready channel, and appends one history entry per step
   * (subtasks 13–14). Critical meds with the caregiver copy opted in also
   * emit a duplicate inbox entry for the family member.
   */
  deliver(med: Medication, nowMs: number = Date.now()): ReminderHistoryEntry[] {
    const steps = this.planDelivery(med, nowMs);
    const entries: ReminderHistoryEntry[] = steps.map((step) =>
      this.executeStep(med, step, nowMs)
    );
    const prefs = this._prefs();
    if (med.critical && prefs.caregiverCopy.enabled && entries.some((e) => e.status === 'sent')) {
      this.notifications?.notify(
        'medication.missed',
        `Caregiver copy: ${med.name}`,
        `Duplicate reminder${prefs.caregiverCopy.relationship ? ` for ${prefs.caregiverCopy.relationship}` : ''}: time for ${med.dose}.`,
        '/medications'
      );
      entries.push({
        id: nextId('rh'),
        medicationId: med.id,
        medicationName: med.name,
        channel: 'inapp',
        status: 'sent',
        atMs: nowMs,
        detail: 'Caregiver duplicate copy delivered to the inbox.',
      });
    }
    this._history.update((history) => [...entries, ...history].slice(0, HISTORY_CAP));
    return entries;
  }

  /**
   * Test mode (subtask 9): emits `reminder.test` over the demo socket (the
   * demo stand-in answers with a live `notification.push`), drops an inbox
   * entry + toast via the notifications store, and logs the attempt.
   */
  sendTestReminder(med: Medication): void {
    const nowMs = Date.now();
    this.ws?.send({ type: 'reminder.test', payload: { medicationId: med.id, name: med.name, atMs: nowMs } });
    const preview = this.previewFor(med, nowMs);
    this.notifications?.notify(
      'medication.missed',
      `Test reminder: ${med.name}`,
      `${preview}. This is how your reminder will look.`,
      '/medications'
    );
    this.notifications?.toast(`Test reminder sent for ${med.name}`, 'success');
    this._history.update((history) =>
      [
        {
          id: nextId('rh'),
          medicationId: med.id,
          medicationName: med.name,
          channel: 'inapp' as const,
          status: 'sent' as const,
          atMs: nowMs,
          detail: 'Test reminder emitted (socket + inbox).',
        },
        ...history,
      ].slice(0, HISTORY_CAP)
    );
  }

  private executeStep(med: Medication, step: DeliveryStep, nowMs: number): ReminderHistoryEntry {
    const base = {
      id: nextId('rh'),
      medicationId: med.id,
      medicationName: med.name,
      channel: step.channel,
      atMs: nowMs,
    };
    if (step.status !== 'ready') {
      return { ...base, status: step.status, detail: step.detail };
    }
    switch (step.channel) {
      case 'inapp':
        if (med.critical) {
          this.notifications?.notify(
            'medication.missed',
            `Reminder: ${med.name}`,
            `Time for ${med.dose} (${this.previewFor(med, nowMs)}).`,
            '/medications'
          );
        }
        return { ...base, status: 'sent', detail: 'Delivered to the notification inbox.' };
      case 'push': {
        const Native = browserNotification();
        if (!Native || Native.permission !== 'granted') {
          return { ...base, status: 'failed', detail: 'Browser push permission not granted.' };
        }
        try {
          new Native(`Reminder: ${med.name}`, { body: `Time for ${med.dose}.` });
          return { ...base, status: 'sent', detail: 'Shown via the browser Notification API.' };
        } catch {
          return { ...base, status: 'failed', detail: 'Browser notification failed to display.' };
        }
      }
      case 'sms':
      case 'voice':
        // Server-side stub (subtask 5): consent + phone already gated the
        // step to `ready`, so the provider queue is the only hop left.
        return {
          ...base,
          status: 'sent',
          detail: `${step.channel === 'sms' ? 'SMS' : 'Voice call'} queued server-side (stub).`,
        };
    }
  }
}
