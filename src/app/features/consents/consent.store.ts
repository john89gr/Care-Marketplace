import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { AuditService } from '../../core/services/audit/audit.service';

/**
 * Consent management store (FEATURE_PLAN.md §16 subtasks 6–7, 9, 10).
 *
 * Tracks GDPR-style consents per purpose. Each consent record carries a
 * versioned consent document so a version bump triggers re-consent (subtask 10).
 * The store syncs with `GET/PUT /me/consents` and exposes an
 * `isConsented(purpose)` selector that the rest of the app gates on
 * (subtask 9: vitals sharing to caregiver requires active `familySharing`).
 *
 * `audit` is optional so existing tests that omit it still construct.
 */

/** Consent purposes tracked in the ledger. */
export type ConsentPurpose = 'familySharing' | 'smsReminders' | 'bluetooth' | 'export';

export interface ConsentDocument {
  /** Stable machine key for the purpose. */
  purpose: ConsentPurpose;
  /** Human label shown in the consents page. */
  label: string;
  /** Version of the consent document — bump forces re-consent. */
  version: number;
}

/** Current consent state for one purpose. */
export interface ConsentRecord {
  purpose: ConsentPurpose;
  granted: boolean;
  /** When the current grant/revoke decision was made. */
  updatedAtMs: number;
  /** Epoch ms of the last `granted: true`, or null if never granted. */
  consentedAtMs: number | null;
  /** Epoch ms when consent was revoked, or null if currently granted. */
  revokedAtMs: number | null;
  /** Document version the user last acted on. */
  documentVersion: number;
}

/** Versioned consent documents registered in the app. */
export const CONSENT_DOCUMENTS: Record<ConsentPurpose, ConsentDocument> = {
  familySharing: {
    purpose: 'familySharing',
    label: 'Share my health record with my caregiver',
    version: 1,
  },
  smsReminders: {
    purpose: 'smsReminders',
    label: 'SMS reminders for medications',
    version: 1,
  },
  bluetooth: {
    purpose: 'bluetooth',
    label: 'Pair Bluetooth medical devices',
    version: 1,
  },
  export: {
    purpose: 'export',
    label: 'Export my health summary as PDF',
    version: 1,
  },
};

export const ALL_CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  'familySharing',
  'smsReminders',
  'bluetooth',
  'export',
];

/** Default consent documents returned when the user has none persisted yet. */
function defaultConsents(): ConsentRecord[] {
  return ALL_CONSENT_PURPOSES.map((purpose) => ({
    purpose,
    granted: false,
    updatedAtMs: 0,
    consentedAtMs: null,
    revokedAtMs: null,
    documentVersion: CONSENT_DOCUMENTS[purpose].version,
  }));
}

@Injectable({ providedIn: 'root' })
export class ConsentStore {
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly audit?: AuditService
  ) {}

  private readonly _consents = signal<ConsentRecord[]>(defaultConsents());
  private readonly _loading = signal(false);
  private readonly _error = signal('');

  readonly consents = this._consents.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Returns the consent record for a purpose, or the default (not granted)
   * when the user hasn't loaded from the backend yet.
   */
  get(purpose: ConsentPurpose): ConsentRecord {
    return this._consents().find((c) => c.purpose === purpose) ?? {
      purpose,
      granted: false,
      updatedAtMs: 0,
      consentedAtMs: null,
      revokedAtMs: null,
      documentVersion: CONSENT_DOCUMENTS[purpose].version,
    };
  }

  /** True when the user has an active, current-version consent for `purpose`. */
  isConsented(purpose: ConsentPurpose): boolean {
    const record = this.get(purpose);
    return record.granted && record.documentVersion >= CONSENT_DOCUMENTS[purpose].version;
  }

  /** True when the stored document version is behind the registered one. */
  needsReconsent(purpose: ConsentPurpose): boolean {
    if (!this._consents().some((c) => c.purpose === purpose)) {
      return true;
    }
    const record = this.get(purpose);
    return record.documentVersion < CONSENT_DOCUMENTS[purpose].version;
  }

  /** Overall re-consent flag: any purpose with a stale document version. */
  readonly needsReconsentAny = signal(false);

  load(): Observable<boolean> {
    this._loading.set(true);
    this._error.set('');
    return this.api.get<ConsentRecord[]>('/me/consents').pipe(
      map((records) => {
        const normalized = (Array.isArray(records) ? records : []).map((r) => ({
          purpose: r.purpose,
          granted: Boolean(r.granted),
          updatedAtMs: typeof r.updatedAtMs === 'number' ? r.updatedAtMs : 0,
          consentedAtMs: typeof r.consentedAtMs === 'number' ? r.consentedAtMs : null,
          revokedAtMs: typeof r.revokedAtMs === 'number' ? r.revokedAtMs : null,
          documentVersion: typeof r.documentVersion === 'number' ? r.documentVersion : 1,
        }));
        const merged = ALL_CONSENT_PURPOSES.map((p) => {
          const existing = normalized.find((c) => c.purpose === p);
          return existing ?? defaultConsents().find((c) => c.purpose === p)!;
        });
        this._consents.set(merged);
        this._loading.set(false);
        this.checkReconsent();
        return true;
      }),
      catchError((error) => {
        this._loading.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not load consent settings.'
        );
        return of(false);
      })
    );
  }

  /**
   * Grant or revoke a single purpose (subtask 9). Optimistic local update
   * followed by a PUT; on failure the UI shows the error signal.
   */
  setConsent(purpose: ConsentPurpose, granted: boolean): Observable<boolean> {
    const now = Date.now();
    const record: ConsentRecord = {
      purpose,
      granted,
      updatedAtMs: now,
      consentedAtMs: granted ? now : this.get(purpose).consentedAtMs,
      revokedAtMs: granted ? null : now,
      documentVersion: CONSENT_DOCUMENTS[purpose].version,
    };
    const prev = this._consents();
    this._consents.set(
      prev.map((c) => (c.purpose === purpose ? record : c))
    );
    return this.api.put<ConsentRecord[]>('/me/consents', [record]).pipe(
      map(() => {
        this.audit?.log(
          granted ? 'consent.grant' : 'consent.revoke',
          'consent',
          purpose,
          {
            documentVersion: record.documentVersion,
            correlationId: `consent-${Date.now().toString(36)}`,
          }
        );
        this.checkReconsent();
        return true;
      }),
      catchError((error) => {
        // Roll back on failure so the UI reflects the saved state.
        this._consents.set(prev);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save consent.'
        );
        return of(false);
      })
    );
  }

  private checkReconsent(): void {
    const needs = ALL_CONSENT_PURPOSES.some((p) => this.needsReconsent(p));
    this.needsReconsentAny.set(needs);
  }
}
