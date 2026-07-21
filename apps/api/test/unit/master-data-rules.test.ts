import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ItemType,
  MasterDataStatus,
  TrackingMethod,
  assertCanArchiveCategory,
  assertCanArchivePolicy,
  assertCanArchiveUnit,
  assertCategoryNoCycle,
  assertCategoryNotSelfParent,
  assertInventoryPolicyShape,
  assertItemPolicyTypeMatch,
  DomainError,
} from '../../src/modules/master-data/domain/master-data-rules.js';

test('flower policy requires LOT + expiration', () => {
  assert.doesNotThrow(() =>
    assertInventoryPolicyShape({
      itemType: ItemType.FLOWER,
      trackingMethod: TrackingMethod.LOT,
      expirationTracking: true,
      defaultShelfLifeDays: 5,
    }),
  );

  assert.throws(
    () =>
      assertInventoryPolicyShape({
        itemType: ItemType.FLOWER,
        trackingMethod: TrackingMethod.NONE,
        expirationTracking: true,
        defaultShelfLifeDays: null,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INVALID_FLOWER_TRACKING',
  );
});

test('material policy requires NONE + no expiration', () => {
  assert.doesNotThrow(() =>
    assertInventoryPolicyShape({
      itemType: ItemType.MATERIAL,
      trackingMethod: TrackingMethod.NONE,
      expirationTracking: false,
      defaultShelfLifeDays: null,
    }),
  );

  assert.throws(
    () =>
      assertInventoryPolicyShape({
        itemType: ItemType.MATERIAL,
        trackingMethod: TrackingMethod.LOT,
        expirationTracking: false,
        defaultShelfLifeDays: null,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'INVALID_MATERIAL_TRACKING',
  );
});

test('item type must match policy type', () => {
  assert.doesNotThrow(() => assertItemPolicyTypeMatch(ItemType.FLOWER, ItemType.FLOWER));
  assert.throws(
    () => assertItemPolicyTypeMatch(ItemType.FLOWER, ItemType.MATERIAL),
    (err: unknown) => err instanceof DomainError && err.code === 'ITEM_POLICY_TYPE_MISMATCH',
  );
});

test('category cannot be its own parent', () => {
  assert.throws(
    () => assertCategoryNotSelfParent('cat-1', 'cat-1'),
    (err: unknown) => err instanceof DomainError && err.code === 'CATEGORY_SELF_PARENT',
  );
});

test('category cycle detection walks ancestors', async () => {
  const parents: Record<string, string | null> = {
    a: null,
    b: 'a',
    c: 'b',
  };

  await assert.rejects(
    () => assertCategoryNoCycle('a', 'c', async (id) => parents[id] ?? null),
    (err: unknown) => err instanceof DomainError && err.code === 'CATEGORY_CYCLE',
  );

  await assert.doesNotReject(() =>
    assertCategoryNoCycle('d', 'c', async (id) => parents[id] ?? null),
  );
});

test('archive guards for category/unit/policy dependencies', () => {
  assert.throws(
    () =>
      assertCanArchiveCategory({
        status: MasterDataStatus.ACTIVE,
        childCount: 1,
        itemCount: 0,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'CATEGORY_HAS_CHILDREN',
  );

  assert.throws(
    () => assertCanArchiveUnit({ status: MasterDataStatus.ACTIVE, itemCount: 2 }),
    (err: unknown) => err instanceof DomainError && err.code === 'UNIT_IN_USE',
  );

  assert.throws(
    () => assertCanArchivePolicy({ status: MasterDataStatus.ACTIVE, itemCount: 1 }),
    (err: unknown) => err instanceof DomainError && err.code === 'POLICY_IN_USE',
  );

  assert.doesNotThrow(() =>
    assertCanArchiveCategory({
      status: MasterDataStatus.ACTIVE,
      childCount: 0,
      itemCount: 0,
    }),
  );
});
