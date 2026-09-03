import { Injectable, signal } from '@angular/core';

/**
 * Lightweight search/usage analytics (FEATURE_PLAN.md §2 subtask 19).
 * Events are buffered in memory; a real sink (endpoint or provider) can be
 * attached later without touching call sites. Never blocks the UI.
 */
export interface AnalyticsEvent {
  name: string;
  atMs: number;
  props?: Record<string, unknown>;
}

const MAX_BUFFER = 50;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly _events = signal<AnalyticsEvent[]>([]);

  /** Most recent events, oldest first (capped at MAX_BUFFER). */
  readonly events = this._events.asReadonly();

  track(name: string, props?: Record<string, unknown>): void {
    const event: AnalyticsEvent = { name, atMs: Date.now(), props };
    this._events.update((list) => [...list.slice(-(MAX_BUFFER - 1)), event]);
  }

  clear(): void {
    this._events.set([]);
  }
}
