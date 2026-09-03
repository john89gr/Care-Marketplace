import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VitalsStore } from './vitals.store';
import { MedicationsStore } from './medications.store';
import { ScreeningStore } from './screening.store';
import { CarePlanStore } from '../home-health/care-plan.store';
import { ProfileStore } from '../profiles/profile.store';
import { HealthSummaryExportService } from './export.service';
import { drawSparkline } from './export.sparkline';
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
      <h1>{{ locale() === 'el' ? 'Εξαγωγή σύνοψης υγείας' : 'Health summary export' }}</h1>
      <p class="meta">
        {{
          locale() === 'el'
            ? 'Σύνοψη για τον θεράποντα ιατρό — προφίλ, μετρήσεις, φάρμακα, προληπτικός έλεγχος, πλάνο φροντίδας.'
            : 'Summary for the treating physician — profile, vitals, medications, screenings, care plan.'
        }}
      </p>

      <div class="row" role="group" aria-label="Language / Γλώσσα">
        @for (loc of locales; track loc) {
          <button
            type="button"
            [attr.aria-pressed]="locale() === loc"
            [class.active]="locale() === loc"
            (click)="locale.set(loc)"
          >
            {{ loc === 'el' ? 'Ελληνικά' : 'English' }}
          </button>
        }
      </div>

      <fieldset class="row">
        <legend>{{ locale() === 'el' ? 'Εύρος' : 'Range' }}</legend>
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
      </fieldset>

      <p class="summary" role="status">
        {{
          locale() === 'el'
            ? previewTextEl()
            : previewTextEn()
        }}
      </p>

      <label class="consent">
        <input
          type="checkbox"
          [checked]="consent()"
          (change)="onConsent($event)"
        />
        {{
          locale() === 'el'
            ? 'Συναινώ στην εξαγωγή της σύνοψης υγείας μου (καταγράφεται).'
            : 'I consent to exporting my health summary (this is logged).'
        }}
      </label>

      <div class="actions">
        <button
          type="button"
          class="primary"
          [disabled]="exporting.loading() || !consent()"
          (click)="runExport()"
        >
          {{ exporting.loading() ? (locale() === 'el' ? 'Δημιουργία…' : 'Generating…') : (locale() === 'el' ? 'Εξαγωγή PDF' : 'Export PDF') }}
        </button>
        <button type="button" (click)="printFallback()">
          {{ locale() === 'el' ? 'Εκτύπωση' : 'Print' }}
        </button>
        <button
          type="button"
          [disabled]="!exporting.lastFilename()"
          (click)="share()"
        >
          {{ locale() === 'el' ? 'Κοινοποίηση σε ιατρό' : 'Share with physician' }}
        </button>
      </div>

      @if (exporting.loading()) {
        <p role="status">{{ locale() === 'el' ? 'Δημιουργία PDF…' : 'Generating PDF…' }}</p>
      }
      @if (exporting.error()) {
        <p class="error" role="alert">
          {{ exporting.error() }}
          <button type="button" (click)="exporting.retry()">
            {{ locale() === 'el' ? 'Επανάληψη' : 'Retry' }}
          </button>
        </p>
      }
      @if (exporting.lastFilename()) {
        <p class="meta" role="status">
          {{ locale() === 'el' ? 'Τελευταία εξαγωγή' : 'Last export' }}: {{ exporting.lastFilename() }}
        </p>
      }
      @if (exporting.shareLink()) {
        <p class="meta" role="status">Share link: {{ exporting.shareLink() }}</p>
      }

      <div class="preview-toggle">
        <button type="button" (click)="showPreview.set(!showPreview())">
          {{ showPreview() ? (locale() === 'el' ? 'Απόκρυψη γραφήματος' : 'Hide chart') : (locale() === 'el' ? 'Προεπισκόπηση γραφήματος' : 'Preview chart') }}
        </button>
      </div>
      @if (showPreview()) {
        @defer (on viewport) {
          <canvas
            #chart
            width="480"
            height="96"
            role="img"
            [attr.aria-label]="locale() === 'el' ? 'Γράφημα τάσης ζωτικών μετρήσεων' : 'Vitals trend sparkline'"
          ></canvas>
        } @placeholder {
          <p class="meta">{{ locale() === 'el' ? 'Το γράφημα φορτώνει…' : 'Chart preview loads…' }}</p>
        }
      }
    </section>
  `,
  styles: `
    .export { max-width: 44rem; display: grid; gap: 0.75rem; }
    .meta { color: var(--text-muted); }
    .row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; border: 0; padding: 0; margin: 0; }
    button { min-height: 44px; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid var(--border, #ccc); background: var(--surface, #fff); cursor: pointer; }
    button.primary { background: var(--accent, #4f7cff); color: #fff; border-color: transparent; font-weight: 600; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    button.active { outline: 2px solid var(--accent, #4f7cff); }
    .range { display: inline-flex; gap: 0.35rem; align-items: center; min-height: 44px; }
    .consent { display: flex; gap: 0.5rem; align-items: flex-start; }
    .consent input { width: 1.4rem; height: 1.4rem; margin-top: 0.1rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .error { color: var(--danger, #c62828); }
    canvas { max-width: 100%; border: 1px solid var(--border, #ccc); border-radius: 0.5rem; }
  `,
})
export class HealthSummaryExportPage {
  readonly vitals = inject(VitalsStore);
  readonly meds = inject(MedicationsStore);
  readonly screening = inject(ScreeningStore);
  readonly carePlan = inject(CarePlanStore);
  readonly profile = inject(ProfileStore);
  readonly exporting = inject(HealthSummaryExportService);

  readonly ranges = EXPORT_RANGES;
  readonly locales = EXPORT_LOCALES;
  readonly range = signal<ExportRangeDays>(90);
  readonly locale = signal<ExportLocale>('en');
  readonly showPreview = signal(false);
  readonly consent = signal(this.exporting.consentGiven());

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

  readonly previewTextEn = computed(
    () =>
      `Includes ${this.vitals.readings().length} vitals readings, ` +
      `${this.meds.meds().filter((m) => !m.archived).length} medications, ` +
      `${this.screening.statuses().length} screenings over ${rangeLabel(this.range(), 'en').toLowerCase()}.`
  );

  readonly previewTextEl = computed(
    () =>
      `Περιλαμβάνει ${this.vitals.readings().length} μετρήσεις, ` +
      `${this.meds.meds().filter((m) => !m.archived).length} φάρμακα, ` +
      `${this.screening.statuses().length} ελέγχους — ${rangeLabel(this.range(), 'el')}.`
  );

  constructor() {
    this.vitals.load();
    this.meds.load().subscribe();
    this.screening.load().subscribe();
    this.profile.load().subscribe();
    this.carePlan.load();
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

  onConsent(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.consent.set(checked);
    this.exporting.setConsent(checked);
  }

  async runExport(): Promise<void> {
    const profile = this.profile.profile();
    await this.exporting.exportNow({
      profile: { userId: profile.userId, displayName: profile.displayName },
      readings: this.vitals.readings(),
      medications: this.meds.meds(),
      adherenceLogs: this.meds.logs(),
      screeningStatuses: this.screening.statuses(),
      carePlan: this.carePlan.plan(),
      range: this.range(),
      locale: this.locale(),
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
