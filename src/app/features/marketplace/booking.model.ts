import { BookingRecord } from './booking.store';

/**
 * Booking lifecycle state machine (FEATURE_PLAN.md §3). Pure functions only:
 * the store, the UI and the tests share the exact same rules.
 *
 * Transition matrix (`requested → accepted → in_progress → completed` plus
 * cancellation/dispute short-circuits):
 *
 *   requested    → accepted | cancelled
 *   accepted     → in_progress | cancelled
 *   in_progress  → completed | disputed
 *   completed    → disputed
 *   cancelled    → (terminal)
 *   disputed     → (terminal on the booking side; resolution via admin console)
 */

export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'requested',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'disputed',
];

export type BookingEventKind =
  | 'created'
  | 'accepted'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'rescheduled'
  | 'disputed';

export interface BookingEvent {
  id: string;
  bookingId: string;
  kind: BookingEventKind;
  atMs: number;
  byUserId: string;
  byName: string;
  detail: string;
}

/** Allowed transitions per status. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  cancelled: [],
  disputed: [],
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUSES as readonly string[]).includes(value);
}

/** True when moving `from` → `to` is a legal transition. */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Cancellation policy (FEATURE_PLAN.md §3 subtask 8): free cancellation up to
 * `FREE_CANCEL_HOURS` before the visit start; afterwards a percentage fee of
 * the held amount applies. Amounts stay in integer cents end to end.
 */
export const FREE_CANCEL_HOURS = 24;
/** Platform commission percent at escrow release (13.9 for demo parity). */
export const PLATFORM_FEE_PERCENT = 13.9;
/** Cancellation fee percent applied when cancelling inside the free window. */
export const CANCEL_FEE_PERCENT = 10;

export interface CancellationQuote {
  free: boolean;
  /** Fee in integer cents (0 when free). */
  feeCents: number;
  /** Refund in integer cents (amount when free). */
  refundCents: number;
  hoursUntilStart: number;
}

/**
 * Quote the cancellation outcome for a booking. `nowMs` is injectable so the
 * math is deterministic in tests. Never returns negative or fractional cents.
 */
export function quoteCancellation(
  booking: Pick<BookingRecord, 'scheduledAtMs'>,
  amountCents: number,
  nowMs: number = Date.now()
): CancellationQuote {
  const msUntilStart = booking.scheduledAtMs - nowMs;
  const hoursUntilStart = msUntilStart / 3_600_000;
  const free = hoursUntilStart >= FREE_CANCEL_HOURS;
  const feeCents = free
    ? 0
    : Math.min(amountCents, Math.round((amountCents * CANCEL_FEE_PERCENT) / 100));
  return {
    free,
    feeCents,
    refundCents: amountCents - feeCents,
    hoursUntilStart,
  };
}

/** Provider commission taken from the provider's payout on release (cents). */
export function platformFeeCents(amountCents: number): number {
  return Math.min(amountCents, Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100));
}

/**
 * Role-aware action list for a booking (subtask 7). Empty for terminal
 * states. Used to render the allowed-action buttons per role.
 */
export type BookingAction = 'accept' | 'start' | 'complete' | 'cancel' | 'reschedule' | 'dispute';

/**
 * Pending reschedule proposal (subtask 6). A reschedule takes effect as a new
 * timeslot immediately, but both parties must confirm it: the proposer counts
 * as confirmed, the other party confirms via `confirmReschedule`. The flags
 * are the dual-confirmation record shown in the timeline UI.
 */
export interface RescheduleProposal {
  scheduledAtMs: number;
  note?: string;
  proposedBy: 'client' | 'provider';
  clientConfirmed: boolean;
  providerConfirmed: boolean;
}

/** True once both parties confirmed the pending proposal. */
export function rescheduleConfirmed(
  proposal: Pick<RescheduleProposal, 'clientConfirmed' | 'providerConfirmed'> | null | undefined
): boolean {
  return Boolean(proposal?.clientConfirmed && proposal?.providerConfirmed);
}

/** Roles allowed to accept a booking (subtask 14: only providers accept). */
export const ACCEPT_ROLES: readonly string[] = ['caregiver', 'nurse', 'physio'];

/** True when the session roles include a provider role. */
export function canAcceptBooking(roles: readonly string[]): boolean {
  return roles.some((role) => ACCEPT_ROLES.includes(role));
}

/**
 * True when the user is a party to the booking (subtask 14: only involved
 * parties may cancel). Matches either the client or the provider user id.
 */
export function isInvolvedParty(
  booking: Pick<BookingRecord, 'clientId' | 'providerUserId'>,
  userId: string | null | undefined
): boolean {
  if (!userId) {
    return false;
  }
  return booking.clientId === userId || booking.providerUserId === userId;
}

export function allowedActions(
  status: BookingStatus,
  role: 'client' | 'provider'
): BookingAction[] {
  switch (status) {
    case 'requested':
      return role === 'provider' ? ['accept', 'cancel', 'reschedule'] : ['cancel', 'reschedule'];
    case 'accepted':
      return role === 'provider' ? ['start', 'cancel', 'reschedule'] : ['cancel', 'reschedule'];
    case 'in_progress':
      return role === 'provider' ? ['complete'] : ['dispute'];
    case 'completed':
      return role === 'client' ? ['dispute'] : [];
    default:
      return [];
  }
}
