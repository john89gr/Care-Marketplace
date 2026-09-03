import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { Subject } from 'rxjs';
import { RemindersStore } from './reminders.store';
import { DEFAULT_PREFERENCES, ReminderPreferences } from './reminders.logic';
import type { Medication } from './medications.logic';
import { ApiClient } from '../../core/api/api.client';
import { WebSocketClient } from '../../core/services/ws/websocket.client';

/**
 * Smart-reminders store tests (FEATURE_PLAN.md §8 subtask 16): quiet-hours
 * suppression, the escalation ladder, timezone-aware previews, consent
 * gating, caregiver copies, history logging, and PUT persistence.
 */

const CRITICAL: Medication = {
  id: 'med-1',
  name: 'Insulin glargine',
  dose: '10 units',
  schedule: { kind: 'daily', timesMinutes: [8 * 60] },
  critical: true,
  createdAtMs: Date.UTC(2025, 0, 1),
};

const VITAMIN: Medication = {
  id: 'med-2',
  name: 'Vitamin D',
  dose: '1 tablet',
  schedule: { kind: 'daily', timesMinutes: [9 * 60] },
  critical: false,
  createdAtMs: Date.UTC(2025, 0, 1),
};

function storedPrefs(overrides: Partial<ReminderPreferences> = {}): ReminderPreferences {
  return structuredClone({ ...DEFAULT_PREFERENCES, ...overrides });
}

function makeDeps(serverPrefs: ReminderPreferences = storedPrefs()) {
  let current = structuredClone(serverPrefs);
  const api = {
    get: vi.fn(() => of(structuredClone(current))),
    // PUT echoes the merged resource like the demo backend.
    put: vi.fn((_url: string, body: ReminderPreferences) => {
      current = structuredClone(body);
      return of(structuredClone(current));
    }),
    post: vi.fn(() => of({ ok: true })),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
  } as unknown as ApiClient;
  const notifications = { notify: vi.fn(), toast: vi.fn() };
  const messages = new Subject<{ type: string; payload?: Record<string, unknown> }>();
  const ws = {
    messages$: messages.asObservable(),
    send: vi.fn(() => true),
  } as unknown as WebSocketClient;
  return { api, notifications, ws, messages };
}

describe('RemindersStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads preferences from the backend', () => {
    const deps = makeDeps(storedPrefs({ timezone: 'UTC' }));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe((ok) => expect(ok).toBe(true));
    expect(deps.api.get).toHaveBeenCalledWith('/me/reminders/preferences');
    expect(store.prefs().timezone).toBe('UTC');
    expect(store.loaded()).toBe(true);
  });

  it('persists channel prefs with PUT /me/reminders/preferences', () => {
    const deps = makeDeps();
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    store.setChannels('med-1', ['sms', 'voice']).subscribe((ok) => expect(ok).toBe(true));
    expect(deps.api.put).toHaveBeenCalledWith(
      '/me/reminders/preferences',
      expect.objectContaining({ channelsByMedication: { 'med-1': ['sms', 'voice'] } })
    );
    expect(store.channelsFor('med-1')).toEqual(['sms', 'voice']);
  });

  it('rejects unknown timezones without calling the backend', () => {
    const deps = makeDeps();
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    store.setTimezone('Not/AZone').subscribe((ok) => expect(ok).toBe(false));
    expect(deps.api.put).not.toHaveBeenCalled();
    expect(store.error()).toContain('Unknown timezone');
  });

  it('maps save failures to the error signal', () => {
    const deps = makeDeps();
    deps.api.put = vi.fn(() => throwError(() => ({ error: { message: 'Down.' } })));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    store.setChannels('med-1', ['sms']).subscribe((ok) => expect(ok).toBe(false));
    expect(store.error()).toBe('Down.');
  });

  it('builds the "next reminder … via …" preview in the user timezone', () => {
    const deps = makeDeps(storedPrefs({ timezone: 'Europe/Athens' }));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    // Monday 2026-08-31 12:00Z → next 08:00 Athens dose is Tue 08:00.
    const preview = store.previewFor(CRITICAL, Date.UTC(2026, 7, 31, 12, 0));
    expect(preview).toBe('next reminder fires Tue 08:00 via inapp');
  });

  it('suppresses non-critical reminders in quiet hours but never critical ones', () => {
    // Noon UTC in winter Athens = 14:00 wall; window 13:00–15:00 Athens.
    const quiet = storedPrefs({
      timezone: 'Europe/Athens',
      quietHours: { startMinutes: 13 * 60, endMinutes: 15 * 60 },
    });
    const deps = makeDeps(quiet);
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    const nowMs = Date.UTC(2026, 0, 15, 12, 0);
    expect(store.isQuietNow(nowMs)).toBe(true);

    const plan = store.planDelivery(VITAMIN, nowMs);
    expect(plan.map((s) => s.status)).toEqual(['suppressed-quiet-hours', 'suppressed-quiet-hours']);

    const criticalPlan = store.planDelivery(CRITICAL, nowMs);
    expect(criticalPlan.every((s) => s.status !== 'suppressed-quiet-hours')).toBe(true);
  });

  it('deliver() walks the escalation ladder and logs every step', () => {
    // Push granted locally is not enough for the jsdom Notification stub, so
    // the ladder resolves to: inapp sent, push failed, sms blocked (no consent).
    const deps = makeDeps(storedPrefs({ timezone: 'UTC', quietHours: null, pushEnabled: true }));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    const entries = store.deliver(CRITICAL, Date.UTC(2026, 0, 15, 12, 0));
    expect(entries.map((e) => e.channel)).toEqual(['inapp', 'push', 'sms']);
    expect(entries[0].status).toBe('sent');
    expect(entries[1].status).toBe('failed'); // no Notification grant in jsdom
    expect(entries[2].status).toBe('blocked-no-consent');
    expect(store.history()).toHaveLength(3);
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      'medication.missed',
      expect.stringContaining('Insulin'),
      expect.any(String),
      '/medications'
    );
  });

  it('deliver() suppresses non-critical reminders and logs the reason', () => {
    const deps = makeDeps(
      storedPrefs({ timezone: 'UTC', quietHours: { startMinutes: 0, endMinutes: 23 * 60 + 59 } })
    );
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    const entries = store.deliver(VITAMIN, Date.UTC(2026, 0, 15, 12, 0));
    expect(entries.every((e) => e.status === 'suppressed-quiet-hours')).toBe(true);
    expect(deps.notifications.notify).not.toHaveBeenCalled();
  });

  it('deliver() emits a caregiver duplicate copy for critical meds when opted in', () => {
    const deps = makeDeps(
      storedPrefs({
        timezone: 'UTC',
        quietHours: null,
        caregiverCopy: { enabled: true, relationship: 'daughter' },
      })
    );
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    const entries = store.deliver(CRITICAL, Date.UTC(2026, 0, 15, 12, 0));
    const copy = entries.find((e) => e.detail.includes('Caregiver duplicate'));
    expect(copy).toBeDefined();
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      'medication.missed',
      expect.stringContaining('Caregiver copy'),
      expect.stringContaining('daughter'),
      '/medications'
    );
    // Non-critical meds never fan out to the caregiver.
    deps.notifications.notify.mockClear();
    store.deliver(VITAMIN, Date.UTC(2026, 0, 15, 12, 0));
    expect(deps.notifications.notify).not.toHaveBeenCalled();
  });

  it('sendTestReminder emits over the socket, notifies, toasts, and logs', () => {
    const deps = makeDeps(storedPrefs({ timezone: 'UTC', quietHours: null }));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    store.sendTestReminder(CRITICAL);
    expect(deps.ws.send).toHaveBeenCalledWith({
      type: 'reminder.test',
      payload: expect.objectContaining({ medicationId: 'med-1', name: 'Insulin glargine' }),
    });
    expect(deps.notifications.notify).toHaveBeenCalledWith(
      'medication.missed',
      'Test reminder: Insulin glargine',
      expect.stringContaining('next reminder fires'),
      '/medications'
    );
    expect(deps.notifications.toast).toHaveBeenCalledWith(
      expect.stringContaining('Insulin glargine'),
      'success'
    );
    expect(store.history()[0].detail).toContain('Test reminder');
  });

  it('records SMS consent with a timestamp (GDPR hook)', () => {
    const deps = makeDeps();
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    expect(store.prefs().consents.sms).toBe(false);
    store.setConsent('sms', true).subscribe();
    expect(store.prefs().consents.sms).toBe(true);
    expect(store.prefs().consents.consentedAtMs).not.toBeNull();
  });

  it('caps the history log', () => {
    const deps = makeDeps(storedPrefs({ timezone: 'UTC', quietHours: null }));
    const store = new RemindersStore(deps.api, deps.notifications, deps.ws);
    store.load().subscribe();
    for (let i = 0; i < 120; i++) {
      store.sendTestReminder(CRITICAL);
    }
    expect(store.history().length).toBeLessThanOrEqual(100);
  });
});
