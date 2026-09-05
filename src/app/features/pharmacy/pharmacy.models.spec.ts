import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PharmacyOrder } from './pharmacy.models';
import { addressFromProfile, medicationDraftsFor } from './pharmacy.models';

/**
 * Pure-model tests (FEATURE_PLAN.md §9 subtasks 10 & 14): the delivered →
 * medication-list draft math and the profile delivery-address default. Both
 * functions are pure, so no Angular imports are needed.
 */

function deliveredOrder(overrides: Partial<PharmacyOrder> = {}): PharmacyOrder {
  return {
    id: 'po-1',
    prescriptionId: 'rx-1',
    clientId: 'u-client',
    pharmacyId: 'ph-1',
    pharmacyName: 'Syntagma Central Pharmacy',
    meds: [
      { name: 'Atorvastatin', dose: '20 mg', qty: 30 },
      { name: 'Vitamin D3', dose: '1 tablet', qty: 1 },
    ],
    prescriber: 'Dr. Stavrou',
    status: 'delivered',
    deliveryAddress: 'Mitropoleos 12, Athens',
    timeline: [
      { status: 'uploaded', atMs: 1000 },
      { status: 'delivered', atMs: 2000 },
    ],
    createdAtMs: 1000,
    updatedAtMs: new Date(2026, 0, 15, 10, 0, 0).getTime(),
    ...overrides,
  };
}

describe('medicationDraftsFor', () => {
  beforeEach(() => {
    // Fixed clock so the "no updatedAtMs → now" fallback is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0)); // 2026-09-02 12:00 local
  });

  it('returns one draft per med, carrying name/dose/qty and the prescriber', () => {
    const drafts = medicationDraftsFor(deliveredOrder(), 'Dr. Stavrou');
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ name: 'Atorvastatin', dose: '20 mg', qty: 30 });
    expect(drafts[1]).toMatchObject({ name: 'Vitamin D3', dose: '1 tablet', qty: 1 });
    for (const draft of drafts) {
      expect(draft.prescriber).toBe('Dr. Stavrou');
    }
  });

  it('uses the passed prescriber even when it differs from the order record', () => {
    const drafts = medicationDraftsFor(deliveredOrder(), 'Dr. Ioannou');
    expect(drafts[0]?.prescriber).toBe('Dr. Ioannou');
  });

  it('computes a 30-day local refill date from the fulfilment timestamp', () => {
    // updatedAtMs = 2026-01-15 → +30 days = 2026-02-14.
    const drafts = medicationDraftsFor(deliveredOrder(), 'Dr. Stavrou');
    expect(drafts[0]?.refillDueDate).toBe('2026-02-14');
    expect(drafts[1]?.refillDueDate).toBe('2026-02-14');
  });

  it('zero-pads the refill month and day', () => {
    // updatedAtMs = 2026-03-05 → +30 days = 2026-04-04 (mm/dd need padding).
    const drafts = medicationDraftsFor(deliveredOrder({ updatedAtMs: new Date(2026, 2, 5).getTime() }), 'Dr. Stavrou');
    expect(drafts[0]?.refillDueDate).toBe('2026-04-04');
  });

  it('falls back to now when the order has no fulfilment timestamp', () => {
    const drafts = medicationDraftsFor(deliveredOrder({ updatedAtMs: 0 }), 'Dr. Stavrou');
    // Fixed clock 2026-09-02 → +30 days = 2026-10-02.
    expect(drafts[0]?.refillDueDate).toBe('2026-10-02');
  });

  it('returns an empty list for an order with no line items', () => {
    expect(medicationDraftsFor(deliveredOrder({ meds: [] }), 'Dr. Stavrou')).toEqual([]);
  });
});

describe('addressFromProfile', () => {
  it('returns the address when the profile carries a string address', () => {
    expect(addressFromProfile({ address: 'Mitropoleos 12, Athens' })).toBe('Mitropoleos 12, Athens');
  });

  it('returns empty when the profile has no address field', () => {
    expect(addressFromProfile({ displayName: 'Maria' })).toBe('');
  });

  it('returns empty when the address is not a string', () => {
    expect(addressFromProfile({ address: 42 })).toBe('');
    expect(addressFromProfile({ address: null })).toBe('');
  });

  it('returns empty for a missing profile', () => {
    expect(addressFromProfile(null)).toBe('');
    expect(addressFromProfile(undefined)).toBe('');
  });

  it('returns empty for non-object profiles', () => {
    expect(addressFromProfile('Mitropoleos 12')).toBe('');
    expect(addressFromProfile(42)).toBe('');
  });
});
