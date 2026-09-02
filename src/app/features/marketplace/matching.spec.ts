import { describe, it, expect } from 'vitest';
import { matchCandidates, MatchQuery } from './matching';
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

const baseQuery: MatchQuery = {
  query: '',
  roles: [],
  maxDistanceKm: null,
  minRating: null,
  availableNowOnly: false,
};

describe('matchCandidates', () => {
  it('returns all candidates when no filters are set', () => {
    const candidates = [card({ id: 'a' }), card({ id: 'b' })];
    expect(matchCandidates(candidates, baseQuery).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('filters by free-text query on display name', () => {
    const candidates = [
      card({ id: 'a', displayName: 'Maria Papadopoulou' }),
      card({ id: 'b', displayName: 'Elena Georgiou' }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, query: 'maria' });
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('filters by role intersection', () => {
    const candidates = [
      card({ id: 'a', roles: [ROLES.CAREGIVER] }),
      card({ id: 'b', roles: [ROLES.NURSE] }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, roles: [ROLES.NURSE] });
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('filters by maximum distance', () => {
    const candidates = [
      card({ id: 'a', distanceKm: 2 }),
      card({ id: 'b', distanceKm: 20 }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, maxDistanceKm: 10 });
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('filters by minimum rating', () => {
    const candidates = [
      card({ id: 'a', rating: 3 }),
      card({ id: 'b', rating: 4.5 }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, minRating: 4 });
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('filters by availability', () => {
    const candidates = [
      card({ id: 'a', availableNow: true }),
      card({ id: 'b', availableNow: false }),
    ];
    const result = matchCandidates(candidates, { ...baseQuery, availableNowOnly: true });
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('ranks higher-rated, closer, available candidates first', () => {
    const candidates = [
      card({ id: 'far', rating: 5, distanceKm: 40, availableNow: false }),
      card({ id: 'near', rating: 4, distanceKm: 1, availableNow: true }),
    ];
    const result = matchCandidates(candidates, baseQuery);
    expect(result[0].id).toBe('near');
    expect(result[1].id).toBe('far');
  });
});
