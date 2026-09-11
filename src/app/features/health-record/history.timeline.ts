/**
 * Health-history timeline (FEATURE_PLAN.md §21 subtask 10): merges every
 * history category (conditions, allergies, immunizations, events, symptoms,
 * prescriptions) into one chronological view with kind icons and year
 * grouping. Pure functions — no DI, fully unit-testable.
 */
import type {
  Allergy,
  HistoryKind,
  Immunization,
  MedicalCondition,
  MedicalEvent,
  PrescriptionRecord,
  Symptom,
} from './history.models';
import {
  ALLERGY_KIND_LABELS,
  CONDITION_STATUS_LABELS,
  EVENT_KIND_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  SYMPTOM_SEVERITY_LABELS,
  historyLabel,
} from './history.models';
import { icd11Label } from './icd11';

export interface HistoryInput {
  conditions: readonly MedicalCondition[];
  allergies: readonly Allergy[];
  immunizations: readonly Immunization[];
  events: readonly MedicalEvent[];
  symptoms: readonly Symptom[];
  prescriptions: readonly PrescriptionRecord[];
}

export interface TimelineEntry {
  /** Stable key for @for tracking: `<kind>:<recordId>` (archived entries keep theirs). */
  key: string;
  kind: HistoryKind;
  /** Date the entry is anchored to (diagnosed / confirmed / administered / occurred / issued / onset). */
  atMs: number;
  title: string;
  detail: string;
  archived: boolean;
}

/** The calendar date (not the anchor) each entry is grouped under. */
export interface TimelineGroup {
  year: number;
  entries: TimelineEntry[];
}

/**
 * Build one chronology for every history category. Archived records are kept
 * (history is never deleted) but flagged so the UI can render them muted.
 */
export function buildTimeline(input: HistoryInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const c of input.conditions) {
    entries.push({
      key: `conditions:${c.id}`,
      kind: 'conditions',
      atMs: c.diagnosedAtMs,
      title: c.name,
      detail: [
        c.icd11Code ? icd11Label(c.icd11Code) : '',
        historyLabel(CONDITION_STATUS_LABELS, c.status),
      ]
        .filter(Boolean)
        .join(' · '),
      archived: Boolean(c.archived),
    });
  }

  for (const a of input.allergies) {
    entries.push({
      key: `allergies:${a.id}`,
      kind: 'allergies',
      atMs: a.confirmedAtMs,
      title: a.substance,
      detail: [historyLabel(ALLERGY_KIND_LABELS, a.kind), a.reaction ?? '']
        .filter(Boolean)
        .join(' · '),
      archived: Boolean(a.archived),
    });
  }

  for (const im of input.immunizations) {
    entries.push({
      key: `immunizations:${im.id}`,
      kind: 'immunizations',
      atMs: im.administeredAtMs,
      title: im.vaccine,
      detail: im.doseNumber ? `Δόση ${im.doseNumber}` : '',
      archived: Boolean(im.archived),
    });
  }

  for (const e of input.events) {
    entries.push({
      key: `events:${e.id}`,
      kind: 'events',
      atMs: e.occurredAtMs,
      title: e.name,
      detail: [historyLabel(EVENT_KIND_LABELS, e.kind), e.facility ?? '']
        .filter(Boolean)
        .join(' · '),
      archived: Boolean(e.archived),
    });
  }

  for (const s of input.symptoms) {
    entries.push({
      key: `symptoms:${s.id}`,
      kind: 'symptoms',
      atMs: s.onsetAtMs,
      title: s.name,
      detail: historyLabel(SYMPTOM_SEVERITY_LABELS, s.severity),
      archived: Boolean(s.archived),
    });
  }

  for (const p of input.prescriptions) {
    entries.push({
      key: `prescriptions:${p.id}`,
      kind: 'prescriptions',
      atMs: p.issuedAtMs,
      title: p.drug,
      detail: [p.dose ?? '', historyLabel(PRESCRIPTION_STATUS_LABELS, p.status)]
        .filter(Boolean)
        .join(' · '),
      archived: Boolean(p.archived),
    });
  }

  return entries.sort((a, b) => b.atMs - a.atMs);
}

/**
 * Group sorted entries by calendar year (newest year first, entries newest
 * first within a year). `nowMs` decides which year "today" belongs to.
 */
export function groupTimelineByYear(entries: readonly TimelineEntry[]): TimelineGroup[] {
  const byYear = new Map<number, TimelineEntry[]>();
  for (const entry of entries) {
    const year = new Date(entry.atMs).getFullYear();
    const list = byYear.get(year) ?? [];
    list.push(entry);
    byYear.set(year, list);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, list]) => ({ year, entries: list }));
}

/** Filter chips: restrict the timeline to one kind ('' = all). */
export function filterTimeline(
  entries: readonly TimelineEntry[],
  kind: HistoryKind | ''
): TimelineEntry[] {
  if (!kind) {
    return [...entries];
  }
  return entries.filter((e) => e.kind === kind);
}

/** Kind icons (emoji only — never color-only state, per §21 subtask 20). */
export const TIMELINE_KIND_ICONS: Record<HistoryKind, string> = {
  conditions: '🩺',
  allergies: '⚠️',
  immunizations: '💉',
  events: '🏥',
  symptoms: '🌡️',
  prescriptions: '📋',
};