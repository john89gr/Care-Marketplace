import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConsentStore, ConsentPurpose, CONSENT_PURPOSES, CONSENT_PURPOSE_LABELS } from '../../core/services/audit/consent.store';

/**
 * User consent management page (FEATURE_PLAN.md §16 subtask 8).
 *
 * Lists every consent purpose with its current state, effective date and
 * document version. Toggles are optimistic: the UI flips immediately and
 * rolls back on API failure. A re-consent banner appears when the consent
 * document version has bumped (subtask 10).
 */
@Component({
  selector: 'app-consents',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="consents">
      <h1>Consent settings</h1>

      <p class="meta">
        These settings control how your health data is shared. You can withdraw
        any consent at any time. Withdrawing does not delete data already
        processed.
      </p>

      @if (store.needsReConsent()) {
        <div class="banner" role="alert" aria-live="polite">
          <h2>Action required: new consent terms</h2>
          <p>
            The terms for the following purpose(s) have been updated and require
            your renewed consent:
          </p>
          <ul>
            @for (purpose of store.stalePurposes(); track purpose) {
              <li>{{ label(purpose) }}</li>
            }
          </ul>
          <p>
            <a href="https://care-marketplace.example/consent/v{{ store.documentVersion() }}"
               target="_blank" rel="noopener">
              Review the updated document (v{{ store.documentVersion() }})
            </a>
          </p>
          <button type="button" class="primary" (click)="grantAllStale()">Re-consent now</button>
        </div>
      }

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      } @else {
        <ul class="list">
          @for (purpose of purposes; track purpose) {
            <li [class.granted]="store.isGranted(purpose)">
              <div class="head">
                <h3>{{ label(purpose) }}</h3>
                <span class="status">
                  {{ store.isGranted(purpose) ? 'Active' : 'Not granted' }}
                </span>
              </div>
              <p class="effective">
                Effective:
                @if (byPurpose()[purpose]?.updatedAtMs) {
                  {{ formatDate(byPurpose()[purpose]!.updatedAtMs) }}
                } @else {
                  <em>Not yet set</em>
                }
              </p>
              <div class="actions">
                <button
                  type="button"
                  [class.primary]="store.isGranted(purpose)"
                  (click)="toggle(purpose)"
                  [attr.aria-pressed]="store.isGranted(purpose)"
                >
                  {{ store.isGranted(purpose) ? 'Withdraw' : 'Grant' }}
                </button>
              </div>
            </li>
          }
        </ul>
      }

      @if (status()) {
        <p class="status" role="status" aria-live="polite">{{ status() }}</p>
      }
    </section>
  `,
  styles: `
    .consents { max-width: 48rem; }
    .meta { color: var(--text-muted); }
    .banner {
      background: var(--warning-soft, #fff8e1);
      border: 1px solid var(--warning, #f57f17);
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .banner h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
    .banner ul { margin: 0.5rem 0; padding-left: 1.2rem; }
    .banner a { font-weight: 600; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .list li {
      border: 1px solid var(--border, #d9dee7);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
    }
    .list li.granted { border-color: var(--success, #1d7a3d); }
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
    .head h3 { margin: 0; font-size: 1.05rem; }
    .status { font-size: 0.85rem; color: var(--text-muted); }
    .effective { font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0; }
    .actions { margin-top: 0.5rem; }
    .actions button { min-height: 44px; padding: 0.4rem 0.9rem; border-radius: 0.4rem; border: 1px solid var(--border, #ccc); background: var(--surface, #fff); cursor: pointer; }
    .actions button.primary { background: var(--accent, #4f7cff); color: #fff; border-color: transparent; font-weight: 600; }
    .actions button[aria-pressed="true"] { outline: 2px solid var(--success, #1d7a3d); }
    .error { color: var(--danger, #c62828); font-weight: 600; }
    .banner button.primary { background: var(--accent, #4f7cff); color: #fff; border: none; border-radius: 0.4rem; min-height: 44px; padding: 0.4rem 1rem; }
  `,
})
export class ConsentsPage implements OnInit {
  private readonly store = inject(ConsentStore);

  protected readonly purposes = CONSENT_PURPOSES;
  readonly status = signal('');

  readonly byPurpose = this.store.byPurpose;

  ngOnInit(): void {
    this.store.load().subscribe();
  }

  toggle(purpose: ConsentPurpose): void {
    const currentlyGranted = this.store.isGranted(purpose);
    this.store.update(purpose, !currentlyGranted).subscribe((ok) => {
      if (ok) {
        this.status.set(
          currentlyGranted
            ? `${this.label(purpose)} withdrawn.`
            : `${this.label(purpose)} granted.`
        );
      } else {
        this.status.set(`Could not update ${this.label(purpose).toLowerCase()}. Please try again.`);
      }
    });
  }

  /** Re-consent flow (subtask 10): grant all stale purposes at the current version. */
  grantAllStale(): void {
    const stale = this.store.stalePurposes();
    if (stale.length === 0) {
      return;
    }
    for (const purpose of stale) {
      this.store.update(purpose, true).subscribe();
    }
    this.status.set('All updated consents have been re-confirmed.');
  }

  label(purpose: ConsentPurpose): string {
    const labels = CONSENT_PURPOSE_LABELS[purpose];
    return labels.en;
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
