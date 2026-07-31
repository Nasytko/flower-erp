import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { allocateUniqueCode } from '../../../infrastructure/ids/allocate-unique-code';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  INVENTORY_POLICY_REPOSITORY,
  ITEM_CATEGORY_REPOSITORY,
  ITEM_REPOSITORY,
  UNIT_OF_MEASURE_REPOSITORY,
  type InventoryPolicyRepository,
  type ItemCategoryRepository,
  type ItemListFilter,
  type ItemRepository,
  type UnitOfMeasureRepository,
} from './ports/repositories';
import {
  ITEM_RECIPE_REPOSITORY,
  type ItemRecipeRepository,
} from './ports/item-recipe.repository';
import {
  ItemType,
  InventoryPolicyPresetCode,
  MasterDataStatus,
  DEFAULT_UNIT_SYMBOL,
  assertAvailableForNewDocuments,
  assertEntityName,
  assertItemPolicyTypeMatch,
  assertOptionalText,
  canArchiveMasterRecord,
  normalizeMasterCode,
  type ItemProps,
} from '../domain/master-data-rules';
import {
  assertRecipeNotEmpty,
  assertRecipeParentSellable,
  assertShowcaseFlag,
  assertTemplateItemEligible,
  validateRecipeLines,
  type RecipeLineInput,
} from '../domain/item-recipe-rules';
import { mapDomainError } from './map-domain-error';

const DEFAULT_CATEGORY_NAME = 'Общее';

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function normalizeMinimumStockQuantity(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new BadRequestException({
      code: 'INVALID_MINIMUM_STOCK',
      message: 'Minimum stock quantity must be a non-negative number',
    });
  }
  return num.toString();
}

@Injectable()
export class ItemUseCases {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(ITEM_RECIPE_REPOSITORY) private readonly recipes: ItemRecipeRepository,
    @Inject(ITEM_CATEGORY_REPOSITORY) private readonly categories: ItemCategoryRepository,
    @Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly units: UnitOfMeasureRepository,
    @Inject(INVENTORY_POLICY_REPOSITORY) private readonly policies: InventoryPolicyRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  private async resolveCategoryId(
    organizationId: string,
    categoryId?: string | null,
  ): Promise<string> {
    if (categoryId?.trim()) {
      return categoryId;
    }
    const listed = await this.categories.list(organizationId, { page: 1, pageSize: 100 });
    const active = listed.items.filter((c) => c.status === MasterDataStatus.ACTIVE);
    const preferred =
      active.find((c) => c.name.trim().toLowerCase() === DEFAULT_CATEGORY_NAME.toLowerCase()) ??
      active[0];
    if (preferred) {
      return preferred.id;
    }
    const code = await allocateUniqueCode('CAT', (candidate) =>
      this.categories.existsCode(organizationId, candidate),
    );
    const created = await this.categories.create({
      id: randomUUID(),
      organizationId,
      name: DEFAULT_CATEGORY_NAME,
      code,
      parentId: null,
      status: MasterDataStatus.ACTIVE,
    });
    return created.id;
  }

  private async resolvePolicyId(
    organizationId: string,
    itemType: ItemType,
    inventoryPolicyId?: string | null,
  ): Promise<string> {
    if (inventoryPolicyId?.trim()) {
      return inventoryPolicyId;
    }
    const presetCode =
      itemType === ItemType.FLOWER
        ? InventoryPolicyPresetCode.FLOWER_DEFAULT
        : InventoryPolicyPresetCode.MATERIAL_UNIT;
    const byPreset = await this.policies.findByPresetCode(organizationId, presetCode);
    if (byPreset && byPreset.status === MasterDataStatus.ACTIVE) {
      return byPreset.id;
    }
    const listed = await this.policies.list(organizationId, { page: 1, pageSize: 100 });
    const match = listed.items.find(
      (p) => p.itemType === itemType && p.status === MasterDataStatus.ACTIVE,
    );
    if (!match) {
      throw new BadRequestException({
        code: 'POLICY_REQUIRED',
        message: 'No inventory policy for this item type. Create one in master data first.',
      });
    }
    return match.id;
  }

  private async resolveDefaultUnitId(organizationId: string): Promise<string> {
    const unit = await this.units.findBySymbol(organizationId, DEFAULT_UNIT_SYMBOL);
    if (!unit) {
      throw new BadRequestException({
        code: 'DEFAULT_UNIT_MISSING',
        message: 'Default unit (шт) is missing. Seed master data for the organization.',
      });
    }
    assertAvailableForNewDocuments(unit.status, 'UNIT');
    return unit.id;
  }

  async createItem(input: {
    organizationId: string;
    categoryId?: string | null;
    unitId?: string | null;
    inventoryPolicyId?: string | null;
    name: string;
    code?: string | null;
    itemType: ItemType;
    description?: string | null;
    isPurchasable?: boolean;
    isSellable?: boolean;
    isShowcase?: boolean;
    minimumStockQuantity?: string | null;
  }): Promise<ItemProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'ITEM');
      const description = assertOptionalText(input.description, 2000);
      const ctx = getRequestContext();
      const createdByMembershipId = actorMembershipId();

      return await this.uow.runInTransaction(async () => {
        const code = input.code?.trim()
          ? normalizeMasterCode(input.code, 'ITEM')
          : await allocateUniqueCode('ITM', (candidate) =>
              this.items.existsCode(input.organizationId, candidate),
            );

        if (await this.items.existsCode(input.organizationId, code)) {
          throw new ConflictException({
            code: 'ITEM_CODE_TAKEN',
            message: 'Item code already exists in this organization',
          });
        }

        const categoryId = await this.resolveCategoryId(
          input.organizationId,
          input.categoryId,
        );
        const inventoryPolicyId = await this.resolvePolicyId(
          input.organizationId,
          input.itemType,
          input.inventoryPolicyId,
        );
        const unitId = input.unitId?.trim()
          ? input.unitId
          : await this.resolveDefaultUnitId(input.organizationId);

        const [category, unit, policy] = await Promise.all([
          this.categories.findById(input.organizationId, categoryId),
          this.units.findById(input.organizationId, unitId),
          this.policies.findById(input.organizationId, inventoryPolicyId),
        ]);

        if (!category) {
          throw new NotFoundException({
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found in this organization',
          });
        }
        if (!unit) {
          throw new NotFoundException({
            code: 'UNIT_NOT_FOUND',
            message: 'Unit of measure not found in this organization',
          });
        }
        if (!policy) {
          throw new NotFoundException({
            code: 'POLICY_NOT_FOUND',
            message: 'Inventory policy not found in this organization',
          });
        }

        assertAvailableForNewDocuments(category.status, 'CATEGORY');
        assertAvailableForNewDocuments(unit.status, 'UNIT');
        assertAvailableForNewDocuments(policy.status, 'POLICY');
        assertItemPolicyTypeMatch(input.itemType, policy.itemType);

        const isSellable = input.isSellable ?? false;
        const isShowcase = input.isShowcase ?? false;
        assertShowcaseFlag({ isSellable }, isShowcase);
        const isPurchasable = isSellable ? false : (input.isPurchasable ?? true);

        const minimumStockQuantity = normalizeMinimumStockQuantity(input.minimumStockQuantity);
        if (minimumStockQuantity !== null && input.itemType !== ItemType.FLOWER) {
          throw new BadRequestException({
            code: 'MINIMUM_STOCK_FLOWERS_ONLY',
            message: 'Minimum stock threshold applies to flowers only',
          });
        }

        const item = await this.items.create({
          id: randomUUID(),
          organizationId: input.organizationId,
          categoryId: category.id,
          unitId: unit.id,
          inventoryPolicyId: policy.id,
          name,
          code,
          itemType: input.itemType,
          description,
          isPurchasable,
          isSellable,
          isShowcase,
          minimumStockQuantity,
          status: MasterDataStatus.ACTIVE,
          createdByMembershipId,
        });

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item.created',
          entityType: 'Item',
          entityId: item.id,
          afterState: {
            name: item.name,
            code: item.code,
            itemType: item.itemType,
            categoryId: item.categoryId,
            unitId: item.unitId,
            inventoryPolicyId: item.inventoryPolicyId,
            isPurchasable: item.isPurchasable,
            isSellable: item.isSellable,
            isShowcase: item.isShowcase,
            status: item.status,
            createdByMembershipId: item.createdByMembershipId,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return item;
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async getItem(organizationId: string, itemId: string): Promise<ItemProps> {
    const item = await this.items.findById(organizationId, itemId);
    if (!item) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        message: 'Item not found in this organization',
      });
    }
    return item;
  }

  async updateItem(input: {
    organizationId: string;
    itemId: string;
    name?: string;
    description?: string | null;
    minimumStockQuantity?: string | null;
    isShowcase?: boolean;
  }): Promise<ItemProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const item = await this.items.findById(input.organizationId, input.itemId);
        if (!item) {
          throw new NotFoundException({
            code: 'ITEM_NOT_FOUND',
            message: 'Item not found in this organization',
          });
        }
        if (item.status === MasterDataStatus.ARCHIVED) {
          throw new BadRequestException({
            code: 'ITEM_ARCHIVED',
            message: 'Archived items cannot be updated',
          });
        }

        const patch: {
          name?: string;
          description?: string | null;
          minimumStockQuantity?: string | null;
          isShowcase?: boolean;
        } = {};

        if (input.name !== undefined) {
          patch.name = assertEntityName(input.name, 'ITEM');
        }
        if (input.description !== undefined) {
          patch.description = assertOptionalText(input.description, 2000);
        }
        if (input.minimumStockQuantity !== undefined) {
          if (item.itemType !== ItemType.FLOWER && input.minimumStockQuantity !== null) {
            throw new BadRequestException({
              code: 'MINIMUM_STOCK_FLOWERS_ONLY',
              message: 'Minimum stock threshold applies to flowers only',
            });
          }
          patch.minimumStockQuantity = normalizeMinimumStockQuantity(input.minimumStockQuantity);
        }
        if (input.isShowcase !== undefined) {
          assertShowcaseFlag(item, input.isShowcase);
          patch.isShowcase = input.isShowcase;
        }

        if (Object.keys(patch).length === 0) {
          return item;
        }

        const updated = await this.items.update(input.organizationId, input.itemId, patch);
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item.updated',
          entityType: 'Item',
          entityId: item.id,
          beforeState: {
            name: item.name,
            description: item.description,
            minimumStockQuantity: item.minimumStockQuantity,
          },
          afterState: {
            name: updated.name,
            description: updated.description,
            minimumStockQuantity: updated.minimumStockQuantity,
            isShowcase: updated.isShowcase,
          },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });
        return updated;
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async listItems(
    organizationId: string,
    page: number,
    pageSize: number,
    filter: ItemListFilter,
  ) {
    await this.organizations.getOrganization(organizationId);
    return this.items.list(organizationId, { page, pageSize }, filter);
  }

  async getItemRecipe(organizationId: string, itemId: string) {
    const item = await this.getItem(organizationId, itemId);
    assertRecipeParentSellable(item);
    const lines = await this.recipes.listByParent(organizationId, itemId);
    return { itemId, lines };
  }

  async setItemRecipe(input: {
    organizationId: string;
    itemId: string;
    lines: RecipeLineInput[];
  }) {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const item = await this.items.findById(input.organizationId, input.itemId);
        if (!item) {
          throw new NotFoundException({
            code: 'ITEM_NOT_FOUND',
            message: 'Item not found in this organization',
          });
        }
        assertRecipeParentSellable(item);

        const componentIds = input.lines.map((line) => line.componentItemId);
        const components = await this.items.findByIds(input.organizationId, componentIds);
        const componentMap = new Map(
          components.map((row) => [
            row.id,
            {
              id: row.id,
              itemType: row.itemType,
              status: row.status,
              isSellable: row.isSellable,
            },
          ]),
        );
        validateRecipeLines(input.lines, componentMap);

        const replaced = await this.recipes.replaceAll(
          input.organizationId,
          input.itemId,
          input.lines.map((line, index) => ({
            componentItemId: line.componentItemId,
            quantity: line.quantity,
            sortOrder: index,
          })),
        );

        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item.recipe.updated',
          entityType: 'Item',
          entityId: item.id,
          afterState: { lineCount: replaced.length },
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });

        return { itemId: input.itemId, lines: replaced };
      });
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async listBouquetCatalog(organizationId: string, showcaseOnly?: boolean) {
    await this.organizations.getOrganization(organizationId);
    return this.recipes.listBouquetCatalog(organizationId, { showcaseOnly });
  }

  async listShowcaseBouquets(organizationId: string) {
    return this.listBouquetCatalog(organizationId, true);
  }

  async getRecipeForTemplate(organizationId: string, templateItemId: string) {
    try {
      const item = await this.getItem(organizationId, templateItemId);
      assertTemplateItemEligible(item);
      const lines = await this.recipes.listByParent(organizationId, templateItemId);
      assertRecipeNotEmpty(
        lines.map((line) => ({
          componentItemId: line.componentItemId,
          quantity: line.quantity,
        })),
      );
      return { item, lines };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      mapDomainError(error);
    }
  }

  async archiveItem(input: {
    organizationId: string;
    itemId: string;
    reason?: string;
  }): Promise<ItemProps> {
    try {
      const ctx = getRequestContext();
      return await this.uow.runInTransaction(async () => {
        const item = await this.items.findById(input.organizationId, input.itemId);
        if (!item) {
          throw new NotFoundException({
            code: 'ITEM_NOT_FOUND',
            message: 'Item not found in this organization',
          });
        }
        canArchiveMasterRecord(item.status, 'ITEM');
        const updated = await this.items.updateStatus(
          input.organizationId,
          input.itemId,
          MasterDataStatus.ARCHIVED,
        );
        await this.audit.append({
          organizationId: input.organizationId,
          actorId: ctx?.actorId ?? null,
          action: 'item.archived',
          entityType: 'Item',
          entityId: item.id,
          beforeState: { status: item.status },
          afterState: { status: updated.status },
          reason: input.reason ?? null,
          requestId: ctx?.requestId ?? 'unknown',
          occurredAt: this.clock.now(),
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      mapDomainError(error);
    }
  }
}
