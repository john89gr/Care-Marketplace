/**
 * Pharmacy order state machine (FEATURE_PLAN.md §9 subtask 2).
 * Pure guard function + helpers; no DI, fully unit-testable.
 */
import type { PharmacyOrderStatus } from './pharmacy.models';

/** Allowed forward edges. `failed → routed` is the explicit retry edge. */
export const ORDER_TRANSITIONS: Record<PharmacyOrderStatus, readonly PharmacyOrderStatus[]> = {
  uploaded: ['routed', 'failed'],
  routed: ['accepted', 'failed'],
  accepted: ['preparing', 'failed'],
  preparing: ['out_for_delivery', 'failed'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: [],
  failed: ['routed'],
};

/** Guard: true when `from → to` is a legal pipeline transition. */
export function canTransition(from: PharmacyOrderStatus, to: PharmacyOrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/** Legal next states from `from` (drives the pharmacy stub action buttons). */
export function nextStatuses(from: PharmacyOrderStatus): PharmacyOrderStatus[] {
  return [...(ORDER_TRANSITIONS[from] ?? [])];
}

/** Terminal states: no further transitions possible. */
export function isTerminalOrder(status: PharmacyOrderStatus): boolean {
  return status === 'delivered';
}
