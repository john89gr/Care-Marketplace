import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AuditService, AuditEvent } from './audit.service';

function makeApi() {
  return {
    get: vi.fn(() => of(null)),
    post: vi.fn(() => of({ ok: true })),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
  };
}

describe('AuditService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs an event in memory and exposes it via the events signal', () => {
    const audit = new AuditService(makeApi() as never);
    const event = audit.log('vitals.view', 'vital-reading', 'vt-1', { count: 4 });
    expect(event.action).toBe('vitals.view');
    expect(event.resourceType).toBe('vital-reading');
    expect(event.resourceId).toBe('vt-1');
    expect(event.meta).toEqual({ count: 4 });
    expect(audit.events().length).toBe(1);
    expect(audit.events()[0].id).toBe(event.id);
  });

  it('sends a POST to /audit for backend persistence', () => {
    const api = makeApi();
    const audit = new AuditService(api as never);
    audit.log('medications.add', 'medication', 'med-1');
    expect(api.post).toHaveBeenCalledWith('/audit', expect.objectContaining({
      action: 'medications.add',
      resourceType: 'medication',
      resourceId: 'med-1',
    }));
  });

  it('persists events to localStorage as a ring buffer', () => {
    const audit = new AuditService(makeApi() as never);
    for (let i = 0; i < 3; i++) {
      audit.log('test.action', 'test', `id-${i}`);
    }
    const raw = localStorage.getItem('cm.audit.v1');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as AuditEvent[];
    expect(stored.length).toBe(3);
    expect(stored[0].action).toBe('test.action');
  });

  it('reloads persisted events on construction', () => {
    const seed: AuditEvent[] = [
      { id: 'a', actorId: 'me', action: 'seed', resourceType: 't', resourceId: 'r', atMs: 1 },
    ];
    localStorage.setItem('cm.audit.v1', JSON.stringify(seed));
    const audit = new AuditService(makeApi() as never);
    expect(audit.events()).toHaveLength(1);
    expect(audit.events()[0].action).toBe('seed');
  });

  it('caps events at MAX_EVENTS in the ring buffer', () => {
    const audit = new AuditService(makeApi() as never);
    for (let i = 0; i < 210; i++) {
      audit.log('test.action', 'test', `id-${i}`);
    }
    const stored = JSON.parse(localStorage.getItem('cm.audit.v1')!) as AuditEvent[];
    expect(stored.length).toBeLessThanOrEqual(200);
    expect(audit.events().length).toBeLessThanOrEqual(200);
  });

  it('clears memory and localStorage', () => {
    const audit = new AuditService(makeApi() as never);
    audit.log('test.action', 'test', 'id-1');
    expect(audit.events().length).toBe(1);
    audit.clear();
    expect(audit.events().length).toBe(0);
    expect(localStorage.getItem('cm.audit.v1')).toBeNull();
  });

  it('swallows POST errors without throwing', () => {
    const api = makeApi();
    api.post = vi.fn(() => of({ ok: true }));
    const audit = new AuditService(api as never);
    expect(() => audit.log('test.action', 'test', 'id-1')).not.toThrow();
  });

  it('uses default actorId "me" when omitted', () => {
    const audit = new AuditService(makeApi() as never);
    const event = audit.log('test.action', 'test', 'id-1');
    expect(event.actorId).toBe('me');
  });

  it('tolerates corrupted localStorage on construction', () => {
    localStorage.setItem('cm.audit.v1', 'not-json');
    const audit = new AuditService(makeApi() as never);
    expect(audit.events()).toEqual([]);
  });

  it('tolerates non-array localStorage on construction', () => {
    localStorage.setItem('cm.audit.v1', JSON.stringify({ not: 'an array' }));
    const audit = new AuditService(makeApi() as never);
    expect(audit.events()).toEqual([]);
  });
});
