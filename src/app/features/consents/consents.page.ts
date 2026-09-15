import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n } from '../../core/i18n/i18n.service';
import { ConsentStore, ConsentPurpose, CONSENT_PURPOSES, CONSENT_PURPOSE_LABELS } from '../../core/services/audit/consent.store';

/**
 * User consent management page (FEATURE_PLAN.md §16 subtask 8).
 *
 * Lists every consent purpose with its current state, effective date and
 * document version. Toggles are optimistic: the UI flips immediately and
 * rolls back on API failure. A re-consent banner appears when the consent
 * document version has bumped (subtask 10).
 *
 * Purpose names come from the shared bilingual catalog in `consent.store.ts`,
 * so they follow the active locale rather than being duplicated here.
 */
@Component({
  selector: 'app-consents',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="consents">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('consents.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('consents.intro') }}</p>
        </div>
      </header>

      @if (store.needsReConsent()) {
        <div class="card banner" role="alert" aria-live="polite">
          <h2 class="card-title">{{ i18n.t('consents.reConsentTitle') }}</h2>
          <p>{{ i18n.t('consents.reConsentBody') }}</p>
          <ul class="purposes">
            @for (purpose of store.stalePurposes(); track purpose) {
              <li>{{ label(purpose) }}</li>
            }
          </ul>
          <p>
            <a
              href="https://care-marketplace.example/consent/v{{ store.documentVersion() }}"
              target="_blank"
              rel="noopener"
            >
              {{ i18n.t('consents.reviewDocument', { version: store.documentVersion() }) }}
            </a>
          </p>
          <div class="card-actions">
            <button type="button" class="btn" (click)="grantAllStale()">
              {{ i18n.t('consents.reConsentNow') }}
            </button>
          </div>
        </div>
      }

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      } @else {
        <ul class="list">
          @for (purpose of purposes; track purpose) {
            <li class="card consent" [class.granted]="store.isGranted(purpose)">
              <div class="head">
                <h2 class="card-title">{{ label(purpose) }}</h2>
                <span class="badge" [class.success]="store.isGranted(purpose)">
                  {{
                    store.isGranted(purpose)
                      ? i18n.t('consents.active')
                      : i18n.t('consents.notGranted')
                  }}
                </span>
              </div>
              <p class="meta">
                {{ i18n.t('consents.effective') }}
                @if (byPurpose()[purpose]?.updatedAtMs) {
                  {{ formatDate(byPurpose()[purpose]!.updatedAtMs) }}
                } @else {
                  <em>{{ i18n.t('consents.notYetSet') }}</em>
                }
              </p>
              <div class="card-actions">
                <button
                  type="button"
                  [class]="store.isGranted(purpose) ? 'btn secondary' : 'btn'"
                  (click)="toggle(purpose)"
                  [attr.aria-pressed]="store.isGranted(purpose)"
                >
                  {{
                    store.isGranted(purpose)
                      ? i18n.t('consents.withdraw')
                      : i18n.t('consents.grant')
                  }}
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
    .consents {
      max-width: 52rem;
    }
    /* .card for the shared surface, .banner for the warning tone. */
    .card.banner {
      border-color: color-mix(in srgb, var(--warning) 55%, transparent);
      background: var(--warning-soft);
      color: var(--warning);
      margin-bottom: var(--space-4);
    }
    .card.banner .card-title,
    .card.banner a {
      color: var(--warning);
    }
    .purposes {
      margin: var(--space-2) 0;
      padding-left: 1.2rem;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .card.consent.granted {
      border-left: 3px solid var(--success);
    }
    .status {
      margin-top: var(--space-4);
      color: var(--success);
      font-weight: var(--weight-medium);
    }
  `,
})
export class ConsentsPage implements OnInit {
  protected readonly store = inject(ConsentStore);
  protected readonly i18n = inject(I18n);

  protected readonly purposes = CONSENT_PURPOSES;
  readonly status = signal('');

  readonly byPurpose = this.store.byPurpose;

  ngOnInit(): void {
    this.store.load().subscribe();
  }

  toggle(purpose: ConsentPurpose): void {
    const currentlyGranted = this.store.isGranted(purpose);
    this.store.update(purpose, !currentlyGranted).subscribe((ok) => {
      const purposeName = this.label(purpose);
      if (ok) {
        this.status.set(
          currentlyGranted
            ? this.i18n.t('consents.status.withdrawn', { purpose: purposeName })
            : this.i18n.t('consents.status.granted', { purpose: purposeName })
        );
      } else {
        this.status.set(this.i18n.t('consents.status.failed', { purpose: purposeName }));
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
    this.status.set(this.i18n.t('consents.status.reConfirmed'));
  }

  /** Purpose label in the active locale (catalog ships both). */
  label(purpose: ConsentPurpose): string {
    return CONSENT_PURPOSE_LABELS[purpose][this.i18n.language()];
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
