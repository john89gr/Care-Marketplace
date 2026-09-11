/**
 * Contact phone manager contracts (FEATURE_PLAN.md — contact phone manager):
 * a per-user directory with two groups — **emergency / ICE** contacts (callable
 * in one tap, printed on the health-summary export, mapped to FHIR
 * `Patient.contact`) and the **care team** (doctor, pharmacy, caregiver…).
 *
 * Pure types + helpers only, no Angular dependencies: every rule here is
 * unit-testable without DI. Mirrors the server row mappers in
 * `server/src/contacts.ts`.
 */
import { BilingualLabel, historyLabel } from './history.models';

export type ContactKind = 'emergency' | 'care';

/** Care-team role labels (emergency contacts use free-text `relationship`). */
export type CareRole =
  | 'doctor'
  | 'pharmacy'
  | 'caregiver'
  | 'nurse'
  | 'hospital'
  | 'lab'
  | 'other';

export interface MedicalContact {
  id: string;
  kind: ContactKind;
  /** Person or organisation name. */
  name: string;
  /** ICE: spouse/daughter… ; care team: the role (also in `careRole`). */
  relationship: string;
  /** Primary phone — validated to be at least 6 digits. */
  phone: string;
  altPhone?: string;
  email?: string;
  address?: string;
  notes?: string;
  /** At most one primary per kind; "call first" in an emergency. */
  isPrimary: boolean;
  /** Manual ordering within a group (higher first); ties break on name. */
  priority: number;
  archived?: boolean;
  createdAtMs: number;
}

/** POST body: id/createdAtMs/archived are server-assigned. */
export type ContactDraft = Omit<MedicalContact, 'id' | 'createdAtMs' | 'archived'> &
  Partial<Pick<MedicalContact, 'archived'>>;

// ---- Bilingual labels (Greek primary, English fallback) ----

export const CONTACT_KIND_LABELS: Record<ContactKind, BilingualLabel> = {
  emergency: { el: 'Επαφές έκτακτης ανάγκης (ICE)', en: 'Emergency / ICE contacts' },
  care: { el: 'Ομάδα φροντίδας', en: 'Care team' },
};

export const CARE_ROLE_LABELS: Record<CareRole, BilingualLabel> = {
  doctor: { el: 'Ιατρός', en: 'Doctor' },
  pharmacy: { el: 'Φαρμακείο', en: 'Pharmacy' },
  caregiver: { el: 'Φροντιστής', en: 'Caregiver' },
  nurse: { el: 'Νοσηλευτής', en: 'Nurse' },
  hospital: { el: 'Νοσοκομείο', en: 'Hospital' },
  lab: { el: 'Εργαστήριο', en: 'Laboratory' },
  other: { el: 'Άλλο', en: 'Other' },
};

export const CARE_ROLE_KEYS: readonly CareRole[] = Object.keys(CARE_ROLE_LABELS) as CareRole[];

/** Label for a contact kind/role in the active locale (el default). */
export function contactLabel(
  map: Record<string, BilingualLabel>,
  key: string,
  locale: 'el' | 'en' = 'el'
): string {
  return historyLabel(map, key, locale);
}

// ---- Phone normalization + validation ----

/**
 * Normalize a phone number for storage/display: keeps a single leading `+`,
 * strips spaces, dashes, dots and parentheses. Returns `''` when fewer than 6
 * digits remain (the same requirement as the reminder SMS/voice gate).
 */
export function normalizePhone(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) {
    return '';
  }
  return hadPlus ? `+${digits}` : digits;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw).length > 0;
}

/** Loose email shape check (empty is allowed = not provided). */
export function isValidEmail(raw: string): boolean {
  const value = (raw ?? '').trim();
  if (!value) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** `tel:` href for tap-to-call (digits + optional leading `+`). */
export function telHref(raw: string): string {
  const normalized = normalizePhone(raw);
  return normalized ? `tel:${normalized}` : '';
}

// ---- Ordering + selection ----

/**
 * Canonical ordering: primary first, then higher `priority`, then name
 * (locale-aware). Archived rows are dropped. Never mutates the input.
 */
export function sortContacts(contacts: readonly MedicalContact[]): MedicalContact[] {
  return contacts
    .filter((c) => !c.archived)
    .slice()
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) {
        return a.isPrimary ? -1 : 1;
      }
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.name.localeCompare(b.name, 'el');
    });
}

/** Live (non-archived) contacts of one kind, ordered. */
export function contactsOfKind(
  contacts: readonly MedicalContact[],
  kind: ContactKind
): MedicalContact[] {
  return sortContacts(contacts.filter((c) => c.kind === kind));
}

/**
 * The contact to call first in an emergency: the flagged primary, else the
 * highest-priority emergency contact, else null.
 */
export function primaryEmergency(contacts: readonly MedicalContact[]): MedicalContact | null {
  const emergency = contactsOfKind(contacts, 'emergency');
  return emergency.find((c) => c.isPrimary) ?? emergency[0] ?? null;
}

/** Emergency contacts that belong on exports / safety surfaces. */
export function safetyContacts(contacts: readonly MedicalContact[]): MedicalContact[] {
  return contactsOfKind(contacts, 'emergency');
}

/**
 * Enforce "at most one primary per kind": mark `primaryId` primary and demote
 * every other contact of the same kind. Returns a new array (pure).
 */
export function withSinglePrimary(
  contacts: readonly MedicalContact[],
  kind: ContactKind,
  primaryId: string
): MedicalContact[] {
  return contacts.map((c) =>
    c.kind === kind ? { ...c, isPrimary: c.id === primaryId } : c
  );
}

/**
 * Client-side validation shared by the page and (mirrored by) the server:
 * returns an error message key, or null when the draft is valid.
 */
export function validateContactDraft(draft: Partial<ContactDraft>): string | null {
  const kind = draft.kind;
  if (kind !== 'emergency' && kind !== 'care') {
    return 'unknown_kind';
  }
  if (!(draft.name ?? '').trim()) {
    return 'name_required';
  }
  if (!isValidPhone(draft.phone ?? '')) {
    return 'phone_invalid';
  }
  if (!isValidEmail(draft.email ?? '')) {
    return 'email_invalid';
  }
  return null;
}

/** Short one-line summary used on cards and the export. */
export function contactSummary(contact: MedicalContact): string {
  const role = contact.relationship || (contact.kind === 'care' ? 'other' : '');
  return role ? `${contact.name} — ${role}` : contact.name;
}
