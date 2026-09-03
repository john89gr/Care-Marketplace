/**
 * Certification & licence expiry tracking (FEATURE_PLAN.md §14).
 *
 * Pure helpers that classify a certificate/licence by its expiry timestamp.
 * Shared by the vetting store (provider self-view + admin dashboard), the
 * marketplace search filter (expired providers are hidden from results) and
 * the onboarding expiry banner. Keeping this logic outside the stores makes
 * the date-boundary rules (~14 subtask) trivially unit-testable.
 *
 * Classification (§14 bullet 3):
 *   null / lifetime  -> 'valid'
 *   ≤ EXPIRY_WARNING_DAYS remaining -> 'expiring_soon'
 *   expiry in the past -> 'expired'
 */

/** Days before expiry that trigger the "expiring soon" warning (§14 bullet 3). */
export const EXPIRY_WARNING_DAYS = 30;
/** One day in milliseconds (used for day-arithmetic and boundary tests). */
export const DAY_MS = 24 * 60 * 60 * 1000;

export type CertificationStatus = 'valid' | 'expiring_soon' | 'expired';

/** A single certificate/licence entry sharing the expiry machinery (§14 bullet 11). */
export interface Certification {
  id: string;
  name: string;
  /** Epoch ms at which the certificate expires; null = no expiry / lifetime. */
  expiresAtMs: number | null;
}

/**
 * Classify a single expiry timestamp against a reference "now".
 *
 * Boundary behaviour (§14 bullet 15):
 *   - exactly 0 ms ahead (expires now) -> 'expired'
 *   - exactly EXPIRY_WARNING_DAYS ahead -> 'expiring_soon' (window is inclusive)
 */
export function certificationStatus(
  expiresAtMs: number | null | undefined,
  nowMs: number = Date.now()
): CertificationStatus {
  if (expiresAtMs == null) {
    return 'valid';
  }
  if (expiresAtMs <= nowMs) {
    return 'expired';
  }
  const remainingDays = (expiresAtMs - nowMs) / DAY_MS;
  return remainingDays <= EXPIRY_WARNING_DAYS ? 'expiring_soon' : 'valid';
}

/**
 * Whole days until expiry, clamped to ≥ 0. Returns null when there is no
 * recorded expiry (e.g. lifetime certificate).
 */
export function daysUntilExpiry(expiresAtMs: number | null | undefined): number | null {
  if (expiresAtMs == null) {
    return null;
  }
  const days = Math.ceil((expiresAtMs - Date.now()) / DAY_MS);
  return days < 0 ? 0 : days;
}

/**
 * Most urgent status across a set of expiries (licence + extra certifications).
 * Returns 'expired' if any has expired, else 'expiring_soon' if any is in the
 * warning window, else 'valid'. Items with a null expiry are skipped.
 */
export function certificationStatusForMany(
  items: ReadonlyArray<Pick<Certification, 'expiresAtMs'>>,
  nowMs: number = Date.now()
): CertificationStatus {
  let expired = false;
  let expiring = false;
  for (const item of items) {
    switch (certificationStatus(item.expiresAtMs, nowMs)) {
      case 'expired':
        expired = true;
        break;
      case 'expiring_soon':
        expiring = true;
        break;
    }
  }
  if (expired) {
    return 'expired';
  }
  if (expiring) {
    return 'expiring_soon';
  }
  return 'valid';
}
