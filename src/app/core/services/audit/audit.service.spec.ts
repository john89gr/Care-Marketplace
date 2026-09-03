import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AuditService, AuditEvent, AUDIT_BATCH_SIZE } from './audit.service';
import { ApiClient } from '../../api/api.client';

function makeApi() {
  return {
    get: vi.fn(() => of({ items: [], total: 0 })),
    post: vi.fn(() => of({ ok: true })),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
  } as unknown as ApiClient;
}

function fakeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit-test-1',
    actorId: 'u-client',
    action: 'vitals.view',
    resourceType: 'vital-reading',
    resourceId: '',
    atMs: 1000,
    meta: { correlationId: 'corr-1' },
    ...overrides,
  };
}

describe('AuditService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('appends events to the local ring buffer immediately', () => {
    const api = makeApi();
    const service = new AuditService(api);
    service.log('vitals.view', 'vital-reading', '', { count: 3 });
    expect(service.events()).toHaveLength(1);
    expect(service.events()[0].action).toBe('vitals.view');
    expect(service.eventCount()).toBe(1);
  });

  it('persists events to localStorage across instances', () => {
    const api = makeApi();
    const first = new AuditService(api);
    first.log('vitals.view', 'vital-reading', 'vt-1');
    const second = new AuditService(api);
    expect(second.events()).toHaveLength(1);
    expect(second.events()[0].id).toBe(first.events()[0].id);
  });

  it('buffers events and flushes in batches of AUDIT_BATCH_SIZE (subtask 19)', () => {
    const api = makeApi();
    const service = new AuditService(api);
    // Log fewer than a full batch → no batch POST yet.
    for (let i = 0; i < AUDIT_BATCH_SIZE - 1; i++) {
      service.log('test.action', 'test', `r-${i}`);
    }
    expect(api.post).not.toHaveBeenCalled();
    expect(service.pendingCount()).toBe(AUDIT_BATCH_SIZE - 1);

    // Logging the 10th event triggers a batch flush.
    service.log('test.action', 'test', 'r-final');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/audit/batch', expect.arrayContaining([
      expect.objectContaining({ action: 'test.action' }),
    ]));
    // After flushing, the buffer is empty.
    expect(service.pendingCount()).toBe(0);
    // But the local ring buffer still holds all events.
    expect(service.eventCount()).toBe(AUDIT_BATCH_SIZE);
  });

  it('flush() sends the batch and clears the pending buffer', () => {
    const api = makeApi();
    const service = new AuditService(api);
    service.log('a', 'r', '1');
    service.log('b', 'r', '2');
    expect(service.pendingCount()).toBe(2);
    service.flush();
    expect(api.post).toHaveBeenCalledWith('/audit/batch', expect.arrayContaining([
      expect.objectContaining({ action: 'a' }),
      expect.objectContaining({ action: 'b' }),
    ]));
    expect(service.pendingCount()).toBe(0);
  });

  it('flush() with an empty buffer is a no-op', () => {
    const api = makeApi();
    const service = new AuditService(api);
    service.flush();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('attaches a correlationId to meta (subtask 4)', () => {
    const api = makeApi();
    const service = new AuditService(api);
    const event = service.log('test.action', 'test', 'r-1', { custom: true });
    expect(event.meta).toHaveProperty('correlationId');
    expect(typeof event.meta!['correlationId']).toBe('string');
    expect(event.meta).toHaveProperty('custom', true);
  });

  it('loadAll() fetches from the backend /audit/all endpoint', () => {
    const api = makeApi();
    api.get = vi.fn(() => of({ items: [fakeEvent()], total: 1 }));
    const service = new AuditService(api);
    const result = service.loadAll();
    expect(api.get).toHaveBeenCalledWith('/audit/all');
    result.subscribe((data) => {
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
    });
  });

  it('toCsv() produces a header + one row per event', () => {
    const api = makeApi();
    const service = new AuditService(api);
    service.log('vitals.view', 'vital-reading', 'vt-1');
    service.log('medications.view', 'medication', 'med-1');
    const csv = service.toCsv();
    const lines = csv.split('\n');
    expect(lines[0]).toContain('id');
    expect(lines[0]).toContain('actorId');
    expect(lines[0]).toContain('action');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('chainHash changes when events are added (subtask 13: tamper-evidence)', () => {
    const api = makeApi();
    const service = new AuditService(api);
    const hashBefore = service.chainHash();
    service.log('test.action', 'test', 'r-1');
    const hashAfter = service.chainHash();
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('clear() flushes + wipes the local buffer and localStorage', () => {
    const api = makeApi();
    const service = new AuditService(api);
    service.log('test.action', 'test', 'r-1');
    service.clear();
    expect(service.events()).toHaveLength(0);
    expect(service.pendingCount()).toBe(0);
    expect(localStorage.getItem('cm.audit.v1')).toBeNull();
  });

  it('log() never throws when the API POST fails (fire-and-forget)', () => {
    const api = makeApi();
    api.post = vi.fn(() => {
      throw new Error('network');
    });
    const service = new AuditService(api);
    expect(() => service.log('test.action', 'test', 'r-1')).not.toThrow();
    expect(service.events()).toHaveLength(1);
  });
});
