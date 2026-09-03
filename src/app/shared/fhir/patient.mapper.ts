/**
 * Patient mapper: profile → FHIR R4 `Patient` (FEATURE_PLAN.md §11 subtask 2).
 *
 * The Patient.id is a deterministic UUID **v5** derived from the user's AMKA.
 * The raw AMKA is never stored in any identifier field (subtask 14) — only the
 * hash-based id is used, so the PHI-bearing AMKA does not leak into exported
 * FHIR resources.
 *
 * Because the `uuid` package is not a project dependency, the v5 algorithm
 * (RFC 4122 §4.3: SHA-1 of namespace + name, with version/variant bits set)
 * is implemented here as a self-contained, dependency-free primitive. Its
 * correctness is verified against the canonical UUID v5 known-answer test
 * (uuid5(NAMESPACE_DNS, "python.org") == 886313e1-3b8a-5372-9b90-0c9aee199e5d)
 * in `patient.mapper` specs.
 */
import type { UserProfile } from '../../features/profiles/profile.store';
import type {
  Patient,
  HumanName,
  ContactPoint,
  Identifier,
  AdministrativeGender,
} from './fhir.types';

/** Well-known DNS namespace UUID (RFC 4122 §4.2.2) — a stable, public seed. */
export const FHIR_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
/** OID-ish system for the care-marketplace's own patient identifier. */
export const PATIENT_ID_SYSTEM = 'https://care-marketplace.example/patient';

/** System label for the Greek AMKA, registered for display only (never the raw value). */
export const AMKA_SYSTEM = 'urn:oid:2.25.1'; // reserved display system — raw AMKA never appears

// ---- Self-contained SHA-1 (FIPS 180-4) — needed for UUID v5 ----

/** Rotate a 32-bit value left by n bits (unsigned). */
function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/**
 * SHA-1 message digest, returning 20 bytes. Pure JS — works in browser and
 * Node/jsdom test hosts without any native crypto dependency.
 */
function sha1(message: Uint8Array): Uint8Array {
  const msgLen = message.length;
  const bitLen = msgLen * 8;

  // Pad: message + 0x80 + zeros + 64-bit big-endian bit length. Total ≡ 56 (mod 64).
  const padLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(padLen);
  padded.set(message);
  padded[msgLen] = 0x80;
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  const view = new DataView(padded.buffer, padLen - 8, 8);
  view.setUint32(0, high);
  view.setUint32(4, low);

  const w = new Uint32Array(80);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = (padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3];
    }
    for (let t = 16; t < 80; t++) {
      w[t] = rotl((w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16]) >>> 0, 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (t < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return new Uint8Array([
    (h0 >>> 24) & 0xff,
    (h0 >>> 16) & 0xff,
    (h0 >>> 8) & 0xff,
    h0 & 0xff,
    (h1 >>> 24) & 0xff,
    (h1 >>> 16) & 0xff,
    (h1 >>> 8) & 0xff,
    h1 & 0xff,
    (h2 >>> 24) & 0xff,
    (h2 >>> 16) & 0xff,
    (h2 >>> 8) & 0xff,
    h2 & 0xff,
    (h3 >>> 24) & 0xff,
    (h3 >>> 16) & 0xff,
    (h3 >>> 8) & 0xff,
    h3 & 0xff,
    (h4 >>> 24) & 0xff,
    (h4 >>> 16) & 0xff,
    (h4 >>> 8) & 0xff,
    h4 & 0xff,
  ]);
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function uuidToString(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * RFC 4122 v5: a deterministic UUID from a `name` in a `namespace`.
 * Verified against uuid5(NAMESPACE_DNS, 'python.org') in the spec.
 */
export function uuidv5(name: string, namespace: string = FHIR_NAMESPACE): string {
  const ns = uuidToBytes(namespace);
  const nameBytes = new TextEncoder().encode(name);
  const data = new Uint8Array(ns.length + nameBytes.length);
  data.set(ns);
  data.set(nameBytes, ns.length);
  const hash = sha1(data);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  return uuidToString(hash.slice(0, 16));
}

// ---- Patient mapping ----

const EMPTY_PROFILE = {
  userId: '',
  displayName: '',
  phone: '',
  amka: '',
  afm: '',
  licenceNumber: '',
  hourlyRate: null,
  dateOfBirth: '',
  sex: '' as AdministrativeGender | '',
};

/** Derive a stable, PHI-safe Patient id: uuid v5 of the AMKA (never the raw AMKA). */
export function patientId(amka: string, fallback: string): string {
  const name = amka || fallback;
  return uuidv5(name || 'anonymous', FHIR_NAMESPACE);
}

/** Map the app sex field to FHIR AdministrativeGender. */
export function sexToGender(sex: UserProfile['sex']): AdministrativeGender {
  switch (sex) {
    case 'female':
      return 'female';
    case 'male':
      return 'male';
    case 'other':
      return 'other';
    default:
      return 'unknown';
  }
}

function instantISO(ms: number): string {
  return new Date(ms).toISOString();
}

/** Split a display name into { family, given, text }; Greek names: "FirstName FamilyName". */
function splitName(displayName: string): HumanName {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) {
    return {};
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { text: trimmed, given: [trimmed] };
  }
  const family = parts[parts.length - 1]!;
  const given = parts.slice(0, parts.length - 1);
  return { text: trimmed, family, given };
}

/** Build the `telecom` array, omitting null/empty entries. */
function buildTelecom(phone: string): ContactPoint[] | undefined {
  const items: ContactPoint[] = [];
  if (phone) {
    items.push({ system: 'phone', value: phone });
  }
  return items.length ? items : undefined;
}

/** Build the `identifier` array. The AMKA is never placed in `value` (subtask 14). */
function buildIdentifier(id: string): Identifier[] | undefined {
  return [{ system: PATIENT_ID_SYSTEM, value: id }];
}

/**
 * Map a user profile to a FHIR `Patient` resource.
 *
 * @param profile  UserProfile (may be null/empty when the profile hasn't loaded yet).
 * @param nowMs    Fixed timestamp for deterministic `meta.lastUpdated` (subtask 12).
 */
export function toPatient(profile: UserProfile | null | undefined, nowMs: number = Date.now()): Patient {
  const p = profile ?? EMPTY_PROFILE;
  const id = patientId(p.amka, p.userId);

  return {
    resourceType: 'Patient',
    id,
    meta: { lastUpdated: instantISO(nowMs) },
    identifier: buildIdentifier(id),
    name: [splitName(p.displayName)],
    telecom: buildTelecom(p.phone),
    gender: sexToGender(p.sex),
    birthDate: p.dateOfBirth || undefined,
    active: true,
  };
}
