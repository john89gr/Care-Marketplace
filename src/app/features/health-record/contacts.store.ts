import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { AuditService } from '../../core/services/audit/audit.service';
import {
  ContactDraft,
  ContactKind,
  MedicalContact,
  contactsOfKind,
  primaryEmergency,
  withSinglePrimary,
} from './contacts.models';

/**
 * Contact phone manager store (FEATURE_PLAN.md — contact phone manager):
 * ICEM/care-team directory with lazy load, CRUD (optimistic add + rollback),
 * soft-archive (never hard-delete) and a single-primary rule per kind. Shares
 * the read-only RBAC flag with the other PHR stores (family roles read).
 * Every read/write is instrumented through the optional AuditService.
 *
 * Paths mirror the server router: `GET/POST /me/contacts`,
 * `PATCH /me/contacts/:id` (soft-archive via `{ archived: true }`).
 */

const CONTACTS_PATH = '/me/contacts';

@Injectable({ providedIn: 'root' })
export class ContactsStore {
  // Default-parameter injection keeps `new ContactsStore(api, audit)` possible
  // in unit tests while remaining DI-friendly in the app (codebase convention).
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly audit?: AuditService
  ) {}

  private readonly _contacts = signal<MedicalContact[]>([]);
  private readonly _loading = signal(false);
  private readonly _actingKey = signal<string | null>(null);
  private readonly _error = signal('');
  private readonly _loaded = signal(false);
  private readonly _readOnly = signal(false);

  readonly contacts = this._contacts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly actingKey = this._actingKey.asReadonly();
  readonly error = this._error.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly readOnly = this._readOnly.asReadonly();

  /** Ordered, non-archived contacts of a kind. */
  list(kind: ContactKind): MedicalContact[] {
    return contactsOfKind(this._contacts(), kind);
  }

  /** First-to-call emergency contact (primary, else highest priority). */
  primaryEmergency(): MedicalContact | null {
    return primaryEmergency(this._contacts());
  }

  load(): Observable<boolean> {
    this._loading.set(true);
    this._error.set('');
    return this.api.get<MedicalContact[]>(CONTACTS_PATH).pipe(
      map((items) => {
        this._contacts.set(items ?? []);
        this._loading.set(false);
        this._loaded.set(true);
        this.audit?.log('contacts.view', 'contacts', 'me', {
          count: items?.length ?? 0,
          correlationId: `contacts-load-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._loading.set(false);
        this._error.set(this.message(error, 'Could not load your contacts. Please try again.'));
        return of(false);
      })
    );
  }

  /** Add a contact (optimistic: renders instantly, rolled back on error). */
  add(draft: ContactDraft): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    this._error.set('');
    this._actingKey.set('new');
    const optimisticId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic: MedicalContact = {
      ...draft,
      id: optimisticId,
      archived: false,
      createdAtMs: Date.now(),
    };
    this._contacts.update((all) =>
      draft.isPrimary ? withSinglePrimary([optimistic, ...all], draft.kind, optimisticId) : [optimistic, ...all]
    );
    return this.api.post<MedicalContact>(CONTACTS_PATH, draft).pipe(
      map((created) => {
        this._contacts.update((all) =>
          all.map((c) => (c.id === optimisticId ? created : c))
        );
        this._actingKey.set(null);
        this.audit?.log('contacts.create', 'contacts', created.id, {
          correlationId: `contacts-add-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._contacts.update((all) => all.filter((c) => c.id !== optimisticId));
        this._actingKey.set(null);
        this._error.set(this.message(error, 'Could not save this contact. Please try again.'));
        return of(false);
      })
    );
  }

  /** Partial update (rename, re-phone, change priority…). */
  update(id: string, patch: Partial<ContactDraft>): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    this._actingKey.set(id);
    this._error.set('');
    return this.api.patch<MedicalContact>(`${CONTACTS_PATH}/${encodeURIComponent(id)}`, patch).pipe(
      map((updated) => {
        this._contacts.update((all) => all.map((c) => (c.id === id ? updated : c)));
        this._actingKey.set(null);
        this.audit?.log('contacts.update', 'contacts', id, {
          ...(patch as object),
          correlationId: `contacts-update-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._actingKey.set(null);
        this._error.set(this.message(error, 'Could not update this contact.'));
        return of(false);
      })
    );
  }

  /** Soft-archive (never hard-delete — audit-friendly). */
  archive(id: string): Observable<boolean> {
    return this.update(id, { archived: true } as Partial<ContactDraft>);
  }

  /**
   * Make one contact the primary of its kind. Applies the demotion locally
   * first (optimistic) and rolls back the whole list on failure.
   */
  setPrimary(id: string): Observable<boolean> {
    if (this.rejectWhenReadOnly()) {
      return of(false);
    }
    const before = this._contacts();
    const target = before.find((c) => c.id === id);
    if (!target) {
      return of(false);
    }
    this._actingKey.set(id);
    this._error.set('');
    this._contacts.set(withSinglePrimary(before, target.kind, id));
    return this.api.patch<MedicalContact>(`${CONTACTS_PATH}/${encodeURIComponent(id)}`, { isPrimary: true }).pipe(
      map((updated) => {
        this._contacts.update((all) => all.map((c) => (c.id === id ? updated : c)));
        this._actingKey.set(null);
        this.audit?.log('contacts.setPrimary', 'contacts', id, {
          correlationId: `contacts-primary-${Date.now().toString(36)}`,
        });
        return true;
      }),
      catchError((error) => {
        this._contacts.set(before);
        this._actingKey.set(null);
        this._error.set(this.message(error, 'Could not set the primary contact.'));
        return of(false);
      })
    );
  }

  /** Mark this store read-only for family roles. */
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

  private message(error: unknown, fallback: string): string {
    return (
      (error as { error?: { message?: string } })?.error?.message ??
      (error as { message?: string })?.message ??
      fallback
    );
  }
}
