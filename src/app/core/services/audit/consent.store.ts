import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../api/api.client';
import { SessionStore } from '../../auth/session';

/**
 * Consent management (FEATURE_PLAN.md §16 subtasks 6–10, 15).
 *
 * Consents are tracked per *purpose*: the user can grant or withdraw each one
 * independently, and enforcement points across the app consult the store (or
 * the pure `isConsentGranted` / `canPerformAction` helpers) before sharing
 * personal health data.
 *
 * API contract (subtask 7):
 *   GET  /me/consents            -> ConsentState
 *   PUT  /me/consents            -> ConsentState  (full replacement)
 *
 * A versioned consent document backs each purpose so the re-consent flow
 * (subtask 10) can detect when a document version has changed since the user
 * last agreed.
 */

/** Each consent purpose governs a distinct data-sharing behaviour. */
export type ConsentPurpose =
  | 'family_sharing'
  | 'sms_reminders'
  | 'bluetooth'
  | 'data_export';

/** All recognised purposes, in display order. */
export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  'family_sharing',
  'sms_reminders',
  'bluetooth',
  'data_export',
];

/** Bilingual labels (subtask 9: Greek + English, matching the export page). */
export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, { en: string; el: string }> =
  {
    family_sharing: { en: 'Family & caregiver sharing', el: 'Κοινοχρησία με την οικογένεια' },
    sms_reminders: { en: 'SMS reminders', el: 'Υπενθυμίσεις μέσω SMS' },
    bluetooth: { en: 'Bluetooth device pairing', el: 'Σύνδεση συσκευής Bluetooth' },
    data_export: { en: 'Health data export (PDF/FHIR)', el: 'Εξαγωγή υγειονομικών δεδομένων' },
  };

/** A versioned consent document the user signs. */
export interface ConsentDocument {
  version: string;
  /** Human-readable URL for the document (displayed in the consent UI). */
  url: string;
  effectiveAtMs: number;
}

/** A single user consent record. */
export interface Consent {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Version of the consent document the user agreed to. */
  documentVersion: string;
  /** Who/when set the current state (for audit trail / withdrawal). */
  updatedAtMs: number;
  updatedBy: string;
}

/** Full consent state for one user. */
export interface ConsentState {
  userId: string;
  consents: Consent[];
  /** Most recent document version the user was shown. */
  currentDocumentVersion: string;
}

/**
 * Enforcement matrix (subtask 9 + 15): maps a *resource access action* to the
 * consent purpose that gates it. Returns `null` when no consent is required.
 *
 * "view" = reading another party's health data (family sharing).
 * "share" = explicitly sharing data with a third party.
 * "export" = generating a FHIR bundle or PDF summary.
 */
export const CONSENT_ENFORCEMENT: Record<string, ConsentPurpose> = {
  'vitals.view_family': 'family_sharing',
  'vitals.share_caregiver': 'family_sharing',
  'medications.view_family': 'family_sharing',
  'reminder.sms': 'sms_reminders',
  'bluetooth.pair': 'bluetooth',
  'export.pdf': 'data_export',
  'export.fhir': 'data_export',
};

/**
 * Returns the consent purpose required for an action, or `null` when the
 * action does not require consent (open for all users).
 */
export function consentRequiredFor(action: string): ConsentPurpose | null {
  return CONSENT_ENFORCEMENT[action] ?? null;
}

/** True when `consents` contains an active (granted) entry for `purpose`. */
export function isConsentGranted(
  consents: readonly Consent[],
  purpose: ConsentPurpose
): boolean {
  const c = consents.find((c) => c.purpose === purpose);
  return c?.granted ?? false;
}

/**
 * Enforcement check (subtask 9): can the actor perform `action` given the
 * current consent set? Actions with no entry in the matrix are always allowed.
 */
export function canPerformAction(
  consents: readonly Consent[],
  action: string
): boolean {
  const required = consentRequiredFor(action);
  if (required === null) {
    return true;
  }
  return isConsentGranted(consents, required);
}

const STORAGE_KEY = 'cm.consents.v1';

function readLocal(): Consent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Consent[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(consents: Consent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consents));
  } catch {
    // Storage unavailable — consents stay in memory only.
  }
}

const DEFAULT_DOCUMENT_VERSION = 'v1.0';

@Injectable({ providedIn: 'root' })
export class ConsentStore {
  // Default-parameter injection keeps `new ConsentStore(api, session)` possible
  // in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly session: SessionStore = inject(SessionStore)
  ) {}

  private readonly _consents = signal<Consent[]>(readLocal());
  private readonly _loading = signal(false);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  private readonly _documentVersion = signal(DEFAULT_DOCUMENT_VERSION);

  readonly consents = this._consents.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly documentVersion = this._documentVersion.asReadonly();

  /** Consent record per purpose (defaults to not-granted for unasked purposes). */
  readonly byPurpose = computed<Record<string, Consent>>(() => {
    const map: Record<string, Consent> = {};
    const current = this._documentVersion();
    for (const purpose of CONSENT_PURPOSES) {
      const existing = this._consents().find((c) => c.purpose === purpose);
      if (existing) {
        map[purpose] = existing;
      } else {
        // Not yet asked → not granted, but with the current document version
        // so the UI can pre-fill a "grant" action.
        map[purpose] = {
          purpose,
          granted: false,
          documentVersion: current,
          updatedAtMs: 0,
          updatedBy: '',
        };
      }
    }
    return map;
  });

  /** True for purposes whose document version is behind the current one. */
  readonly stalePurposes = computed<ConsentPurpose[]>(() => {
    const current = this._documentVersion();
    return this._consents()
      .filter((c) => c.granted && c.documentVersion !== current)
      .map((c) => c.purpose as ConsentPurpose);
  });

  /** True when at least one granted consent needs re-consent (version bump). */
  readonly needsReConsent = computed(() => this.stalePurposes().length > 0);

  load(): Observable<boolean> {
    if (this._loaded()) {
      return of(true);
    }
    this._loading.set(true);
    this._error.set('');
    return this.api.get<ConsentState>('/me/consents').pipe(
      map((state) => {
        const list = state?.consents ?? [];
        this._consents.set(list);
        this._documentVersion.set(state?.currentDocumentVersion ?? DEFAULT_DOCUMENT_VERSION);
        this._loaded.set(true);
        this._loading.set(false);
        writeLocal(list);
        return true;
      }),
      catchError((error) => {
        this._loading.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not load your consent settings.'
        );
        return of(false);
      })
    );
  }

  /** Grant or withdraw a single purpose (subtask 7: PUT /me/consents). */
  update(purpose: ConsentPurpose, granted: boolean): Observable<boolean> {
    const me = this.session.session();
    const current = this._consents();
    const existing = current.find((c) => c.purpose === purpose);
    const replacement: Consent = {
      purpose,
      granted,
      documentVersion: this._documentVersion(),
      updatedAtMs: Date.now(),
      updatedBy: me?.userId ?? 'me',
    };
    const next: Consent[] = existing
      ? current.map((c) => (c.purpose === purpose ? replacement : c))
      : [...current, replacement];
    this._error.set('');
    return this.api.put<ConsentState>('/me/consents', {
      userId: me?.userId ?? 'me',
      consents: next,
      currentDocumentVersion: this._documentVersion(),
    }).pipe(
      map((state) => {
        this._consents.set(state?.consents ?? next);
        this._documentVersion.set(state?.currentDocumentVersion ?? this._documentVersion());
        writeLocal(this._consents());
        return true;
      }),
      catchError((error) => {
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not save your consent settings. Please try again.'
        );
        return of(false);
      })
    );
  }

  /** Convenience: is a single purpose currently granted? */
  isGranted(purpose: ConsentPurpose): boolean {
    return isConsentGranted(this._consents(), purpose);
  }

  /** Enforcement point (subtask 9): check whether `action` is allowed now. */
  canPerform(action: string): boolean {
    return canPerformAction(this._consents(), action);
  }
}
