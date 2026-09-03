import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { VitalsStore, VitalReading } from './vitals.store';
import { MedicationsStore } from './medications.store';
import { Medication } from './medications.logic';
import { ApiClient } from '../../core/api/api.client';
import { AuditService } from '../../core/services/audit/audit.service';
import type { AppNotification } from '../../core/services/notifications/notifications.service';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeAudit() {
  const calls: unknown[][] = [];
  const audit = { log: vi.fn((...args: unknown[]) => calls.push(args)) };
  return Object.assign(audit as unknown as AuditService, { calls });
}

describe('Audit instrumentation (feature 16, subtask 14)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('VitalsStore', () => {
    it('logs vitals.view exactly once on load', () => {
      const audit = makeAudit();
      const readings: VitalReading[] = [];
      const store = new VitalsStore(makeApi({ get: vi.fn(() => of(readings)) }), undefined, audit);
      store.load();
      const viewCalls = audit.calls.filter((c) => c[0] === 'vitals.view');
      expect(viewCalls).toHaveLength(1);
      expect(viewCalls[0][1]).toBe('vital-reading');
    });

    it('logs vitals.create exactly once on add', async () => {
      const audit = makeAudit();
      const api = makeApi({ post: vi.fn((_p, body) => of(body)) });
      const store = new VitalsStore(api, undefined, audit);
      await new Promise<boolean>((resolve) =>
        store
          .add({ type: 'heartRate', value: 72, value2: null, measuredAtMs: 2000 })
          .subscribe(resolve)
      );
      const createCalls = audit.calls.filter((c) => c[0] === 'vitals.create');
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0][1]).toBe('vital-reading');
      expect(createCalls[0][3]).toMatchObject({ type: 'heartRate', source: 'manual' });
    });

    it('does not double-log on error', async () => {
      const audit = makeAudit();
      const store = new VitalsStore(
        makeApi({ post: vi.fn(() => of(null)) }),
        undefined,
        audit
      );
      // add() with an invalid response still logs on success path only.
      await new Promise<boolean>((resolve) =>
        store
          .add({ type: 'heartRate', value: 72, value2: null, measuredAtMs: 2000 })
          .subscribe(resolve)
      );
      const createCalls = audit.calls.filter((c) => c[0] === 'vitals.create');
      expect(createCalls).toHaveLength(1);
    });
  });

  describe('MedicationsStore', () => {
    const med: Medication = {
      id: 'med-1',
      name: 'Insulin',
      dose: '10 units',
      schedule: { kind: 'daily', timesMinutes: [480] },
      critical: true,
      createdAtMs: Date.now(),
    };

    it('logs medications.view exactly once on load', () => {
      const audit = makeAudit();
      const store = new MedicationsStore(
        makeApi({ get: vi.fn(() => of({ medications: [med], logs: [] })) }),
        undefined,
        undefined,
        audit
      );
      store.load().subscribe();
      const viewCalls = audit.calls.filter((c) => c[0] === 'medications.view');
      expect(viewCalls).toHaveLength(1);
      expect(viewCalls[0][3]).toMatchObject({ count: 1 });
    });

    it('logs medications.create exactly once on add', async () => {
      const audit = makeAudit();
      const api = makeApi({
        get: vi.fn(() => of({ medications: [], logs: [] })),
        post: vi.fn((_p, body) => of({ ...body, id: 'med-new' })),
      });
      const store = new MedicationsStore(api, undefined, undefined, audit);
      await new Promise<boolean>((resolve) =>
        store
          .add({ name: 'Aspirin', dose: '81 mg', schedule: { kind: 'daily', timesMinutes: [540] }, critical: false })
          .subscribe(resolve)
      );
      const createCalls = audit.calls.filter((c) => c[0] === 'medications.create');
      expect(createCalls).toHaveLength(1);
      expect(createCalls[0][3]).toMatchObject({ name: 'Aspirin' });
    });

    it('logs medication.log exactly once on logDose', async () => {
      const audit = makeAudit();
      const api = makeApi({
        get: vi.fn(() => of({ medications: [med], logs: [] })),
        post: vi.fn(() =>
          of({ id: 'ml-1', medicationId: 'med-1', date: '2026-09-02', timeMinutes: 480, action: 'taken', atMs: Date.now(), loggedBy: 'me' })
        ),
      });
      const store = new MedicationsStore(api, undefined, undefined, audit);
      await new Promise<boolean>((resolve) =>
        store.logDose('med-1', '2026-09-02', 480, 'taken').subscribe(resolve)
      );
      const logCalls = audit.calls.filter((c) => c[0] === 'medication.log');
      expect(logCalls).toHaveLength(1);
      expect(logCalls[0][3]).toMatchObject({ medicationId: 'med-1', action: 'taken' });
    });

    it('logs medication.archive exactly once on archive', async () => {
      const audit = makeAudit();
      const api = makeApi({
        get: vi.fn(() => of({ medications: [med], logs: [] })),
        post: vi.fn(() => of({ ...med, archived: true })),
      });
      const store = new MedicationsStore(api, undefined, undefined, audit);
      store.load().subscribe();
      await new Promise<boolean>((resolve) => store.archive('med-1').subscribe(resolve));
      const archiveCalls = audit.calls.filter((c) => c[0] === 'medication.archive');
      expect(archiveCalls).toHaveLength(1);
    });
  });
});
