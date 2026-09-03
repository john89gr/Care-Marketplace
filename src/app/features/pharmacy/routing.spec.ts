import { describe, it, expect } from 'vitest';
import { choosePharmacy, haversineKm, routeWithDistance } from './routing';
import type { PartnerPharmacy } from './pharmacy.models';

/**
 * Routing tests (FEATURE_PLAN.md §9 subtask 15): nearest-with-stock choice.
 */
const SYNTAGMA: PartnerPharmacy = {
  id: 'ph-1',
  name: 'Syntagma Central Pharmacy',
  address: 'Pl. Syntagmatos 1, Athens',
  lat: 37.9756,
  lng: 23.7332,
  inStock: true,
};

const KOLONAKI_OUT: PartnerPharmacy = {
  id: 'ph-2',
  name: 'Kolonaki Care Pharmacy',
  address: 'Skoufa 12, Athens',
  lat: 37.9825,
  lng: 23.7305,
  inStock: false,
};

const PIRAEUS: PartnerPharmacy = {
  id: 'ph-3',
  name: 'Piraeus Port Pharmacy',
  address: 'Akti Miaouli 45, Piraeus',
  lat: 37.9415,
  lng: 23.6465,
  inStock: true,
};

// City-centre origin: closest partner is Kolonaki (out of stock), then Syntagma.
const ORIGIN = { lat: 37.9838, lng: 23.7275 };

describe('haversineKm', () => {
  it('is zero for identical points and symmetric', () => {
    expect(haversineKm(ORIGIN, ORIGIN)).toBe(0);
    const a = haversineKm(ORIGIN, { lat: SYNTAGMA.lat, lng: SYNTAGMA.lng });
    const b = haversineKm({ lat: SYNTAGMA.lat, lng: SYNTAGMA.lng }, ORIGIN);
    expect(a).toBeCloseTo(b, 9);
  });

  it('matches known Athens distances within tolerance', () => {
    const centreToSyntagma = haversineKm(ORIGIN, { lat: SYNTAGMA.lat, lng: SYNTAGMA.lng });
    expect(centreToSyntagma).toBeGreaterThan(0.5);
    expect(centreToSyntagma).toBeLessThan(2);
    const centreToPiraeus = haversineKm(ORIGIN, { lat: PIRAEUS.lat, lng: PIRAEUS.lng });
    expect(centreToPiraeus).toBeGreaterThan(5);
  });
});

describe('choosePharmacy', () => {
  it('picks the nearest partner with stock, skipping closer out-of-stock ones', () => {
    const kolonakiDistance = haversineKm(ORIGIN, { lat: KOLONAKI_OUT.lat, lng: KOLONAKI_OUT.lng });
    const syntagmaDistance = haversineKm(ORIGIN, { lat: SYNTAGMA.lat, lng: SYNTAGMA.lng });
    expect(kolonakiDistance).toBeLessThan(syntagmaDistance);
    expect(choosePharmacy(ORIGIN, [KOLONAKI_OUT, SYNTAGMA, PIRAEUS])?.id).toBe('ph-1');
  });

  it('picks the nearest when several have stock', () => {
    const kolonakiInStock = { ...KOLONAKI_OUT, inStock: true };
    expect(choosePharmacy(ORIGIN, [SYNTAGMA, kolonakiInStock, PIRAEUS])?.id).toBe('ph-2');
  });

  it('returns null when no partner has stock', () => {
    expect(choosePharmacy(ORIGIN, [{ ...SYNTAGMA, inStock: false }, KOLONAKI_OUT])).toBeNull();
  });

  it('returns null for an empty partner list', () => {
    expect(choosePharmacy(ORIGIN, [])).toBeNull();
  });

  it('reports the distance alongside the choice', () => {
    const routed = routeWithDistance(ORIGIN, [KOLONAKI_OUT, SYNTAGMA, PIRAEUS]);
    expect(routed?.pharmacy.id).toBe('ph-1');
    expect(routed?.distanceKm).toBeCloseTo(
      haversineKm(ORIGIN, { lat: SYNTAGMA.lat, lng: SYNTAGMA.lng }),
      9
    );
  });
});
