import { describe, it, expect } from 'vitest';
import {
  ORDER_TRANSITIONS,
  canTransition,
  nextStatuses,
  isTerminalOrder,
} from './order-machine';
import type { PharmacyOrderStatus } from './pharmacy.models';

/**
 * State-machine tests (FEATURE_PLAN.md §9 subtask 15): the full transition
 * matrix, the retry edge, and terminal states.
 */

const ALL: PharmacyOrderStatus[] = [
  'uploaded',
  'routed',
  'accepted',
  'preparing',
  'out_for_delivery',
  'delivered',
  'failed',
];

describe('pharmacy order state machine', () => {
  it('allows exactly the documented edges', () => {
    expect(ORDER_TRANSITIONS['uploaded']).toEqual(['routed', 'failed']);
    expect(ORDER_TRANSITIONS['routed']).toEqual(['accepted', 'failed']);
    expect(ORDER_TRANSITIONS['accepted']).toEqual(['preparing', 'failed']);
    expect(ORDER_TRANSITIONS['preparing']).toEqual(['out_for_delivery', 'failed']);
    expect(ORDER_TRANSITIONS['out_for_delivery']).toEqual(['delivered', 'failed']);
    expect(ORDER_TRANSITIONS['delivered']).toEqual([]);
    expect(ORDER_TRANSITIONS['failed']).toEqual(['routed']);
  });

  it('accepts every listed edge via the guard', () => {
    for (const from of ALL) {
      for (const to of ORDER_TRANSITIONS[from]) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects skips, backwards moves and self-transitions', () => {
    const illegal: Array<[PharmacyOrderStatus, PharmacyOrderStatus]> = [
      ['uploaded', 'delivered'],
      ['uploaded', 'accepted'],
      ['uploaded', 'uploaded'],
      ['routed', 'uploaded'],
      ['routed', 'delivered'],
      ['accepted', 'routed'],
      ['accepted', 'delivered'],
      ['preparing', 'accepted'],
      ['out_for_delivery', 'preparing'],
      ['delivered', 'failed'],
      ['delivered', 'routed'],
      ['failed', 'accepted'],
      ['failed', 'failed'],
      ['failed', 'delivered'],
    ];
    for (const [from, to] of illegal) {
      expect(canTransition(from, to)).toBe(false);
    }
  });

  it('exposes the retry edge failed → routed', () => {
    expect(canTransition('failed', 'routed')).toBe(true);
    expect(nextStatuses('failed')).toEqual(['routed']);
  });

  it('nextStatuses mirrors the transition table', () => {
    for (const from of ALL) {
      expect(nextStatuses(from)).toEqual([...ORDER_TRANSITIONS[from]]);
    }
  });

  it('treats only delivered as terminal', () => {
    expect(isTerminalOrder('delivered')).toBe(true);
    for (const status of ALL.filter((s) => s !== 'delivered')) {
      expect(isTerminalOrder(status)).toBe(false);
    }
  });
});
