import { Role } from '../../core/auth/roles';
import { CaregiverCard } from './marketplace.store';

/**
 * Matching engine v1 (PLAN.md §5 Phase 1 — Marketplace):
 * geo (distance) + availability + rating. Purely client-side: the backend
 * returns candidate cards and this module filters/scores them for display.
 */
export interface MatchQuery {
  query: string;
  roles: Role[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
}

const WEIGHTS = {
  rating: 0.4,
  availableNow: 0.3,
  distance: 0.2,
  text: 0.1,
} as const;

export function matchCandidates(candidates: CaregiverCard[], query: MatchQuery): CaregiverCard[] {
  const q = query.query.trim().toLowerCase();

  return candidates
    .filter((card) => {
      if (query.maxDistanceKm !== null && card.distanceKm > query.maxDistanceKm) {
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
      if (q && !card.displayName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    })
    .map((card) => ({ card, score: score(card, q) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.card);
}

function score(card: CaregiverCard, query: string): number {
  let score = (card.rating / 5) * WEIGHTS.rating;
  if (card.availableNow) {
    score += WEIGHTS.availableNow;
  }
  score += Math.max(0, 1 - card.distanceKm / 50) * WEIGHTS.distance;
  if (query && card.displayName.toLowerCase().includes(query)) {
    score += WEIGHTS.text;
  }
  return score;
}
