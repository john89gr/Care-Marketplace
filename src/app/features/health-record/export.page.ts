import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VitalsStore } from './vitals.store';
import { MedicationsStore } from './medications.store';
import { ScreeningStore } from './screening.store';
import { CarePlanStore } from '../home-health/care-plan.store';
import { ProfileStore } from '../profiles/profile.store';
import { HealthSummaryExportService } from './export.service';
import { HistoryStore } from './history.store';
import { ContactsStore } from './contacts.store';
import { drawSparkline } from './export.sparkline';
import { I18n, translateStatic } from '../../core/i18n/i18n.service';
import {
  EXPORT_LOCALES,
  EXPORT_RANGES,
  ExportLocale,
  ExportRangeDays,
  rangeLabel,
} from './export.types';

/**
 * Health-summary export page (FEATURE_PLAN.md §10).
 *
 * Gathers the store snapshots (profile + vitals + meds + screenings +
 * care-plan — all served from the in-memory demo backend, so the export
 * works fully offline, subtask 13) and delegates to
 * `HealthSummaryExportService` (build → generate → download).
 *
 * A11y (subtask 19): the export region exposes `aria-busy` while
 * generating, progress via `role="status"`, errors via `role="alert"`.
 */
@Component({
  selector: 'app-health-summary-export',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="export" [attr.aria-busy]="exporting.loading()">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('export.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('export.intro') }}</p>
        </div>
      </header>

      <div class="export-grid">
        <div class="card export-options">
          <div class="option-block">
            <span class="field-label" id="export-lang-label">{{ i18n.t('export.language') }}</span>
            <div class="segmented" role="group" aria-labelledby="export-lang-label">
              @for (loc of locales; track loc) {
                <button
                  type="button"
                  [attr.aria-pressed]="locale() === loc"
                  [class.active]="locale() === loc"
                  (click)="locale.set(loc)"
                >
                  {{ languageLabel(loc) }}
                </button>
              }
            </div>
          </div>

          <fieldset class="option-block">
            <legend>{{ i18n.t('export.rangeLegend') }}</legend>
            <div class="range-row">
              @for (r of ranges; track r) {
                <label class="range">
                  <input
                    type="radio"
                    name="export-range"
                    [value]="r"
                    [checked]="range() === r"
                    (change)="range.set(r)"
                  />
                  {{ rangeLabel(r, locale()) }}
                </label>
              }
            </div>
          </fieldset>

          <p class="summary" role="status">{{ previewText() }}</p>

          <label class="consent">
            <input
              type="checkbox"
              [checked]="consent()"
              (change)="onConsent($event)"
            />
            <span>{{ i18n.t('export.consent') }}</span>
          </label>

          <div class="actions">
            <button
              type="button"
              class="btn"
              [disabled]="exporting.loading()"
              (click)="runExport()"
            >
              {{ exporting.loading() ? i18n.t('export.generating') : i18n.t('export.exportPdf') }}
            </button>
            <button
              type="button"
              class="btn secondary"
              [disabled]="exporting.loading()"
              (click)="runFhirExport()"
            >
              {{ i18n.t('export.fhir') }}
            </button>
            <button type="button" class="btn secondary" (click)="printFallback()">
              {{ i18n.t('export.print') }}
            </button>
            <button
              type="button"
              class="btn secondary"
              [disabled]="!exporting.lastFilename()"
              (click)="share()"
            >
              {{ i18n.t('export.share') }}
            </button>
          </div>

          @if (consentError()) {
            <p class="alert danger" role="alert">
              <span class="alert-icon" aria-hidden="true">⚠️</span>
              <span>{{ i18n.t(consentError()) }}</span>
            </p>
          }
          @if (exporting.loading()) {
            <p class="export-progress" role="status">
              <span class="spinner" aria-hidden="true"></span>
              {{ i18n.t('export.generatingPdf') }}
            </p>
          }
          @if (exporting.error()) {
            <p class="alert danger" role="alert">
              <span class="alert-icon" aria-hidden="true">⚠️</span>
              <span>
                {{ i18n.message(exporting.errorSource(), exporting.error()) }}
                <button type="button" class="link" (click)="exporting.retry()">
                  {{ i18n.t('common.retry') }}
                </button>
              </span>
            </p>
          }
          @if (exporting.lastFilename()) {
            <p class="meta export-note" role="status">
              <span aria-hidden="true">📄</span>
              {{ i18n.t('export.lastExport') }}: {{ exporting.lastFilename() }}
            </p>
          }
          @if (exporting.shareLink()) {
            <p class="meta export-note" role="status">
              <span aria-hidden="true">🔗</span>
              {{ i18n.t('export.shareLink') }} {{ exporting.shareLink() }}
            </p>
          }
        </div>

        <div class="card export-preview">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('export.chartLabel') }}</h2>
            <button type="button" class="btn ghost sm" (click)="showPreview.set(!showPreview())">
              {{ showPreview() ? i18n.t('export.hideChart') : i18n.t('export.showChart') }}
            </button>
          </div>
          @if (showPreview()) {
            @defer (on viewport) {
              <canvas
                #chart
                width="480"
                height="96"
                role="img"
                [attr.aria-label]="i18n.t('export.chartLabel')"
              ></canvas>
            } @placeholder {
              <div class="skeleton block" aria-hidden="true"></div>
            }
          } @else {
            <div class="preview-placeholder" aria-hidden="true">📈</div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .export-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    @media (max-width: 52rem) {
      .export-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .export-options {
      display: grid;
      gap: var(--space-4);
    }
    .option-block {
      display: grid;
      gap: var(--space-2);
    }
    fieldset.option-block {
      border: none;
      padding: 0;
      margin: 0;
    }
    .range-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
    }
    .range {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.5rem;
      color: var(--text);
    }
    .summary {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    .consent {
      flex-direction: row;
      align-items: flex-start;
      gap: var(--space-2);
      color: var(--text);
      line-height: 1.45;
    }
    .consent input {
      width: 1.25rem;
      height: 1.25rem;
      margin-top: 0.1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .export-progress {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
      margin: 0;
    }
    .spinner {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: var(--radius-full);
      border: 2px solid var(--border-strong);
      border-top-color: var(--accent);
      animation: export-spin 800ms linear infinite;
    }
    @keyframes export-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }
    .export-note {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      word-break: break-all;
    }
    .export-preview {
      position: sticky;
      top: calc(var(--topbar-height) + var(--space-4));
    }
    .export-preview canvas {
      width: 100%;
      height: auto;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    .preview-placeholder {
      display: grid;
      place-items: center;
      min-height: 6rem;
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-md);
      font-size: 1.6rem;
      color: var(--text-subtle);
    }
  `,
})
export class HealthSummaryExportPage {
  protected readonly i18n = inject(I18n);

  readonly vitals = inject(VitalsStore);
  readonly meds = inject(MedicationsStore);
  readonly screening = inject(ScreeningStore);
  readonly carePlan = inject(CarePlanStore);
  readonly profile = inject(ProfileStore);
  readonly history = inject(HistoryStore);
  readonly contacts = inject(ContactsStore);
  readonly exporting = inject(HealthSummaryExportService);

  readonly ranges = EXPORT_RANGES;
  readonly locales = EXPORT_LOCALES;
  readonly range = signal<ExportRangeDays>(90);
  readonly locale = signal<ExportLocale>('en');
  readonly showPreview = signal(false);
  readonly consent = signal(this.exporting.consentGiven());
  /**
   * Consent-gate message shown when Export is clicked before consenting.
   * Holds a dictionary *key*, rendered through `i18n.t` in the template so it
   * follows the UI language rather than the document's export locale.
   */
  readonly consentError = signal('');

  private readonly chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chart');

  /** Values for the sparkline preview: richest vitals series. */
  readonly previewValues = computed<number[]>(() => {
    const readings = this.vitals.readings();
    if (readings.length === 0) {
      return [];
    }
    const byType = new Map<string, number[]>();
    for (const r of readings) {
      const list = byType.get(r.type) ?? [];
      list.push(r.value);
      byType.set(r.type, list);
    }
    let best: number[] = [];
    for (const list of byType.values()) {
      if (list.length > best.length) {
        best = list;
      }
    }
    return best.slice(-60);
  });

  /**
   * What the export will contain, written in the language the *document* is
   * generated in (`translateStatic` resolves a non-active locale), so it
   * describes the PDF rather than the page around it.
   */
  readonly previewText = computed(() =>
    translateStatic(
      'export.preview',
      {
        vitals: this.vitals.readings().length,
        medications: this.meds.meds().filter((m) => !m.archived).length,
        screenings: this.screening.statuses().length,
        history: this.historyCounts(),
        contacts: this.contacts.list('emergency').length,
        range: rangeLabel(this.range(), this.locale()).toLowerCase(),
      },
      this.locale()
    )
  );

  /** Non-archived history entries across all six register categories. */
  private historyCounts(): number {
    let total = 0;
    for (const kind of [
      'conditions',
      'allergies',
      'immunizations',
      'events',
      'symptoms',
      'prescriptions',
    ] as const) {
      total += this.history.records(kind).length;
    }
    return total;
  }

  constructor() {
    this.vitals.load();
    this.meds.load().subscribe();
    this.screening.load().subscribe();
    this.profile.load().subscribe();
    this.carePlan.load();
    for (const kind of ['conditions', 'allergies', 'immunizations', 'events', 'symptoms', 'prescriptions'] as const) {
      this.history.load(kind).subscribe();
    }
    this.contacts.load().subscribe();
    effect(() => {
      const canvas = this.chartCanvas()?.nativeElement;
      if (canvas && this.showPreview()) {
        // Canvas → PNG preview of the same data embedded in the PDF.
        drawSparkline(canvas, this.previewValues());
      }
    });
  }

  rangeLabel(range: ExportRangeDays, locale: ExportLocale): string {
    return rangeLabel(range, locale);
  }

  /** Self-labelled language names: each reads in its own language. */
  languageLabel(locale: ExportLocale): string {
    return locale === 'el' ? 'Ελληνικά' : 'English';
  }

  onConsent(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.consent.set(checked);
    this.consentError.set('');
    this.exporting.setConsent(checked);
  }

  async runExport(): Promise<void> {
    if (!this.consent()) {
      this.consentError.set('export.consentRequiredPdf');
      return;
    }
    this.consentError.set('');
    const profile = this.profile.profile();
    await this.exporting.exportNow({
      profile: { userId: profile.userId, displayName: profile.displayName },
      readings: this.vitals.readings(),
      medications: this.meds.meds(),
      adherenceLogs: this.meds.logs(),
      screeningStatuses: this.screening.statuses(),
      carePlan: this.carePlan.plan(),
      conditions: this.history.records('conditions'),
      allergies: this.history.records('allergies'),
      immunizations: this.history.records('immunizations'),
      events: this.history.records('events'),
      symptoms: this.history.records('symptoms'),
      prescriptions: this.history.records('prescriptions'),
      emergencyContacts: this.contacts.list('emergency'),
      range: this.range(),
      locale: this.locale(),
    });
  }

  /** FHIR R4 bundle export (§11/§21): same consent gate as the PDF export. */
  async runFhirExport(): Promise<void> {
    if (!this.consent()) {
      this.consentError.set('export.consentRequiredFhir');
      return;
    }
    this.consentError.set('');
    const profile = this.profile.profile();
    await this.exporting.exportFhir({
      profile,
      readings: this.vitals.readings(),
      medications: this.meds.meds(),
      carePlan: this.carePlan.plan(),
      conditions: this.history.records('conditions'),
      allergies: this.history.records('allergies'),
      immunizations: this.history.records('immunizations'),
      symptoms: this.history.records('symptoms'),
      prescriptions: this.history.records('prescriptions'),
      emergencyContacts: this.contacts.list('emergency'),
    });
  }

  async printFallback(): Promise<void> {
    const { printHealthSummary } = await import('./export.pdf');
    printHealthSummary();
  }

  share(): void {
    this.exporting.shareWithPhysician(this.profile.profile().userId || 'me');
  }
}
