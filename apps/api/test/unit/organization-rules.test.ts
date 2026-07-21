import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OrganizationStatus,
  StoreStatus,
  assertOrganizationName,
  assertSingleDefaultWarehouse,
  canArchiveOrganization,
  canArchiveStore,
  canCreateStoreInOrganization,
  defaultWarehouseCode,
  normalizeStoreCode,
  normalizeWarehouseCode,
  DomainError,
} from '../../src/modules/organization/domain/organization-rules.js';

test('normalizeStoreCode uppercases and validates', () => {
  assert.equal(normalizeStoreCode(' msk-01 '), 'MSK-01');
  assert.throws(() => normalizeStoreCode('x'), DomainError);
});

test('normalizeWarehouseCode validates', () => {
  assert.equal(normalizeWarehouseCode('main'), 'MAIN');
  assert.throws(() => normalizeWarehouseCode(''), DomainError);
});

test('assertOrganizationName', () => {
  assert.equal(assertOrganizationName('  Demo  '), 'Demo');
  assert.throws(() => assertOrganizationName('A'), DomainError);
});

test('archive rules', () => {
  assert.throws(() => canArchiveOrganization(OrganizationStatus.ARCHIVED), DomainError);
  canArchiveOrganization(OrganizationStatus.ACTIVE);
  assert.throws(() => canArchiveStore(StoreStatus.ARCHIVED), DomainError);
});

test('create store requires ACTIVE org', () => {
  assert.throws(() => canCreateStoreInOrganization(OrganizationStatus.SUSPENDED), DomainError);
  canCreateStoreInOrganization(OrganizationStatus.ACTIVE);
});

test('default warehouse invariant helpers', () => {
  assert.equal(defaultWarehouseCode(), 'MAIN');
  assert.throws(() => assertSingleDefaultWarehouse(true, true), DomainError);
  assertSingleDefaultWarehouse(true, false);
});
