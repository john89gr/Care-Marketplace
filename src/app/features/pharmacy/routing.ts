/**
 * Pharmacy routing (FEATURE_PLAN.md §9 subtask 7): nearest pharmacy with
 * stock. Pure functions over lat/lng so the choice logic is unit-testable
 * without DI. The caller supplies the origin (browser geolocation when
 * available, profile/city fallback otherwise — see the pages); distance math
 * here mirrors the marketplace matcher convention (haversine, km).
 */
import type { PartnerPharmacy } from './pharmacy.models';

export interface RoutingOrigin {
  lat: number;
  lng: number;
}

export interface RoutedPharmacy {
  pharmacy: PartnerPharmacy;
  distanceKm: number;
}

/** Great-circle distance in km. */
export function haversineKm(a: RoutingOrigin, b: RoutingOrigin): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Nearest pharmacy with stock (`inStock`). Skips out-of-stock partners even
 * when they are closer. Returns null when no partner can fulfil (the caller
 * maps that to a `failed` order with a retry affordance).
 */
export function choosePharmacy(
  origin: RoutingOrigin,
  pharmacies: readonly PartnerPharmacy[]
): PartnerPharmacy | null {
  return routeWithDistance(origin, pharmacies)?.pharmacy ?? null;
}

/** Same choice plus the distance for timeline/receipt display. */
export function routeWithDistance(
  origin: RoutingOrigin,
  pharmacies: readonly PartnerPharmacy[]
): RoutedPharmacy | null {
  let best: RoutedPharmacy | null = null;
  for (const pharmacy of pharmacies) {
    if (!pharmacy.inStock) {
      continue;
    }
    const distanceKm = haversineKm(origin, { lat: pharmacy.lat, lng: pharmacy.lng });
    if (!best || distanceKm < best.distanceKm) {
      best = { pharmacy, distanceKm };
    }
  }
  return best;
}
