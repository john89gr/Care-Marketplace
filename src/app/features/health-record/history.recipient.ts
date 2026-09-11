/**
 * Care-recipient resolution for the family history view (FEATURE_PLAN.md §21
 * subtask 16): a caregiver/nurse has no record of their own to show, so the
 * history page resolves *whose* record to open from the clients on their
 * visits and loads it through the consent-gated family endpoint
 * (`GET /api/history/:userId/:kind`). Pure helpers, unit-tested without DI.
 */

/** The client whose record a family role is viewing. */
export interface CareRecipient {
  userId: string;
  name: string;
}

/** The slice of a visit needed to resolve recipients (keeps this DI-free). */
export type VisitRef = {
  clientId: string;
  clientName: string;
  scheduledAtMs: number;
};

/**
 * Distinct clients across a family member's visits, most recent visit first.
 * Visits without a client id are ignored; blank names fall back to the id so
 * the read-only notice always has something to render.
 */
export function recipientsFrom(visits: readonly VisitRef[]): CareRecipient[] {
  const seen = new Set<string>();
  const recipients: CareRecipient[] = [];
  const byRecency = [...visits].sort((a, b) => b.scheduledAtMs - a.scheduledAtMs);
  for (const visit of byRecency) {
    if (!visit.clientId || seen.has(visit.clientId)) {
      continue;
    }
    seen.add(visit.clientId);
    recipients.push({
      userId: visit.clientId,
      name: visit.clientName || visit.clientId,
    });
  }
  return recipients;
}

/**
 * The care recipient a family role should open: the client of the most recent
 * visit, or `fallback` when the user has no visits yet (the demo client, so
 * the seeded nurse/caregiver accounts still land on a record).
 */
export function pickRecipient(
  visits: readonly VisitRef[],
  fallback: CareRecipient | null = null
): CareRecipient | null {
  return recipientsFrom(visits)[0] ?? fallback;
}
