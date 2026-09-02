/**
 * RBAC roles for the Care Marketplace.
 * Mirrors PLAN.md §2. Kept as plain strings so they serialize cleanly
 * from API payloads and can be used directly in route guards.
 */
export const ROLES = {
  CLIENT: 'client',
  CAREGIVER: 'caregiver',
  NURSE: 'nurse',
  PHYSIO: 'physio',
  PHARMACY: 'pharmacy',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value);
}

export function rolesFrom(value: unknown): Role[] {
  if (Array.isArray(value)) {
    return value.filter(isRole);
  }
  if (isRole(value)) {
    return [value];
  }
  return [];
}

/** Home-health professionals share the "visit provider" capability. */
export function isVisitProvider(roles: readonly Role[]): boolean {
  return roles.includes(ROLES.NURSE) || roles.includes(ROLES.PHYSIO);
}
