/**
 * Prescription → pill reminder plan (FEATURE_PLAN.md Track 3): parse a
 * prescription's free-text instructions into a suggested `MedicationSchedule`
 * (Greek + English phrasing), pre-fill the structured instruction sheet from
 * the curated catalog, and package it for the confirm/adjust wizard.
 *
 * Pure functions only — no Angular, no I/O: every rule is unit-testable and
 * the wizard renders the result verbatim. Nothing is persisted here.
 *
 * The parser is deliberately conservative: when it does not recognize a
 * phrase it returns `confidence: 'defaulted'` with an explanation, never a
 * silently wrong schedule. `SOS` / PRN text yields `isPrn: true` and a null
 * schedule so the user must set times explicitly.
 */
import type { MedicationSchedule } from './medications.logic';
import {
  FoodRelation,
  MedicineInstructions,
  emptyInstructions,
} from './medicine.info';
import { applyCatalog } from './medicine.catalog';
import { ALL_CHANNELS, ReminderChannel, DEFAULT_CHANNELS } from './reminders.logic';
import type { PrescriptionRecord } from './history.models';

export type PlanConfidence = 'parsed' | 'defaulted';

export interface ParsedFrequency {
  /** Suggested schedule, or null for PRN / unrecognized text. */
  schedule: MedicationSchedule | null;
  /** True for "SOS"/PRN prescriptions (no fixed schedule). */
  isPrn: boolean;
  confidence: PlanConfidence;
  /** The phrase that produced the suggestion ('' when defaulted). */
  matched: string;
  /** Human-readable explanation shown in the wizard. */
  note: string;
}

/** Default dose times (minutes from midnight) for N doses a day. */
const TIMES_BY_COUNT: Record<number, number[]> = {
  1: [8 * 60],
  2: [8 * 60, 20 * 60],
  3: [8 * 60, 14 * 60, 20 * 60],
  4: [8 * 60, 12 * 60, 16 * 60, 20 * 60],
  5: [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60],
  6: [8 * 60, 10 * 60, 12 * 60, 14 * 60, 16 * 60, 18 * 60],
};

export function defaultTimesFor(count: number): number[] {
  const clamped = Math.min(6, Math.max(1, Math.round(count)));
  return [...(TIMES_BY_COUNT[clamped] ?? TIMES_BY_COUNT[1])];
}

/** Named time-of-day tokens → minutes (first match wins per token). */
const NAMED_TIMES: readonly { pattern: RegExp; minutes: number; label: string }[] = [
  { pattern: /(πρωι|morning|breakfast|πρωιν[οό])/, minutes: 8 * 60, label: 'πρωί' },
  { pattern: /(μεσημερι|noon|midday|lunch)/, minutes: 14 * 60, label: 'μεσημέρι' },
  { pattern: /(απογευμα|afternoon)/, minutes: 18 * 60, label: 'απόγευμα' },
  { pattern: /(βραδυ|evening|dinner|nighttime)/, minutes: 20 * 60, label: 'βράδυ' },
  // `\bnight\b` deliberately excludes "nighttime" (handled by the evening row).
  { pattern: /(νυχτα|bedtime|before bed|\bnight\b)/, minutes: 22 * 60, label: 'νύχτα' },
];

const PRN_PATTERN = /(sos|s\.o\.s|prn|οταν χρειαστει|επι πονου|as needed|as required|if needed)/;
const HOURLY_PATTERN = /(?:καθε|every)\s*(\d{1,2})\s*(?:ωρε[ςσ]|hours?|h\b)/;
const EVERY_DAYS_PATTERN = /(?:καθε|every)\s*(\d{1,2})\s*(?:ημερε[ςσ]|days?)/;
const WEEKLY_PATTERN = /(μια φορα την εβδομαδα|εβδομαδιαι[αώ]ς|once a week|weekly|per week)/;
const DAILY_ONCE_PATTERN = /(μια φορα την ημερα|μια φορα ημερησιως|once a day|once daily|\bdaily\b|ημερησιως)/;
const FACTOR_PATTERN = /(\d+)\s*(?:x|×)\s*(\d+)/;
const GREEK_TIMES_PATTERN = /(\d+)\s*φορε[ςσ]/;
const ENGLISH_TIMES_PATTERN = /(\d+)\s*times?\s*(?:a|per)\s*day/;

/** Lowercase + strip accents so Greek/English phrases match consistently. */
function fold(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Spread N-hourly doses from 08:00, wrapping within the day and sorted. */
export function everyNHoursTimes(everyHours: number): number[] {
  const step = Math.min(12, Math.max(1, Math.round(everyHours)));
  const count = Math.max(1, Math.min(6, Math.floor(24 / step)));
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push((8 * 60 + i * step * 60) % (24 * 60));
  }
  return times.sort((a, b) => a - b);
}

/** Parse a free-text frequency phrase into a suggested schedule. */
export function parseFrequency(raw: string): ParsedFrequency {
  const text = fold(raw);
  if (!text) {
    return {
      schedule: null,
      isPrn: false,
      confidence: 'defaulted',
      matched: '',
      note: 'Δεν δόθηκε οδηγία δοσολογίας — ορίστε τις ώρες χειροκίνητα.',
    };
  }

  if (PRN_PATTERN.test(text)) {
    return {
      schedule: null,
      isPrn: true,
      confidence: 'defaulted',
      matched: 'SOS',
      note: 'Λήψη κατά περίπτωση (SOS). Δεν ορίζεται σταθερό πρόγραμμα — προσθέστε ώρες μόνο αν το ζήτησε ο γιατρός.',
    };
  }

  // Named times ("πρωί και βράδυ", "morning and evening") beat generic counts.
  const named = NAMED_TIMES.filter((t) => t.pattern.test(text));
  if (named.length > 0) {
    const times = [...new Set(named.map((n) => n.minutes))].sort((a, b) => a - b);
    return {
      schedule: { kind: 'daily', timesMinutes: times },
      isPrn: false,
      confidence: 'parsed',
      matched: named.map((n) => n.label).join(', '),
      note: `Αναγνωρίστηκαν ώρες: ${named.map((n) => n.label).join(', ')}.`,
    };
  }

  const weekly = WEEKLY_PATTERN.test(text);
  if (weekly) {
    return {
      schedule: { kind: 'weekly', weekdays: [1], timeMinutes: 8 * 60 },
      isPrn: false,
      confidence: 'defaulted',
      matched: 'εβδομαδιαία',
      note: 'Εβδομαδιαία λήψη — ελέγξτε την ημέρα και την ώρα.',
    };
  }

  const everyDays = EVERY_DAYS_PATTERN.exec(text);
  if (everyDays) {
    const days = Math.max(1, Number(everyDays[1]));
    return {
      schedule: { kind: 'interval', everyDays: days, timeMinutes: 8 * 60 },
      isPrn: false,
      confidence: 'parsed',
      matched: everyDays[0],
      note: `Κάθε ${days} ημέρα/ες στις 08:00.`,
    };
  }

  const hourly = HOURLY_PATTERN.exec(text);
  if (hourly) {
    const hours = Math.max(1, Number(hourly[1]));
    return {
      schedule: { kind: 'daily', timesMinutes: everyNHoursTimes(hours) },
      isPrn: false,
      confidence: 'parsed',
      matched: hourly[0],
      note: `Κάθε ${hours} ώρες (προτεινόμενες ώρες — προσαρμόστε τις).`,
    };
  }

  // "μία φορά την ημέρα" / "once daily" → one dose at the default time.
  const onceDaily = DAILY_ONCE_PATTERN.exec(text);
  if (onceDaily) {
    return {
      schedule: { kind: 'daily', timesMinutes: defaultTimesFor(1) },
      isPrn: false,
      confidence: 'parsed',
      matched: onceDaily[0],
      note: '1 δόση την ημέρα.',
    };
  }

  // "1x3" → 3 doses; "3 φορές την ημέρα"; "3 times a day".
  const factor = FACTOR_PATTERN.exec(text);
  const greekTimes = GREEK_TIMES_PATTERN.exec(text);
  const englishTimes = ENGLISH_TIMES_PATTERN.exec(text);
  const count = factor
    ? Number(factor[2])
    : greekTimes
      ? Number(greekTimes[1])
      : englishTimes
        ? Number(englishTimes[1])
        : null;
  if (count !== null && count >= 1 && count <= 6) {
    return {
      schedule: { kind: 'daily', timesMinutes: defaultTimesFor(count) },
      isPrn: false,
      confidence: 'parsed',
      matched: factor?.[0] ?? greekTimes?.[0] ?? englishTimes?.[0] ?? '',
      note: `${count} δόσεις την ημέρα.`,
    };
  }

  return {
    schedule: null,
    isPrn: false,
    confidence: 'defaulted',
    matched: '',
    note: `Δεν αναγνωρίστηκε η οδηγία "${raw.trim()}" — ορίστε τις ώρες χειροκίνητα.`,
  };
}

/** Detect a food relation ("μετά το φαγητό", "before meals"…). */
export function parseFoodRelation(raw: string): FoodRelation {
  const text = fold(raw);
  if (/(με το φαγητο|με τα γευματα|with food|with meals)/.test(text)) return 'with';
  if (/(πριν το φαγητο|πριν τα γευματα|before food|before meals|αδειο στομαχι|empty stomach)/.test(text)) {
    return 'before';
  }
  if (/(μετα το φαγητο|μετα τα γευματα|after food|after meals)/.test(text)) return 'after';
  return 'any';
}

export interface PrescriptionReminderPlan {
  /** Suggested schedule; null for PRN (the wizard requires explicit times). */
  schedule: MedicationSchedule | null;
  /** Enabled reminder channels (defaults to in-app + push). */
  channels: ReminderChannel[];
  instructions: MedicineInstructions;
  confidence: PlanConfidence;
  isPrn: boolean;
  /** Raw prescription instructions this plan was parsed from. */
  parsedFrom: string;
  note: string;
}

export interface PlanOptions {
  /** Override the default channels (e.g. the user's saved reminder prefs). */
  channels?: readonly ReminderChannel[];
}

/**
 * Build the suggested plan for a prescription: parsed schedule + pre-filled
 * instruction sheet (catalog suggestion, then the Rx text as special
 * instructions and its parsed food relation).
 */
export function planFromPrescription(
  rx: Pick<PrescriptionRecord, 'drug' | 'dose' | 'instructions'>,
  options: PlanOptions = {}
): PrescriptionReminderPlan {
  const parsedFrom = (rx.instructions ?? '').trim();
  const parsed = parseFrequency(parsedFrom);
  const base = applyCatalog(rx.drug) ?? emptyInstructions();
  const foodRelation = parseFoodRelation(parsedFrom);
  const instructions: MedicineInstructions = {
    ...base,
    foodRelation: foodRelation === 'any' ? base.foodRelation : foodRelation,
    specialInstructions: parsedFrom || base.specialInstructions || '',
  };
  const channels = (options.channels && options.channels.length > 0
    ? [...options.channels]
    : [...DEFAULT_CHANNELS]
  ).filter((c) => ALL_CHANNELS.includes(c));

  return {
    schedule: parsed.schedule ?? (parsed.isPrn ? null : { kind: 'daily', timesMinutes: defaultTimesFor(1) }),
    channels: channels.length > 0 ? channels : [...DEFAULT_CHANNELS],
    instructions,
    confidence: parsed.schedule ? parsed.confidence : 'defaulted',
    isPrn: parsed.isPrn,
    parsedFrom,
    note: parsed.note,
  };
}

/** The wizard's editable schedule shape (see `PrescriptionReminderComponent`). */
export interface ScheduleEditorState {
  kind: 'daily' | 'interval' | 'weekly';
  timesMinutes: readonly number[];
  everyDays: number;
  singleTimeMinutes: number;
  weekdays: readonly number[];
}

/**
 * Assemble the wizard's editor state into a schedule, or null when the state
 * cannot make a valid one (daily with no times, weekly with no weekdays) — the
 * confirm button is disabled in exactly those cases. Pure, so the wizard's
 * confirm payload is unit-testable without a component harness.
 */
export function scheduleFromEditor(state: ScheduleEditorState): MedicationSchedule | null {
  switch (state.kind) {
    case 'daily': {
      const times = [...state.timesMinutes].sort((a, b) => a - b);
      return times.length > 0 ? { kind: 'daily', timesMinutes: times } : null;
    }
    case 'interval':
      return {
        kind: 'interval',
        everyDays: Math.max(1, Math.round(state.everyDays)),
        timeMinutes: state.singleTimeMinutes,
      };
    case 'weekly': {
      const days = [...new Set(state.weekdays)].sort((a, b) => a - b);
      return days.length > 0
        ? { kind: 'weekly', weekdays: days, timeMinutes: state.singleTimeMinutes }
        : null;
    }
  }
}

/** Body for `POST /me/prescriptions/:id/to-medication` (null schedule for PRN). */
export function toMedicationBody(plan: PrescriptionReminderPlan): {
  schedule?: MedicationSchedule;
  instructions: MedicineInstructions;
} {
  return plan.schedule
    ? { schedule: plan.schedule, instructions: plan.instructions }
    : { instructions: plan.instructions };
}
