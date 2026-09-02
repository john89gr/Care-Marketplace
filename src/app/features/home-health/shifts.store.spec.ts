import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ShiftsStore, Shift } from './shifts.store';
import { ApiClient } from '../../core/api/api.client';

function makeApi(overrides: Partial<Record<'get' | 'patch', unknown>> = {}) {
  return {
    get: vi.fn(() => of(null)),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

const MORNING = { startMinutes: 8 * 60, endMinutes: 12 * 60 };

describe('ShiftsStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads availability, on-demand flag and shifts', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({
          availability: [{ id: 'a1', weekday: 0, ...MORNING }],
          onDemand: true,
          shifts: [],
        })
      ),
    });
    const store = new ShiftsStore(api);
    store.load();
    expect(store.availability()).toHaveLength(1);
    expect(store.onDemand()).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/shifts/me');
  });

  it('toggles a segment on and off', () => {
    const store = new ShiftsStore(makeApi());
    store.toggleSegment(1, MORNING.startMinutes, MORNING.endMinutes);
    expect(store.availability()).toHaveLength(1);
    expect(store.hasSegment(1, MORNING.startMinutes, MORNING.endMinutes)).toBe(true);

    store.toggleSegment(1, MORNING.startMinutes, MORNING.endMinutes);
    expect(store.availability()).toHaveLength(0);
  });

  it('keeps segments for different weekdays separate', () => {
    const store = new ShiftsStore(makeApi());
    store.toggleSegment(0, MORNING.startMinutes, MORNING.endMinutes);
    store.toggleSegment(1, MORNING.startMinutes, MORNING.endMinutes);
    expect(store.availability()).toHaveLength(2);
  });

  it('sets the on-demand flag', () => {
    const store = new ShiftsStore(makeApi());
    store.setOnDemand(true);
    expect(store.onDemand()).toBe(true);
  });

  it('exposes upcoming shifts sorted soonest first', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({
          availability: [],
          onDemand: false,
          shifts: [
            shift({ id: 's2', scheduledAtMs: 2000 }),
            shift({ id: 's1', scheduledAtMs: 1000, status: 'completed' }),
            shift({ id: 's3', scheduledAtMs: 3000 }),
          ],
        })
      ),
    });
    const store = new ShiftsStore(api);
    store.load();
    expect(store.upcomingShifts().map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('save sends availability and on-demand flag', async () => {
    const api = makeApi({ patch: vi.fn(() => of({})) });
    const store = new ShiftsStore(api);
    store.toggleSegment(0, MORNING.startMinutes, MORNING.endMinutes);
    store.setOnDemand(true);
    const ok = await new Promise<boolean>((resolve) => store.save().subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/shifts/me', {
      availability: store.availability(),
      onDemand: true,
    });
  });

  it('save reports failure with an error message', async () => {
    const api = makeApi({ patch: vi.fn(() => throwError(() => new Error('nope'))) });
    const store = new ShiftsStore(api);
    const ok = await new Promise<boolean>((resolve) => store.save().subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.saveError()).toContain('Could not save');
  });
});

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 's1',
    providerId: 'u-nurse-1',
    clientId: 'u-client-1',
    clientName: 'Maria Papadopoulou',
    act: 'Injection',
    scheduledAtMs: 1000,
    durationMinutes: 45,
    status: 'confirmed',
    ...overrides,
  };
}
