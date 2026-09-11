/**
 * Medicine instructions manager contracts (FEATURE_PLAN.md — medicine
 * instructions manager): a structured "how to take it" sheet per pill — dose
 * form, route, food relation, max daily doses, warnings, side effects, storage
 * and special instructions.
 *
 * Pure types + helpers only, no Angular dependencies (every rule is
 * unit-testable without DI). The curated auto-fill catalog lives in
 * `medicine.catalog.ts`; the server mirrors this shape in
 * `server/src/medications.ts` (`validateInstructions`).
 *
 * This is user-editable informational text, not medical advice — the UI says
 * so and the catalog is a convenience, never an authority.
 */
import { BilingualLabel, historyLabel } from './history.models';

export type MedicineRoute = 'oral' | 'topical' | 'inhalation' | 'injection' | 'other';

/** How the dose relates to food. */
export type FoodRelation = 'before' | 'with' | 'after' | 'any';

export interface MedicineInstructions {
  /** Tablet / syrup / capsule… (free text; the catalog suggests one). */
  doseForm?: string;
  route?: MedicineRoute;
  foodRelation: FoodRelation;
  /** Upper bound per day, or null when not specified. */
  maxDailyDoses?: number | null;
  /** Never-miss warnings ("Do not drink alcohol", "Avoid direct sun"). */
  warnings: string[];
  sideEffects?: string;
  storage?: string;
  specialInstructions?: string;
}

// ---- Bilingual labels ----

export const MEDICINE_ROUTE_LABELS: Record<MedicineRoute, BilingualLabel> = {
  oral: { el: 'Από το στόμα', en: 'By mouth' },
  topical: { el: 'Τοπική εφαρμογή', en: 'Topical' },
  inhalation: { el: 'Εισπνοή', en: 'Inhalation' },
  injection: { el: 'Ένεση', en: 'Injection' },
  other: { el: 'Άλλο', en: 'Other' },
};

export const FOOD_RELATION_LABELS: Record<FoodRelation, BilingualLabel> = {
  before: { el: 'Πριν το φαγητό', en: 'Before food' },
  with: { el: 'Με το φαγητό', en: 'With food' },
  after: { el: 'Μετά το φαγητό', en: 'After food' },
  any: { el: 'Όποτε', en: 'Any time' },
};

export const MEDICINE_ROUTE_KEYS: readonly MedicineRoute[] = Object.keys(
  MEDICINE_ROUTE_LABELS
) as MedicineRoute[];

export const FOOD_RELATION_KEYS: readonly FoodRelation[] = Object.keys(
  FOOD_RELATION_LABELS
) as FoodRelation[];

export function medicineLabel(
  map: Record<string, BilingualLabel>,
  key: string,
  locale: 'el' | 'en' = 'el'
): string {
  return historyLabel(map, key, locale);
}

// ---- Defaults + normalization ----

export const MAX_WARNINGS = 8;
const MAX_TEXT = 400;

export function emptyInstructions(): MedicineInstructions {
  return {
    doseForm: '',
    route: 'oral',
    foodRelation: 'any',
    maxDailyDoses: null,
    warnings: [],
    sideEffects: '',
    storage: '',
    specialInstructions: '',
  };
}

function isRoute(value: unknown): value is MedicineRoute {
  return MEDICINE_ROUTE_KEYS.includes(value as MedicineRoute);
}

function isFoodRelation(value: unknown): value is FoodRelation {
  return FOOD_RELATION_KEYS.includes(value as FoodRelation);
}

const cleanText = (value: unknown, max = MAX_TEXT): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * Total normalizer: unknown payloads never throw and missing fields fall back
 * to the defaults, so a forward-compatible server row can't break the UI.
 */
export function normalizeInstructions(input: unknown): MedicineInstructions {
  if (typeof input !== 'object' || input === null) {
    return emptyInstructions();
  }
  const raw = input as Partial<MedicineInstructions>;
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings
        .map((w) => cleanText(w, 160))
        .filter((w) => w.length > 0)
        .slice(0, MAX_WARNINGS)
    : [];
  const maxDaily = raw.maxDailyDoses;
  return {
    doseForm: cleanText(raw.doseForm, 60),
    route: isRoute(raw.route) ? raw.route : 'oral',
    foodRelation: isFoodRelation(raw.foodRelation) ? raw.foodRelation : 'any',
    maxDailyDoses:
      typeof maxDaily === 'number' && Number.isFinite(maxDaily) && maxDaily > 0
        ? Math.min(24, Math.round(maxDaily))
        : null,
    warnings,
    sideEffects: cleanText(raw.sideEffects),
    storage: cleanText(raw.storage),
    specialInstructions: cleanText(raw.specialInstructions),
  };
}

/** True when the sheet carries any user-meaningful information. */
export function hasInstructions(instructions: MedicineInstructions | undefined | null): boolean {
  if (!instructions) {
    return false;
  }
  return Boolean(
    (instructions.doseForm ?? '') ||
      (instructions.route && instructions.route !== 'oral') ||
      instructions.foodRelation !== 'any' ||
      (instructions.maxDailyDoses ?? null) !== null ||
      instructions.warnings.length > 0 ||
      (instructions.sideEffects ?? '') ||
      (instructions.storage ?? '') ||
      (instructions.specialInstructions ?? '')
  );
}

/**
 * One-line summary for the medication list ("Από το στόμα · Μετά το φαγητό ·
 * max 3/ημέρα"). Returns `''` when there is nothing worth showing, so callers
 * can render a neutral fallback instead of an empty chip.
 */
export function instructionsSummary(
  instructions: MedicineInstructions,
  locale: 'el' | 'en' = 'el',
  /**
   * Separator between parts. The default middle dot is fine in the UI, but
   * the PDF export passes an ASCII separator (`; `) so the line stays
   * ASCII-encoded and text-searchable (see export.pdf.ts encoding note).
   */
  separator = ' · '
): string {
  const parts: string[] = [];
  if (instructions.route && instructions.route !== 'oral') {
    parts.push(medicineLabel(MEDICINE_ROUTE_LABELS, instructions.route, locale));
  }
  if (instructions.foodRelation !== 'any') {
    parts.push(medicineLabel(FOOD_RELATION_LABELS, instructions.foodRelation, locale));
  }
  if ((instructions.maxDailyDoses ?? null) !== null) {
    parts.push(locale === 'el' ? `έως ${instructions.maxDailyDoses}/ημέρα` : `up to ${instructions.maxDailyDoses}/day`);
  }
  if (instructions.warnings.length > 0) {
    const count = instructions.warnings.length;
    parts.push(
      locale === 'el'
        ? `${count} ${count > 1 ? 'προειδοποιήσεις' : 'προειδοποίηση'}`
        : `${count} warning${count > 1 ? 's' : ''}`
    );
  }
  return parts.join(separator);
}

/** `tel:`-free plain text warnings block for exports/reminders. */
export function warningsText(instructions: MedicineInstructions): string {
  return instructions.warnings.join('; ');
}
