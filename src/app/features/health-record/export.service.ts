import { Injectable, inject, signal } from '@angular/core';
import { AuditService } from '../../core/services/audit/audit.service';
import {
  composeHealthSummary,
  HealthSummaryInput,
} from './export.payload';
import {
  exportFilename,
  hasExportConsent,
  setExportConsent,
} from './export.types';

/**
 * Health-summary export service (FEATURE_PLAN.md §10 subtask 5):
 * build → generate → download, with loading/error signals (subtask 18) and
 * a retry entry point. The PDF generator is lazy-loaded via dynamic import
 * (subtask 4) so the initial bundle stays within budget.
 *
 * Works fully offline in demo mode (subtask 13): the payload is composed
 * from the already-loaded store snapshots (which the demo backend serves
 * from memory), and the audit hook degrades to a local ring buffer.
 */
@Injectable({ providedIn: 'root' })
export class HealthSummaryExportService {
  // Default-parameter injection keeps `new HealthSummaryExportService(audit)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(private readonly audit: AuditService = inject(AuditService)) {}

  private readonly _loading = signal(false);
  private readonly _error = signal('');
  private readonly _lastFilename = signal<string | null>(null);
  private readonly _lastExportAtMs = signal<number | null>(null);
  private readonly _shareLink = signal<string | null>(null);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastFilename = this._lastFilename.asReadonly();
  readonly lastExportAtMs = this._lastExportAtMs.asReadonly();
  readonly shareLink = this._shareLink.asReadonly();

  /** Last arguments, kept so a failed export can be retried (subtask 18). */
  private lastInput: HealthSummaryInput | null = null;

  async exportNow(input: HealthSummaryInput): Promise<boolean> {
    this.lastInput = input;
    if (!hasExportConsent()) {
      this._error.set('Please confirm the export consent before generating the PDF.');
      return false;
    }
    this._loading.set(true);
    this._error.set('');
    try {
      const payload = composeHealthSummary(input);
      const filename = exportFilename(payload.generatedAtMs);
      // Lazy chunk boundary — generator + download helper stay out of the
      // initial JS (subtask 4; verify with `ng build --stats-json`).
      const { generateHealthSummaryPdf, triggerPdfDownload } = await import('./export.pdf');
      const bytes = generateHealthSummaryPdf(payload);
      triggerPdfDownload(bytes, filename);
      this._lastFilename.set(filename);
      this._lastExportAtMs.set(payload.generatedAtMs);
      // Consent + audit hook (subtask 11): every export is logged.
      this.audit.log(
        'health-summary.export',
        'health-summary',
        filename,
        { range: input.range, locale: input.locale, readings: payload.counts.vitals },
        input.profile.userId
      );
      this._loading.set(false);
      return true;
    } catch {
      this._loading.set(false);
      this._error.set('Could not generate the PDF. Please try again.');
      return false;
    }
  }

  /** Re-run the last export attempt (subtask 18: no silent failure). */
  retry(): Promise<boolean> {
    if (!this.lastInput) {
      this._error.set('Nothing to retry yet — start an export first.');
      return Promise.resolve(false);
    }
    return this.exportNow(this.lastInput);
  }

  /**
   * "Share with physician" stub (subtask 12): generates a local reference
   * link and audit-logs the share. Server-side delivery lands later.
   */
  shareWithPhysician(actorId = 'me'): string {
    const link = `health-summary-share://${this._lastFilename() ?? 'pending'}`;
    this._shareLink.set(link);
    this.audit.log('health-summary.share', 'health-summary', link, { stub: true }, actorId);
    return link;
  }

  consentGiven(): boolean {
    return hasExportConsent();
  }

  setConsent(given: boolean): void {
    setExportConsent(given);
  }
}
