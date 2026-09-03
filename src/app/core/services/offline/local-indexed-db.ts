import { Injectable } from '@angular/core';
import { QueueBackend, QueuedRequest, QUEUE_BACKEND } from './offline.models';

/**
 * IndexedDB persistence for the offline outbox (FEATURE_PLAN.md §20 subtask 5).
 *
 * Wrapped behind the `QueueBackend` interface so unit tests can swap an
 * in-memory fake without touching a real database. The store uses the entry
 * `id` (a ULID-like monotonic string) as its keyPath.
 *
 * Schema (DB name `care-marketplace`, store `outbox` keyPath `id`):
 *   - index `by_status`  (status, createdAtMs)  for pending/syncing lookups
 *   - index `by_store`   (store, createdAtMs)   for per-feature queues
 */
const DB_NAME = 'care-marketplace';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

function indexedDbGlobal(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class IndexedDbBackend implements QueueBackend {
  private db: IDBDatabase | null = null;
  private opened = false;

  async open(): Promise<void> {
    if (this.opened && this.db) {
      return;
    }
    const factory = indexedDbGlobal();
    if (!factory) {
      return;
    }
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_status', ['status', 'createdAtMs'], { unique: false });
        store.createIndex('by_store', ['store', 'createdAtMs'], { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    this.opened = true;
  }

  private tx(): IDBObjectStore {
    if (!this.db) {
      throw new Error('IndexedDbBackend: call open() before using it');
    }
    return this.db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
  }

  private ready<T>(value: T): Promise<T> {
    return this.db ? this.open().then(() => value) : Promise.resolve(value);
  }

  async all(): Promise<QueuedRequest[]> {
    if (!this.db) {
      return [];
    }
    return new Promise<QueuedRequest[]>((resolve, reject) => {
      const req = this.tx().getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedRequest[]);
      req.onerror = () => reject(req.error);
    });
  }

  async save(entry: QueuedRequest): Promise<void> {
    await this.ready(undefined);
    if (!this.db) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const req = this.tx().put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async update(entry: QueuedRequest): Promise<void> {
    await this.ready(entry);
    return this.save(entry);
  }

  async remove(id: string): Promise<void> {
    if (!this.db) {
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const req = this.tx().delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * Provider wiring — binds the `QUEUE_BACKEND` token to the IndexedDB impl so the
 * OfflineQueueService gets a real outbox at runtime. Tests never reach this.
 */
export const IndexedDbBackendProvider = {
  provide: QUEUE_BACKEND,
  useExisting: IndexedDbBackend,
};
