import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { NotificationsService } from '../../core/services/notifications/notifications.service';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import {
  Medication,
  AdherenceLog,
  DoseSlot,
  dateKey,
  doseSlotsFor,
  adherenceFor,
  consecutiveMisses,
  needsRefill,
  AdherenceStats,
  ESCALATION_AFTER_MISSES,
} from './medications.logic';

/**
 * Medications store (FEATURE_PLAN.md §7 subtasks 2–3, 6–11, 13–14): loads the
 * medication list + adherence logs, computes today's timeline and adherence,
 * logs doses (client or caregiver on behalf), and raises critical-miss
 * alerts to the notification center with an escalation rule.
 */
export interface NewMedication {
  name: string;
  dose: string;
  schedule: Medication['schedule'];
  critical: boolean;
  prescriber?: string;
}

/** Interaction-check placeholder contract (subtask 12; server-side later). */
export interface InteractionCheck {
  medicationId: string;
  severity: 'none' | 'minor' | 'major';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class MedicationsStore {
  // Default-parameter injection keeps direct construction possible in tests.
  // `ws` is optional (no inject() default) so `new MedicationsStore(api,
  // notifications)` keeps working outside an injection context.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly notifications?: NotificationsService,
    private readonly ws?: WebSocketClient
  ) {}

  private readonly _meds = signal<Medication[]>([]);
  private readonly _logs = signal<AdherenceLog[]>([]);
  private readonly _loading = signal(false);
  private readonly _actingId = signal<string | null>(null);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  private readonly _interaction = signal<InteractionCheck | null>(null);

  readonly meds = this._meds.asReadonly();
  readonly logs = this._logs.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingId = this._actingId.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly interaction = this._interaction.asReadonly();

  /** Active (non-archived) medications. */
  readonly activeMeds = computed(() => this._meds().filter((m) => !m.archived));

  /** Today's dose slots per active medication. */
  readonly today = computed(() => {
    const now = Date.now();
    const today = dateKey(now);
    return this.activeMeds().map((med) => ({
      med,
      slots: doseSlotsFor(med, today, this._logs(), now),
    }));
  });

  /** Adherence per active medication over a window. */
  adherence(med: Medication, days: 7 | 30): AdherenceStats {
    return adherenceFor(med, this._logs(), Date.now(), days);
  }

  /** Overall adherence across all active meds (7-day window). */
  readonly overallAdherence = computed<AdherenceStats>(() =>
    this.overallAdherenceFor(7)
  );

  /** Overall adherence across all active meds (30-day window, subtask 5). */
  readonly overallAdherence30 = computed<AdherenceStats>(() =>
    this.overallAdherenceFor(30)
  );

  private overallAdherenceFor(days: number): AdherenceStats {
    const meds = this.activeMeds();
    const totals = meds.reduce(
      (acc, med) => {
        const stats = adherenceFor(med, this._logs(), Date.now(), days);
        return {
          taken: acc.taken + stats.taken,
          scheduled: acc.scheduled + stats.scheduled,
        };
      },
      { taken: 0, scheduled: 0 }
    );
    return {
      ...totals,
      rate: totals.scheduled === 0 ? null : Math.round((totals.taken / totals.scheduled) * 100) / 100,
    };
  }

  /** Meds whose supply is running out (subtask 14). */
  readonly refillNeeded = computed(() =>
    this.activeMeds().filter((med) => needsRefill(med, Date.now()))
  );

  /** Meds with missed doses right now (for the alert strip). */
  readonly missedToday = computed(() =>
    this.today().filter(({ slots }) => slots.some((s) => s.state === 'missed'))
  );

  load(): Observable<boolean> {
    if (this._loaded()) {
      return of(true);
    }
    this._loading.set(true);
    return this.api
      .get<{ medications: Medication[]; logs: AdherenceLog[] }>('/me/medications')
      .pipe(
        map(({ medications, logs }) => {
          this._meds.set(medications ?? []);
          this._logs.set(logs ?? []);
          this._loading.set(false);
          this._loaded.set(true);
          this.raiseCriticalMissAlerts();
          return true;
        }),
        catchError(() => {
          this._loading.set(false);
          return of(false);
        })
      );
  }

  /** Add a medication (subtask 2: POST /me/medications). */
  add(input: NewMedication): Observable<boolean> {
    this._error.set('');
    return this.api.post<Medication>('/me/medications', input).pipe(
      map((created) => {
        this._meds.update((meds) => [created, ...meds]);
        this.raiseCriticalMissAlerts();
        return true;
      }),
      catchError((error) => {
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not add the medication. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Log a dose as taken or skipped (subtask 11: caregiver may log too). */
  logDose(
    medicationId: string,
    date: string,
    timeMinutes: number,
    action: 'taken' | 'skipped',
    loggedBy = 'me'
  ): Observable<boolean> {
    this._actingId.set(medicationId);
    this._error.set('');
    return this.api
      .post<AdherenceLog>(`/medications/${encodeURIComponent(medicationId)}/log`, {
        date,
        timeMinutes,
        action,
        loggedBy,
      })
      .pipe(
        map((entry) => {
          this._logs.update((logs) => [
            ...logs.filter(
              (l) => !(l.medicationId === entry.medicationId && l.date === entry.date && l.timeMinutes === entry.timeMinutes)
            ),
            entry,
          ]);
          this._actingId.set(null);
          this.raiseCriticalMissAlerts();
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not log the dose. Please try again.'
          );
          return of(false);
        })
      );
  }

  /** Soft-delete/archive (subtask 13): history is preserved for audit. */
  archive(medicationId: string): Observable<boolean> {
    this._actingId.set(medicationId);
    return this.api
      .post<Medication>(`/medications/${encodeURIComponent(medicationId)}/archive`, {})
      .pipe(
        map((updated) => {
          this._meds.update((meds) => meds.map((m) => (m.id === updated.id ? updated : m)));
          this._actingId.set(null);
          return true;
        }),
        catchError((error) => {
          this._actingId.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not archive the medication.'
          );
          return of(false);
        })
      );
  }

  /** Interaction-check placeholder call (subtask 12). */
  checkInteractions(medicationId: string): void {
    this.api
      .get<InteractionCheck>(`/medications/${encodeURIComponent(medicationId)}/interactions`)
      .subscribe({
        next: (result) => this._interaction.set(result),
        error: () => this._interaction.set(null),
      });
  }

  /**
   * Critical-miss family alert (subtask 9) + escalation (subtask 10): one
   * alert per missed dose, re-alerting only when the consecutive-miss streak
   * grows past what was last alerted (so the 2nd consecutive miss escalates
   * without spamming on every recompute). Each new alert also emits a
   * `medication.alert` WebSocket event so family clients on other devices
   * receive it live (the demo socket fans it out as `notification.push`).
   */
  private alertState = new Map<string, number>();
  private raiseCriticalMissAlerts(): void {
    if (!this.notifications && !this.ws) {
      return;
    }
    const now = Date.now();
    for (const { med, slots } of this.today()) {
      if (!med.critical) {
        continue;
      }
      const streak = consecutiveMisses(med, this._logs(), now);
      const missed = slots.filter((s) => s.state === 'missed');
      for (const slot of missed) {
        const key = `${med.id}:${dateKey(now)}:${slot.timeMinutes}`;
        const lastStreak = this.alertState.get(key);
        if (lastStreak !== undefined && streak <= lastStreak) {
          continue;
        }
        const escalate = streak >= ESCALATION_AFTER_MISSES;
        const escalationNote = escalate
          ? ` This is the ${streak}${streak === 2 ? 'nd' : 'th'} consecutive miss — please check in.`
          : '';
        this.notifications?.notify(
          'medication.missed',
          `Missed dose: ${med.name}`,
          `A critical medication dose was missed.${escalationNote}`,
          '/medications'
        );
        this.ws?.send({
          type: 'medication.alert',
          payload: {
            medicationId: med.id,
            name: med.name,
            date: dateKey(now),
            timeMinutes: slot.timeMinutes,
            consecutiveMisses: streak,
          },
        });
        this.alertState.set(key, streak);
      }
    }
  }
}
