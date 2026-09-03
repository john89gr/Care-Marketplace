import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Gov.gr Health Wallet categories (PLAN.md §3.D / FEATURE_PLAN.md §15
 * subtask 6). The four document families synced from the Gov.gr wallet.
 */
export type WalletCategory = 'vaccinations' | 'prescriptions' | 'exams' | 'kepa_certificates';

/** A single document in the citizen's Gov.gr Health Wallet. */
export interface WalletDocument {
  id: string;
  userId: string;
  category: WalletCategory;
  title: string;
  issuer: string;
  issuedAtMs: number;
  expiresAtMs: number | null;
  /** 'pdf' | 'image' — drives the viewer's object-URL rendering path. */
  docType: 'pdf' | 'image';
  /** Embedded data URL (demo only); never persisted to localStorage. */
  dataUrl: string;
  /** Whether Gov.gr has cryptographically verified the document. */
  verified: boolean;
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

/** Category order used by the page tabs (feature list, stable ordering). */
export const WALLET_CATEGORIES: WalletCategory[] = [
  'vaccinations',
  'prescriptions',
  'exams',
  'kepa_certificates',
];

/**
 * Gov.gr Health Wallet sync engine (FEATURE_PLAN.md §15 subtasks 8, 10, 11):
 *
 *   GET /me/wallet                → all documents for the user
 *   GET /me/wallet?category=…     → per-category refresh (sync contract)
 *
 * The store is a pull → diff → store engine: the API response is merged into
 * local state **idempotently by document id** — re-syncing the same payload
 * never duplicates or reorders entries. Documents are kept in-memory only
 * (never written to localStorage) per the encrypted-at-rest contract
 * (FEATURE_PLAN.md §15 subtask 11 + PLAN.md §4 GDPR).
 */
@Injectable({ providedIn: 'root' })
export class WalletStore {
  // Default-parameter injection keeps `new WalletStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _documents = signal<WalletDocument[]>([]);
  private readonly _loading = signal(false);
  private readonly _syncState = signal<SyncState>('idle');
  private readonly _syncingCategory = signal<WalletCategory | null>(null);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  /** Per-category last-sync epoch; 0 = never synced. */
  private readonly _lastSynced = signal<Record<WalletCategory, number>>({
    vaccinations: 0,
    prescriptions: 0,
    exams: 0,
    kepa_certificates: 0,
  });

  readonly documents = this._documents.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly syncState = this._syncState.asReadonly();
  readonly syncingCategory = this._syncingCategory.asReadonly();
  readonly error = this._error.asReadonly();
  /** True once the wallet has been loaded at least once. */
  readonly loaded = this._loaded.asReadonly();
  readonly lastSynced = this._lastSynced.asReadonly();

  /** Documents grouped by category (computed, read-only view). */
  readonly byCategory = computed<Record<WalletCategory, WalletDocument[]>>(() => {
    const grouped: Record<WalletCategory, WalletDocument[]> = {
      vaccinations: [],
      prescriptions: [],
      exams: [],
      kepa_certificates: [],
    };
    for (const doc of this._documents()) {
      grouped[doc.category].push(doc);
    }
    return grouped;
  });

  /** Document count per category — handy for tab badges. */
  readonly counts = computed<Record<WalletCategory, number>>(() => {
    const counts = { vaccinations: 0, prescriptions: 0, exams: 0, kepa_certificates: 0 };
    for (const doc of this._documents()) {
      counts[doc.category] += 1;
    }
    return counts;
  });

  /** Documents for one category, newest first. */
  docsFor(category: WalletCategory): WalletDocument[] {
    return this._documents().filter((d) => d.category === category);
  }

  /** Human-readable sync age for a category tab. */
  syncAgeMs(category: WalletCategory): number {
    const ts = this._lastSynced()[category];
    return ts === 0 ? -1 : Date.now() - ts;
  }

  /**
   * Full wallet sync (pull → diff → store, idempotent by document id).
   * Returns true on success, false on error (check `error()` for details).
   */
  sync(): Observable<boolean> {
    return this._syncCategory(null);
  }

  /**
   * Per-category refresh. Passing a category hits
   * `GET /me/wallet?category=…` and updates the per-category
   * last-synced timestamp.
   */
  syncCategory(category: WalletCategory): Observable<boolean> {
    return this._syncCategory(category);
  }

  private _syncCategory(category: WalletCategory | null): Observable<boolean> {
    this._syncState.set('syncing');
    this._syncingCategory.set(category);
    this._error.set('');
    const url = category ? `/me/wallet?category=${encodeURIComponent(category)}` : '/me/wallet';
    return this.api.get<{ documents: WalletDocument[] }>(url).pipe(
      map((payload) => {
        const incoming = payload.documents ?? [];
        this._upsertAll(incoming, category);
        this._loaded.set(true);
        this._syncState.set('synced');
        this._syncingCategory.set(null);
        return true;
      }),
      catchError((error) => {
        this._syncState.set('error');
        this._syncingCategory.set(null);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not sync your health wallet. Please try again.'
        );
        return of(false);
      })
    );
  }

  /**
   * Diff → store: idempotent by document id. Documents with matching ids are
   * replaced in place; new ids are appended. When a category is specified,
   * only that category's slice is reconciled (other categories are left
   * untouched), which keeps per-category refreshes from wiping unrelated data.
   * Health documents are kept in-memory signals only — never persisted to
   * localStorage (FEATURE_PLAN.md §15 subtask 11).
   */
  private _upsertAll(incoming: WalletDocument[], category: WalletCategory | null): void {
    const existing = this._documents();
    const keep = category ? existing.filter((d) => d.category !== category) : [];
    const byId = new Map<string, WalletDocument>();
    for (const doc of keep) {
      byId.set(doc.id, doc);
    }
    for (const doc of incoming) {
      byId.set(doc.id, doc);
    }
    this._documents.set(Array.from(byId.values()));

    const now = Date.now();
    if (category) {
      this._lastSynced.update((ts) => ({ ...ts, [category]: now }));
    } else {
      this._lastSynced.set({
        vaccinations: now,
        prescriptions: now,
        exams: now,
        kepa_certificates: now,
      });
    }
  }
}
