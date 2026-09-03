import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AuditService } from '../../core/services/audit/audit.service';
import { HealthSummaryExportService } from './export.service';
import type { HealthSummaryInput } from './export.payload';

function makeAudit() {
  const calls: unknown[][] = [];
  const api = {
    get: vi.fn(() => of(null)),
    post: vi.fn(() => of({ ok: true })),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
  };
  const audit = new AuditService(api as never);
  vi.spyOn(audit, 'log').mockImplementation((...args: unknown[]) => {
    calls.push(args);
    return {
      id: 'audit-1',
      actorId: 'me',
      action: String(args[0]),
      resourceType: String(args[1]),
      resourceId: String(args[2]),
      atMs: Date.now(),
    };
  });
  return { audit, calls };
}

function baseInput(): HealthSummaryInput {
  return {
    profile: { userId: 'u-client', displayName: 'Maria Papadopoulou' },
    readings: [],
    medications: [],
    adherenceLogs: [],
    screeningStatuses: [],
    carePlan: null,
    range: 30,
    locale: 'en',
  };
}

describe('HealthSummaryExportService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // jsdom lacks URL.createObjectURL — stub the download sink.
    URL.createObjectURL = vi.fn(() => 'blob:fake') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('exports: download fires, filename follows convention, audit is logged', async () => {
    const { audit, calls } = makeAudit();
    const service = new HealthSummaryExportService(audit);
    service.setConsent(true);

    const ok = await service.exportNow(baseInput());

    expect(ok).toBe(true);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('');
    expect(service.lastFilename()).toMatch(/^health-summary-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(service.lastExportAtMs()).toBeTypeOf('number');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('health-summary.export');
  });

  it('blocks export without consent (no silent generation)', async () => {
    const { audit, calls } = makeAudit();
    const service = new HealthSummaryExportService(audit);
    service.setConsent(false);

    const ok = await service.exportNow(baseInput());

    expect(ok).toBe(false);
    expect(service.error()).toMatch(/consent/i);
    expect(service.lastFilename()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('surfaces generation failure and recovers via retry', async () => {
    const { audit } = makeAudit();
    const service = new HealthSummaryExportService(audit);
    service.setConsent(true);

    // Break the download sink → generation fails loudly.
    (URL as unknown as Record<string, unknown>)['createObjectURL'] = undefined;
    const failed = await service.exportNow(baseInput());
    expect(failed).toBe(false);
    expect(service.error()).toMatch(/try again/i);
    expect(service.loading()).toBe(false);

    // Restore the sink → retry succeeds and clears the error.
    URL.createObjectURL = vi.fn(() => 'blob:fake') as unknown as typeof URL.createObjectURL;
    const retried = await service.retry();
    expect(retried).toBe(true);
    expect(service.error()).toBe('');
    expect(service.lastFilename()).not.toBeNull();
  });

  it('retry with no prior attempt reports a friendly error', async () => {
    const { audit } = makeAudit();
    const service = new HealthSummaryExportService(audit);
    expect(await service.retry()).toBe(false);
    expect(service.error()).toMatch(/nothing to retry/i);
  });

  it('share-with-physician stub returns a link and audit-logs the share', () => {
    const { audit, calls } = makeAudit();
    const service = new HealthSummaryExportService(audit);
    service.setConsent(true);

    const link = service.shareWithPhysician('u-client');

    expect(link.startsWith('health-summary-share://')).toBe(true);
    expect(service.shareLink()).toBe(link);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('health-summary.share');
  });

  it('persists export consent across instances', () => {
    const { audit } = makeAudit();
    const first = new HealthSummaryExportService(audit);
    expect(first.consentGiven()).toBe(false);
    first.setConsent(true);
    expect(new HealthSummaryExportService(audit).consentGiven()).toBe(true);
  });
});
