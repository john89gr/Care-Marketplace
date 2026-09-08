import { describe, expect, it } from 'vitest';
import { daysUntil, expiryStatus, EXPIRING_WINDOW_MS } from '../src/certifications';

/**
 * Pure boundary tests for the certification expiry engine (certifications.ts)
 * that drives the certification.expiring / certification.expired Web Push.
 * Window edges are INCLUSIVE: exactly on the boundary counts as expiring;
 * exactly at expiry is expired.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const nowMs = Date.UTC(2026, 0, 15);

describe('expiryStatus (boundaries)', () => {
  it.each<[string, number, string]>([
    ['expired exactly at now', nowMs, 'expired'],
    ['expired in the past', nowMs - DAY_MS, 'expired'],
    ['expiring exactly on the window edge', nowMs + EXPIRING_WINDOW_MS, 'expiring'],
    ['expiring inside the window', nowMs + 14 * DAY_MS, 'expiring'],
    ['expiring tomorrow', nowMs + DAY_MS, 'expiring'],
    ['ok just past the window', nowMs + EXPIRING_WINDOW_MS + 1, 'ok'],
    ['ok far out', nowMs + 200 * DAY_MS, 'ok'],
  ])('%s → %s', (_label, expiresAtMs, expected) => {
    expect(expiryStatus(expiresAtMs, nowMs)).toBe(expected);
  });
});

describe('daysUntil', () => {
  it('reports whole days, ceiling, never below 1', () => {
    expect(daysUntil(nowMs + 14 * DAY_MS, nowMs)).toBe(14);
    expect(daysUntil(nowMs + DAY_MS + 60_000, nowMs)).toBe(2); // 1 day + 1 min → 2
    expect(daysUntil(nowMs + 60_000, nowMs)).toBe(1); // sub-day → floor of 1
  });
});