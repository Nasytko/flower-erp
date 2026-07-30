import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ItemType,
  MasterDataStatus,
  DomainError,
} from '../../src/modules/master-data/domain/master-data-rules.js';
import {
  assertRecipeNotEmpty,
  assertRecipeParentSellable,
  assertShowcaseFlag,
  assertTemplateItemEligible,
  validateRecipeLines,
} from '../../src/modules/master-data/domain/item-recipe-rules.js';

test('showcase flag requires sellable item', () => {
  assert.doesNotThrow(() => assertShowcaseFlag({ isSellable: true }, true));
  assert.throws(
    () => assertShowcaseFlag({ isSellable: false }, true),
    (err: unknown) =>
      err instanceof DomainError && err.code === 'SHOWCASE_REQUIRES_SELLABLE',
  );
});

test('recipe parent must be sellable', () => {
  assert.doesNotThrow(() =>
    assertRecipeParentSellable({
      isSellable: true,
      status: MasterDataStatus.ACTIVE,
    }),
  );
  assert.throws(
    () =>
      assertRecipeParentSellable({
        isSellable: false,
        status: MasterDataStatus.ACTIVE,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'RECIPE_NOT_SELLABLE',
  );
});

test('recipe validation rejects duplicate components and wrong types', () => {
  const flower = {
    id: 'flower-1',
    itemType: ItemType.FLOWER,
    status: MasterDataStatus.ACTIVE,
  };
  const material = {
    id: 'mat-1',
    itemType: ItemType.MATERIAL,
    status: MasterDataStatus.ACTIVE,
  };
  const components = new Map([
    [flower.id, flower],
    [material.id, material],
  ]);

  assert.doesNotThrow(() =>
    validateRecipeLines(
      [
        { componentItemId: flower.id, quantity: '7' },
        { componentItemId: material.id, quantity: '1' },
      ],
      components,
    ),
  );

  assert.throws(
    () =>
      validateRecipeLines(
        [
          { componentItemId: flower.id, quantity: '3' },
          { componentItemId: flower.id, quantity: '2' },
        ],
        components,
      ),
    (err: unknown) =>
      err instanceof DomainError && err.code === 'RECIPE_DUPLICATE_COMPONENT',
  );

  assert.throws(
    () =>
      validateRecipeLines([{ componentItemId: 'missing', quantity: '1' }], components),
    (err: unknown) =>
      err instanceof DomainError && err.code === 'RECIPE_COMPONENT_NOT_FOUND',
  );
});

test('template item eligibility and non-empty recipe', () => {
  assert.doesNotThrow(() =>
    assertTemplateItemEligible({
      status: MasterDataStatus.ACTIVE,
      isShowcase: true,
      isSellable: true,
    }),
  );

  assert.throws(
    () =>
      assertTemplateItemEligible({
        status: MasterDataStatus.INACTIVE,
        isShowcase: true,
        isSellable: true,
      }),
    (err: unknown) => err instanceof DomainError && err.code === 'TEMPLATE_NOT_ACTIVE',
  );

  assert.throws(
    () => assertRecipeNotEmpty([]),
    (err: unknown) => err instanceof DomainError && err.code === 'RECIPE_EMPTY',
  );
});
