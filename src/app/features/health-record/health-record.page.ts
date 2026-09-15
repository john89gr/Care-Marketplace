import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ScreeningStore } from './screening.store';
import { HistoryStore } from './history.store';
import { ContactsStore } from './contacts.store';
import { safetyAllergies } from './history.models';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * PHR dashboard (FEATURE_PLAN.md §6 subtask 11 + §21 subtask 9): entry point
 * to the health record surfaces with a live due-screenings badge and a
 * persistent allergy safety banner (drug / severe allergies — never
 * color-only, icon + text).
 */
@Component({
  selector: 'app-health-record',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="health-record">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('phr.title') }}</h1>
        </div>
      </header>

      @if (allergyWarning().length > 0) {
        <div class="alert danger allergy-banner" role="alert">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <div>
            <strong>{{ i18n.t('phr.allergyBannerTitle') }}</strong>
            {{ i18n.t('phr.allergyBannerBody') }}
            {{ allergySummary() }}
          </div>
        </div>
      }

      <ul class="links grid grid-3">
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/history">
            <span class="icon-bubble" aria-hidden="true">🗂️</span>
            <span class="tile-title">{{ i18n.t('phr.historyLabel') }}</span>
          </a>
          <span class="meta">{{ i18n.t('phr.historyDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/vitals">
            <span class="icon-bubble" aria-hidden="true">❤️</span>
            <span class="tile-title">{{ i18n.t('phr.vitalsLabel') }}</span>
          </a>
          <span class="meta">{{ i18n.t('phr.vitalsDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/medications">
            <span class="icon-bubble" aria-hidden="true">💊</span>
            <span class="tile-title">{{ i18n.t('nav.medications') }}</span>
          </a>
          <span class="meta">{{ i18n.t('phr.medicationsDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/contacts">
            <span class="icon-bubble" aria-hidden="true">📞</span>
            <span class="tile-title">{{ i18n.t('phr.contactsLabel') }}</span>
            @if (emergencyContact(); as ice) {
              <span class="badge accent">ICE: {{ ice.name }}</span>
            }
          </a>
          <span class="meta">{{ i18n.t('phr.contactsDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/health-summary">
            <span class="icon-bubble" aria-hidden="true">📄</span>
            <span class="tile-title">{{ i18n.t('export.title') }}</span>
          </a>
          <span class="meta">{{ i18n.t('phr.exportDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/consents">
            <span class="icon-bubble" aria-hidden="true">🔏</span>
            <span class="tile-title">{{ i18n.t('consents.title') }}</span>
          </a>
          <span class="meta">{{ i18n.t('phr.consentsDesc') }}</span>
        </li>
        <li class="card interactive tile">
          <a class="tile-link" routerLink="/screenings">
            <span class="icon-bubble" aria-hidden="true">🛡️</span>
            <span class="tile-title">{{ i18n.t('nav.screenings') }}</span>
            @if (screening.dueCount() > 0) {
              <span class="badge" [class.danger]="screening.overdueCount() > 0" [class.warning]="screening.overdueCount() === 0">
                <span class="dot"></span>{{ i18n.t('phr.due', { count: screening.dueCount() }) }}
              </span>
            }
          </a>
          <span class="meta">{{ i18n.t('phr.screeningsDesc') }}</span>
        </li>
      </ul>
    </section>
  `,
  styles: `
    .links {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .tile {
      display: grid;
      gap: var(--space-2);
      align-content: start;
    }
    .tile-link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      text-decoration: none;
      color: var(--text);
      flex-wrap: wrap;
    }
    .tile-link:hover {
      color: var(--text);
    }
    .tile-title {
      font-weight: var(--weight-semibold);
      font-size: var(--text-md);
    }
    .allergy-banner {
      margin-bottom: var(--space-5);
      align-items: flex-start;
    }
    .allergy-banner strong {
      display: block;
    }
  `,
})
export class HealthRecordPage {
  protected readonly i18n = inject(I18n);

  readonly screening = inject(ScreeningStore);
  readonly history = inject(HistoryStore);
  readonly contacts = inject(ContactsStore);

  /** First-to-call ICE contact (contact phone manager). */
  readonly emergencyContact = computed(() => this.contacts.primaryEmergency());

  /** Safety allergies (drug or severe) — §21 subtask 9 banner source. */
  readonly allergyWarning = computed(() =>
    safetyAllergies(this.history.records('allergies'))
  );

  readonly allergySummary = computed(() =>
    this.allergyWarning().map((a) => `${a.substance} (${a.severity})`).join(', ')
  );

  constructor() {
    this.screening.load().subscribe();
    this.history.load('allergies').subscribe();
    this.contacts.load().subscribe();
  }
}
