import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import {
  ScreeningProfile,
  ScreeningRecord,
  ScreeningStatus,
  ScreeningSex,
  ScreeningType,
  evaluateScreenings,
} from './screening.rules';

/**
 * Screening store (FEATURE_PLAN.md §6 subtasks 3–4, 11–12): loads the
 * persisted records + profile and evaluates them with the pure rule engine.
 * Overdue screenings surface as notifications (kind `screening.due`).
 */

export interface ScreeningApiRecord extends ScreeningRecord {
  id: string;
  snoozeCount?: number;
}

export const MAX_SNOOZES = 2;

/** Audit hook point (subtask 13): wired to the audit ledger when present (Feature 17), else in-memory only. */
export interface ScreeningAuditEvent {
  action: 'done' | 'waived' | 'snoozed' | 'scheduled';
  type: ScreeningType;
  atMs: number;
  reason?: string;
}

export interface ScreeningAuditHook {
  log(event: ScreeningAuditEvent): void;
}

@Injectable({ providedIn: 'root' })
export class ScreeningStore {
  // Default-parameter injection keeps `new ScreeningStore(api, notifications)`
  // possible in unit tests while remaining DI-friendly in the app.
  // The optional `audit` hook feeds the audit ledger when present (Feature 17);
  // otherwise events stay in the in-memory `auditLog`.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly notifications?: NotificationsService,
    private readonly audit?: ScreeningAuditHook
  ) {}

  private readonly _records = signal<ScreeningApiRecord[]>([]);
  private readonly _profile = signal<ScreeningProfile>({ dateOfBirth: '', sex: '' });
  private readonly _loading = signal(false);
  private readonly _actingType = signal<ScreeningType | null>(null);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  /** In-memory audit trail of waive/done/snooze/schedule (subtask 13; feeds Feature 17). */
  private readonly _auditLog = signal<ScreeningAuditEvent[]>([]);
  /**
   * RBAC read-only flag (subtask 10): family roles (caregiver/nurse) view
   * but cannot mutate. Set via `setReadOnly()` from the page's SessionStore.
   */
  private readonly _readOnly = signal(false);

  readonly records = this._records.asReadonly();
  readonly profile = this._profile.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingType = this._actingType.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly auditLog = this._auditLog.asReadonly();
  readonly readOnly = this._readOnly.asReadonly();

  /** Evaluated statuses (overdue first). */
  readonly statuses = computed(() =>
    evaluateScreenings(this._profile(), this._records(), Date.now())
  );

  readonly dueCount = computed(
    () => this.statuses().filter((s) => s.state === 'due').length
  );
  readonly overdueCount = computed(
    () => this.statuses().filter((s) => s.overdue).length
  );

  load(): Observable<boolean> {
    if (this._loading()) {
      return of(true);
    }
    this._loading.set(true);
    return this.api
      .get<{ profile: ScreeningProfile; records: ScreeningApiRecord[] }>('/me/screenings')
      .pipe(
        map(({ profile, records }) => {
          this._profile.set({
            dateOfBirth: profile?.dateOfBirth ?? '',
            sex: (profile?.sex ?? '') as ScreeningSex | '',
          });
          this._records.set(records ?? []);
          this._loading.set(false);
          this._loaded.set(true);
          this.raiseDueNotifications();
          return true;
        }),
        catchError(() => {
          this._loading.set(false);
          return of(false);
        })
      );
  }

  markDone(type: ScreeningType): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    return this.act(type, '/done', { status: 'done' }, { action: 'done', type, atMs: Date.now() });
  }

  /** Waive requires a reason (subtask 13); backend validates + audit hook logs it. */
  waive(type: ScreeningType, reason: string): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    if (!reason.trim()) {
      this._error.set('A reason is required to waive a screening.');
      return of(false);
    }
    const trimmed = reason.trim();
    return this.act(
      type,
      '/waive',
      { status: 'waived', reason: trimmed },
      { action: 'waived', type, atMs: Date.now(), reason: trimmed }
    );
  }

  /** Snooze for 30 days, up to MAX_SNOOZES times (subtask 12). */
  snooze(type: ScreeningType): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    const record = this._records().find((r) => r.type === type);
    const count = record?.snoozeCount ?? 0;
    if (count >= MAX_SNOOZES) {
      this._error.set(`This screening can only be snoozed ${MAX_SNOOZES} times.`);
      return of(false);
    }
    return this.act(
      type,
      '/snooze',
      {
        snoozeUntilMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
        snoozeCount: count + 1,
      },
      { action: 'snoozed', type, atMs: Date.now() }
    );
  }

  /**
   * Schedule a future appointment (subtask 4): keeps the rule in `upcoming`
   * until the date passes. Accepts epoch ms; defaults to 30 days out.
   */
  schedule(type: ScreeningType, atMs: number = Date.now() + 30 * 24 * 60 * 60 * 1000): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    if (!Number.isFinite(atMs)) {
      this._error.set('Choose a valid date to schedule this screening.');
      return of(false);
    }
    return this.act(
      type,
      '/schedule',
      { scheduledAtMs: atMs },
      { action: 'scheduled', type, atMs: Date.now() }
    );
  }

  /** Hook profile DOB/sex from `ProfileStore` into rule evaluation (subtask 5). */
  applyProfileFromUserProfile(user: { dateOfBirth?: string; sex?: ScreeningSex | '' }): void {
    this._profile.set({
      dateOfBirth: user.dateOfBirth ?? '',
      sex: (user.sex ?? '') as ScreeningSex | '',
    });
  }

  /** Mark this store read-only for family roles (subtask 10 RBAC). */
  setReadOnly(readOnly: boolean): void {
    this._readOnly.set(readOnly);
  }

  private rejectWhenReadOnly(): boolean {
    if (!this._readOnly()) {
      return false;
    }
    this._error.set('This view is read-only for your role.');
    return true;
  }

  private emitAudit(event: ScreeningAuditEvent): void {
    this._auditLog.update((log) => [...log, event]);
    try {
      this.audit?.log(event);
    } catch {
      // Audit hook must never break the UI (fire-and-forget).
    }
  }

  private act(
    type: ScreeningType,
    path: '/done' | '/waive' | '/snooze' | '/schedule',
    body: Record<string, unknown>,
    auditEvent?: ScreeningAuditEvent
  ): Observable<boolean> {
    this._actingType.set(type);
    this._error.set('');
    return this.api
      .post<ScreeningApiRecord>(`/me/screenings/${encodeURIComponent(type)}${path}`, body)
      .pipe(
        map((updated) => {
          this._records.update((records) => [
            ...records.filter((r) => r.type !== updated.type),
            updated,
          ]);
          this._actingType.set(null);
          if (auditEvent) {
            this.emitAudit(auditEvent);
          }
          this.raiseDueNotifications();
          return true;
        }),
        catchError((error) => {
          this._actingType.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not update the screening. Please try again.'
          );
          return of(false);
        })
      );
  }

  /** Overdue screenings → notification center (subtask 11), raised once each. */
  private raised = new Set<string>();
  private raiseDueNotifications(): void {
    if (!this.notifications) {
      return;
    }
    for (const status of this.statuses()) {
      if (status.state !== 'due') {
        continue;
      }
      const key = status.rule.type;
      if (this.raised.has(key)) {
        continue;
      }
      this.raised.add(key);
      this.notifications.notify(
        'screening.due',
        `${status.rule.label} is due`,
        status.overdue
          ? `This preventive check is overdue for your age group — book a visit or mark it done.`
          : `A preventive check is recommended for your age group.`,
        '/screenings'
      );
    }
  }
}
