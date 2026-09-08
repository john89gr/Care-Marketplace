import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { OfflineQueueService, FlushHandler } from './offline-queue.service';
import { QueuedRequest } from './offline.models';
import { OFFLINE_REPLAY_HEADER } from './offline.interceptor';

/**
 * Outbox replay (FEATURE_PLAN.md §20 subtask 6): each queued entry stores the
 * original `{ method, url, body }`; the handler re-issues it through HttpClient
 * exactly as it would have been sent. The `OFFLINE_REPLAY_HEADER` marks the
 * replay so the offline interceptor never re-enqueues it on failure — a failed
 * replay surfaces as a flush failure instead of looping forever.
 */
export function replayHandler(http: HttpClient): FlushHandler {
  return async (entry: QueuedRequest): Promise<{ ok: boolean; serverTs?: number; error?: string }> => {
    const spec = entry.payload as { method?: unknown; url?: unknown; body?: unknown } | null;
    if (!spec || typeof spec.method !== 'string' || typeof spec.url !== 'string' || !spec.url) {
      return { ok: false, error: 'Queued entry is missing a replayable request.' };
    }
    try {
      const response = await lastValueFrom(
        http.request(spec.method, spec.url, {
          body: spec.body,
          headers: new HttpHeaders({ [OFFLINE_REPLAY_HEADER]: '1' }),
        })
      );
      const body = (response ?? {}) as {
        measuredAtMs?: number;
        createdAtMs?: number;
        atMs?: number;
        syncedAtMs?: number;
      };
      const serverTs = body.measuredAtMs ?? body.createdAtMs ?? body.atMs ?? body.syncedAtMs;
      return { ok: true, serverTs: typeof serverTs === 'number' ? serverTs : Date.now() };
    } catch (err) {
      // Network failures mean "still offline" (the entry stays for retry);
      // HTTP error responses mean the server rejected the replay (it surfaces
      // to the retry UX and exhausts the attempt budget).
      const message =
        err instanceof HttpErrorResponse
          ? `Replay failed (${err.status}): ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      return { ok: false, error: message };
    }
  };
}

/**
 * Wires the outbox to the app:
 *  - after the persisted queue has been loaded, flush pending entries (boot
 *    replay — covers reloads while offline where the SW served the shell);
 *  - on the browser's `online` event, retry anything that failed and flush
 *    again.
 * Runs lazily and never blocks app boot on the network.
 */
function startOfflineSync(): void {
  const queue = inject(OfflineQueueService);
  const http = inject(HttpClient);
  const handler = replayHandler(http);
  // Expose the handler to the shell banner ("Retry now") via queue.retryAll().
  queue.setHandler(handler);
  let handle: ReturnType<OfflineQueueService['flushWithRetry']> | null = null;

  const flush = (): void => {
    handle?.cancel();
    handle = queue.flushWithRetry(handler);
    void handle.flush();
  };

  queue.setOnReconnect(() => {
    queue.retryFailed();
    flush();
  });

  void queue.ready.then(() => flush());
}

/** Provider wiring for app.config.ts — instantiates the offline sync once. */
export function provideOfflineSync(): EnvironmentProviders {
  return provideAppInitializer(() => {
    startOfflineSync();
    return Promise.resolve();
  });
}