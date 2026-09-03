import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { NotificationsService, AppNotification } from '../../core/services/notifications/notifications.service';
import { VitalsStore, VitalReading, isOutOfRange } from './vitals.store';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeNotifications(): NotificationsService & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const service = {
    notify: (...args: unknown[]) => calls.push(args),
  };
  return Object.assign(service as unknown as NotificationsService, { calls });
}

const bp = (value: number, value2: number | null, measuredAtMs: number): VitalReading => ({
  id: `r-${measuredAtMs}`,
  type: 'bloodPressure',
  value,
  value2,
  measuredAtMs,
  source: 'manual',
});

describe('VitalsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads readings from the API', () => {
    const readings: VitalReading[] = [bp(132, 86, 1000)];
    const store = new VitalsStore(makeApi({ get: vi.fn(() => of(readings)) }));
    store.load();
    expect(store.readings()).toEqual(readings);
    expect(store.loading()).toBe(false);
  });

  it('adds a reading to the front of the list and marks saved', async () => {
    const api = makeApi({ post: vi.fn((_path, body) => of(body)) });
    const store = new VitalsStore(api);
    const ok = await new Promise<boolean>((resolve) =>
      store.add({ type: 'heartRate', value: 72, value2: null, measuredAtMs: 2000 }).subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(store.saved()).toBe(true);
    expect(store.readings().length).toBe(1);
    expect(store.readings()[0].type).toBe('heartRate');
    expect(store.readings()[0].source).toBe('manual');
    expect((api.post as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/vitals/me');
  });

  it('emits a vitals.alert notification for out-of-range readings', async () => {
    const notifications = makeNotifications();
    const store = new VitalsStore(makeApi({ post: vi.fn((_path, body) => of(body)) }), notifications);
    await new Promise<boolean>((resolve) =>
      store.add({ type: 'bloodPressure', value: 165, value2: 100, measuredAtMs: 2000 }).subscribe(resolve)
    );
    expect(notifications.calls).toHaveLength(1);
    const [kind, title] = notifications.calls[0] as [AppNotification['kind'], string];
    expect(kind).toBe('vitals.alert');
    expect(title).toContain('Blood pressure');
  });

  it('emits no notification for in-range readings', async () => {
    const notifications = makeNotifications();
    const store = new VitalsStore(makeApi({ post: vi.fn((_path, body) => of(body)) }), notifications);
    await new Promise<boolean>((resolve) =>
      store.add({ type: 'bloodPressure', value: 120, value2: 80, measuredAtMs: 2000 }).subscribe(resolve)
    );
    expect(notifications.calls).toHaveLength(0);
  });

  it('surfaces an error message when the API rejects', async () => {
    const store = new VitalsStore(
      makeApi({ post: vi.fn(() => throwError(() => ({ error: { message: 'boom' } }))) })
    );
    const ok = await new Promise<boolean>((resolve) =>
      store.add({ type: 'spo2', value: 94, value2: null, measuredAtMs: 3000 }).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('boom');
    expect(store.saving()).toBe(false);
    expect(store.readings()).toHaveLength(0);
  });

  it('latest() returns the most recent reading of a type', () => {
    const store = new VitalsStore(makeApi());
    store['_readings'].set([
      bp(120, 80, 1000),
      bp(135, 88, 2000),
      { id: 'r3', type: 'spo2', value: 97, value2: null, measuredAtMs: 3000, source: 'manual' },
    ]);
    expect(store.latest('bloodPressure')?.value).toBe(135);
    expect(store.latest('spo2')?.value).toBe(97);
    expect(store.latest('glucose')).toBeNull();
  });

  it('trend() returns points oldest → newest and caps the limit', () => {
    const store = new VitalsStore(makeApi());
    store['_readings'].set([bp(120, 80, 3000), bp(130, 85, 1000), bp(125, 82, 2000)]);
    const trend = store.trend('bloodPressure', 2);
    expect(trend.map((r) => r.measuredAtMs)).toEqual([2000, 3000]);
  });

  it('alerts() flags the latest reading of each out-of-range type', () => {
    const store = new VitalsStore(makeApi());
    store['_readings'].set([
      bp(150, 92, 3000), // high
      bp(120, 80, 1000), // normal (not latest)
      { id: 'r3', type: 'spo2', value: 98, value2: null, measuredAtMs: 2000, source: 'manual' },
      { id: 'r4', type: 'temperature', value: 38.2, value2: null, measuredAtMs: 2500, source: 'manual' },
    ]);
    const alerts = store.alerts();
    expect(alerts.length).toBe(2);
    expect(alerts.map((a) => a.type).sort()).toEqual(['bloodPressure', 'temperature']);
  });
});

describe('isOutOfRange', () => {
  it('returns false for in-range readings and unbounded types', () => {
    expect(isOutOfRange(bp(120, 80, 1))).toBe(false);
    expect(
      isOutOfRange({ id: 'w', type: 'weight', value: 78, value2: null, measuredAtMs: 1, source: 'manual' })
    ).toBe(false);
  });

  it('flags high and low values (main and diastolic)', () => {
    expect(isOutOfRange(bp(150, 88, 1))).toBe(true);
    expect(isOutOfRange(bp(120, 95, 1))).toBe(true);
    expect(isOutOfRange(bp(85, 80, 1))).toBe(true);
    expect(isOutOfRange(bp(120, 80, 1))).toBe(false);
  });
});