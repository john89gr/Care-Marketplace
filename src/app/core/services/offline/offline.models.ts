import { InjectionToken } from '@angular/core';

/**
 * Offline-first queue (FEATURE_PLAN.md §20 subtask 5/6).
 *
 * Stores "outbox" actions (chat messages, vitals entries, prescriptions …) that
 * originated while offline (or before the SW has synced them) in IndexedDB, then
 * replays them against the API once connectivity returns.
 *
 * Conflict policy (§20 subtask 6): the backend is authoritative — its timestamp
 * (`serverTs`) wins over any local value; local entries are only ever marked
 * `synced` / `failed`, never mutated by the handler.
 */

export type QueueAction = 'create' | 'update' | 'delete';
export type QueueStoreName = 'chat' | 'vitals' | 'prescriptions';

export type EntryStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedRequest {
  id: string;
  store: QueueStoreName;
  action: QueueAction;
  /** Opaque payload the flush handler replays against the API backend. */
  payload: unknown;
  createdAtMs: number;
  /** How many flush attempts have been made (drives retry backoff). */
  attempts: number;
  status: EntryStatus;
  /** Server-assigned timestamp wins on conflict; null while unsynced. */
  syncedAtMs: number | null;
  /** Optional client hint so duplicate actions can collapse (e.g. latest vitals). */
  dedupeKey: string | null;
  /** Last error from the backend, surfaced to the user / retry UX. */
  error: string | null;
}

/** Result returned by the flush handler for a single queued request. */
export interface FlushResult {
  ok: boolean;
  /** Optional server timestamp (authoritative). Server wins on conflict. */
  serverTs?: number;
  /** Optional server echo of the request id for correlation. */
  serverId?: string;
  /** Failure reason surfaced to the retry UX. */
  error?: string;
}

export interface FlushSummary {
  succeeded: number;
  failed: number;
  remaining: number;
}

export interface FlushOptions {
  /** Max concurrent handler invocations (default 4). Bounded for the flaky-3G case. */
  concurrency?: number;
  /** When set, a failed entry keeps "pending" and a retry is scheduled; see flushWithRetry. */
  autoRetry?: boolean;
}

/** Pluggable persistence backend. IndexedDB in production; an in-memory fake in tests. */
export interface QueueBackend {
  open(): Promise<void>;
  all(): Promise<QueuedRequest[]>;
  save(entry: QueuedRequest): Promise<void>;
  update(entry: QueuedRequest): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Injection token binding the persistence layer. The production provider is the
 * IndexedDB implementation (see local-indexed-db.ts); tests substitute an
 * in-memory fake via the constructor default param (codebase convention).
 */
export const QUEUE_BACKEND = new InjectionToken<QueueBackend>('cm.offline.QueueBackend');

export const MAX_FLUSH_ATTEMPTS = 5;
