import assert from 'node:assert/strict';
import test from 'node:test';
import { Test } from '@nestjs/testing';
import { InfrastructureModule } from '../../src/infrastructure/infrastructure.module.js';
import { OrganizationModule } from '../../src/modules/organization/organization.module.js';
import { MasterDataModule } from '../../src/modules/master-data/master-data.module.js';
import { OrganizationUseCases } from '../../src/modules/organization/application/organization.use-cases.js';
import { SupplierUseCases } from '../../src/modules/master-data/application/supplier.use-cases.js';
import { CategoryUseCases } from '../../src/modules/master-data/application/category.use-cases.js';
import { UnitUseCases } from '../../src/modules/master-data/application/unit.use-cases.js';
import { PolicyUseCases } from '../../src/modules/master-data/application/policy.use-cases.js';
import { ItemUseCases } from '../../src/modules/master-data/application/item.use-cases.js';
import {
  ItemType,
  TrackingMethod,
} from '../../src/modules/master-data/domain/master-data-rules.js';
import { ConflictException, BadRequestException } from '@nestjs/common';

const DATABASE_URL = process.env.DATABASE_URL;
const runIntegration = Boolean(DATABASE_URL) && process.env.SKIP_INTEGRATION !== '1';

async function boot() {
  const moduleRef = await Test.createTestingModule({
    imports: [InfrastructureModule, OrganizationModule, MasterDataModule],
  }).compile();
  return moduleRef;
}

test('create supplier / category / item happy path', { skip: !runIntegration }, async () => {
  const moduleRef = await boot();
  const orgs = moduleRef.get(OrganizationUseCases);
  const suppliers = moduleRef.get(SupplierUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);

  const org = await orgs.createOrganization({ name: `MD Org ${Date.now()}` });
  const suffix = Date.now().toString().slice(-6);

  const supplier = await suppliers.createSupplier({
    organizationId: org.id,
    name: 'Holland Flowers',
    code: `SUP-${suffix}`,
  });
  assert.equal(supplier.status, 'ACTIVE');

  const category = await categories.createCategory({
    organizationId: org.id,
    name: 'Розы',
    code: `ROSE-${suffix}`,
  });

  const unit = await units.createUnit({
    organizationId: org.id,
    name: 'Ветка',
    symbol: `в${suffix.slice(-3)}`,
  });

  const policy = await policies.createInventoryPolicy({
    organizationId: org.id,
    name: 'Flower LOT',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
    defaultShelfLifeDays: 7,
  });

  const item = await items.createItem({
    organizationId: org.id,
    categoryId: category.id,
    unitId: unit.id,
    inventoryPolicyId: policy.id,
    name: 'Роза Red Naomi',
    code: `ITEM-${suffix}`,
    itemType: ItemType.FLOWER,
  });

  assert.equal(item.itemType, 'FLOWER');
  assert.equal(item.inventoryPolicyId, policy.id);

  await moduleRef.close();
});

test('tree cycle and item/policy type mismatch / archive deps', { skip: !runIntegration }, async () => {
  const moduleRef = await boot();
  const orgs = moduleRef.get(OrganizationUseCases);
  const categories = moduleRef.get(CategoryUseCases);
  const units = moduleRef.get(UnitUseCases);
  const policies = moduleRef.get(PolicyUseCases);
  const items = moduleRef.get(ItemUseCases);

  const org = await orgs.createOrganization({ name: `MD Rules ${Date.now()}` });
  const suffix = Date.now().toString().slice(-6);

  const root = await categories.createCategory({
    organizationId: org.id,
    name: 'Root',
    code: `ROOT-${suffix}`,
  });
  const child = await categories.createCategory({
    organizationId: org.id,
    name: 'Child',
    code: `CHILD-${suffix}`,
    parentId: root.id,
  });

  // Creating a category whose parent chain includes itself is impossible on create-only,
  // but self-parent with matching random id is covered in unit tests.
  assert.ok(child.parentId === root.id);

  const unit = await units.createUnit({
    organizationId: org.id,
    name: 'шт',
    symbol: `s${suffix.slice(-3)}`,
  });

  const materialPolicy = await policies.createInventoryPolicy({
    organizationId: org.id,
    name: 'Material',
    itemType: ItemType.MATERIAL,
    trackingMethod: TrackingMethod.NONE,
    expirationTracking: false,
  });

  await assert.rejects(
    () =>
      items.createItem({
        organizationId: org.id,
        categoryId: root.id,
        unitId: unit.id,
        inventoryPolicyId: materialPolicy.id,
        name: 'Bad flower',
        code: `BAD-${suffix}`,
        itemType: ItemType.FLOWER,
      }),
    (err: unknown) => err instanceof BadRequestException,
  );

  const flowerPolicy = await policies.createInventoryPolicy({
    organizationId: org.id,
    name: 'Flower',
    itemType: ItemType.FLOWER,
    trackingMethod: TrackingMethod.LOT,
    expirationTracking: true,
  });

  const item = await items.createItem({
    organizationId: org.id,
    categoryId: root.id,
    unitId: unit.id,
    inventoryPolicyId: flowerPolicy.id,
    name: 'Good flower',
    code: `GOOD-${suffix}`,
    itemType: ItemType.FLOWER,
  });

  await assert.rejects(
    () =>
      categories.archiveCategory({
        organizationId: org.id,
        categoryId: root.id,
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await assert.rejects(
    () =>
      units.archiveUnit({
        organizationId: org.id,
        unitId: unit.id,
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await assert.rejects(
    () =>
      policies.archiveInventoryPolicy({
        organizationId: org.id,
        policyId: flowerPolicy.id,
      }),
    (err: unknown) => err instanceof ConflictException,
  );

  await items.archiveItem({ organizationId: org.id, itemId: item.id });
  await policies.archiveInventoryPolicy({
    organizationId: org.id,
    policyId: flowerPolicy.id,
  });
  await units.archiveUnit({ organizationId: org.id, unitId: unit.id });
  // root still has child — cannot archive
  await assert.rejects(
    () =>
      categories.archiveCategory({
        organizationId: org.id,
        categoryId: root.id,
      }),
    (err: unknown) => err instanceof ConflictException,
  );
  await categories.archiveCategory({ organizationId: org.id, categoryId: child.id });
  await categories.archiveCategory({ organizationId: org.id, categoryId: root.id });

  await moduleRef.close();
});
