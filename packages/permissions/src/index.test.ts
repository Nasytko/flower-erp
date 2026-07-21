import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_PERMISSION_CODES,
  COURIER_PERMISSIONS,
  DIRECTOR_PERMISSIONS,
  FLORIST_PERMISSIONS,
  PERMISSION_REGISTRY,
  SYSTEM_ROLE_PRESETS,
  hasPermission,
  isPermissionCode,
  isPermissionName,
} from './index.js';

test('permission registry is populated', () => {
  assert.ok(PERMISSION_REGISTRY.length >= 18);
  assert.equal(ALL_PERMISSION_CODES.length, PERMISSION_REGISTRY.length);
});

test('isPermissionCode validates known codes', () => {
  assert.equal(isPermissionCode('organization:read'), true);
  assert.equal(isPermissionCode('bad:permission'), false);
});

test('isPermissionName validates module:action convention', () => {
  assert.equal(isPermissionName('inventory:read'), true);
  assert.equal(isPermissionName('bad'), false);
});

test('director has all permissions', () => {
  assert.equal(hasPermission(DIRECTOR_PERMISSIONS, ALL_PERMISSION_CODES), true);
});

test('florist lacks admin permissions', () => {
  assert.equal(hasPermission(FLORIST_PERMISSIONS, ['users:manage']), false);
  assert.equal(hasPermission(FLORIST_PERMISSIONS, ['inventory:view-cost']), false);
  assert.equal(hasPermission(FLORIST_PERMISSIONS, ['supply:reverse']), false);
  assert.equal(hasPermission(FLORIST_PERMISSIONS, ['delivery:manage-couriers']), false);
  assert.equal(hasPermission(FLORIST_PERMISSIONS, ['delivery:complete']), false);
});

test('courier has delivery execution permissions only', () => {
  assert.equal(SYSTEM_ROLE_PRESETS.COURIER.code, 'COURIER');
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['delivery:read']), true);
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['delivery:dispatch']), true);
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['delivery:complete']), true);
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['delivery:report-problem']), true);
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['delivery:manage-couriers']), false);
  assert.equal(hasPermission(COURIER_PERMISSIONS, ['payments:read']), false);
});
