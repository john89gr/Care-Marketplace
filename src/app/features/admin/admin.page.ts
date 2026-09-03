import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { VettingStore, LicenceSubmission } from '../vetting/vetting.store';
import { ReviewsStore, Review } from '../marketplace/reviews.store';
import {
  certificationStatus,
  CertificationStatus,
  daysUntilExpiry,
} from '../../core/services/integrations/certification-status';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [],
  template: `
    <section class="admin">
      <h1>Admin & compliance</h1>

      <h2>Licence vetting queue</h2>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else if (pending().length === 0) {
        <p>No submissions awaiting review.</p>
      } @else {
        <ul class="results">
          @for (submission of pending(); track submission.id) {
            <li class="card">
              <div class="row">
                <h3>{{ submission.providerName }}</h3>
                <span class="chip">pending</span>
              </div>
              <p class="meta">Licence {{ submission.licenceNumber }} · submitted {{ formatDate(submission.submittedAtMs) }}</p>
              <p class="roles">
                @for (specialty of submission.specialties; track specialty) {
                  <span class="chip">{{ specialty }}</span>
                }
              </p>
              @if (submission.note) {
                <p class="meta">Note: {{ submission.note }}</p>
              }
              <p class="actions">
                <button type="button" (click)="review(submission, 'approved')">Approve</button>
                <button type="button" class="secondary" (click)="review(submission, 'rejected')">Reject</button>
              </p>
            </li>
          }
        </ul>
      }

       @if (reviewed().length > 0) {
        <h2>Recently reviewed</h2>
        <ul class="results">
          @for (submission of reviewed(); track submission.id) {
            <li class="card">
              <div class="row">
                <h3>{{ submission.providerName }}</h3>
                <span class="chip" [class.ok]="submission.status === 'approved'"
                  [class.bad]="submission.status === 'rejected'">
                  {{ submission.status }}
                </span>
              </div>
              <p class="meta">Licence {{ submission.licenceNumber }} · reviewed {{ formatDate(submission.reviewedAtMs ?? submission.submittedAtMs) }}</p>
            </li>
          }
        </ul>
      }

      <h2>Certification expiry</h2>
      <div class="controls">
        <label>
          Show
          <select [value]="certFilter()" (change)="setCertFilter($any($event.target).value)">
            <option value="expiring_soon">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="valid">Valid</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>
      @if (expiring().length === 0) {
        <p class="meta">No certificates match the current filter.</p>
      } @else {
        <table class="expiry" role="table">
          <caption>Providers whose licence or certificate is expiring or expired, sorted by soonest expiry.</caption>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">Licence</th>
              <th scope="col">Expires</th>
              <th scope="col">Days left</th>
              <th scope="col">Status</th>
              <th scope="col">Certs</th>
            </tr>
          </thead>
          <tbody>
            @for (submission of expiring(); track submission.id) {
              <tr>
                <td>{{ submission.providerName }}</td>
                <td>{{ submission.licenceNumber }}</td>
                <td>{{ submission.expiresAtMs ? formatDate(submission.expiresAtMs) : '—' }}</td>
                <td>{{ daysOf(submission) ?? '—' }}</td>
                <td>
                  <span class="chip"
                    [class.ok]="statusOf(submission) === 'valid'"
                    [class.warning]="statusOf(submission) === 'expiring_soon'"
                    [class.bad]="statusOf(submission) === 'expired'">
                    {{ statusOf(submission) }}
                  </span>
                </td>
                <td>
                  @for (cert of submission.certifications; track cert.id) {
                    <span class="chip">{{ cert.name }} · {{ cert.expiresAtMs ? formatDate(cert.expiresAtMs) : 'no expiry' }}</span>
                  } @empty {
                    <span class="meta">none</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (reviewStore.flagged().length > 0) {
        <h2>Flagged reviews</h2>
        <ul class="results">
          @for (review of reviewStore.flagged(); track review.id) {
            <li class="card">
              <div class="row">
                <h3>{{ review.authorName }} · ★ {{ review.rating }}</h3>
                <span class="chip">flagged</span>
              </div>
              <p class="meta">{{ review.comment }}</p>
              <p class="actions">
                <button type="button"
                  [disabled]="reviewStore.actingId() === review.id"
                  (click)="moderate(review, 'published')">
                  Publish
                </button>
                <button type="button" class="secondary"
                  [disabled]="reviewStore.actingId() === review.id"
                  (click)="moderate(review, 'removed')">
                  Remove
                </button>
              </p>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .controls { margin: 0.5rem 0 0.75rem; }
    .controls label { display: inline-flex; align-items: center; gap: 0.35rem; }
    .chip.ok { background: var(--success); color: #fff; }
    .chip.bad { background: var(--danger); color: #fff; }
    .chip.warning { background: var(--warning, #b8860b); color: #fff; }
    .chip { display: inline-block; border-radius: 999px; padding: 0.15rem 0.6rem; font-size: 0.8rem; margin-right: 0.25rem; }
    .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
    .expiry { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    .expiry caption { text-align: left; color: var(--text-muted); font-size: 0.85rem; padding-bottom: 0.25rem; }
    .expiry th, .expiry td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
    .expiry th { font-size: 0.8rem; color: var(--text-muted); }
  `,
})
export class AdminPage implements OnInit {
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
