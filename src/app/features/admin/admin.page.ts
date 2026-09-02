import { Component, computed, inject, OnInit } from '@angular/core';
import { VettingStore, LicenceSubmission } from '../vetting/vetting.store';

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
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.75rem; font-size: 1.15rem; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success); color: #fff; }
    .chip.bad { background: var(--danger); color: #fff; }
    .actions { margin-top: 0.75rem; display: flex; gap: 0.5rem; }
  `,
})
export class AdminPage implements OnInit {
  readonly store = inject(VettingStore);

  readonly pending = computed(() => this.store.queue().filter((s) => s.status === 'pending'));
  readonly reviewed = computed(() =>
    this.store
      .queue()
      .filter((s) => s.status !== 'pending')
      .sort((a, b) => (b.reviewedAtMs ?? 0) - (a.reviewedAtMs ?? 0))
  );

  ngOnInit(): void {
    this.store.loadQueue();
  }

  review(submission: LicenceSubmission, decision: 'approved' | 'rejected'): void {
    this.store.review(submission.id, decision).subscribe();
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
