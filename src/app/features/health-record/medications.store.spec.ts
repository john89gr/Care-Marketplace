import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { MedicationsStore } from './medications.store';
import { Medication, AdherenceLog, ESCALATION_AFTER_MISSES } from './medications.logic';
import { ApiClient } from '../../core/api/api.client';

/**
 * Store tests (FEATURE_PLAN.md §7 subtasks 16–17): logging, critical-miss
 * alert emission exactly once, escalation on the 2nd consecutive miss.
 */

const CRITICAL: Medication = {
  id: 'med-1',
  name: 'Insulin glargine',
  dose: '10 units',
  schedule: { kind: 'daily', timesMinutes: [8 * 60] }, // 08:00
  critical: true,
  createdAtMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
};

const VITAMIN: Medication = {
  id: 'med-2',
  name: 'Vitamin D',
  dose: '1 tablet',
  schedule: { kind: 'daily', timesMinutes: [9 * 60] },
  critical: false,
  createdAtMs: Date.now() - 30 * 24 * 60 * 60 * 1000,
};

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of({ medications: [CRITICAL, VITAMIN], logs: [] })),
    // Server echoes the request body, like the real demo backend.
    post: vi.fn((_url: string, body: Record<string, unknown>) =>
      of({
        id: 'ml-new',
        medicationId: 'med-1',
        date: String(body.date),
        timeMinutes: Number(body.timeMinutes),
        action: body.action,
        atMs: Date.now(),
        loggedBy: 'me',
      })
    ),
    ...overrides,
  } as unknown as ApiClient;
}

function makeNotifications() {
  return { notify: vi.fn() };
}

describe('MedicationsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0)); // after 08:00 + grace
  });

  it('loads meds + logs and computes today', () => {
    const store = new MedicationsStore(makeApi(), makeNotifications());
    store.load().subscribe();
    expect(store.activeMeds().length).toBe(2);
    expect(store.today().length).toBe(2);
    // Both 08:00/09:00 slots are past grace at noon → missed.
    expect(store.missedToday().length).toBe(2);
  });

  it('logDose inserts and later replaces the same slot (upsert)', () => {
    const store = new MedicationsStore(makeApi(), makeNotifications());
    store.load().subscribe();
    store.logDose('med-1', '2026-09-02', 480, 'taken').subscribe((ok) => expect(ok).toBe(true));
    store.logDose('med-1', '2026-09-02', 480, 'skipped').subscribe((ok) => expect(ok).toBe(true));
    const slots = store.today().find((t) => t.med.id === 'med-1')!.slots;
    expect(slots[0].state).toBe('skipped');
  });

  it('critical miss raises a notification exactly once per dose', () => {
    const notifications = makeNotifications();
    const store = new MedicationsStore(makeApi(), notifications);
    store.load().subscribe();
    const first = notifications.notify.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    // Re-raising (e.g. a reload-triggered recompute) must not duplicate.
    store.load().subscribe();
    store.logDose('med-2', '2026-09-02', 540, 'taken').subscribe();
    const med1Calls = notifications.notify.mock.calls.filter(
      ([, title]) => String(title).includes('Insulin')
    ).length;
    expect(med1Calls).toBe(1);
  });

  it('escalates when the consecutive-miss streak reaches the threshold', () => {
    const notifications = makeNotifications();
    // Med created 30 days ago with zero logs → every scheduled day missed,
    // so the streak is far past ESCALATION_AFTER_MISSES.
    const store = new MedicationsStore(makeApi(), notifications);
    store.load().subscribe();
    const calls = notifications.notify.mock.calls.filter(
      ([, title]) => String(title).includes('Insulin')
    );
    expect(calls.length).toBe(1);
    const body = String(calls[0][2]);
    expect(body).toContain('consecutive');
  });

  it('does not escalate on the first miss', () => {
    const notifications = makeNotifications();
    // Med created today → only today's slot can be missed (streak 1 < 2).
    const medToday: Medication = { ...CRITICAL, createdAtMs: Date.now() };
    const store = new MedicationsStore(
      makeApi({ get: vi.fn(() => of({ medications: [medToday], logs: [] })) }),
      notifications
    );
    store.load().subscribe();
    const calls = notifications.notify.mock.calls.filter(
      ([, title]) => String(title).includes('Insulin')
    );
    expect(calls.length).toBe(1);
    expect(String(calls[0][2])).not.toContain('consecutive');
  });

  it('non-critical misses never notify', () => {
    const notifications = makeNotifications();
    const store = new MedicationsStore(
      makeApi({ get: vi.fn(() => of({ medications: [VITAMIN], logs: [] })) }),
      notifications
    );
    store.load().subscribe();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('archive keeps the med but hides it from active lists', () => {
    const store = new MedicationsStore(
      makeApi({
        post: vi.fn((_url: string, _body: unknown) =>
          of({ ...CRITICAL, archived: true })
        ),
      }),
      makeNotifications()
    );
    store.load().subscribe();
    store.archive('med-1').subscribe();
    expect(store.meds().length).toBe(2);
    expect(store.activeMeds().length).toBe(1);
  });

  it('maps backend errors to the error signal', () => {
    const store = new MedicationsStore(
      makeApi({ post: vi.fn(() => throwError(() => ({ error: { message: 'Nope.' } }))) }),
      makeNotifications()
    );
    store.load().subscribe();
    store.logDose('med-1', '2026-09-02', 480, 'taken').subscribe((ok) => expect(ok).toBe(false));
    expect(store.error()).toBe('Nope.');
  });
});
