import { query } from './db';
import { notifyUser } from './push';

/**
 * Licence/certificate expiry (FEATURE_PLAN.md §14/§20): once per certificate,
 * push `certification.expiring` when it is within the renewal window and
 * `certification.expired` when it lapses. Runs on the vetting read so the
 * reminder lands when the provider opens the onboarding feature; notices are
 * once-only per (certificate, kind) — renewing (a new cert row) arms fresh
 * pushes.
 */

/** Renewal window: a certificate is "expiring" from this many ms before expiry. */
export const EXPIRING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ExpiryKind = 'expiring' | 'expired' | 'ok';

/** Pure boundary check — unit-tested against the expiry matrix. */
export function expiryStatus(expiresAtMs: number, nowMs: number): ExpiryKind {
  if (expiresAtMs <= nowMs) {
    return 'expired';
  }
  if (expiresAtMs - nowMs <= EXPIRING_WINDOW_MS) {
    return 'expiring';
  }
  return 'ok';
}

/** Whole days until expiry (ceil, min 1) for the reminder copy. */
export function daysUntil(expiresAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((expiresAtMs - nowMs) / (24 * 60 * 60 * 1000)));
}

interface CertificationRow {
  id: string;
  name: string;
  licence_number: string;
  expires_at_ms: string | number;
}

export async function checkCertificationExpiry(userId: string): Promise<void> {
  const certs = await query<CertificationRow>(
    `SELECT id, name, licence_number, expires_at_ms
     FROM certifications WHERE provider_id = $1`,
    [userId]
  );
  const nowMs = Date.now();
  for (const cert of certs) {
    const expiresAtMs = Number(cert.expires_at_ms);
    const kind = expiryStatus(expiresAtMs, nowMs);
    if (kind === 'ok') {
      continue;
    }
    const inserted = await query(
      `INSERT INTO certification_notices (cert_id, kind, notified_at_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (cert_id, kind) DO NOTHING
       RETURNING notified_at_ms`,
      [cert.id, kind, nowMs]
    );
    if (inserted.length === 0) {
      continue; // Already alerted for this certificate + kind.
    }
    if (kind === 'expired') {
      await notifyUser(userId, {
        kind: 'certification.expired',
        title: 'Licence expired',
        body: `Your licence ${cert.licence_number} has expired. Renew it to stay visible in the marketplace.`,
        link: '/onboarding',
      });
    } else {
      await notifyUser(userId, {
        kind: 'certification.expiring',
        title: 'Licence expires soon',
        body: `Your licence ${cert.licence_number} expires in ${daysUntil(expiresAtMs, nowMs)} days. Renew it to stay visible in the marketplace.`,
        link: '/onboarding',
      });
    }
  }
}