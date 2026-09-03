import { describe, it, expect } from 'vitest';
import {
  matchCandidates,
  matchCandidatesWithScores,
  scoreCandidate,
  priceFit,
  distanceBand,
  distanceBandScore,
  haversineKm,
  distanceOf,
  specialityMatches,
  DEFAULT_WEIGHTS,
  MatchingWeights,
} from './matching';
import { CaregiverCard } from './marketplace.store';
import { ROLES } from '../../core/auth/roles';

function card(overrides: Partial<CaregiverCard> & { id: string }): CaregiverCard {
  return {
    displayName: `Caregiver ${overrides.id}`,
    roles: [ROLES.CAREGIVER],
    rating: 4,
    distanceKm: 5,
    hourlyRate: 18,
    availableNow: false,
    ...overrides,
  };
}

const baseQuery = {
  query: '',
  roles: [] as never[],
  maxDistanceKm: null,
  minRating: null,
  availableNowOnly: false,
};

describe('distance bands (subtask 3)', () => {
  it('maps km to bands 0–2 / 2–5 / 5–10 / >10', () => {
    expect(distanceBand(0)).toBe(0);
    expect(distanceBand(2)).toBe(0);
    expect(distanceBand(2.1)).toBe(1);
    expect(distanceBand(5)).toBe(1);
    expect(distanceBand(5.1)).toBe(2);
    expect(distanceBand(10)).toBe(2);
    expect(distanceBand(10.1)).toBe(3);
    expect(distanceBand(40)).toBe(3);
  });

  it('assigns decreasing band scores', () => {
    expect(distanceBandScore(1)).toBeGreaterThan(distanceBandScore(4));
    expect(distanceBandScore(4)).toBeGreaterThan(distanceBandScore(8));
    expect(distanceBandScore(8)).toBeGreaterThan(distanceBandScore(20));
  });
});

describe('haversine (subtask 2)', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 37.9838, lng: 23.7275 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it('matches a known Athens → Thessaloniki distance (~300 km)', () => {
    const athens = { lat: 37.9838, lng: 23.7275 };
    const thessaloniki = { lat: 40.6403, lng: 22.9439 };
    const km = haversineKm(athens, thessaloniki);
    expect(km).toBeGreaterThan(290);
    expect(km).toBeLessThan(310);
  });

  it('uses haversine when card and origin both have coordinates', () => {
    const origin = { lat: 37.9838, lng: 23.7275, accuracyM: 10, atMs: 0 };
    const c = card({ id: 'a', lat: 37.9838, lng: 23.7275, distanceKm: 99 });
    expect(distanceOf(c, origin)).toBeCloseTo(0, 3);
  });

  it('falls back to backend distanceKm without coordinates', () => {
    const origin = { lat: 37.9838, lng: 23.7275, accuracyM: 10, atMs: 0 };
    const c = card({ id: 'a', distanceKm: 7 });
    expect(distanceOf(c, origin)).toBe(7);
  });
});

describe('speciality matching (subtask 8)', () => {
  it('matches card speciality tags', () => {
    const c = card({ id: 'a', specialties: ['Wound care'] });
    expect(specialityMatches(c, 'wound')).toBe(true);
  });

  it('matches via role taxonomy terms', () => {
    const c = card({ id: 'a', roles: [ROLES.NURSE] });
    expect(specialityMatches(c, 'need help with injections')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    const c = card({ id: 'a', roles: [ROLES.NURSE], specialties: ['Wound care'] });
    expect(specialityMatches(c, 'gardening')).toBe(false);
  });
});

describe('price fit (subtask 7)', () => {
  it('gives 1 within budget', () => {
    expect(priceFit(20, 25)).toBe(1);
    expect(priceFit(25, 25)).toBe(1);
  });

  it('falls off linearly over budget', () => {
    expect(priceFit(50, 25)).toBeCloseTo(0, 5);
    expect(priceFit(30, 20)).toBeCloseTo(0.5, 5);
  });

  it('without budget, cheaper is mildly better', () => {
    expect(priceFit(10, null)).toBeGreaterThan(priceFit(30, null));
  });
});

describe('scoreCandidate (subtasks 4, 9, 10)', () => {
  it('components sum to the composite score', () => {
    const c = card({ id: 'a', rating: 4.5, availableNow: true, distanceKm: 3, completedVisits: 10, recentCancellations: 1 });
    const b = scoreCandidate(c, baseQuery);
    const sum =
      b.rating + b.availableNow + b.distance + b.price + b.speciality + b.history + b.cancellationPenalty;
    expect(b.score).toBeCloseTo(sum, 6);
  });

  it('saturates history at 20 completed visits', () => {
    const at20 = scoreCandidate(card({ id: 'a', completedVisits: 20 }), baseQuery);
    const at40 = scoreCandidate(card({ id: 'b', completedVisits: 40 }), baseQuery);
    expect(at40.history).toBeCloseTo(at20.history, 6);
  });

  it('penalises recent cancellations, capped at 15%', () => {
    const one = scoreCandidate(card({ id: 'a', recentCancellations: 1 }), baseQuery);
    expect(one.cancellationPenalty).toBeCloseTo(-0.05, 6);
    const ten = scoreCandidate(card({ id: 'b', recentCancellations: 10 }), baseQuery);
    expect(ten.cancellationPenalty).toBeCloseTo(-0.15, 6);
  });

  it('scores a perfect candidate at 1.0', () => {
    const c = card({
      id: 'perfect', rating: 5, availableNow: true, distanceKm: 1, hourlyRate: 10,
      completedVisits: 20, recentCancellations: 0, specialties: ['injections'],
    });
    const b = scoreCandidate(c, { ...baseQuery, query: 'injections', maxHourlyRate: 20 });
    expect(b.score).toBeCloseTo(1, 5);
  });

  it('matches a golden fixture breakdown exactly (subtask 13)', () => {
    // rating 4 → 0.8 * 0.35 = 0.28; available → 0.25; 4 km = band 1 → 0.75 * 0.2 = 0.15;
    // €20 ≤ €25 budget → 0.1; 'wound' hits speciality → 0.05; 10 visits → 0.5 * 0.05 = 0.025;
    // 1 cancellation → −0.05. Total = 0.805.
    const c = card({
      id: 'golden-1', displayName: 'Golden Caregiver', rating: 4, availableNow: true,
      distanceKm: 4, hourlyRate: 20, specialties: ['Wound care'],
      completedVisits: 10, recentCancellations: 1,
    });
    const b = scoreCandidate(c, { ...baseQuery, query: 'wound', maxHourlyRate: 25 });
    expect(b.rating).toBeCloseTo(0.28, 6);
    expect(b.availableNow).toBeCloseTo(0.25, 6);
    expect(b.distance).toBeCloseTo(0.15, 6);
    expect(b.price).toBeCloseTo(0.1, 6);
    expect(b.speciality).toBeCloseTo(0.05, 6);
    expect(b.history).toBeCloseTo(0.025, 6);
    expect(b.cancellationPenalty).toBeCloseTo(-0.05, 6);
    expect(b.score).toBeCloseTo(0.805, 6);
  });

  it('priceFit never returns NaN and stays in [0, 1]', () => {
    for (const rate of [NaN, Infinity, -Infinity, -20, 0, 10, 200]) {
      for (const budget of [null, undefined, NaN, 0, -5, 20, Infinity] as const) {
        const v = priceFit(rate, budget);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('matchCandidates v2', () => {
  it('keeps v1 filter behaviour (distance, rating, availability, roles, text)', () => {
    const candidates = [
      card({ id: 'a', distanceKm: 20 }),
      card({ id: 'b', distanceKm: 5 }),
    ];
    expect(matchCandidates(candidates, { ...baseQuery, maxDistanceKm: 10 }).map((c) => c.id)).toEqual(['b']);
  });

  it('relevance sort: higher composite score first', () => {
    const candidates = [
      card({ id: 'far', rating: 5, distanceKm: 40 }),
      card({ id: 'near', rating: 4, distanceKm: 1, availableNow: true }),
    ];
    expect(matchCandidates(candidates, baseQuery)[0].id).toBe('near');
  });

  it('sort=distance orders by effective distance (subtask 1/16)', () => {
    const candidates = [card({ id: 'near', distanceKm: 3 }), card({ id: 'far', distanceKm: 9 })];
    const result = matchCandidates(candidates, { ...baseQuery, sort: 'distance' });
    expect(result.map((c) => c.id)).toEqual(['near', 'far']);
  });

  it('sort=rating orders by rating regardless of distance', () => {
    const candidates = [
      card({ id: 'mid', rating: 4.5, distanceKm: 8 }),
      card({ id: 'low', rating: 3.9, distanceKm: 1 }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, sort: 'rating' });
    expect(result.map((c) => c.id)).toEqual(['mid', 'low']);
  });

  it('sort=price orders by hourly rate (subtask 7)', () => {
    const candidates = [card({ id: 'cheap', hourlyRate: 12 }), card({ id: 'dear', hourlyRate: 30 })];
    const result = matchCandidates(candidates, { ...baseQuery, sort: 'price' });
    expect(result.map((c) => c.id)).toEqual(['cheap', 'dear']);
  });

  it('maxHourlyRate filters out over-budget candidates', () => {
    const candidates = [card({ id: 'a', hourlyRate: 30 }), card({ id: 'b', hourlyRate: 20 })];
    const result = matchCandidates(candidates, { ...baseQuery, maxHourlyRate: 25 });
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('tie-breaks deterministically by id (subtask 11)', () => {
    const candidates = [
      card({ id: 'zz', rating: 4, distanceKm: 5, hourlyRate: 20, availableNow: false }),
      card({ id: 'aa', rating: 4, distanceKm: 5, hourlyRate: 20, availableNow: false }),
    ];
    expect(matchCandidates(candidates, baseQuery).map((c) => c.id)).toEqual(['aa', 'zz']);
  });

  it('honours custom injectable weights (subtask 5)', () => {
    const candidates = [card({ id: 'rated', rating: 5, distanceKm: 40 }), card({ id: 'near', rating: 3, distanceKm: 1 })];
    const distanceHeavy: MatchingWeights = { ...DEFAULT_WEIGHTS, rating: 0.05, distance: 0.5 };
    const result = matchCandidates(candidates, baseQuery, distanceHeavy);
    expect(result[0].id).toBe('near');
  });

  it('attaches a score breakdown per candidate (subtask 6)', () => {
    const candidates = [card({ id: 'a', rating: 4, distanceKm: 5 })];
    const scored = matchCandidatesWithScores(candidates, baseQuery);
    expect(scored[0].breakdown.score).toBeGreaterThan(0);
    expect(scored[0].breakdown).toHaveProperty('rating');
    expect(scored[0].breakdown).toHaveProperty('distance');
  });
});

// ---- Property + benchmark tests (subtasks 14, 17) ----

/** Deterministic LCG so the property test is reproducible. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

describe('property + perf', () => {
  it('score is always a finite number in [−0.15, 1] across random inputs (subtask 14)', () => {
    const rand = lcg(1234);
    for (let i = 0; i < 500; i++) {
      const c = card({
        id: `c${i}`,
        rating: rand() * 10 - 1, // includes out-of-range values on purpose
        distanceKm: rand() * 100,
        hourlyRate: rand() * 120,
        availableNow: rand() > 0.5,
        completedVisits: Math.floor(rand() * 60),
        recentCancellations: Math.floor(rand() * 5),
      });
      const b = scoreCandidate(c, { ...baseQuery, maxHourlyRate: rand() * 100 });
      expect(Number.isFinite(b.score)).toBe(true);
      expect(b.score).toBeLessThanOrEqual(1.000001);
      expect(b.score).toBeGreaterThanOrEqual(-0.150001);
    }
  });

  it('score stays finite and in range for hostile inputs (NaN/Infinity/negatives)', () => {
    const hostile = [NaN, Infinity, -Infinity, -100, -1, 0];
    let n = 0;
    for (const rating of hostile) {
      for (const distanceKm of hostile) {
        for (const hourlyRate of hostile) {
          const c = card({
            id: `hostile-${n++}`,
            rating, distanceKm, hourlyRate,
            availableNow: n % 2 === 0,
            completedVisits: hostile[n % hostile.length],
            recentCancellations: hostile[(n + 3) % hostile.length],
          });
          for (const maxHourlyRate of [null, NaN, -10, 0, 25] as const) {
            const b = scoreCandidate(c, { ...baseQuery, maxHourlyRate });
            expect(Number.isFinite(b.score)).toBe(true);
            expect(b.score).toBeLessThanOrEqual(1.000001);
            expect(b.score).toBeGreaterThanOrEqual(-0.150001);
          }
        }
      }
    }
  });

  it('scores 500 candidates in < 16 ms (subtask 17)', () => {
    const rand = lcg(99);
    const candidates = Array.from({ length: 500 }, (_, i) =>
      card({
        id: `c${i}`,
        rating: 3 + rand() * 2,
        distanceKm: rand() * 30,
        hourlyRate: 10 + rand() * 40,
        availableNow: rand() > 0.5,
        completedVisits: Math.floor(rand() * 40),
        recentCancellations: Math.floor(rand() * 3),
      })
    );
    const start = performance.now();
    matchCandidates(candidates, { ...baseQuery, query: 'care', sort: 'relevance' });
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(16);
  });
});
