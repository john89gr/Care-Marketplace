import { InjectionToken } from '@angular/core';
import { Role } from '../../core/auth/roles';
import { CaregiverCard } from './marketplace.store';
import { GeoPoint } from '../../core/services/geo/geolocation.service';

/**
 * Matching engine v2 (FEATURE_PLAN.md §5): weighted composite scoring with
 * real geo, distance bands, price fit, speciality match, history boost and a
 * cancellation penalty. Every scoring step is a pure function so the whole
 * engine is unit-testable without DI (subtask 12).
 */

export type SortOption = 'relevance' | 'distance' | 'rating' | 'price';

export interface MatchQuery {
  query: string;
  roles: Role[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
  /** Result ordering (v2). Defaults to relevance (weighted score). */
  sort?: SortOption;
  /** Budget filter + price-fit scoring (subtask 7). */
  maxHourlyRate?: number | null;
  /** Real user position; when present + card has coords, haversine is used. */
  origin?: GeoPoint | null;
}

/** Weighted contribution of each factor to the composite score. */
export interface MatchingWeights {
  rating: number;
  availableNow: number;
  distance: number;
  price: number;
  speciality: number;
  history: number;
}

export const DEFAULT_WEIGHTS: MatchingWeights = {
  rating: 0.35,
  availableNow: 0.25,
  distance: 0.2,
  price: 0.1,
  speciality: 0.05,
  history: 0.05,
};

/** Subtraction per recent cancellation (capped, see scoreCandidate). */
export const CANCELLATION_PENALTY = 0.05;
export const MAX_CANCELLATION_PENALTY = 0.15;

/**
 * Injectable weights for tuning/testing (subtask 5). Pure functions accept
 * weights as a parameter; this token lets DI override the default.
 */
export const MATCHING_WEIGHTS = new InjectionToken<MatchingWeights>('MATCHING_WEIGHTS', {
  factory: () => DEFAULT_WEIGHTS,
});

// ---- Distance bands (subtask 3) ----

/** Upper bounds (km) of the ranking bands: 0–2, 2–5, 5–10, >10. */
export const DISTANCE_BANDS = [2, 5, 10] as const;
/** Score per band, closest first. */
const BAND_SCORES = [1, 0.75, 0.5, 0.25] as const;

export function distanceBand(km: number): 0 | 1 | 2 | 3 {
  // Non-finite distances (NaN/Infinity from bad payloads) rank worst.
  if (!Number.isFinite(km)) return 3;
  if (km <= DISTANCE_BANDS[0]) return 0;
  if (km <= DISTANCE_BANDS[1]) return 1;
  if (km <= DISTANCE_BANDS[2]) return 2;
  return 3;
}

export function distanceBandScore(km: number): number {
  return BAND_SCORES[distanceBand(km)];
}

// ---- Real geo (subtask 2) ----

/** Great-circle distance in km between two points. */
export function haversineKm(a: GeoPoint | { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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
 * Effective distance for a card: haversine from the user origin when both
 * ends have coordinates, otherwise the backend-provided distanceKm.
 */
export function distanceOf(card: CaregiverCard, origin: GeoPoint | null | undefined): number {
  if (origin && typeof card.lat === 'number' && typeof card.lng === 'number') {
    return haversineKm(origin, { lat: card.lat, lng: card.lng });
  }
  return card.distanceKm;
}

// ---- Speciality taxonomy (subtask 8) ----

export const SPECIALITY_GROUPS = {
  nurse: ['injections', 'wound care', 'dressing', 'insulin', 'catheter', 'stoma care'],
  physio: ['mobility', 'rehabilitation', 'post-stroke rehab', 'joint mobilisation', 'exercise programme'],
  caregiver: ['companionship', 'personal care', 'meal preparation', 'mobility assistance'],
} as const;

/**
 * True when the query intersects the card's specialities (or its name —
 * keeping v1's free-text behaviour inside the speciality factor).
 */
export function specialityMatches(card: CaregiverCard, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return false;
  }
  if (card.displayName.toLowerCase().includes(q)) {
    return true;
  }
  const specialties = card.specialties ?? [];
  if (specialties.some((s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase()))) {
    return true;
  }
  // Fall back to role-driven taxonomy terms ("nurse", "physio"…).
  const terms = card.roles.flatMap((role) => (SPECIALITY_GROUPS as Record<string, readonly string[]>)[role] ?? []);
  return terms.some((t) => q.includes(t) || t.includes(q));
}

// ---- Scoring (subtasks 4, 6, 7, 9, 10, 11) ----

/** Weighted contribution of each factor (breakdown for the explainer UI). */
export interface ScoreBreakdown {
  rating: number;
  availableNow: number;
  distance: number;
  price: number;
  speciality: number;
  history: number;
  /** Cancellation penalty, always ≤ 0. */
  cancellationPenalty: number;
  score: number;
}

/** Price-fit factor: within budget → 1; over budget → linear falloff. */
export function priceFit(hourlyRate: number, maxHourlyRate: number | null | undefined): number {
  // Non-finite rates carry no signal — score worst, never NaN.
  if (!Number.isFinite(hourlyRate)) {
    return 0;
  }
  if (maxHourlyRate == null || !Number.isFinite(maxHourlyRate) || maxHourlyRate <= 0) {
    // No budget set: cheaper is mildly better (normalize against €50/h).
    return Math.min(1, Math.max(0, 1 - hourlyRate / 50));
  }
  if (hourlyRate <= maxHourlyRate) {
    return 1;
  }
  return Math.max(0, 1 - (hourlyRate - maxHourlyRate) / maxHourlyRate);
}

export function scoreCandidate(
  card: CaregiverCard,
  query: MatchQuery,
  weights: MatchingWeights = DEFAULT_WEIGHTS
): ScoreBreakdown {
  const rawKm = distanceOf(card, query.origin);
  // Sanitize hostile payloads so the score is always finite: unknown
  // distance ranks worst, negative counts clamp to 0 (subtask 14).
  const km = Number.isFinite(rawKm) ? Math.max(0, rawKm) : 999;
  const safeRating = Number.isFinite(card.rating) ? clamp(card.rating, 0, 5) : 0;
  const completedRaw = card.completedVisits ?? 0;
  const completed = Number.isFinite(completedRaw) ? Math.max(0, completedRaw) : 0;
  const cancelledRaw = card.recentCancellations ?? 0;
  const cancelled = Number.isFinite(cancelledRaw) ? Math.max(0, cancelledRaw) : 0;
  const w = (v: number) => (Number.isFinite(v) ? v : 0);
  const rating = (safeRating / 5) * w(weights.rating);
  const availableNow = (card.availableNow ? 1 : 0) * w(weights.availableNow);
  const distance = distanceBandScore(km) * w(weights.distance);
  const price = priceFit(card.hourlyRate, query.maxHourlyRate) * w(weights.price);
  const speciality = (specialityMatches(card, query.query) ? 1 : 0) * w(weights.speciality);
  // History boost: 20+ completed visits saturates the factor (subtask 9).
  const history = Math.min(1, completed / 20) * w(weights.history);
  const cancellationPenalty = -Math.min(MAX_CANCELLATION_PENALTY, cancelled * CANCELLATION_PENALTY);
  const score = round6(rating + availableNow + distance + price + speciality + history + cancellationPenalty);
  return {
    rating: round6(rating),
    availableNow: round6(availableNow),
    distance: round6(distance),
    price: round6(price),
    speciality: round6(speciality),
    history: round6(history),
    cancellationPenalty,
    score,
  };
}

/** Filter + weighted sort, returning cards with their score breakdowns. */
export function matchCandidatesWithScores(
  candidates: CaregiverCard[],
  query: MatchQuery,
  weights: MatchingWeights = DEFAULT_WEIGHTS
): { card: CaregiverCard; breakdown: ScoreBreakdown; distanceKm: number }[] {
  const q = query.query.trim().toLowerCase();

  const filtered = candidates.filter((card) => {
    const km = distanceOf(card, query.origin);
    if (query.maxDistanceKm !== null && km > query.maxDistanceKm) {
      return false;
    }
    if (query.minRating !== null && card.rating < query.minRating) {
      return false;
    }
    if (query.availableNowOnly && !card.availableNow) {
      return false;
    }
    if (query.roles.length > 0 && !query.roles.some((role) => card.roles.includes(role))) {
      return false;
    }
    if (query.maxHourlyRate != null && card.hourlyRate > query.maxHourlyRate) {
      return false;
    }
    if (q && !card.displayName.toLowerCase().includes(q) && !specialityMatches(card, query.query)) {
      return false;
    }
    return true;
  });

  const scored = filtered.map((card) => {
    const breakdown = scoreCandidate(card, query, weights);
    return { card, breakdown, distanceKm: round1(distanceOf(card, query.origin)) };
  });

  const byId = (a: { card: CaregiverCard }, b: { card: CaregiverCard }) =>
    a.card.id.localeCompare(b.card.id);

  switch (query.sort ?? 'relevance') {
    case 'distance':
      scored.sort((a, b) => a.distanceKm - b.distanceKm || byId(a, b));
      break;
    case 'rating':
      scored.sort((a, b) => b.card.rating - a.card.rating || byId(a, b));
      break;
    case 'price':
      scored.sort((a, b) => a.card.hourlyRate - b.card.hourlyRate || byId(a, b));
      break;
    case 'relevance':
    default:
      // Deterministic tie-break on id (subtask 11).
      scored.sort((a, b) => b.breakdown.score - a.breakdown.score || byId(a, b));
      break;
  }
  return scored;
}

/** v1-compatible entry point: filtered + sorted cards. */
export function matchCandidates(
  candidates: CaregiverCard[],
  query: MatchQuery,
  weights: MatchingWeights = DEFAULT_WEIGHTS
): CaregiverCard[] {
  return matchCandidatesWithScores(candidates, query, weights).map((entry) => entry.card);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
