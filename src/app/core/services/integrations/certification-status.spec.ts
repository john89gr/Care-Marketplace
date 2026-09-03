import { describe, it, expect } from 'vitest';
import {
  certificationStatus,
  certificationStatusForMany,
  daysUntilExpiry,
  DAY_MS,
  EXPIRY_WARNING_DAYS,
  Certification,
} from './certification-status';

const NOW = 1_000_000_000_000; // fixed reference for boundary tests

describe('certificationStatus', () => {
  it('returns valid when there is no expiry (null/undefined)', () => {
    expect(certificationStatus(null, NOW)).toBe('valid');
    expect(certificationStatus(undefined, NOW)).toBe('valid');
  });

  it('returns expired when the expiry is in the past', () => {
    expect(certificationStatus(NOW - 1, NOW)).toBe('expired');
    expect(certificationStatus(NOW - DAY_MS, NOW)).toBe('expired');
  });

  it('returns expiring_soon within the warning window (inclusive)', () => {
    // one day, half the window, exactly on the boundary
    expect(certificationStatus(NOW + DAY_MS, NOW)).toBe('expiring_soon');
    expect(certificationStatus(NOW + 15 * DAY_MS, NOW)).toBe('expiring_soon');
    expect(certificationStatus(NOW + EXPIRY_WARNING_DAYS * DAY_MS, NOW)).toBe('expiring_soon');
  });

  it('returns valid beyond the warning window', () => {
    expect(certificationStatus(NOW + (EXPIRY_WARNING_DAYS + 1) * DAY_MS, NOW)).toBe('valid');
    expect(certificationStatus(NOW + 365 * DAY_MS, NOW)).toBe('valid');
  });

  it('treats expiry exactly now as expired (§14 bullet 15: exactly 0d)', () => {
    expect(certificationStatus(NOW, NOW)).toBe('expired');
  });

  it('treats expiry exactly 30 days ahead as expiring_soon (§14 bullet 15: exactly 30d)', () => {
    expect(certificationStatus(NOW + EXPIRY_WARNING_DAYS * DAY_MS, NOW)).toBe('expiring_soon');
  });

  it('defaults "now" to Date.now() when omitted', () => {
    const fixed = Date.now() + 10 * DAY_MS;
    expect(certificationStatus(fixed)).toBe('expiring_soon');
  });
});

describe('daysUntilExpiry', () => {
  it('returns null for no expiry', () => {
    expect(daysUntilExpiry(null)).toBeNull();
    expect(daysUntilExpiry(undefined)).toBeNull();
  });

  it('returns whole ceiling days for a future expiry', () => {
    expect(daysUntilExpiry(Date.now() + 0.4 * DAY_MS)).toBe(1);
    const far = Date.now() + 45 * DAY_MS;
    expect(daysUntilExpiry(far)).toBe(45);
  });

  it('clamps a past expiry to 0', () => {
    const past = Date.now() - 5 * DAY_MS;
    expect(daysUntilExpiry(past)).toBe(0);
  });
});

describe('certificationStatusForMany', () => {
  const licences = (overrides: Partial<Certification> = {}): Certification => ({
    id: 'c-1',
    name: 'CPR Basic Life Support',
    expiresAtMs: null,
    ...overrides,
  });

  it('returns valid when all items are valid', () => {
    expect(
      certificationStatusForMany([
        licences({ expiresAtMs: NOW + 60 * DAY_MS }),
        licences({ expiresAtMs: NOW + 90 * DAY_MS }),
      ], NOW)
    ).toBe('valid');
  });

  it('returns expiring_soon when the soonest is in the window', () => {
    expect(
      certificationStatusForMany([
        licences({ expiresAtMs: NOW + 60 * DAY_MS }),
        licences({ expiresAtMs: NOW + 14 * DAY_MS }),
      ], NOW)
    ).toBe('expiring_soon');
  });

  it('returns expired when any item has lapsed', () => {
    expect(
      certificationStatusForMany([
        licences({ expiresAtMs: NOW - 5 * DAY_MS }),
        licences({ expiresAtMs: NOW + 60 * DAY_MS }),
      ], NOW)
    ).toBe('expired');
  });

  it('treats null-expiry items as valid (skipped)', () => {
    expect(certificationStatusForMany([licences({ expiresAtMs: null })], NOW)).toBe('valid');
  });

  it('returns valid for an empty collection', () => {
    expect(certificationStatusForMany([], NOW)).toBe('valid');
  });

  it('expired wins over expiring_soon across a mixed set', () => {
    expect(
      certificationStatusForMany([
        licences({ expiresAtMs: NOW + 10 * DAY_MS }), // expiring
        licences({ expiresAtMs: NOW - 1 }), // expired
      ], NOW)
    ).toBe('expired');
  });
});
