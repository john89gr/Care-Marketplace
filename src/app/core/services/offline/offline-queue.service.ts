import { Injectable, computed, signal, inject, OnDestroy } from '@angular/core';
import {
  QueuedRequest,
  QueueAction,
  QueueStoreName,
  FlushResult,
  FlushSummary,
  FlushOptions,
  QueueBackend,
  QUEUE_BACKEND,
  MAX_FLUSH_ATTEMPTS,
} from './offline.models';

/**
 * In-memory outbox for requests that fail while offline (FEATURE_PLAN.md §20).
 *
 * The queue persists through `QueueBackend` (IndexedDB in production) so it
 * survives tab restarts. The service is reactive: `pendingCount`, `syncedCount`,
 * `failedCount` and `isOnline` are signals components can bind to for an offline
 * banner / retry button.
 */
const MAX_CONCURRENCY = 4;
const RETRY_BASE_DELAY_MS = 1000;

export type FlushHandler = (entry: QueuedRequest) => Promise<FlushResult>;

/** Exponential backoff for the Nth retry (1st retry = base, then 2x, 4x … capped). */
export function backoffDelay(attempts: number): number {
  return RETRY_BASE_DELAY_MS * 2 ** Math.min(Math.max(attempts - 1, 0), 5);
}

@Injectable({ providedIn: 'root' })
export class OfflineQueueService implements OnDestroy {
  private readonly backend: QueueBackend | null;

  private _entries = signal<QueuedRequest[]>([]);
  private _isOnline = signal(defaultOnline());
  private _flushing = signal(false);

  readonly entries = this._entries.asReadonly();
  readonly isOnline = this._isOnline.asReadonly();
  readonly flushing = this._flushing.asReadonly();

  readonly pendingCount = computed(() => this._entries().filter((e) => e.status === 'pending').length);
  readonly syncingCount = computed(() => this._entries().filter((e) => e.status === 'syncing').length);
  readonly failedCount = computed(() => this._entries().filter((e) => e.status === 'failed').length);
  readonly syncedCount = computed(() => this._entries().filter((e) => e.status === 'synced').length);

  private onlineUnlisten: (() => void) | null = null;
  private reconnectUnlisten: (() => void) | null = null;
  private readonly _retryTimers = new Set<ReturnType<typeof setTimeout>>();

  // Optional at construction: in DI the binding comes from app.config; in unit
  // tests an in-memory fake is passed straight through (codebase convention).
  constructor(backend: QueueBackend | null = inject(QUEUE_BACKEND, { optional: true })) {
    this.backend = backend ?? null;
    this.bootstrap().catch(() => {
      /* SW unavailable / IDB blocked — keep the in-memory buffer. */
    });
    if (typeof window !== 'undefined') {
      this.onlineUnlisten = listen(window, 'online', () => {
        this._isOnline.set(true);
        if (this.reconnectHandler) {
          this.reconnectHandler();
        }
      });
      this.reconnectUnlisten = listen(window, 'offline', () => {
        this._isOnline.set(false);
      });
    }
  }

  /** Handler invoked on the next `online` event (bound by app via setOnReconnect). */
  private reconnectHandler: (() => void) | null = null;
  setOnReconnect(handler: () => void): void {
    this.reconnectHandler = handler;
  }

  ngOnDestroy(): void {
    this.onlineUnlisten?.();
    this.reconnectUnlisten?.();
    for (const t of this._retryTimers) {
      clearTimeout(t);
    }
    this._retryTimers.clear();
  }

  private seq = 0;
  private nextId(): string {
    this.seq += 1;
    return `${Date.now().toString(36)}-${this.seq.toString(36)}`;
  }

  private async bootstrap(): Promise<void> {
    await this.backend?.open();
    const persisted = await this.backend?.all();
    if (persisted && persisted.length > 0) {
      this._entries.set(this.dedupe(persisted));
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    if (!this.backend) {
      return;
    }
    const all = this._entries();
    for (const e of all) {
      await this.backend.save(e);
    }
  }

  /** Collapse duplicate entries for the same dedupe key, keeping the latest. */
  private dedupe(entries: QueuedRequest[]): QueuedRequest[] {
    const byKey = new Map<string, QueuedRequest>();
    for (const e of entries) {
      if (!e.dedupeKey) {
        continue;
      }
      const existing = byKey.get(e.dedupeKey);
      if (!existing || e.createdAtMs > existing.createdAtMs) {
        byKey.set(e.dedupeKey, e);
      }
    }
    if (byKey.size === 0) {
      return entries;
    }
    // Remove the superseded entries.
    const superseded = new Set<string>();
    for (const e of entries) {
      if (!e.dedupeKey) {
        continue;
      }
      const latest = byKey.get(e.dedupeKey)!;
      if (latest.id !== e.id) {
        superseded.add(e.id);
      }
    }
    return entries.filter((e) => !superseded.has(e.id));
  }

  /** Enqueue a single request for offline replay. */
  enqueue(
    store: QueueStoreName,
    action: QueueAction,
    payload: unknown,
    opts?: { dedupeKey?: string }
  ): QueuedRequest {
    const entry: QueuedRequest = {
      id: this.nextId(),
      store,
      action,
      payload,
      createdAtMs: Date.now(),
      attempts: 0,
      status: 'pending',
      syncedAtMs: null,
      dedupeKey: opts?.dedupeKey ?? null,
      error: null,
    };
    this._entries.update((list) => this.dedupe([...list, entry]));
    void this.persist();
    return entry;
  }

  /** Bulk enqueue (used for batch vitals / multi-attachment sends). */
  async enqueueMany(
    store: QueueStoreName,
    action: QueueAction,
    payloads: unknown[],
    opts?: { dedupeKey?: string }
  ): Promise<QueuedRequest[]> {
    const created: QueuedRequest[] = [];
    this._entries.update((list) => {
      let next = list;
      for (const payload of payloads) {
        const entry: QueuedRequest = {
          id: this.nextId(),
          store,
          action,
          payload,
          createdAtMs: Date.now(),
          attempts: 0,
          status: 'pending',
          syncedAtMs: null,
          dedupeKey: opts?.dedupeKey ?? null,
          error: null,
        };
        next = this.dedupe([...next, entry]);
        created.push(entry);
      }
      return next;
    });
    await this.persist();
    return created;
  }

  /**
   * Flush all `pending` entries through `handler`. The handler is the only
   * piece that knows how to replay a payload against the API; on success it
   * returns `{ ok: true, serverTs }`, on failure `{ ok: false, error }`.
   *
   * Conflict policy: the returned `serverTs` (authoritative) replaces the
   * local `syncedAtMs`; the entry is then marked `synced`/`failed` and never
   * mutated again, so a stale local timestamp can never win.
   */
  async flush(handler: FlushHandler, options?: FlushOptions): Promise<FlushSummary> {
    const pending = this._entries()
      .filter((e) => e.status === 'pending')
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    if (pending.length === 0) {
      return { succeeded: 0, failed: 0, remaining: this.pendingCount() };
    }

    const concurrency = options?.concurrency ?? MAX_CONCURRENCY;
    this._flushing.set(true);

    let succeeded = 0;
    let failed = 0;

    const run = async (entry: QueuedRequest): Promise<void> => {
      let inFlight: QueuedRequest = entry;
      this._entries.update((list) =>
        list.map((e) => {
          if (e.id === entry.id) {
            const updated = { ...e, status: 'syncing', attempts: e.attempts + 1 };
            inFlight = updated;
            return updated;
          }
          return e;
        })
      );
      try {
        const result = await handler(entry);
        if (result.ok) {
          const updated: QueuedRequest = {
            ...inFlight,
            status: 'synced',
            syncedAtMs: typeof result.serverTs === 'number' ? result.serverTs : Date.now(),
            error: null,
          };
          this._entries.update((list) => list.map((e) => (e.id === entry.id ? updated : e)));
          succeeded += 1;
        } else {
          const failedEntry: QueuedRequest = { ...inFlight, status: 'failed', error: result.error ?? 'flush failed' };
          this._entries.update((list) => list.map((e) => (e.id === entry.id ? failedEntry : e)));
          failed += 1;
        }
      } catch (err) {
        const failedEntry: QueuedRequest = { ...inFlight, status: 'failed', error: asError(err) };
        this._entries.update((list) => list.map((e) => (e.id === entry.id ? failedEntry : e)));
        failed += 1;
      }
    };

    // Sequential within a bounded concurrency window, refilling as slots free.
    let i = 0;
    const workers: Promise<void>[] = [];
    const launch = () => {
      while (i < pending.length && workers.length < concurrency) {
        const entry = pending[i++];
        const w = run(entry).finally(() => {
          workers.splice(workers.indexOf(w), 1);
          launch();
        });
        workers.push(w);
      }
    };
    launch();
    await Promise.all(workers);

    this._flushing.set(false);
    await this.persist();

    return {
      succeeded,
      failed,
      remaining: this.pendingCount(),
    };
  }

  /**
   * Flush with exponential-backoff retries scheduled via `setTimeout`.
   * The returned `pendingRetries` counts scheduled-but-unfired retries so the
   * spec can drive backoff with fake timers (§20 subtask 13).
   */
  flushWithRetry(handler: FlushHandler): {
    flush: () => Promise<FlushSummary>;
    pendingRetries: () => number;
    cancel: () => void;
  } {
    const scheduleRetry = (entry: QueuedRequest) => {
      const delay = backoffDelay(entry.attempts);
      const t = setTimeout(() => {
        this._retryTimers.delete(t);
        void this._retryEntry(entry, handler);
      }, delay);
      this._retryTimers.add(t);
    };

    const flush = async (): Promise<FlushSummary> => {
      const summary = await this.flush(handler);
      for (const entry of this._entries().filter(
        (e) => e.status === 'failed' && e.attempts < MAX_FLUSH_ATTEMPTS
      )) {
        scheduleRetry(entry);
      }
      return summary;
    };

    const cancel = () => {
      for (const t of this._retryTimers) {
        clearTimeout(t);
      }
      this._retryTimers.clear();
    };

    return { flush, pendingRetries: () => this._retryTimers.size, cancel };
  }

  private async _retryEntry(entry: QueuedRequest, handler: FlushHandler): Promise<void> {
    this._entries.update((list) =>
      list.map((e) => (e.id === entry.id ? { ...e, status: 'pending', error: null } : e))
    );
    await this.flush(handler);
    const current = this._entries().find((e) => e.id === entry.id);
    if (current && current.status === 'failed' && current.attempts < MAX_FLUSH_ATTEMPTS) {
      const delay = backoffDelay(current.attempts);
      const t = setTimeout(() => {
        this._retryTimers.delete(t);
        void this._retryEntry(current, handler);
      }, delay);
      this._retryTimers.add(t);
    }
  }

  /** Move `failed` entries back to `pending` so the next flush retries them. */
  retryFailed(): QueuedRequest[] {
    this._entries.update((list) =>
      list.map((e) => (e.status === 'failed' ? { ...e, status: 'pending', error: null } : e))
    );
    void this.persist();
    return this._entries().filter((e) => e.status === 'pending' || e.status === 'syncing');
  }

  /** Permanently drop entries the backend accepted (or that can never retry). */
  purgeSynced(): number {
    const before = this._entries().length;
    this._entries.update((list) => list.filter((e) => e.status !== 'synced'));
    void this.persist();
    return before - this._entries().length;
  }

  /** Drop a single entry regardless of status (user-initiated clear). */
  remove(id: string): boolean {
    const had = this._entries().some((e) => e.id === id);
    this._entries.update((list) => list.filter((e) => e.id !== id));
    void this.persist();
    return had;
  }

  /** Re-flush the queue right now (wired to the online banner / "sync now"). */
  syncNow(handler: FlushHandler): Promise<FlushSummary> {
    return this.flush(handler);
  }
}

function defaultOnline(): boolean {
  try {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  } catch {
    return true;
  }
}

function listen(target: EventTarget, type: string, cb: () => void): () => void {
  target.addEventListener(type, cb);
  return () => target.removeEventListener(type, cb);
}

function asError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
