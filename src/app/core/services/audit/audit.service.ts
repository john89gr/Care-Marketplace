import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '../../api/api.client';

/**
 * Minimal audit-log hook (FEATURE_PLAN.md §10 subtask 11; feeds §16/17).
 *
 * `log()` is fire-and-forget and never blocks the UI: the event is appended
 * to an in-memory signal + a localStorage ring buffer (so exports stay
 * auditable offline in demo mode), and a best-effort POST is sent to
 * `/api/audit` (answered by the demo backend; failures are swallowed).
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
  readonly events = this._events.asReadonly();

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
      meta,
    };
    this._events.update((list) => [...list.slice(-(MAX_EVENTS - 1)), event]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._events()));
    } catch {
      // Storage unavailable — the in-memory entry is still returned.
    }
    try {
      this.api.post('/audit', event).subscribe({ error: () => undefined });
    } catch {
      // Offline / no backend — the local entry is the record.
    }
    return event;
  }

  clear(): void {
    this._events.set([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
}
