import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { VettingStore, LicenceSubmission } from '../vetting/vetting.store';
import { ReviewsStore, Review } from '../marketplace/reviews.store';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <section class="admin">
      <h1>Admin & compliance</h1>

      <nav class="admin-nav" aria-label="Admin sections">
        <a routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Queue</a>
        <a routerLink="/admin/audit" routerLinkActive="active">Audit trail</a>
        <a routerLink="/admin/consents" routerLinkActive="active">Consents</a>
      </nav>

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
    .admin-nav { display: flex; gap: 0.5rem; margin: 0.5rem 0 1rem; border-bottom: 1px solid var(--border, #d9dee7); }
    .admin-nav a { padding: 0.4rem 0.8rem; border-radius: 0.3rem 0.3rem 0 0; text-decoration: none; font-size: 0.9rem; }
    .admin-nav a.active { background: var(--accent, #4f7cff); color: #fff; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success); color: #fff; }
    .chip.bad { background: var(--danger); color: #fff; }
    .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
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
