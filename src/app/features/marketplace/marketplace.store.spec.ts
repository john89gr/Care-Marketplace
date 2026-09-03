import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect } from 'vitest';
import {
  isCaregiverVisible,
  isCaregiverExpiringSoon,
  CaregiverCard,
} from './marketplace.store';
import { DAY_MS, EXPIRY_WARNING_DAYS } from '../../core/services/integrations/certification-status';

const NOW = 1_000_000_000_000;

function card(overrides: Partial<CaregiverCard> = {}): CaregiverCard {
  return {
    id: 'cg-1',
    displayName: 'Provider',
    roles: ['caregiver'],
    rating: 4,
    distanceKm: 5,
    hourlyRate: 20,
    availableNow: true,
    ...overrides,
  };
}

describe('isCaregiverVisible (§14 / §16)', () => {
  it('includes providers with no expiry recorded', () => {
    expect(isCaregiverVisible(card({ expiresAtMs: null }), NOW)).toBe(true);
    expect(isCaregiverVisible(card({ expiresAtMs: undefined }), NOW)).toBe(true);
  });

  it('excludes providers whose licence has expired', () => {
    expect(isCaregiverVisible(card({ expiresAtMs: NOW - DAY_MS }), NOW)).toBe(false);
    expect(isCaregiverVisible(card({ expiresAtMs: NOW }), NOW)).toBe(false);
  });

  it('keeps providers expiring soon (only fully expired are hidden)', () => {
    expect(isCaregiverVisible(card({ expiresAtMs: NOW + 14 * DAY_MS }), NOW)).toBe(true);
    expect(isCaregiverVisible(card({ expiresAtMs: NOW + EXPIRY_WARNING_DAYS * DAY_MS }), NOW)).toBe(true);
  });

  it('keeps providers with a valid (far-future) expiry', () => {
    expect(isCaregiverVisible(card({ expiresAtMs: NOW + 365 * DAY_MS }), NOW)).toBe(true);
  });
});

describe('isCaregiverExpiringSoon', () => {
  it('flags cards within the warning window', () => {
    expect(isCaregiverExpiringSoon(card({ expiresAtMs: NOW + 14 * DAY_MS }), NOW)).toBe(true);
  });

  it('does not flag valid or expired cards', () => {
    expect(isCaregiverExpiringSoon(card({ expiresAtMs: NOW + 120 * DAY_MS }), NOW)).toBe(false);
    expect(isCaregiverExpiringSoon(card({ expiresAtMs: NOW - DAY_MS }), NOW)).toBe(false);
    expect(isCaregiverExpiringSoon(card({ expiresAtMs: null }), NOW)).toBe(false);
  });
});
