/**
 * Shared types for the PDF health-summary export (FEATURE_PLAN.md §10).
 * Pure helpers only — safe for the initial bundle.
 */

/** Vitals/care-plan window selector (subtask 8): days, or all history. */
export type ExportRangeDays = 30 | 90 | 365 | 'all';

export const EXPORT_RANGES: readonly ExportRangeDays[] = [30, 90, 365, 'all'];

/** PDF + UI locale (subtask 9: Greek + English labels). */
export type ExportLocale = 'el' | 'en';

export const EXPORT_LOCALES: readonly ExportLocale[] = ['el', 'en'];

const DAY_MS = 24 * 60 * 60 * 1000;

export function rangeDays(range: ExportRangeDays): number | null {
  return range === 'all' ? null : range;
}

/** Earliest timestamp included by a range, or null for "all". */
export function rangeCutoffMs(range: ExportRangeDays, nowMs: number): number | null {
  const days = rangeDays(range);
  return days === null ? null : nowMs - days * DAY_MS;
}

export function inExportRange(
  measuredAtMs: number,
  range: ExportRangeDays,
  nowMs: number
): boolean {
  const cutoff = rangeCutoffMs(range, nowMs);
  return cutoff === null || measuredAtMs >= cutoff;
}

export function rangeLabel(range: ExportRangeDays, locale: ExportLocale): string {
  if (range === 'all') {
    return locale === 'el' ? 'Όλο το ιστορικό' : 'All history';
  }
  return locale === 'el' ? `Τελευταίες ${range} ημέρες` : `Last ${range} days`;
}

/**
 * Filename convention (subtask 10): `health-summary-<yyyy-mm-dd>.pdf`,
 * UTC date of generation for determinism across timezones.
 */
export function exportFilename(generatedAtMs: number): string {
  const date = new Date(generatedAtMs).toISOString().slice(0, 10);
  return `health-summary-${date}.pdf`;
}

export interface ExportLabels {
  title: string;
  subtitle: string;
  patient: string;
  generatedAt: string;
  range: string;
  vitals: string;
  medications: string;
  screenings: string;
  carePlan: string;
  noData: string;
  critical: string;
  overdue: string;
  disclaimer: string;
}

/** Bilingual section labels — both languages are embedded in the PDF. */
export const EXPORT_LABELS: Record<ExportLocale, ExportLabels> = {
  en: {
    title: 'Health summary',
    subtitle: 'Exportable summary for the treating physician',
    patient: 'Patient',
    generatedAt: 'Generated',
    range: 'Range',
    vitals: 'Vitals',
    medications: 'Medications',
    screenings: 'Preventive care',
    carePlan: 'Care plan',
    noData: 'No data in this section.',
    critical: 'critical',
    overdue: 'overdue',
    disclaimer: 'Informational summary — not a medical diagnosis.',
  },
  el: {
    title: 'Σύνοψη υγείας',
    subtitle: 'Εξαγώγιμη σύνοψη για τον θεράποντα ιατρό',
    patient: 'Ασθενής',
    generatedAt: 'Δημιουργήθηκε',
    range: 'Εύρος',
    vitals: 'Ζωτικές μετρήσεις',
    medications: 'Φάρμακα',
    screenings: 'Προληπτικός έλεγχος',
    carePlan: 'Πλάνο φροντίδας',
    noData: 'Δεν υπάρχουν δεδομένα σε αυτή την ενότητα.',
    critical: 'κρίσιμο',
    overdue: 'εκπρόθεσμο',
    disclaimer: 'Ενημερωτική σύνοψη — δεν αποτελεί ιατρική διάγνωση.',
  },
};

/** localStorage key for the export consent flag (subtask 11, GDPR). */
export const EXPORT_CONSENT_KEY = 'cm.consents.export.v1';

export function hasExportConsent(): boolean {
  try {
    return localStorage.getItem(EXPORT_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExportConsent(given: boolean): void {
  try {
    if (given) {
      localStorage.setItem(EXPORT_CONSENT_KEY, '1');
    } else {
      localStorage.removeItem(EXPORT_CONSENT_KEY);
    }
  } catch {
    // Storage unavailable — consent stays in memory only (page signal).
  }
}
