/**
 * Health-summary PDF assembly (FEATURE_PLAN.md §10 subtasks 5–7, 9).
 *
 * LAZY CHUNK: this module (plus `shared/utils/pdf-builder`) is only ever
 * loaded through a dynamic `import()` in `export.service.ts`, so the PDF
 * layout code never counts toward the initial JS bundle (subtask 4).
 */
import { buildPdfBytes, PdfBlock } from '../../shared/utils/pdf-builder';
import {
  EXPORT_LABELS,
  ExportLabels,
  exportFilename,
  rangeLabel,
} from './export.types';
import type { HealthSummaryPayload } from './export.payload';
import { VITAL_LABELS, VITAL_UNITS } from './vitals.store';
import { icd11Label } from './icd11';
import {
  ALLERGY_KIND_LABELS,
  ALLERGY_SEVERITY_LABELS,
  CONDITION_STATUS_LABELS,
  EVENT_KIND_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  SYMPTOM_SEVERITY_LABELS,
  SYMPTOM_STATUS_LABELS,
  historyLabel,
} from './history.models';
import { hasInstructions, instructionsSummary, normalizeInstructions } from './medicine.info';

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function readingLine(r: { value: number; value2: number | null; measuredAtMs: number; source: string }, unit: string): string {
  const value = r.value2 !== null && r.value2 !== undefined
    ? `${r.value}/${r.value2}`
    : `${r.value}`;
  return `${isoDate(r.measuredAtMs)}  ${value} ${unit} (${r.source})`;
}

function scheduleText(schedule: { kind: string; timesMinutes?: number[]; timeMinutes?: number; everyDays?: number; weekdays?: number[] }): string {
  switch (schedule.kind) {
    case 'daily':
      return `daily x${(schedule.timesMinutes ?? []).length}`;
    case 'interval':
      return `every ${schedule.everyDays ?? '?'}d`;
    case 'weekly':
      return `weekly x${(schedule.weekdays ?? []).length}`;
    default:
      return String(schedule.kind);
  }
}

/**
 * Bilingual heading (subtask 9): one line per language so each line keeps
 * its natural encoding (ASCII literal vs UTF-16BE hex) and stays searchable.
 * NOTE: keep PDF body text ASCII except for the el labels themselves —
 * punctuation such as em-dashes or bullets would force whole lines into hex.
 */
function bilingualHeading(blocks: PdfBlock[], active: string, mirror: string): void {
  blocks.push({ kind: 'text', text: active, size: 'heading' });
  blocks.push({ kind: 'text', text: mirror, size: 'small' });
}

/** Build the PDF bytes for a composed payload (pure, unit-testable). */
export function generateHealthSummaryPdf(payload: HealthSummaryPayload): Uint8Array {
  const labels = EXPORT_LABELS[payload.locale];
  const other = EXPORT_LABELS[payload.locale === 'el' ? 'en' : 'el'];
  const blocks: PdfBlock[] = [];

  // Header (subtask 6): patient, generated-at, range — in both languages,
  // one language per line.
  const generated = isoDate(payload.generatedAtMs);
  const headerLines = [
    `${labels.title}: ${labels.subtitle}`,
    `${other.title}: ${other.subtitle}`,
    `${labels.patient}: ${payload.patientName}  ${labels.generatedAt}: ${generated}  ${labels.range}: ${rangeLabel(payload.range, payload.locale)}`,
    `${other.patient}: ${payload.patientName}  ${other.generatedAt}: ${generated}  ${other.range}: ${rangeLabel(payload.range, payload.locale === 'el' ? 'en' : 'el')}`,
    labels.disclaimer,
    other.disclaimer,
  ];

  // Safety-allergy warning (subtask 9): drug / severe allergies are printed
  // right after the header, never color-only — label text + entries. (No
  // emoji: non-ASCII forces the whole line into hex and breaks PDF
  // searchability of the ASCII label.)
  if (payload.safetyAllergies.length > 0) {
    blocks.push({ kind: 'text', text: `${labels.allergyWarning}:`, size: 'heading' });
    for (const a of payload.safetyAllergies) {
      blocks.push({
        kind: 'text',
        text: `  ${a.substance} (${historyLabel(ALLERGY_SEVERITY_LABELS, a.severity, payload.locale)})`,
        size: 'body',
      });
    }
    blocks.push({ kind: 'gap' });
  }

  // Emergency / ICE contacts (contact phone manager): who to call, printed
  // before the clinical sections so a physician can find it immediately.
  if (payload.emergencyContacts.length > 0) {
    blocks.push({ kind: 'text', text: `${labels.emergencyContacts}:`, size: 'heading' });
    for (const contact of payload.emergencyContacts) {
      // No parentheses — ASCII parentheses would need escaping in the PDF
      // content stream (see the labels note in export.types.ts).
      const role = contact.relationship ? ` - ${contact.relationship}` : '';
      blocks.push({
        kind: 'text',
        text: `  ${contact.name}${role} - ${contact.phone}`,
        size: 'body',
      });
    }
    blocks.push({ kind: 'gap' });
  }

  // Vitals section (+ sparkline vector for the richest series, subtask 7).
  bilingualHeading(blocks, labels.vitals, other.vitals);
  const typeKeys = Object.keys(payload.vitalsByType).sort();
  if (typeKeys.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  let sparkDrawn = false;
  for (const type of typeKeys) {
    const series = payload.vitalsByType[type];
    const label = (VITAL_LABELS as Record<string, string>)[type] ?? type;
    const unit = (VITAL_UNITS as Record<string, string>)[type] ?? '';
    blocks.push({ kind: 'text', text: `${label} (${unit}) - n=${series.length}`, size: 'body' });
    for (const r of series.slice(-20)) {
      blocks.push({ kind: 'text', text: `  ${readingLine(r, unit)}`, size: 'small' });
    }
    if (!sparkDrawn && series.length >= 2) {
      blocks.push({
        kind: 'sparkline',
        label: `${label} trend (n=${series.length})`,
        values: series.slice(-60).map((r) => r.value),
      });
      sparkDrawn = true;
    }
  }
  blocks.push({ kind: 'gap' });

  // Medications section.
  bilingualHeading(blocks, labels.medications, other.medications);
  if (payload.medications.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const med of payload.medications) {
    const flag = med.critical ? ` [${labels.critical}]` : '';
    const prescriber = med.prescriber ? `, ${med.prescriber}` : '';
    blocks.push({
      kind: 'text',
      text: `${med.name}, ${med.dose}, ${scheduleText(med.schedule)}${flag}${prescriber}`,
      size: 'body',
    });
    // Medicine instructions manager: print the *user-saved* structured sheet
    // only. The curated catalog is a suggestion and is intentionally NOT
    // printed as if it were the treating physician's record.
    if (!med.instructions || !hasInstructions(med.instructions)) {
      continue;
    }
    const instructions = normalizeInstructions(med.instructions);
    // ASCII separator keeps the line in the PDF's searchable ASCII encoding.
    const summary = instructionsSummary(instructions, payload.locale, '; ');
    if (summary) {
      blocks.push({ kind: 'text', text: `  ${labels.howToTake}: ${summary}`, size: 'small' });
    }
    for (const warning of instructions.warnings) {
      blocks.push({ kind: 'text', text: `    ! ${warning}`, size: 'small' });
    }
    if (instructions.specialInstructions) {
      blocks.push({ kind: 'text', text: `    ${instructions.specialInstructions}`, size: 'small' });
    }
    if (instructions.sideEffects) {
      blocks.push({ kind: 'text', text: `    ${instructions.sideEffects}`, size: 'small' });
    }
    if (instructions.storage) {
      blocks.push({ kind: 'text', text: `    ${labels.storage}: ${instructions.storage}`, size: 'small' });
    }
  }
  blocks.push({ kind: 'gap' });

  // Screenings section.
  bilingualHeading(blocks, labels.screenings, other.screenings);
  if (payload.screenings.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const s of payload.screenings) {
    const extra = s.state === 'due' && s.overdue ? ` (${labels.overdue})` : '';
    const last = s.lastCompletedAtMs ? `, last: ${isoDate(s.lastCompletedAtMs)}` : '';
    blocks.push({ kind: 'text', text: `${s.label}: ${s.state}${extra}${last}`, size: 'body' });
  }
  blocks.push({ kind: 'gap' });

  // Care-plan snapshot.
  bilingualHeading(blocks, labels.carePlan, other.carePlan);
  if (!payload.carePlan || (payload.carePlan.goals.length === 0 && payload.carePlan.notes.length === 0)) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  } else {
    for (const goal of payload.carePlan.goals) {
      blocks.push({ kind: 'text', text: `- [${goal.status}] ${goal.text}`, size: 'body' });
    }
    for (const note of payload.carePlan.notes.slice(-10)) {
      blocks.push({
        kind: 'text',
        text: `${isoDate(note.atMs)} ${note.authorName}: ${note.text}`,
        size: 'small',
      });
    }
  }
  blocks.push({ kind: 'gap' });

  // Medical-history register (§21 subtask 13): conditions (ICD-11 Greek
  // labels), allergies, immunizations, events, symptoms, prescriptions.
  const loc = payload.locale;

  bilingualHeading(blocks, labels.conditions, other.conditions);
  if (payload.conditions.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const c of payload.conditions) {
    const code = c.icd11Code ? `, ${icd11Label(c.icd11Code, loc)}` : '';
    blocks.push({
      kind: 'text',
      text: `${c.name}${code} [${historyLabel(CONDITION_STATUS_LABELS, c.status, loc)}], ${isoDate(c.diagnosedAtMs)}`,
      size: 'body',
    });
  }
  blocks.push({ kind: 'gap' });

  bilingualHeading(blocks, labels.allergies, other.allergies);
  if (payload.allergies.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const a of payload.allergies) {
    const reaction = a.reaction ? `, ${a.reaction}` : '';
    blocks.push({
      kind: 'text',
      text: `${a.substance} (${historyLabel(ALLERGY_KIND_LABELS, a.kind, loc)}, ${historyLabel(ALLERGY_SEVERITY_LABELS, a.severity, loc)})${reaction}, ${isoDate(a.confirmedAtMs)}`,
      size: 'body',
    });
  }
  blocks.push({ kind: 'gap' });

  bilingualHeading(blocks, labels.immunizations, other.immunizations);
  if (payload.immunizations.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const im of payload.immunizations) {
    const dose = im.doseNumber ? ` (dose ${im.doseNumber})` : '';
    blocks.push({ kind: 'text', text: `${im.vaccine}${dose}, ${isoDate(im.administeredAtMs)}`, size: 'body' });
  }
  blocks.push({ kind: 'gap' });

  bilingualHeading(blocks, labels.events, other.events);
  if (payload.events.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const e of payload.events) {
    const facility = e.facility ? `, ${e.facility}` : '';
    blocks.push({
      kind: 'text',
      text: `${e.name} (${historyLabel(EVENT_KIND_LABELS, e.kind, loc)})${facility}, ${isoDate(e.occurredAtMs)}`,
      size: 'body',
    });
  }
  blocks.push({ kind: 'gap' });

  bilingualHeading(blocks, labels.symptoms, other.symptoms);
  if (payload.symptoms.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const s of payload.symptoms) {
    blocks.push({
      kind: 'text',
      text: `${s.name} (${historyLabel(SYMPTOM_SEVERITY_LABELS, s.severity, loc)}, ${historyLabel(SYMPTOM_STATUS_LABELS, s.status, loc)}), ${isoDate(s.onsetAtMs)}`,
      size: 'body',
    });
  }
  blocks.push({ kind: 'gap' });

  bilingualHeading(blocks, labels.prescriptions, other.prescriptions);
  if (payload.prescriptions.length === 0) {
    blocks.push({ kind: 'text', text: labels.noData, size: 'body' });
  }
  for (const p of payload.prescriptions) {
    const dose = p.dose ? `, ${p.dose}` : '';
    const instructions = p.instructions ? ` — ${p.instructions}` : '';
    const prescriber = p.prescriber ? `, ${p.prescriber}` : '';
    blocks.push({
      kind: 'text',
      text: `${p.drug}${dose}${instructions}${prescriber} [${historyLabel(PRESCRIPTION_STATUS_LABELS, p.status, loc)}], ${isoDate(p.issuedAtMs)}`,
      size: 'body',
    });
  }

  return buildPdfBytes({
    title: `${labels.title} - ${payload.patientName}`,
    headerLines,
    blocks,
    footerLeft: `health-summary - ${generated}`,
  });
}

export function filenameForPayload(payload: HealthSummaryPayload): string {
  return exportFilename(payload.generatedAtMs);
}

/** Trigger a browser download for generated bytes (download event, subtask 16). */
export function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Print fallback (subtask 1): uses the browser print pipeline instead. */
export function printHealthSummary(): void {
  window.print();
}
