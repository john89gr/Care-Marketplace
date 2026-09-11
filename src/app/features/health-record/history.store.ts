import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { AuditService } from '../../core/services/audit/audit.service';
import type { MedicationSchedule } from './medications.logic';
import type { MedicineInstructions } from './medicine.info';
import type {
  Allergy,
  AllergyDraft,
  ConditionDraft,
  HistoryDraft,
  HistoryKind,
  HistoryRecord,
  Immunization,
  ImmunizationDraft,
  MedicalCondition,
  MedicalEvent,
  MedicalEventDraft,
  PrescriptionDraft,
  PrescriptionRecord,
  Symptom,
  SymptomDraft,
} from './history.models';

/**
 * Medical-history store (FEATURE_PLAN.md §21 subtasks 5–7): lazy per-category
 * load, CRUD with optimistic add + rollback, soft-archive (never hard-delete),
 * and a read-only flag for family roles (caregiver/nurse). Every read/write
 * is instrumented through the optional AuditService (PLAN.md §4 — "who
 * viewed which medical measurement, when"). Prescriptions bridge into the
 * §7 medications feature via `addPrescriptionToMedications`.
 */

type RecordFor<K extends HistoryKind> = K extends 'conditions'
  ? MedicalCondition
  : K extends 'allergies'
    ? Allergy
    : K extends 'immunizations'
      ? Immunization
      : K extends 'events'
        ? MedicalEvent
        : K extends 'symptoms'
          ? Symptom
          : PrescriptionRecord;

type DraftFor<K extends HistoryKind> = K extends 'conditions'
  ? ConditionDraft
  : K extends 'allergies'
    ? AllergyDraft
    : K extends 'immunizations'
      ? ImmunizationDraft
      : K extends 'events'
        ? MedicalEventDraft
        : K extends 'symptoms'
          ? SymptomDraft
          : PrescriptionDraft;

/** History categories backed by `/me/history/:kind` (prescriptions has its own register endpoint). */
const HISTORY_PATH_KINDS: readonly HistoryKind[] = [
  'conditions',
  'allergies',
  'immunizations',
  'events',
  'symptoms',
];

/** Parsed schedule + sheet forwarded by the Track 3 reminder wizard. */
export interface PillReminderPlanInput {
  schedule?: MedicationSchedule | null;
  instructions?: MedicineInstructions | null;
}

/** Owner read path: `/me/history/:kind` (or `/me/prescriptions`). */
export function ownerPathFor(kind: HistoryKind): string {
  return kind === 'prescriptions' ? '/me/prescriptions' : `/me/history/${kind}`;
}

/**
 * Family read path (§21 subtask 16): the consent-gated second-person routes
 * the server enforces (`GET /api/history/:userId/:kind`); it 403s unless the
 * recipient granted `family_sharing`.
 */
export function familyPathFor(kind: HistoryKind, userId: string): string {
  return kind === 'prescriptions'
    ? `/history/${encodeURIComponent(userId)}/prescriptions`
    : `/history/${encodeURIComponent(userId)}/${kind}`;
}

@Injectable({ providedIn: 'root' })
export class HistoryStore {
  // Default-parameter injection keeps `new HistoryStore(api, audit)` possible
  // in unit tests while remaining DI-friendly in the app (codebase convention).
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly audit?: AuditService
  ) {}

  private readonly _byKind = signal<Partial<Record<HistoryKind, HistoryRecord[]>>>({});
  private readonly _loadingKinds = signal<HistoryKind[]>([]);
  private readonly _actingKey = signal<string | null>(null);
  private readonly _error = signal('');
  private readonly _readOnly = signal(false);
  /** Family mode: the care recipient whose record the reads target (§21 subtask 16). */
  private readonly _targetUserId = signal<string | null>(null);

  readonly byKind = this._byKind.asReadonly();
  readonly loadingKinds = this._loadingKinds.asReadonly();
  readonly actingKey = this._actingKey.asReadonly();
  readonly error = this._error.asReadonly();
  readonly readOnly = this._readOnly.asReadonly();
  readonly targetUserId = this._targetUserId.asReadonly();

  /** Read path for a kind: the owner `/me` routes, or the family endpoint. */
  private pathFor(kind: HistoryKind): string {
    const target = this._targetUserId();
    return target ? familyPathFor(kind, target) : ownerPathFor(kind);
  }

  /** Non-archived records of a kind (reactive through `byKind()`). */
  records<K extends HistoryKind>(kind: K): RecordFor<K>[] {
    return ((this._byKind()[kind] ?? []) as RecordFor<K>[]).filter((r) => !r.archived);
  }

  isLoaded(kind: HistoryKind): boolean {
    return this._byKind()[kind] !== undefined;
  }

  isLoading(kind: HistoryKind): boolean {
    return this._loadingKinds().includes(kind);
  }

  /** Lazy load one category (one tab at a time, per-route @defer friendly). */
  load<K extends HistoryKind>(kind: K): Observable<boolean> {
    if (this.isLoaded(kind) || this.isLoading(kind)) {
      return of(true);
    }
    this._loadingKinds.update((kinds) => [...kinds, kind]);
    return this.api.get<RecordFor<K>[]>(this.pathFor(kind)).pipe(
      map((items) => {
        this._byKind.update((all) => ({ ...all, [kind]: (items ?? []) as HistoryRecord[] }));
        this._loadingKinds.update((kinds) => kinds.filter((k) => k !== kind));
        this.audit?.log('history.view', `history.${kind}`, 'me', {
          count: items?.length ?? 0,
          correlationId: `history-load-${kind}-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._loadingKinds.update((kinds) => kinds.filter((k) => k !== kind));
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            `Could not load your ${kind}. Please try again.`
        );
        return of(false);
      })
    );
  }

  /** Add a record (optimistic: the draft renders instantly, rolled back on error). */
  add<K extends HistoryKind>(kind: K, draft: DraftFor<K>): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    this._error.set('');
    this._actingKey.set(`${kind}:new`);
    const optimisticId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      ...(draft as object),
      id: optimisticId,
      archived: false,
      createdAtMs: Date.now(),
    } as RecordFor<K>;
    this._byKind.update((all) => ({
      ...all,
      [kind]: [optimistic, ...((all[kind] ?? []) as HistoryRecord[])],
    }));
    return this.api.post<RecordFor<K>>(this.pathFor(kind), draft).pipe(
      map((created) => {
        this._byKind.update((all) => ({
          ...all,
          [kind]: [
            created,
            ...((all[kind] ?? []) as HistoryRecord[]).filter(
              (r) => r.id !== optimisticId
            ),
          ],
        }));
        this._actingKey.set(null);
        this.audit?.log('history.create', `history.${kind}`, created.id, {
          correlationId: `history-add-${kind}-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._byKind.update((all) => ({
          ...all,
          [kind]: ((all[kind] ?? []) as HistoryRecord[]).filter(
            (r) => r.id !== optimisticId
          ),
        }));
        this._actingKey.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            `Could not save this ${kind.slice(0, -1)}. Please try again.`
        );
        return of(false);
      })
    );
  }

  /** Partial update (status changes, resolved dates, archive…). */
  update<K extends HistoryKind>(
    kind: K,
    id: string,
    patch: Partial<HistoryDraft<RecordFor<K>>>
  ): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    this._actingKey.set(`${kind}:${id}`);
    this._error.set('');
    return this.api
      .patch<RecordFor<K>>(`${this.pathFor(kind)}/${encodeURIComponent(id)}`, patch)
      .pipe(
        map((updated) => {
          this._byKind.update((all) => ({
            ...all,
            [kind]: ((all[kind] ?? []) as HistoryRecord[]).map((r) =>
              r.id === id ? (updated as HistoryRecord) : r
            ),
          }));
          this._actingKey.set(null);
          this.audit?.log('history.update', `history.${kind}`, id, {
            ...(patch as object),
            correlationId: `history-update-${kind}-${Date.now().toString(36)}`,
          });
          return true;
        }),
        catchError((error) => {
          this._actingKey.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not update this record.'
          );
          return of(false);
        })
      );
  }

  /** Soft-archive a record (history is never hard-deleted — audit-friendly). */
  archive<K extends HistoryKind>(kind: K, id: string): Observable<boolean> {
    return this.update(kind, id, { archived: true } as Partial<HistoryDraft<RecordFor<K>>>);
  }

  /** Mark an active prescription completed. */
  completePrescription(id: string): Observable<boolean> {
    return this.update('prescriptions', id, { status: 'completed' });
  }

  /**
   * Attach a scanned pharmacy prescription (§21 subtask 12): links the
   * register entry to the §9 scan record so the register shows what was
   * actually dispensed.
   */
  linkPharmacyPrescription(id: string, pharmacyPrescriptionId: string): Observable<boolean> {
    return this.update('prescriptions', id, { pharmacyPrescriptionId });
  }

  /** Cancel a prescription. */
  cancelPrescription(id: string): Observable<boolean> {
    return this.update('prescriptions', id, { status: 'cancelled' });
  }

  /**
   * Prescription → medication bridge (§21 subtask 6): the server creates a
   * §7 medication (default daily-morning schedule) from the register entry
   * and links them; the user adjusts timing on the medications page.
   */
  addPrescriptionToMedications(id: string): Observable<boolean> {
    return this.setPillReminder(id).pipe(map((created) => created !== null));
  }

  /**
   * Prescription → medication + reminder bridge (Track 3): like
   * `addPrescriptionToMedications`, but forwards the parsed schedule and
   * structured instruction sheet from the wizard and returns the created
   * medication id so the caller can persist the chosen reminder channels.
   */
  setPillReminder(
    id: string,
    plan?: PillReminderPlanInput
  ): Observable<{ medicationId: string } | null> {
    if (this.rejectWhenReadOnly()) {
      return of(null);
    }
    this._actingKey.set(`prescriptions:${id}`);
    this._error.set('');
    const body: Record<string, unknown> = {};
    if (plan?.schedule) {
      body['schedule'] = plan.schedule;
    }
    if (plan?.instructions) {
      body['instructions'] = plan.instructions;
    }
    return this.api
      .post<{ prescription: PrescriptionRecord; medicationId: string }>(
        `/me/prescriptions/${encodeURIComponent(id)}/to-medication`,
        body
      )
      .pipe(
        map(({ prescription, medicationId }) => {
          this._byKind.update((all) => ({
            ...all,
            prescriptions: ((all.prescriptions ?? []) as PrescriptionRecord[]).map(
              (p) => (p.id === id ? { ...prescription, medicationId } : p)
            ),
          }));
          this._actingKey.set(null);
          this.audit?.log('prescription.toMedication', 'prescription', id, {
            medicationId,
            hasSchedule: Boolean(plan?.schedule),
            correlationId: `rx-to-med-${Date.now().toString(36)}`,
          });
          return { medicationId };
        }),
        catchError((error) => {
          this._actingKey.set(null);
          this._error.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not add this prescription to medications.'
          );
          return of(null);
        })
      );
  }

  /** Mark this store read-only for family roles (subtask 7 RBAC). */
  setReadOnly(readOnly: boolean): void {
    this._readOnly.set(readOnly);
  }

  /**
   * Family mode (§21 subtask 16): read `userId`'s record (read-only) through
   * the consent-gated family endpoint instead of the owner `/me` routes.
   * Passing `null` returns the store to owner reads. Cached rows are dropped
   * on a target change so one recipient's data never leaks into another's
   * view.
   */
  setRecipient(userId: string | null): void {
    if (this._targetUserId() === userId) {
      return;
    }
    this._targetUserId.set(userId);
    this._byKind.set({});
    this._loadingKinds.set([]);
  }

  private rejectWhenReadOnly(): boolean {
    if (!this._readOnly()) {
      return false;
    }
    this._error.set('This view is read-only for your role.');
    return true;
  }
}