import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditService, AuditEvent } from '../../core/services/audit/audit.service';
import { SessionStore } from '../../core/auth/session';

/**
 * Admin audit viewer (FEATURE_PLAN.md §16 subtask 11–13).
 * Filters the append-only audit ledger by actor / action / resource / date
 * range, renders a paginated table, exports CSV (self-audit-logged), and
 * displays the tamper-evidence chain-hash status (subtask 13).
 */
@Component({
  selector: 'app-audit-viewer',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="audit-viewer">
      <h1>Audit trail</h1>

      <p class="meta">
        Showing {{ total() }} of {{ allEvents().length }} events.
        <span class="chain" aria-label="Chain hash">
          Chain: {{ chainHash().slice(0, 16) }}…
        </span>
      </p>

      <div class="filters" role="group" aria-label="Audit filters">
        <label>
          Actor
          <input type="text" placeholder="actor id"
                 [value]="actorFilter()"
                 (input)="actorFilter.set($event.target.value)"
                 aria-label="Filter by actor id" />
        </label>
        <label>
          Action
          <input type="text" placeholder="e.g. vitals.view"
                 [value]="actionFilter()"
                 (input)="actionFilter.set($event.target.value)"
                 aria-label="Filter by action" />
        </label>
        <label>
          Resource
          <input type="text" placeholder="e.g. vital-reading"
                 [value]="resourceFilter()"
                 (input)="resourceFilter.set($event.target.value)"
                 aria-label="Filter by resource type" />
        </label>
        <label>
          From
          <input type="date"
                 [value]="dateFrom()"
                 (change)="dateFrom.set($event.target.value)"
                 aria-label="Filter by date from" />
        </label>
        <label>
          To
          <input type="date"
                 [value]="dateTo()"
                 (change)="dateTo.set($event.target.value)"
                 aria-label="Filter by date to" />
        </label>
        <button type="button" (click)="resetFilters()" aria-label="Reset filters">Reset</button>
      </div>

      @if (filtered().length === 0) {
        <p class="meta">No audit events match the current filters.</p>
      } @else {
        <table class="events" role="table">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Actor</th>
              <th scope="col">Action</th>
              <th scope="col">Resource</th>
              <th scope="col">Resource ID</th>
              <th scope="col">Meta</th>
            </tr>
          </thead>
          <tbody>
            @for (event of page(); track event.id) {
              <tr>
                <td>{{ formatDate(event.atMs) }}</td>
                <td>{{ event.actorId }}</td>
                <td>{{ event.action }}</td>
                <td>{{ event.resourceType }}</td>
                <td>{{ event.resourceId }}</td>
                <td><pre>{{ event.meta ? (event.meta | json) : '' }}</pre></td>
              </tr>
            }
          </tbody>
        </table>

        <nav class="pager" role="navigation" aria-label="Audit pages">
          <button type="button" [disabled]="pageIndex() === 0" (click)="prevPage()">Previous</button>
          <span class="meta">Page {{ pageIndex() + 1 }} of {{ totalPages() }}</span>
          <button type="button" [disabled]="pageIndex() >= totalPages() - 1" (click)="nextPage()">Next</button>
        </nav>
      }

      <div class="actions">
        @if (total() > 0) {
          <button type="button" class="primary" (click)="exportCsv()">Export CSV</button>
        }
        <button type="button" (click)="refresh()">Refresh</button>
      </div>
    </section>
  `,
  styles: `
    .audit-viewer { max-width: 72rem; }
    .meta { color: var(--text-muted); font-size: 0.85rem; }
    .chain { font-family: monospace; float: right; }
    .filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 1rem 0; }
    .filters label { display: grid; gap: 0.2rem; font-size: 0.85rem; }
    .filters input { min-height: 44px; font-size: 0.9rem; }
    .filters button { min-height: 44px; }
    table.events { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.85rem; }
    th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border, #d9dee7); }
    th { font-weight: 600; }
    td pre { margin: 0; white-space: pre-wrap; max-width: 12rem; font-size: 0.75rem; }
    .pager { display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0; }
    .pager button { min-height: 44px; }
    .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
    button.primary { background: var(--accent, #4f7cff); color: #fff; border-color: transparent; font-weight: 600; }
  `,
})
export class AuditViewerComponent implements OnInit {
  private readonly audit = inject(AuditService);
  private readonly session = inject(SessionStore);

  readonly loading = signal(false);
  readonly error = signal('');

  readonly actorFilter = signal('');
  readonly actionFilter = signal('');
  readonly resourceFilter = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly pageSize = signal(25);
  readonly pageIndex = signal(0);

  private readonly _allEvents = signal<AuditEvent[]>([]);
  readonly allEvents = this._allEvents.asReadonly();

  readonly filtered = computed(() => {
    const from = this.dateFrom() ? new Date(this.dateFrom()).getTime() : null;
    const to = this.dateTo() ? new Date(this.dateTo()).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const actor = this.actorFilter().trim().toLowerCase();
    const action = this.actionFilter().trim().toLowerCase();
    const resource = this.resourceFilter().trim().toLowerCase();
    return this._allEvents().filter((e) => {
      if (from !== null && e.atMs < from) return false;
      if (to !== null && e.atMs > to) return false;
      if (actor && !e.actorId.toLowerCase().includes(actor)) return false;
      if (action && !e.action.toLowerCase().includes(action)) return false;
      if (resource && !e.resourceType.toLowerCase().includes(resource)) return false;
      return true;
    });
  });

  readonly total = computed(() => this.filtered().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  readonly chainHash = this.audit.chainHash;

  ngOnInit(): void {
    this.load();
    // Log the admin access itself (subtask 12: access itself is audit-logged).
    this.audit.log('admin.audit.view', 'audit', '', { role: this.session.roles().join(',') });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.audit.loadAll().subscribe({
      next: (result) => {
        this._allEvents.set(result.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        // Fallback: merge local + server-side events via the in-memory signal.
        this._allEvents.set(this.audit.events());
        this.loading.set(false);
        this.error.set('Showing local audit log only — the server list could not be loaded.');
      },
    });
  }

  refresh(): void {
    this.pageIndex.set(0);
    this.load();
  }

  resetFilters(): void {
    this.actorFilter.set('');
    this.actionFilter.set('');
    this.resourceFilter.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.pageIndex.set(0);
  }

  prevPage(): void {
    this.pageIndex.update((i) => Math.max(0, i - 1));
  }

  nextPage(): void {
    this.pageIndex.update((i) => Math.min(this.totalPages() - 1, i + 1));
  }

  exportCsv(): void {
    const csv = this.audit.toCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // The export itself is audit-logged (subtask 12).
    this.audit.log('audit.exportCsv', 'audit', '', { count: this.total(), purpose: 'admin.audit.export' });
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
