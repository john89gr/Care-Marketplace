/**
 * e-Prescription & pharmacy order models (FEATURE_PLAN.md §9 subtask 1).
 * Plain data contracts shared by the stores, pages and the demo backend
 * shape. State-transition rules live in `order-machine.ts`; barcode parsing
 * in `barcode.ts`; pharmacy choice in `routing.ts` — all pure and unit-testable.
 */

/** One prescribed line item (normalised by the barcode parser). */
export interface ParsedMed {
  name: string;
  dose: string;
  /** Number of packs/units prescribed. Always ≥ 1 after normalisation. */
  qty: number;
}

/** Lifecycle of a scanned prescription (distinct from the order pipeline). */
export type PrescriptionState = 'parsed' | 'confirmed' | 'failed';

export interface Prescription {
  id: string;
  /** Raw barcode/QR payload exactly as scanned or typed. */
  barcodePayload: string;
  meds: ParsedMed[];
  prescriber: string;
  state: PrescriptionState;
  createdAtMs: number;
}

/**
 * Order pipeline (subtask 2). `uploaded` is the initial state right after a
 * scan; `failed` covers both unreadable-routing failures and downstream
 * fulfilment failures. `failed → routed` is the explicit retry edge.
 */
export type PharmacyOrderStatus =
  | 'uploaded'
  | 'routed'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed';

export interface OrderTimelineEntry {
  status: PharmacyOrderStatus;
  atMs: number;
  note?: string;
}

export interface PharmacyOrder {
  id: string;
  prescriptionId: string;
  clientId: string;
  /** Null while unrouted / when routing failed. */
  pharmacyId: string | null;
  pharmacyName: string | null;
  meds: ParsedMed[];
  prescriber: string;
  status: PharmacyOrderStatus;
  deliveryAddress: string;
  timeline: OrderTimelineEntry[];
  createdAtMs: number;
  updatedAtMs: number;
}

/** Partner pharmacy seed shape (subtask 6). `inStock` is the mock stock flag. */
export interface PartnerPharmacy {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  inStock: boolean;
}

/** Response contract for POST /prescriptions/scan (subtask 3). */
export interface PrescriptionScanResult {
  prescription: Prescription;
  order: PharmacyOrder;
}

const STATUS_LABELS: Record<PharmacyOrderStatus, string> = {
  uploaded: 'Uploaded',
  routed: 'Routed to pharmacy',
  accepted: 'Accepted',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
};

/** Human-readable label for a pipeline status (orders timeline UI). */
export function statusLabel(status: PharmacyOrderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * Delivery address default (subtask 14): prefer an `address` field on the
 * profile when the backend provides one; the profile contract does not
 * guarantee it, so anything else falls back to an empty override string.
 */
export function addressFromProfile(profile: unknown): string {
  if (profile && typeof profile === 'object' && 'address' in profile) {
    const address = (profile as { address?: unknown }).address;
    return typeof address === 'string' ? address : '';
  }
  return '';
}

// ---- Filled order → medication list (subtask 10) ----

/**
 * Draft medication derived from a filled order. Persisted via
 * POST /me/medications by `OrdersStore.importToMedications` with a default
 * daily-morning schedule the user can adjust on the medications page (the
 * scan payload carries no schedule information).
 */
export interface MedicationDraft {
  name: string;
  dose: string;
  qty: number;
  prescriber: string;
  /** Local yyyy-mm-dd estimate: 30 days of supply from fulfilment. */
  refillDueDate: string;
}

const SUPPLY_DAYS = 30;

/** Drafts for every line item of a delivered order (pure, unit-testable). */
export function medicationDraftsFor(order: PharmacyOrder, prescriber: string): MedicationDraft[] {
  const fulfilMs = order.updatedAtMs || Date.now();
  const refill = new Date(fulfilMs + SUPPLY_DAYS * 24 * 60 * 60 * 1000);
  const mm = String(refill.getMonth() + 1).padStart(2, '0');
  const dd = String(refill.getDate()).padStart(2, '0');
  const refillDueDate = `${refill.getFullYear()}-${mm}-${dd}`;
  return order.meds.map((med) => ({
    name: med.name,
    dose: med.dose,
    qty: med.qty,
    prescriber,
    refillDueDate,
  }));
}
