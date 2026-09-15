import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { VettingStore, LicenceSubmission } from '../vetting/vetting.store';
import { ReviewsStore, Review } from '../marketplace/reviews.store';
import {
  certificationStatus,
  CertificationStatus,
  daysUntilExpiry,
} from '../../core/services/integrations/certification-status';
import { I18n } from '../../core/i18n/i18n.service';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Badge tone per certification status (the label carries the meaning). */
const CERT_TONES: Record<CertificationStatus, string> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [],
  template: `
    <section class="admin">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('admin.title') }}</h1>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card warning">
          <span class="stat-label">{{ i18n.t('admin.vettingQueue') }}</span>
          <span class="stat-value">{{ pending().length }}</span>
        </div>
        <div class="stat-card info">
          <span class="stat-label">{{ i18n.t('admin.certExpiry') }}</span>
          <span class="stat-value">{{ expiring().length }}</span>
        </div>
        <div class="stat-card danger">
          <span class="stat-label">{{ i18n.t('admin.flaggedReviews') }}</span>
          <span class="stat-value">{{ reviewStore.flagged().length }}</span>
        </div>
      </div>

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">{{ i18n.t('admin.vettingQueue') }}</h2>
        </div>

        @if (store.loading()) {
          <div class="grid grid-2" aria-hidden="true">
            <div class="skeleton block"></div>
            <div class="skeleton block"></div>
          </div>
        } @else if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        } @else if (pending().length === 0) {
          <div class="empty-state">
            <span class="empty-icon" aria-hidden="true">✅</span>
            <p>{{ i18n.t('admin.vettingEmpty') }}</p>
          </div>
        } @else {
          <ul class="results">
            @for (submission of pending(); track submission.id) {
              <li class="card interactive">
                <div class="row">
                  <div>
                    <h3>{{ submission.providerName }}</h3>
                    <p class="meta">
                      {{
                        i18n.t('admin.licenceSubmitted', {
                          licence: submission.licenceNumber,
                          date: formatDate(submission.submittedAtMs),
                        })
                      }}
                    </p>
                  </div>
                  <span class="badge warning"><span class="dot"></span>{{ i18n.t('admin.pending') }}</span>
                </div>

                <p class="roles">
                  @for (specialty of submission.specialties; track specialty) {
                    <span class="badge accent">{{ specialty }}</span>
                  }
                </p>

                @if (submission.note) {
                  <p class="meta">{{ i18n.t('admin.note', { note: submission.note }) }}</p>
                }

                <div class="card-actions">
                  <button type="button" class="btn" (click)="review(submission, 'approved')">
                    {{ i18n.t('admin.approve') }}
                  </button>
                  <button
                    type="button"
                    class="btn secondary"
                    (click)="review(submission, 'rejected')"
                  >
                    {{ i18n.t('admin.reject') }}
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      @if (reviewed().length > 0) {
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('admin.recentlyReviewed') }}</h2>
          </div>
          <ul class="results">
            @for (submission of reviewed(); track submission.id) {
              <li class="card">
                <div class="row">
                  <div>
                    <h3>{{ submission.providerName }}</h3>
                    <p class="meta">
                      {{
                        i18n.t('admin.licenceReviewed', {
                          licence: submission.licenceNumber,
                          date: formatDate(submission.reviewedAtMs ?? submission.submittedAtMs),
                        })
                      }}
                    </p>
                  </div>
                  <span [class]="'badge ' + (submission.status === 'approved' ? 'success' : 'danger')">
                    <span class="dot"></span>{{ submission.status }}
                  </span>
                </div>
              </li>
            }
          </ul>
        </section>
      }

      <section class="section">
        <div class="section-header">
          <h2 class="section-title">{{ i18n.t('admin.certExpiry') }}</h2>
        </div>

        <div class="filter-bar cert-filter">
          <label class="field">
            <span class="field-label">{{ i18n.t('admin.show') }}</span>
            <select [value]="certFilter()" (change)="setCertFilter($any($event.target).value)">
              <option value="expiring_soon">{{ i18n.t('admin.certStatus.expiringSoon') }}</option>
              <option value="expired">{{ i18n.t('admin.certStatus.expired') }}</option>
              <option value="valid">{{ i18n.t('admin.certStatus.valid') }}</option>
              <option value="all">{{ i18n.t('common.all') }}</option>
            </select>
          </label>
        </div>

        @if (expiring().length === 0) {
          <div class="empty-state">
            <span class="empty-icon" aria-hidden="true">🛡️</span>
            <p>{{ i18n.t('admin.certEmpty') }}</p>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table expiry" role="table">
              <caption class="cert-caption">{{ i18n.t('admin.certCaption') }}</caption>
              <thead>
                <tr>
                  <th scope="col">{{ i18n.t('admin.col.provider') }}</th>
                  <th scope="col">{{ i18n.t('admin.col.licence') }}</th>
                  <th scope="col">{{ i18n.t('admin.col.expires') }}</th>
                  <th scope="col">{{ i18n.t('admin.col.daysLeft') }}</th>
                  <th scope="col">{{ i18n.t('admin.col.status') }}</th>
                  <th scope="col">{{ i18n.t('admin.col.certs') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (submission of expiring(); track submission.id) {
                  <tr>
                    <td>{{ submission.providerName }}</td>
                    <td class="mono">{{ submission.licenceNumber }}</td>
                    <td>{{ submission.expiresAtMs ? formatDate(submission.expiresAtMs) : '—' }}</td>
                    <td class="num">{{ daysOf(submission) ?? '—' }}</td>
                    <td>
                      <span [class]="'badge ' + certTone(submission)">
                        <span class="dot"></span>{{ certStatusLabel(submission) }}
                      </span>
                    </td>
                    <td>
                      @for (cert of submission.certifications; track cert.id) {
                        <span class="badge outline">
                          {{ cert.name }} ·
                          {{ cert.expiresAtMs ? formatDate(cert.expiresAtMs) : i18n.t('admin.noExpiry') }}
                        </span>
                      } @empty {
                        <span class="meta">{{ i18n.t('admin.certsNone') }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      @if (reviewStore.flagged().length > 0) {
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('admin.flaggedReviews') }}</h2>
          </div>
          <ul class="results">
            @for (review of reviewStore.flagged(); track review.id) {
              <li class="card">
                <div class="row">
                  <div>
                    <h3>{{ review.authorName }} · ★ {{ review.rating }}</h3>
                    <p class="meta">{{ review.comment }}</p>
                  </div>
                  <span class="badge danger"><span class="dot"></span>{{ i18n.t('admin.flagged') }}</span>
                </div>
                <div class="card-actions">
                  <button type="button" class="btn"
                    [disabled]="reviewStore.actingId() === review.id"
                    (click)="moderate(review, 'published')">
                    {{ i18n.t('admin.publish') }}
                  </button>
                  <button type="button" class="btn secondary"
                    [disabled]="reviewStore.actingId() === review.id"
                    (click)="moderate(review, 'removed')">
                    {{ i18n.t('admin.removeReview') }}
                  </button>
                </div>
              </li>
            }
          </ul>
        </section>
      }
    </section>
  `,
  styles: `
    .row {
      align-items: center;
    }
    .row h3 {
      margin: 0 0 0.15rem;
      font-size: var(--text-md);
    }
    .row .meta {
      margin: 0;
    }
    .roles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin: var(--space-2) 0 0;
    }
    .cert-filter {
      max-width: 22rem;
    }
    .cert-caption {
      padding: var(--space-3) var(--space-3) 0;
      text-align: left;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    .expiry td.mono {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
    }
    .expiry td.num {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class AdminPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(VettingStore);
  readonly reviewStore = inject(ReviewsStore);

  readonly pending = computed(() => this.store.queue().filter((s) => s.status === 'pending'));
  readonly reviewed = computed(() =>
    this.store
      .queue()
      .filter((s) => s.status !== 'pending')
      .sort((a, b) => (b.reviewedAtMs ?? 0) - (a.reviewedAtMs ?? 0))
  );

  /** §14: dashboard status filter. Defaults to expiring_soon (the actionables). */
  readonly certFilter = signal<CertificationStatus | 'all'>('expiring_soon');

  /** Status of a submission's licence, computed on demand (§14). */
  statusOf(submission: LicenceSubmission): CertificationStatus {
    return certificationStatus(submission.expiresAtMs, Date.now());
  }

  /** Certification status as display copy in the active language. */
  certStatusLabel(submission: LicenceSubmission): string {
    const keys: Record<CertificationStatus, string> = {
      valid: 'admin.certStatus.valid',
      expiring_soon: 'admin.certStatus.expiringSoon',
      expired: 'admin.certStatus.expired',
    };
    return this.i18n.t(keys[this.statusOf(submission)] ?? '');
  }

  certTone(submission: LicenceSubmission): string {
    return CERT_TONES[this.statusOf(submission)] ?? '';
  }

  /** Days left on the licence, or null when none is recorded. */
  daysOf(submission: LicenceSubmission): number | null {
    return daysUntilExpiry(submission.expiresAtMs);
  }

  /** §14: approved submissions with a recorded expiry, sorted soonest-first. */
  readonly expiring = computed(() => {
    const filter = this.certFilter();
    return this.store
      .queue()
      .filter((s) => s.expiresAtMs != null)
      .filter((s) => (filter === 'all' ? true : this.statusOf(s) === filter))
      .sort((a, b) => (a.expiresAtMs ?? 0) - (b.expiresAtMs ?? 0));
  });

  setCertFilter(value: CertificationStatus | 'all'): void {
    this.certFilter.set(value);
  }

  ngOnInit(): void {
    this.store.loadQueue();
    this.reviewStore.loadAll();
  }

  moderate(review: Review, decision: 'published' | 'removed'): void {
    this.reviewStore.moderate(review.id, decision).subscribe();
  }

  review(submission: LicenceSubmission, decision: 'approved' | 'rejected'): void {
    this.store.review(submission.id, decision).subscribe();
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
