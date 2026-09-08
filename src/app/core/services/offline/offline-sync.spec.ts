import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { replayHandler } from './offline-sync';
import { OFFLINE_REPLAY_HEADER } from './offline.interceptor';
import { QueuedRequest } from './offline.models';

function entry(overrides: Partial<QueuedRequest> = {}): QueuedRequest {
  return {
    id: 'q-1',
    store: 'vitals',
    action: 'create',
    payload: { method: 'POST', url: '/api/vitals/me', body: { type: 'heartRate', value: 121 } },
    createdAtMs: 1000,
    attempts: 0,
    status: 'pending',
    syncedAtMs: null,
    dedupeKey: null,
    error: null,
    ...overrides,
  };
}

describe('replayHandler', () => {
  it('re-issues the stored request and reports success with the server timestamp', async () => {
    const request = vi.fn(() => of({ measuredAtMs: 555 }));
    const http = { request } as never;
    const result = await replayHandler(http as Parameters<typeof replayHandler>[0])(entry());

    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/vitals/me',
      expect.objectContaining({ body: { type: 'heartRate', value: 121 } })
    );
    expect(result).toEqual({ ok: true, serverTs: 555 });
  });

  it('marks the replay so the offline interceptor never re-enqueues it', async () => {
    const request = vi.fn(() => of({}));
    const http = { request } as never;
    await replayHandler(http as Parameters<typeof replayHandler>[0])(entry());

    const options = request.mock.calls[0][2] as { headers: { get(name: string): string | null } };
    expect(options.headers.get(OFFLINE_REPLAY_HEADER)).toBe('1');
  });

  it('falls back to Date.now() when the response carries no server timestamp', async () => {
    const before = Date.now();
    const request = vi.fn(() => of({ id: 'vt-1' }));
    const http = { request } as never;
    const result = await replayHandler(http as Parameters<typeof replayHandler>[0])(entry());
    const after = Date.now();

    expect(result.ok).toBe(true);
    expect(typeof result.serverTs).toBe('number');
    expect(result.serverTs!).toBeGreaterThanOrEqual(before);
    expect(result.serverTs!).toBeLessThanOrEqual(after);
  });

  it('fails (not ok) when the network is still down, keeping the entry for retry', async () => {
    const request = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }))
    );
    const http = { request } as never;
    const result = await replayHandler(http as Parameters<typeof replayHandler>[0])(entry());

    expect(result.ok).toBe(false);
    expect(result.error).toContain('0');
  });

  it('fails with the HTTP status when the server rejects the replay', async () => {
    const request = vi.fn(() =>
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable' }))
    );
    const http = { request } as never;
    const result = await replayHandler(http as Parameters<typeof replayHandler>[0])(entry());

    expect(result.ok).toBe(false);
    expect(result.error).toContain('422');
  });

  it('rejects entries without a replayable request spec', async () => {
    const request = vi.fn(() => of({}));
    const http = { request } as never;
    const result = await replayHandler(http as Parameters<typeof replayHandler>[0])(
      entry({ payload: { body: {} } })
    );

    expect(result).toEqual({ ok: false, error: 'Queued entry is missing a replayable request.' });
    expect(request).not.toHaveBeenCalled();
  });
});