import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { AuditService } from '../../core/services/audit/audit.service';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalizedMessage } from '../../core/i18n/localized-message';
import {
  ConsentPurpose,
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
  Consent,
} from '../../core/services/audit/consent.store';

interface AdminConsentRow {
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  updatedAtMs: number;
  updatedBy: string;
  documentVersion: string;
}

interface AdminConsentsResponse {
  items: { userId: string; consents: Consent[]; currentDocumentVersion: string }[];
}

@Component({
  selector: 'app-consents-admin',
  standalone: true,
  imports: [],
  template: `
    <section class="consents-admin">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('consentsAdmin.title') }}</h1>
          <p class="page-subtitle">
            {{ i18n.t('consentsAdmin.viewing', { count: filtered().length }) }}
          </p>
        </div>
        <div class="page-actions">
          <span class="badge outline" [attr.aria-label]="i18n.t('admin.chainLabel')">
            🧾 {{ i18n.t('admin.chain', { hash: chainHash().slice(0, 16) }) }}
          </span>
          <button type="button" class="btn secondary" (click)="refresh()">
            {{ i18n.t('admin.refresh') }}
          </button>
        </div>
      </header>

      <div class="filter-bar" role="group" [attr.aria-label]="i18n.t('consentsAdmin.filtersLabel')">
        <label class="field">
          <span class="field-label">{{ i18n.t('consentsAdmin.purpose') }}</span>
          <select [value]="purposeFilter()" (change)="purposeFilter.set($any($event.target).value)">
            <option value="">{{ i18n.t('consentsAdmin.allPurposes') }}</option>
            @for (p of purposes; track p) {
              <option [value]="p">{{ label(p) }}</option>
            }
          </select>
        </label>
        <label class="check">
          <input type="checkbox" [checked]="grantedOnly()" (change)="grantedOnly.set(!grantedOnly())" />
          {{ i18n.t('consentsAdmin.onlyGranted') }}
        </label>
      </div>

      @if (error.value()) {
        <p class="error" role="alert">{{ i18n.message(error.source(), error.value()) }}</p>
      }

      @if (loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🔏</span>
          <p>{{ i18n.t('consentsAdmin.empty') }}</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table consents" role="table">
            <thead>
              <tr>
                <th scope="col">{{ i18n.t('consentsAdmin.col.user') }}</th>
                <th scope="col">{{ i18n.t('consentsAdmin.purpose') }}</th>
                <th scope="col">{{ i18n.t('consentsAdmin.col.status') }}</th>
                <th scope="col">{{ i18n.t('consentsAdmin.col.effective') }}</th>
                <th scope="col">{{ i18n.t('consentsAdmin.col.updatedBy') }}</th>
                <th scope="col">{{ i18n.t('consentsAdmin.col.document') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of filtered(); track row.userId + row.purpose) {
                <tr>
                  <td class="mono">{{ row.userId }}</td>
                  <td>{{ label(row.purpose) }}</td>
                  <td>
                    <span [class]="'badge ' + (row.granted ? 'success' : 'danger')">
                      <span class="dot"></span>
                      {{
                        row.granted ? i18n.t('consentsAdmin.granted') : i18n.t('consentsAdmin.withdrawn')
                      }}
                    </span>
                  </td>
                  <td>{{ formatDate(row.updatedAtMs) }}</td>
                  <td>{{ row.updatedBy || '—' }}</td>
                  <td class="mono">{{ row.documentVersion }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    .consents-admin {
      max-width: 72rem;
    }
    .mono {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      word-break: break-all;
    }
  `,
})
export class ConsentsAdminComponent implements OnInit {
  protected readonly i18n = inject(I18n);

  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionStore);
  private readonly audit = inject(AuditService);

  readonly loading = signal(false);
  /** Bilingual failure slot (app key, or the server's own text). */
  readonly error = new LocalizedMessage();
  readonly purposeFilter = signal('');
  readonly grantedOnly = signal(false);

  readonly chainHash = this.audit.chainHash;
  protected readonly purposes = CONSENT_PURPOSES;

  private readonly _rows = signal<AdminConsentRow[]>([]);
  readonly rows = this._rows.asReadonly();

  readonly totalRows = computed(() => this.rows().length);

  /** The filtered view the table renders (filters are applied here only). */
  readonly filtered = computed(() => {
    const purpose = this.purposeFilter();
    const onlyGranted = this.grantedOnly();
    return this._rows().filter((r) => {
      if (purpose && r.purpose !== purpose) return false;
      if (onlyGranted && !r.granted) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.load();
    // Log the admin access itself.
    this.audit.log('admin.consents.view', 'consent', '', { role: this.session.roles().join(',') });
  }

  load(): void {
    this.loading.set(true);
    this.error.clear();
    this.api.get<AdminConsentsResponse>('/admin/consents').subscribe({
      next: (result) => {
        const rows: AdminConsentRow[] = [];
        for (const item of result.items ?? []) {
          for (const c of item.consents) {
            rows.push({
              userId: item.userId,
              purpose: c.purpose,
              granted: c.granted,
              updatedAtMs: c.updatedAtMs,
              updatedBy: c.updatedBy,
              documentVersion: c.documentVersion,
            });
          }
        }
        this._rows.set(rows.sort((a, b) => b.updatedAtMs - a.updatedAtMs));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.setFromServer(undefined, { key: 'consentsAdmin.loadFailed' });
      },
    });
  }

  refresh(): void {
    this.purposeFilter.set('');
    this.grantedOnly.set(false);
    this.load();
  }

  /** Purpose label, in the language the admin is actually reading. */
  label(purpose: ConsentPurpose): string {
    return CONSENT_PURPOSE_LABELS[purpose][this.i18n.language()];
  }

  formatDate(ms: number): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
