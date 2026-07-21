export {
  ALL_PERMISSION_CODES,
  COURIER_PERMISSIONS,
  DIRECTOR_PERMISSIONS,
  FLORIST_PERMISSIONS,
  PERMISSION_REGISTRY,
  SYSTEM_ROLE_PRESETS,
  isPermissionCode,
  type PermissionCode,
  type PermissionDefinition,
  type SystemRoleCode,
} from './registry.js';

/** @deprecated Use isPermissionCode — kept for backward-compatible tests. */
export function isPermissionName(value: string): boolean {
  return /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(value);
}

export function hasPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((code) => granted.includes(code));
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.some((code) => granted.includes(code));
}
