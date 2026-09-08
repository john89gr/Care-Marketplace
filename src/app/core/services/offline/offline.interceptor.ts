import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, throwError } from 'rxjs';
import { OfflineQueueService } from './offline-queue.service';
import { QueueAction, QueueStoreName } from './offline.models';

/**
 * Header set by the outbox replay handler so a replayed request can never be
 * enqueued again — a failed replay must surface as a flush failure, not loop
 * back into the queue (FEATURE_PLAN.md §20 subtask 6).
 */
export const OFFLINE_REPLAY_HEADER = 'X-Cm-Offline-Replay';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True when the request never reached a server (offline / DNS / aborted). */
function isNetworkError(err: unknown): boolean {
  return (
    err instanceof HttpErrorResponse &&
    (err.status === 0 || err.error instanceof ProgressEvent)
  );
}

/** Map an API path to the outbox store it belongs to ('api' = catch-all). */
function storeForUrl(url: string): QueueStoreName {
  if (url.includes('/vitals')) {
    return 'vitals';
  }
  if (url.includes('/chat')) {
    return 'chat';
  }
  if (url.includes('/prescriptions')) {
    return 'prescriptions';
  }
  return 'api';
}

function actionForMethod(method: string): QueueAction {
  if (method === 'POST') {
    return 'create';
  }
  if (method === 'DELETE') {
    return 'delete';
  }
  return 'update';
}

/**
 * Offline-first outbox (FEATURE_PLAN.md §20): when a mutating request fails
 * because the network is unreachable (no HTTP response at all), it is stored
 * in the IndexedDB outbox and the caller receives a soft `202 queued` echoing
 * its own payload — the write is already committed to the local outbox, so the
 * optimistic response keeps the UI consistent. The queue is replayed by
 * OfflineSyncService on boot and on reconnect. Non-network errors (4xx/5xx
 * validation) always rethrow untouched.
 *
 * Every request also carries the `ngsw-bypass` header: Angular's service
 * worker `respondWith()`s every same-origin fetch, which hides API traffic
 * from network-layer tooling (Playwright `page.route` mocks, proxies, devtools
 * request blocking). `ngsw-bypass` is the documented escape hatch — API calls
 * go straight to the network, while the precached shell/chunk requests (which
 * never go through HttpClient) keep using the service worker.
 */
export const offlineInterceptor: HttpInterceptorFn = (req, next) => {
  const outgoing =
    req.headers.has('ngsw-bypass') || req.headers.has(OFFLINE_REPLAY_HEADER)
      ? req
      : req.clone({ setHeaders: { 'ngsw-bypass': '1' } });
  if (!MUTATING.has(outgoing.method)) {
    return next(outgoing);
  }
  return next(outgoing).pipe(
    catchError((err: unknown) => {
      if (!isNetworkError(err)) {
        return throwError(() => err);
      }
      const queue = inject(OfflineQueueService);
      queue.enqueue(storeForUrl(outgoing.url), actionForMethod(outgoing.method), {
        method: outgoing.method,
        url: outgoing.url,
        body: outgoing.body ?? null,
      });
      return of(new HttpResponse({ status: 202, body: outgoing.body ?? null }));
    })
  );
};