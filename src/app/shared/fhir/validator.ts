/**
 * FHIR structural validator (FEATURE_PLAN.md §11 subtask 8).
 *
 * A lightweight, dependency-free structural validator — it checks required
 * fields per resource type and reference integrity within a Bundle. It is not
 * a full FHIR spec validator (no terminology check); it catches the mistakes
 * the mappers could realistically make and that would break a consuming
 * system.
 */
import type { Bundle, FhirResource } from './fhir.types';

export interface ValidationResult {
  /** True when `errors` is empty. */
  valid: boolean;
  /** Human-readable structural problems, empty when valid. */
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function err(errors: string[]): ValidationResult {
  return { valid: errors.length === 0, errors };
}

/** A compact, deterministic "type/id" locator for error messages. */
function loc(resource: FhirResource): string {
  return `${resource.resourceType}/${resource.id ?? '<no-id>}'`;
}

/** Collect every `reference`-key value that looks like a FHIR reference. */
function collectReferences(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectReferences(item, out);
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'reference' && typeof value === 'string' && value) {
      out.push(value);
    } else if (typeof value === 'object' && value !== null) {
      collectReferences(value, out);
    }
  }
}

/** Resolve a reference string to the target resource id, or null if not resolvable. */
function resolveRefId(reference: string): string | null {
  // "Patient/123", "Observation/obs-1" → id is the segment after the slash.
  const idx = reference.indexOf('/');
  if (idx > 0) {
    return reference.slice(idx + 1);
  }
  // "urn:uuid:123" → id after the last colon.
  if (reference.startsWith('urn:uuid:')) {
    return reference.slice('urn:uuid:'.length);
  }
  return null;
}

/** Validate a single FHIR resource's structural requirements. */
export function validateResource(resource: FhirResource): ValidationResult {
  const errors: string[] = [];
  const l = loc(resource);

  if (!resource.resourceType) {
    errors.push(`${l}: missing resourceType`);
  }
  if (!resource.id) {
    errors.push(`${l}: missing id`);
  }

  switch (resource.resourceType) {
    case 'Patient': {
      const p = resource as InstanceType<typeof Object>;
      if (!p.name || !Array.isArray(p.name) || p.name.length === 0) {
        errors.push(`${l}: missing name`);
      }
      if (!p.gender) {
        errors.push(`${l}: missing gender`);
      }
      break;
    }
    case 'Observation': {
      const o = resource as InstanceType<typeof Object>;
      if (!o.status) {
        errors.push(`${l}: missing status`);
      }
      if (!o.code) {
        errors.push(`${l}: missing code`);
      }
      if (o.component && Array.isArray(o.component)) {
        for (const c of o.component) {
          if (!c.code) {
            errors.push(`${l}: component missing code`);
          }
        }
      }
      break;
    }
    case 'MedicationRequest': {
      const m = resource as InstanceType<typeof Object>;
      if (!m.status) {
        errors.push(`${l}: missing status`);
      }
      if (!m.intent) {
        errors.push(`${l}: missing intent`);
      }
      if (!m.medicationCodeableConcept) {
        errors.push(`${l}: missing medicationCodeableConcept`);
      }
      break;
    }
    case 'CarePlan': {
      const c = resource as InstanceType<typeof Object>;
      if (!c.status) {
        errors.push(`${l}: missing status`);
      }
      if (!c.intent) {
        errors.push(`${l}: missing intent`);
      }
      if (!c.subject) {
        errors.push(`${l}: missing subject`);
      }
      break;
    }
    default:
      // Other resource types: only the base checks (resourceType + id) apply.
      break;
  }

  return err(errors);
}

/**
 * Validate a `Bundle`: base fields, every entry resource, and reference
 * integrity (every `reference` resolves to a resource id in the bundle).
 */
export function validateBundle(bundle: Bundle): ValidationResult {
  const errors: string[] = [];

  if (bundle.resourceType !== 'Bundle') {
    errors.push('Not a Bundle resource');
  }
  if (!bundle.id) {
    errors.push('Bundle missing id');
  }
  if (!bundle.type) {
    errors.push('Bundle missing type');
  }
  if (!Array.isArray(bundle.entry)) {
    errors.push('Bundle missing entry array');
    return err(errors);
  }
  if (bundle.total !== bundle.entry.length) {
    errors.push(`Bundle total (${bundle.total}) does not match entry count (${bundle.entry.length})`);
  }

  const ids = new Set<string>();
  for (const entry of bundle.entry) {
    if (!entry.resource) {
      errors.push('Bundle entry missing resource');
      continue;
    }
    const r = validateResource(entry.resource);
    if (!r.valid) {
      errors.push(...r.errors);
    }
    if (entry.resource.id) {
      ids.add(entry.resource.id);
    }
    if (!entry.fullUrl) {
      errors.push(`Entry for ${entry.resource.resourceType}/${entry.resource.id ?? '<no-id>'} missing fullUrl`);
    }
  }

  // Reference integrity: every reference must resolve within the bundle.
  for (const entry of bundle.entry) {
    const resource = entry.resource;
    if (!resource) {
      continue;
    }
    const refs: string[] = [];
    collectReferences(resource, refs);
    for (const ref of refs) {
      const target = resolveRefId(ref);
      if (target === null) {
        errors.push(`Unresolvable reference form "${ref}" in ${loc(resource)}`);
      } else if (!ids.has(target)) {
        errors.push(`Dangling reference "${ref}" in ${loc(resource)} (no resource with id "${target}")`);
      }
    }
  }

  return err(errors);
}
