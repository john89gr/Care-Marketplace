import '@angular/compiler'; // required for JIT partial declarations
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  OfflineQueueService,
  FlushHandler,
  backoffDelay,
} from './offline-queue.service';
import {
  QueuedRequest,
  QueueBackend,
  FlushResult,
  MAX_FLUSH_ATTEMPTS,
} from './offline.models';

/** Minimal in-memory QueueBackend (no IndexedDB/jsdom dependency). */
function memoryBackend(): QueueBackend & { data: QueuedRequest[] } {
  const data: QueuedRequest[] = [];
  return {
    data,
    async open() {},
    async all() {
      return [...data];
    },
    async save(entry) {
      const i = data.findIndex((e) => e.id === entry.id);
      if (i >= 0) {
        data[i] = entry;
      } else {
        data.push(entry);
      }
    },
    async update(entry) {
      const i = data.findIndex((e) => e.id === entry.id);
      if (i >= 0) {
        data[i] = entry;
      }
    },
    async remove(id) {
      const i = data.findIndex((e) => e.id === id);
      if (i >= 0) {
        data.splice(i, 1);
      }
    },
  };
}

function ok(ts?: number): FlushResult {
  return ts === undefined ? { ok: true } : { ok: true, serverTs: ts };
}
function fail(error = 'boom'): FlushResult {
  return { ok: false, error };
}

describe('OfflineQueueService', () => {
  let backend: ReturnType<typeof memoryBackend>;
  let service: OfflineQueueService;

  beforeEach(() => {
    backend = memoryBackend();
    vi.useFakeTimers();
    service = new OfflineQueueService(backend);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('creates a pending entry', () => {
      const entry = service.enqueue('vitals', 'create', { bp: '120/80' });
      expect(entry.status).toBe('pending');
      expect(entry.attempts).toBe(0);
      expect(entry.store).toBe('vitals');
      expect(service.pendingCount()).toBe(1);
      expect(service.failedCount()).toBe(0);
    });

    it('collapses duplicate dedupe keys keeping the latest', () => {
      service.enqueue('vitals', 'update', { bp: '120/80' }, { dedupeKey: 'vitals-bp' });
      vi.advanceTimersByTime(5);
      service.enqueue('vitals', 'update', { bp: '118/78' }, { dedupeKey: 'vitals-bp' });
      expect(service.entries()).toHaveLength(1);
      expect((service.entries()[0].payload as { bp: string }).bp).toBe('118/78');
    });

    it('persists the entry through the backend', async () => {
      service.enqueue('chat', 'create', { text: 'hi' });
      await vi.waitFor(() => expect(backend.data).toHaveLength(1));
    });
  });

  describe('enqueueMany', () => {
    it('queues several entries at once', async () => {
      await service.enqueueMany('vitals', 'create', [{ a: 1 }, { a: 2 }, { a: 3 }]);
      expect(service.entries()).toHaveLength(3);
      expect(service.pendingCount()).toBe(3);
    });
  });

  describe('flush', () => {
    it('marks successful entries synced using the server timestamp (server wins)', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok(4242));
      service.enqueue('vitals', 'create', { a: 1 });
      const summary = await service.flush(handler);

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(service.syncedCount()).toBe(1);
      expect(service.pendingCount()).toBe(0);
      // Conflict policy: server timestamp is authoritative.
      expect(service.entries()[0].syncedAtMs).toBe(4242);
    });

    it('marks successful entries synced with local time when no serverTs', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok());
      service.enqueue('vitals', 'create', { a: 1 });
      await service.flush(handler);
      expect(service.entries()[0].syncedAtMs).not.toBeNull();
      expect(service.entries()[0].status).toBe('synced');
    });

    it('marks handler errors as failed with the message', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(fail('network down'));
      service.enqueue('chat', 'create', { text: 'hi' });
      const summary = await service.flush(handler);

      expect(summary.failed).toBe(1);
      expect(service.failedCount()).toBe(1);
      expect(service.entries()[0].status).toBe('failed');
      expect(service.entries()[0].error).toBe('network down');
    });

    it('marks thrown errors as failed with the thrown message', async () => {
      const handler: FlushHandler = vi.fn().mockRejectedValue(new Error('socket died'));
      service.enqueue('chat', 'create', { text: 'hi' });
      await service.flush(handler);
      expect(service.entries()[0].status).toBe('failed');
      expect(service.entries()[0].error).toBe('socket died');
    });

    it('does not call the handler for already-synced entries', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok());
      service.enqueue('vitals', 'create', { a: 1 });
      await service.flush(handler);
      expect(handler).toHaveBeenCalledTimes(1);
      const again = await service.flush(handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(again.succeeded).toBe(0);
    });

    it('respects concurrency without dropping entries', async () => {
      let inFlight = 0;
      let maxConcurrent = 0;
      const handler: FlushHandler = vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return ok();
      });
      for (let i = 0; i < 10; i++) {
        service.enqueue('vitals', 'create', { i });
      }
      await service.flush(handler, { concurrency: 3 });
      expect(handler).toHaveBeenCalledTimes(10);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });
  });

  describe('conflict policy', () => {
    it('does not overwrite a server timestamp with a later local one', async () => {
      // Handler returns serverTs; even if Date.now() advances, server wins.
      vi.setSystemTime(1_000_000);
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok(99));
      service.enqueue('vitals', 'create', { bp: '120/80' });
      await service.flush(handler);
      vi.setSystemTime(2_000_000_000);
      expect(service.entries()[0].syncedAtMs).toBe(99);
    });

    it("keeps a failed entry's error until retried", async () => {
      const handler: FlushHandler = vi.fn()
        .mockResolvedValueOnce(fail('transient'))
        .mockResolvedValueOnce(ok(7));
      service.enqueue('chat', 'create', { text: 'hi' });
      await service.flush(handler);
      expect(service.entries()[0].status).toBe('failed');
      // Retry via retryFailed + flush.
      service.retryFailed();
      await service.flush(handler);
      expect(service.entries()[0].status).toBe('synced');
      expect(service.entries()[0].syncedAtMs).toBe(7);
    });
  });

  describe('retryFailed / purgeSynced / remove / syncNow', () => {
    it('retryFailed moves failed entries back to pending', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(fail('nope'));
      service.enqueue('chat', 'create', { text: 'hi' });
      await service.flush(handler);
      expect(service.failedCount()).toBe(1);
      service.retryFailed();
      expect(service.failedCount()).toBe(0);
      expect(service.pendingCount()).toBe(1);
    });

    it('purgeSynced removes only synced entries', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok());
      service.enqueue('vitals', 'create', { a: 1 });
      service.enqueue('chat', 'create', { a: 2 });
      await service.flush(handler);
      expect(service.purgeSynced()).toBe(2);
      expect(service.entries()).toHaveLength(0);
    });

    it('remove deletes a single entry by id', () => {
      const a = service.enqueue('chat', 'create', { a: 1 });
      service.enqueue('chat', 'create', { a: 2 });
      expect(service.entries()).toHaveLength(2);
      expect(service.remove(a.id)).toBe(true);
      expect(service.entries().find((e) => e.id === a.id)).toBeUndefined();
      expect(service.remove('missing')).toBe(false);
    });

    it('syncNow flushes the queue', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(ok(10));
      service.enqueue('vitals', 'create', {});
      await service.syncNow(handler);
      expect(service.syncedCount()).toBe(1);
    });
  });

  describe('flushWithRetry (fake timers)', () => {
    it('schedules a retry for a failed entry and eventually succeeds', async () => {
      let calls = 0;
      const handler: FlushHandler = vi.fn().mockImplementation(() => {
        calls += 1;
        return calls === 1 ? Promise.resolve(fail('transient')) : Promise.resolve(ok(321));
      });
      service.enqueue('chat', 'create', { text: 'hi' });

      const handle = service.flushWithRetry(handler);
      await handle.flush();

      // First attempt failed; a retry is now scheduled (pendingRetries == 1).
      expect(service.failedCount()).toBe(1);
      expect(handle.pendingRetries()).toBe(1);

      // Advance past the first backoff (1s) -> retry fires, succeeds.
      await vi.advanceTimersByTimeAsync(1000);
      expect(service.syncedCount()).toBe(1);
      expect(service.failedCount()).toBe(0);
      expect(handle.pendingRetries()).toBe(0);
    });

    it('gives up after MAX_FLUSH_ATTEMPTS and stays failed', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(fail('down'));
      service.enqueue('chat', 'create', { text: 'hi' });

      const handle = service.flushWithRetry(handler);
      await handle.flush();

      // attempts increments with each pass; keep advancing until exhausted.
      for (let i = 0; i < MAX_FLUSH_ATTEMPTS; i++) {
        const retries = handle.pendingRetries();
        if (retries === 0) break;
        await vi.advanceTimersByTimeAsync(backoffDelay(i + 1));
      }

      expect(service.failedCount()).toBe(1);
      expect(service.entries()[0].attempts).toBe(MAX_FLUSH_ATTEMPTS);
      expect(service.entries()[0].status).toBe('failed');
      expect(handle.pendingRetries()).toBe(0);
    });

    it('cancel clears pending retries', async () => {
      const handler: FlushHandler = vi.fn().mockResolvedValue(fail('down'));
      service.enqueue('chat', 'create', { text: 'hi' });
      const handle = service.flushWithRetry(handler);
      await handle.flush();
      expect(handle.pendingRetries()).toBeGreaterThan(0);
      handle.cancel();
      expect(handle.pendingRetries()).toBe(0);
    });
  });

  describe('restore from backend', () => {
    it('hydrates persisted entries on construction', async () => {
      const seed: QueuedRequest = {
        id: 'old-1',
        store: 'vitals',
        action: 'create',
        payload: { bp: '120/80' },
        createdAtMs: 100,
        attempts: 0,
        status: 'pending',
        syncedAtMs: null,
        dedupeKey: null,
        error: null,
      };
      backend.data.push(seed);
      const restored = new OfflineQueueService(backend);
      await vi.waitFor(() => expect(restored.pendingCount()).toBe(1));
      expect(restored.entries()[0].id).toBe('old-1');
    });
  });

  describe('online state', () => {
    it('reflects navigator.onLine', () => {
      expect(service.isOnline()).toBe(true);
    });

    it('updates on offline/online events', async () => {
      window.dispatchEvent(new Event('offline'));
      expect(service.isOnline()).toBe(false);
      window.dispatchEvent(new Event('online'));
      expect(service.isOnline()).toBe(true);
    });
  });
});
