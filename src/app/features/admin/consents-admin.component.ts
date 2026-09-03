import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';
import { AuditService } from '../../core/services/audit/audit.service';
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
      <h1>Consent oversight</h1>

      <p class="meta">
        Viewing {{ totalRows() }} consent records across all users.
        <span class="chain" aria-label="Chain hash">
          Chain: {{ chainHash().slice(0, 16) }}…
        </span>
      </p>

      <div class="filters" role="group" aria-label="Consent filters">
        <label>
          Purpose
          <select [value]="purposeFilter()" (change)="purposeFilter.set($event.target.value)">
            <option value="">All purposes</option>
            @for (p of purposes; track p) {
              <option [value]="p">{{ label(p) }}</option>
            }
          </select>
        </label>
        <label>
          Only granted
          <input type="checkbox" [checked]="grantedOnly()" (change)="grantedOnly.set(!grantedOnly())" />
        </label>
      </div>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (rows().length === 0) {
        <p>No consent records found.</p>
      } @else {
        <table class="consents" role="table">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Purpose</th>
              <th scope="col">Status</th>
              <th scope="col">Effective date</th>
              <th scope="col">Updated by</th>
              <th scope="col">Document</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.userId + row.purpose) {
              <tr>
                <td>{{ row.userId }}</td>
                <td>{{ label(row.purpose) }}</td>
                <td>
                  <span class="chip" [class.ok]="row.granted" [class.bad]="!row.granted">
                    {{ row.granted ? 'granted' : 'withdrawn' }}
                  </span>
                </td>
                <td>{{ formatDate(row.updatedAtMs) }}</td>
                <td>{{ row.updatedBy || '—' }}</td>
                <td>{{ row.documentVersion }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      <div class="actions">
        <button type="button" (click)="refresh()">Refresh</button>
      </div>
    </section>
  `,
  styles: `
    .consents-admin { max-width: 64rem; }
    .meta { color: var(--text-muted); font-size: 0.85rem; }
    .chain { font-family: monospace; float: right; }
    .filters { display: flex; gap: 1rem; align-items: center; margin: 1rem 0; }
    .filters label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.85rem; }
    table.consents { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border, #d9dee7); font-size: 0.85rem; }
    th { font-weight: 600; }
    .chip.ok { background: var(--success, #1d7a3d); color: #fff; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.75rem; }
    .chip.bad { background: var(--danger, #c62828); color: #fff; border-radius: 999px; padding: 0.05rem 0.5rem; font-size: 0.75rem; }
    .actions { margin-top: 1rem; }
  `,
})
export class ConsentsAdminComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionStore);
  private readonly audit = inject(AuditService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly purposeFilter = signal('');
  readonly grantedOnly = signal(false);

  readonly chainHash = this.audit.chainHash;
  protected readonly purposes = CONSENT_PURPOSES;

  private readonly _rows = signal<AdminConsentRow[]>([]);
  readonly rows = this._rows.asReadonly();

  readonly totalRows = computed(() => this.rows().length);

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
    this.error.set('');
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
        this.error.set('Could not load consent oversight data. Please try again.');
      },
    });
  }

  refresh(): void {
    this.purposeFilter.set('');
    this.grantedOnly.set(false);
    this.load();
  }

  label(purpose: ConsentPurpose): string {
    return CONSENT_PURPOSE_LABELS[purpose].en;
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
