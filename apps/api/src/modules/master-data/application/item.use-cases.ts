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
  ItemType,
  MasterDataStatus,
  assertAvailableForNewDocuments,
  assertEntityName,
  assertItemPolicyTypeMatch,
  assertOptionalText,
  canArchiveMasterRecord,
  normalizeMasterCode,
  type ItemProps,
} from '../domain/master-data-rules';
import { mapDomainError } from './map-domain-error';

@Injectable()
export class ItemUseCases {
  constructor(
    @Inject(ITEM_REPOSITORY) private readonly items: ItemRepository,
    @Inject(ITEM_CATEGORY_REPOSITORY) private readonly categories: ItemCategoryRepository,
    @Inject(UNIT_OF_MEASURE_REPOSITORY) private readonly units: UnitOfMeasureRepository,
    @Inject(INVENTORY_POLICY_REPOSITORY) private readonly policies: InventoryPolicyRepository,
    private readonly organizations: OrganizationUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createItem(input: {
    organizationId: string;
    categoryId: string;
    unitId: string;
    inventoryPolicyId: string;
    name: string;
    code: string;
    itemType: ItemType;
    description?: string | null;
    isPurchasable?: boolean;
    isSellable?: boolean;
  }): Promise<ItemProps> {
    try {
      await this.organizations.getOrganization(input.organizationId);
      const name = assertEntityName(input.name, 'ITEM');
      const code = normalizeMasterCode(input.code, 'ITEM');
      const description = assertOptionalText(input.description, 2000);
      const ctx = getRequestContext();

      return await this.uow.runInTransaction(async () => {
        if (await this.items.existsCode(input.organizationId, code)) {
          throw new ConflictException({
            code: 'ITEM_CODE_TAKEN',
            message: 'Item code already exists in this organization',
          });
        }

        const [category, unit, policy] = await Promise.all([
          this.categories.findById(input.organizationId, input.categoryId),
          this.units.findById(input.organizationId, input.unitId),
          this.policies.findById(input.organizationId, input.inventoryPolicyId),
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
          isPurchasable: input.isPurchasable ?? true,
          isSellable: input.isSellable ?? false,
          status: MasterDataStatus.ACTIVE,
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
            status: item.status,
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

  async listItems(
    organizationId: string,
    page: number,
    pageSize: number,
    filter: ItemListFilter,
  ) {
    await this.organizations.getOrganization(organizationId);
    return this.items.list(organizationId, { page, pageSize }, filter);
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
