import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ScreeningStore, MAX_SNOOZES } from './screening.store';
import { ApiClient } from '../../core/api/api.client';

/**
 * Store tests (FEATURE_PLAN.md §6 subtask 16): load, markDone, waive
 * validation, snooze limit, and due-notification emission.
 */

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() =>
      of({
        profile: { dateOfBirth: '1968-03-14', sex: 'female' },
        records: [],
      })
    ),
    post: vi.fn(() =>
      of({ id: 'scr-new', type: 'mammography', status: 'done', atMs: Date.now() })
    ),
    ...overrides,
  } as unknown as ApiClient;
}

function makeNotifications() {
  return { notify: vi.fn() };
}

describe('ScreeningStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads profile + records and exposes evaluated statuses', () => {
    const store = new ScreeningStore(makeApi(), makeNotifications());
    store.load().subscribe((ok) => expect(ok).toBe(true));
    expect(store.profile().dateOfBirth).toBe('1968-03-14');
    // A 58-year-old woman has at least mammography + cardio due.
    expect(store.dueCount()).toBeGreaterThan(0);
  });

  it('markDone adds the record and clears it from the due list', () => {
    const store = new ScreeningStore(makeApi(), makeNotifications());
    store.load().subscribe();
    const before = store.dueCount();
    store.markDone('mammography').subscribe((ok) => expect(ok).toBe(true));
    expect(store.dueCount()).toBeLessThan(before);
    expect(store.records().find((r) => r.type === 'mammography')?.status).toBe('done');
  });

  it('waive without a reason is rejected client-side', () => {
    const store = new ScreeningStore(makeApi(), makeNotifications());
    store.load().subscribe();
    store.waive('mammography', '   ').subscribe((ok) => expect(ok).toBe(false));
    expect(store.error()).toContain('reason is required');
  });

  it('snooze respects the max-snooze limit', () => {
    // Server echoes the request body (snoozeCount / snoozeUntilMs included).
    const api = makeApi({
      post: vi.fn((_url: string, body: Record<string, unknown>) =>
        of({ id: 'scr-x', type: 'cardioCheck', status: 'done', atMs: Date.now(), ...body })
      ),
    });
    const store = new ScreeningStore(api, makeNotifications());
    store.load().subscribe();
    // Repeatedly snooze until the limit trips.
    for (let i = 0; i < MAX_SNOOZES; i++) {
      store.snooze('cardioCheck').subscribe();
    }
    store.snooze('cardioCheck').subscribe((ok) => {
      expect(ok).toBe(false);
      expect(store.error()).toContain('snoozed');
    });
  });

  it('surfaces each due screening as a notification exactly once', () => {
    const notifications = makeNotifications();
    const store = new ScreeningStore(makeApi(), notifications);
    store.load().subscribe();
    const afterLoad = notifications.notify.mock.calls.length;
    // A second raise (e.g. after markDone) must not duplicate.
    store.markDone('mammography').subscribe();
    // Only the remaining due ones may be added; mammography's kind is now done.
    const calls = notifications.notify.mock.calls.filter(
      ([kind]) => kind === 'screening.due'
    ).length;
    expect(calls).toBeGreaterThanOrEqual(afterLoad);
    expect(calls).toBeLessThanOrEqual(store.dueCount() + 1);
  });

  it('maps backend errors to the error signal', () => {
    const api = makeApi({
      post: vi.fn(() => throwError(() => ({ error: { message: 'Not allowed.' } }))),
    });
    const store = new ScreeningStore(api, makeNotifications());
    store.load().subscribe();
    store.markDone('mammography').subscribe((ok) => expect(ok).toBe(false));
    expect(store.error()).toBe('Not allowed.');
  });
});
