/**
 * Barcode / manual-entry parsing (FEATURE_PLAN.md §9 subtasks 5, 16).
 * Pure functions. The scanner payload is tried as JSON first (the encoded
 * e-prescription format); anything else falls back to the line-based manual
 * format so a damaged QR never hard-blocks the user. Throws
 * BarcodeParseError with a user-facing message when nothing usable remains.
 */
import type { ParsedMed } from './pharmacy.models';

export interface ParsedPrescriptionPayload {
  prescriber: string;
  meds: ParsedMed[];
}

export const UNKNOWN_PRESCRIBER = 'Unknown prescriber';

export class BarcodeParseError extends Error {
  constructor(
    message = 'The barcode could not be read. Please check the code or enter the details manually.'
  ) {
    super(message);
    this.name = 'BarcodeParseError';
  }
}

/**
 * Parse a scanned barcode/QR payload. Accepts the JSON e-prescription shape
 * `{ prescriber?, meds|medications: [{ name, dose?, qty? }] }`, falling back
 * to the manual line format.
 */
export function parseBarcodePayload(raw: string): ParsedPrescriptionPayload {
  const text = (raw ?? '').trim();
  if (!text) {
    throw new BarcodeParseError('No barcode data found. Please scan again or enter the details manually.');
  }
  const fromJson = tryParseJsonPayload(text);
  if (fromJson) {
    return fromJson;
  }
  if (/^[[{]/.test(text)) {
    // JSON-shaped but with no usable meds — do not misread the raw JSON as a
    // medication name; report it as unreadable instead.
    throw new BarcodeParseError();
  }
  // Fallback: the payload may already be plain lines (printed backup code).
  return parseManualEntry(text);
}

/**
 * Parse manual entry / printed-backup lines. One medication per line (or `;`
 * separated): `Name | Dose | xQty` — `|` or `,` separators, dose and qty
 * optional (qty defaults to 1).
 *
 *   Insulin glargine | 10 units | x1
 *   Atorvastatin, 20 mg, x30
 */
export function parseManualEntry(raw: string): ParsedPrescriptionPayload {
  const text = (raw ?? '').trim();
  if (!text) {
    throw new BarcodeParseError('Enter at least one medication line (name, dose and quantity).');
  }
  const meds: ParsedMed[] = [];
  for (const chunk of text.split(/[\n;]+/)) {
    const line = chunk.trim();
    if (!line) {
      continue;
    }
    const med = parseLine(line);
    if (med) {
      meds.push(med);
    }
  }
  if (meds.length === 0) {
    throw new BarcodeParseError(
      'We could not read that code. Use one line per medication, e.g. “Amoxicillin | 500 mg | x21”.'
    );
  }
  return { prescriber: UNKNOWN_PRESCRIBER, meds };
}

function tryParseJsonPayload(text: string): ParsedPrescriptionPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  const rawMeds = record['meds'] ?? record['medications'];
  if (!Array.isArray(rawMeds) || rawMeds.length === 0) {
    return null;
  }
  const meds: ParsedMed[] = [];
  for (const entry of rawMeds) {
    const med = normaliseJsonMed(entry);
    if (med) {
      meds.push(med);
    }
  }
  if (meds.length === 0) {
    return null;
  }
  const prescriber =
    typeof record['prescriber'] === 'string' && record['prescriber'].trim() !== ''
      ? (record['prescriber'] as string).trim()
      : UNKNOWN_PRESCRIBER;
  return { prescriber, meds };
}

function normaliseJsonMed(entry: unknown): ParsedMed | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  if (!name) {
    return null;
  }
  const dose = typeof record['dose'] === 'string' ? record['dose'].trim() : '';
  return { name, dose, qty: normaliseQty(record['qty']) };
}

function parseLine(line: string): ParsedMed | null {
  const parts = line
    .split(line.includes('|') ? '|' : ',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) {
    return null;
  }
  const name = (parts[0] ?? '').replace(/^(med|name)\s*[:=]\s*/i, '').trim();
  if (!name) {
    return null;
  }
  let dose = '';
  let qty = 1;
  for (const part of parts.slice(1)) {
    const q = tryParseQty(part);
    if (q !== null) {
      qty = q;
    } else if (!dose) {
      dose = part.replace(/^dose\s*[:=]\s*/i, '').trim();
    }
  }
  return { name, dose, qty };
}

/**
 * A part is a quantity only with an explicit marker (`x30`, `qty: 30`), a
 * bare count (`30`), or a count with a pack noun (`60 tabs`). Dose units
 * (`mg`, `units`, `IU`, …) never count as quantities — “10 units” is a dose.
 */
function tryParseQty(part: string): number | null {
  const text = part.trim();
  const pack = '(tablets?|tabs?|capsules?|caps?|pcs?|packs?|bottles?|vials?)';
  let match = new RegExp(`^(?:qty\\s*[:=]\\s*|x\\s*)(\\d+)\\s*${pack}?$`, 'i').exec(text);
  if (match) {
    return normaliseQty(match[1]);
  }
  match = new RegExp(`^(\\d+)\\s*${pack}?$`, 'i').exec(text);
  if (match && (match[2] || /^\d+$/.test(text))) {
    return normaliseQty(match[1]);
  }
  return null;
}

function normaliseQty(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
