import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditService, AuditEvent } from '../../core/services/audit/audit.service';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import { LocalizedMessage } from '../../core/i18n/localized-message';

/**
 * Admin audit viewer (FEATURE_PLAN.md §16 subtask 11–13).
 * Filters the append-only audit ledger by actor / action / resource / date
 * range, renders a paginated table, exports CSV (self-audit-logged), and
 * displays the tamper-evidence chain-hash status (subtask 13).
 */
@Component({
  selector: 'app-audit-viewer',
  standalone: true,
  imports: [FormsModule, JsonPipe],
  template: `
    <section class="audit-viewer">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('audit.title') }}</h1>
          <p class="page-subtitle">
            {{ i18n.t('audit.showing', { shown: total(), total: allEvents().length }) }}
          </p>
        </div>
        <div class="page-actions">
          <span class="badge outline" [attr.aria-label]="i18n.t('admin.chainLabel')">
            🧾 {{ i18n.t('admin.chain', { hash: chainHash().slice(0, 16) }) }}
          </span>
          @if (total() > 0) {
            <button type="button" class="btn" (click)="exportCsv()">
              {{ i18n.t('audit.exportCsv') }}
            </button>
          }
          <button type="button" class="btn secondary" (click)="refresh()">
            {{ i18n.t('admin.refresh') }}
          </button>
        </div>
      </header>

      @if (error.value()) {
        <p class="error" role="alert">{{ i18n.message(error.source(), error.value()) }}</p>
      }

      <div class="filter-bar" role="group" [attr.aria-label]="i18n.t('audit.filtersLabel')">
        <label class="field">
          <span class="field-label">{{ i18n.t('audit.actor') }}</span>
          <input type="text" [attr.placeholder]="i18n.t('audit.placeholder.actor')"
                 [value]="actorFilter()"
                 (input)="actorFilter.set($any($event.target).value)"
                 [attr.aria-label]="i18n.t('audit.filter.actor')" />
        </label>
        <label class="field">
          <span class="field-label">{{ i18n.t('audit.action') }}</span>
          <input type="text" [attr.placeholder]="i18n.t('audit.placeholder.action')"
                 [value]="actionFilter()"
                 (input)="actionFilter.set($any($event.target).value)"
                 [attr.aria-label]="i18n.t('audit.filter.action')" />
        </label>
        <label class="field">
          <span class="field-label">{{ i18n.t('audit.resource') }}</span>
          <input type="text" [attr.placeholder]="i18n.t('audit.placeholder.resource')"
                 [value]="resourceFilter()"
                 (input)="resourceFilter.set($any($event.target).value)"
                 [attr.aria-label]="i18n.t('audit.filter.resource')" />
        </label>
        <label class="field">
          <span class="field-label">{{ i18n.t('audit.from') }}</span>
          <input type="date"
                 [value]="dateFrom()"
                 (change)="dateFrom.set($any($event.target).value)"
                 [attr.aria-label]="i18n.t('audit.filter.from')" />
        </label>
        <label class="field">
          <span class="field-label">{{ i18n.t('audit.to') }}</span>
          <input type="date"
                 [value]="dateTo()"
                 (change)="dateTo.set($any($event.target).value)"
                 [attr.aria-label]="i18n.t('audit.filter.to')" />
        </label>
        <button type="button" class="btn secondary" (click)="resetFilters()"
          [attr.aria-label]="i18n.t('audit.resetLabel')">
          {{ i18n.t('audit.reset') }}
        </button>
      </div>

      @if (loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else if (filtered().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🧾</span>
          <p>{{ i18n.t('audit.empty') }}</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table events" role="table">
            <thead>
              <tr>
                <th scope="col">{{ i18n.t('audit.col.when') }}</th>
                <th scope="col">{{ i18n.t('audit.actor') }}</th>
                <th scope="col">{{ i18n.t('audit.action') }}</th>
                <th scope="col">{{ i18n.t('audit.resource') }}</th>
                <th scope="col">{{ i18n.t('audit.col.resourceId') }}</th>
                <th scope="col">{{ i18n.t('audit.col.meta') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (event of page(); track event.id) {
                <tr>
                  <td class="nowrap">{{ formatDate(event.atMs) }}</td>
                  <td class="mono">{{ event.actorId }}</td>
                  <td><span class="badge accent">{{ event.action }}</span></td>
                  <td>{{ event.resourceType }}</td>
                  <td class="mono">{{ event.resourceId }}</td>
                  <td><pre>{{ event.meta ? (event.meta | json) : '' }}</pre></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <nav class="pager" role="navigation" [attr.aria-label]="i18n.t('audit.pagesLabel')">
          <button type="button" class="btn secondary sm" [disabled]="pageIndex() === 0" (click)="prevPage()">
            {{ i18n.t('audit.previous') }}
          </button>
          <span class="meta">
            {{ i18n.t('audit.pageOf', { page: pageIndex() + 1, total: totalPages() }) }}
          </span>
          <button
            type="button"
            class="btn secondary sm"
            [disabled]="pageIndex() >= totalPages() - 1"
            (click)="nextPage()"
          >
            {{ i18n.t('common.next') }}
          </button>
        </nav>
      }
    </section>
  `,
  styles: `
    .audit-viewer {
      max-width: 80rem;
    }
    .events {
      font-size: var(--text-xs);
    }
    .events pre {
      margin: 0;
      white-space: pre-wrap;
      max-width: 14rem;
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
    .mono {
      font-family: var(--font-mono);
      word-break: break-all;
    }
    .nowrap {
      white-space: nowrap;
    }
    .pager {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-4);
    }
    .pager .meta {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AuditViewerComponent implements OnInit {
  protected readonly i18n = inject(I18n);

  private readonly audit = inject(AuditService);
  private readonly session = inject(SessionStore);

  readonly loading = signal(false);
  /** Bilingual failure slot (app key, or the server's own text). */
  readonly error = new LocalizedMessage();

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
    this.error.clear();
    this.audit.loadAll().subscribe({
      next: (result) => {
        this._allEvents.set(result.items ?? []);
        this.loading.set(false);
      },
      error: () => {
        // Fallback: merge local + server-side events via the in-memory signal.
        this._allEvents.set(this.audit.events());
        this.loading.set(false);
        this.error.setFromServer(undefined, { key: 'audit.localOnly' });
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
