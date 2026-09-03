import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../api/api.client';

/**
 * Audit logging service (FEATURE_PLAN.md §16 §2/§19; feeds §10/§17).
 *
 * `log()` is fire-and-forget and never blocks the UI:
 *  - The event is appended to the in-memory signal + a localStorage ring
 *    buffer immediately, so the admin viewer and offline mode always have it.
 *  - The event is also buffered for batched async upload (batch of 10,
 *    subtask 19) — a single POST per batch instead of one per event.
 *  - A `correlationId` is attached to `meta` (subtask 4) so client-side writes
 *    can be traced from the audit log back to the originating request.
 *
 * `loadAll()` fetches the server-side append-only audit list for the admin
 * viewer (subtask 11). The demo backend never mutates or deletes entries.
 */
export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  atMs: number;
  meta?: Record<string, unknown>;
}

/** Batch size for buffered async upload (subtask 19: never blocks UI). */
export const AUDIT_BATCH_SIZE = 10;

const STORAGE_KEY = 'cm.audit.v1';
const MAX_EVENTS = 200;

let seq = 0;

function readLocal(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AuditEvent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  // Default-parameter injection keeps `new AuditService(apiStub)` possible in
  // unit tests while remaining DI-friendly in the app (codebase convention).
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _events = signal<AuditEvent[]>(readLocal());
  /** Events buffered for batched async upload (cleared after each flush). */
  private readonly _pending = signal<AuditEvent[]>([]);

  readonly events = this._events.asReadonly();
  readonly pendingCount = computed(() => this._pending().length);
  readonly eventCount = computed(() => this._events().length);

  /**
   * Append an event to the local ring buffer + buffered upload queue.
   * Returns the event so callers can reference its id / correlationId.
   */
  log(
    action: string,
    resourceType: string,
    resourceId: string,
    meta?: Record<string, unknown>,
    actorId = 'me'
  ): AuditEvent {
    const event: AuditEvent = {
      id: `audit-${Date.now().toString(36)}-${(seq++).toString(36)}`,
      actorId,
      action,
      resourceType,
      resourceId,
      atMs: Date.now(),
      meta: { ...meta, correlationId: crypto.randomUUID() },
    };
    // Immediate: local record always available (admin viewer / offline).
    this._events.update((list) => [...list.slice(-(MAX_EVENTS - 1)), event]);
    this.persist();
    // Buffered upload: append then flush when the batch fills.
    this._pending.update((buffer) => [...buffer, event]);
    if (this._pending().length >= AUDIT_BATCH_SIZE) {
      this.flush();
    }
    return event;
  }

  /** Flush all buffered events as a single batch POST (subtask 19). */
  flush(): void {
    const batch = this._pending();
    if (batch.length === 0) {
      return;
    }
    this._pending.set([]);
    try {
      this.api.post<unknown>('/audit/batch', batch).subscribe({ error: () => undefined });
    } catch {
      // Offline / no backend — events remain in the local ring buffer.
    }
  }

  /**
   * Load audit events from the backend for the admin viewer (subtask 11).
   * The demo backend returns the full append-only ledger; the viewer
   * performs its own client-side filtering and pagination.
   */
  loadAll(): Observable<{ items: AuditEvent[]; total: number }> {
    return this.api.get<{ items: AuditEvent[]; total: number }>('/audit/all');
  }

  /**
   * Export the local in-memory audit log as CSV text (subtask 12).
   * The admin page triggers a download and logs the export itself.
   */
  toCsv(): string {
    const events = this._events();
    const header = ['id', 'actorId', 'action', 'resourceType', 'resourceId', 'atMs', 'meta'];
    const rows = events.map((e) => [
      e.id,
      e.actorId,
      e.action,
      e.resourceType,
      e.resourceId,
      String(e.atMs),
      e.meta ? JSON.stringify(e.meta).replace(/"/g, '""') : '',
    ]);
    return [header, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(','))
      .join('\n');
  }

  /** Tamper-evidence: a simple client-side chain hash over the local events. */
  readonly chainHash = computed<string>(() => {
    let hash = 'init';
    for (const e of this._events()) {
      hash = btoa(`${hash}|${e.id}|${e.action}|${e.resourceType}|${e.resourceId}|${e.atMs}`);
    }
    return hash;
  });

  clear(): void {
    this.flush();
    this._events.set([]);
    this._pending.set([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._events()));
    } catch {
      // Storage unavailable — the in-memory entry is still returned.
    }
  }
}
