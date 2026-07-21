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
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import {
  INVENTORY_POSTING_PORT,
  type InventoryPostingPort,
} from '../../inventory/application/ports/inventory-posting.port';
import { ItemUseCases } from '../../master-data/application/item.use-cases';
import { PolicyUseCases } from '../../master-data/application/policy.use-cases';
import { SupplierUseCases } from '../../master-data/application/supplier.use-cases';
import { UnitUseCases } from '../../master-data/application/unit.use-cases';
import {
  DomainError,
  assertActiveReference,
  assertItemPurchasable,
  assertQuantityMatchesScale,
} from '../../master-data/domain/master-data-rules';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  GoodsReceiptStatus,
  SupplyStatus,
  addQty,
  assertReceiptLine,
  canAnnul,
  canCreateReceipt,
  canEditSupplyItems,
  canSubmit,
  compareQty,
  recalculateSupplyStatus,
} from '../domain/supply-rules';
import {
  SUPPLY_REPOSITORY,
  type ReceiptView,
  type SupplyRepository,
  type SupplyView,
} from './ports/supply.repository';

function domain(error: unknown): never {
  if (error instanceof DomainError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

@Injectable()
export class SupplyUseCases {
  constructor(
    @Inject(SUPPLY_REPOSITORY) private readonly supplies: SupplyRepository,
    private readonly organizations: OrganizationUseCases,
    private readonly suppliers: SupplierUseCases,
    private readonly items: ItemUseCases,
    private readonly units: UnitUseCases,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createSupply(input: {
    organizationId: string;
    storeId: string;
    warehouseId: string;
    supplierId: string;
    expectedReceiptDate?: string;
    comment?: string | null;
  }): Promise<SupplyView> {
    try {
      await this.organizations.getWarehouse(input.organizationId, input.storeId, input.warehouseId);
      const supplier = await this.suppliers.getSupplier(input.organizationId, input.supplierId);
      assertActiveReference(supplier.status, 'SUPPLIER');
      return await this.uow.runInTransaction(async () =>
        this.supplies.createSupply({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: input.warehouseId,
          supplierId: input.supplierId,
          number: await this.supplies.uniqueNumber('SUP', input.organizationId),
          expectedReceiptDate: input.expectedReceiptDate
            ? new Date(input.expectedReceiptDate)
            : null,
          comment: input.comment?.trim() || null,
        }),
      );
    } catch (error) {
      domain(error);
    }
  }

  async addSupplyItem(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    itemId: string;
    orderedQuantity: string;
    plannedUnitPrice?: string | null;
  }) {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canEditSupplyItems(supply.status as SupplyStatus);
        const item = await this.items.getItem(input.organizationId, input.itemId);
        assertItemPurchasable(item);
        const unit = await this.units.getUnit(input.organizationId, item.unitId);
        assertQuantityMatchesScale(input.orderedQuantity, unit.quantityScale);
        return this.supplies.addSupplyItem({
          id: randomUUID(),
          organizationId: input.organizationId,
          supplyId: supply.id,
          itemId: item.id,
          orderedQuantity: input.orderedQuantity,
          plannedUnitPrice: input.plannedUnitPrice ?? null,
        });
      });
    } catch (error) {
      domain(error);
    }
  }

  async removeSupplyItem(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    itemId: string;
  }): Promise<void> {
    try {
      await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canEditSupplyItems(supply.status as SupplyStatus);
        const result = await this.supplies.removeSupplyItem(
          input.organizationId,
          supply.id,
          input.itemId,
        );
        if (!result.count) {
          throw new NotFoundException({
            code: 'SUPPLY_ITEM_NOT_FOUND',
            message: 'Supply item not found',
          });
        }
      });
    } catch (error) {
      domain(error);
    }
  }

  async submitSupply(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
  }): Promise<SupplyView> {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canSubmit(supply.status as SupplyStatus, supply.items.length);
        await this.supplies.updateSupplyStatus(
          supply.id,
          'SUBMITTED_TO_SUPPLIER',
          this.clock.now(),
        );
        return this.requireSupply(input.organizationId, input.storeId, supply.id);
      });
    } catch (error) {
      domain(error);
    }
  }

  async annulDraftSupply(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
  }): Promise<SupplyView> {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canAnnul(supply.status as SupplyStatus);
        await this.supplies.updateSupplyStatus(supply.id, 'ANNULLED');
        return this.requireSupply(input.organizationId, input.storeId, supply.id);
      });
    } catch (error) {
      domain(error);
    }
  }

  getSupply(organizationId: string, storeId: string, supplyId: string) {
    return this.requireSupply(organizationId, storeId, supplyId);
  }

  async listSupplies(organizationId: string, storeId: string, status?: SupplyStatus) {
    await this.organizations.getStore(organizationId, storeId);
    return this.supplies.listSupplies(organizationId, storeId, status);
  }

  private async requireSupply(
    organizationId: string,
    storeId: string,
    id: string,
  ): Promise<SupplyView> {
    const supply = await this.supplies.getSupply(organizationId, storeId, id);
    if (!supply) {
      throw new NotFoundException({
        code: 'SUPPLY_NOT_FOUND',
        message: 'Supply not found in this store',
      });
    }
    return supply;
  }
}

@Injectable()
export class GoodsReceiptUseCases {
  constructor(
    @Inject(SUPPLY_REPOSITORY) private readonly supplies: SupplyRepository,
    private readonly suppliers: SupplierUseCases,
    private readonly items: ItemUseCases,
    private readonly units: UnitUseCases,
    private readonly policies: PolicyUseCases,
    @Inject(INVENTORY_POSTING_PORT) private readonly inventoryPosting: InventoryPostingPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createGoodsReceipt(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    receivedAt: string;
    comment?: string | null;
  }): Promise<ReceiptView> {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canCreateReceipt(supply.status as SupplyStatus);
        return this.supplies.createReceipt({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: supply.warehouseId,
          supplyId: supply.id,
          number: await this.supplies.uniqueNumber('GR', input.organizationId),
          receivedAt: new Date(input.receivedAt),
          comment: input.comment?.trim() || null,
        });
      });
    } catch (error) {
      domain(error);
    }
  }

  async addGoodsReceiptItem(input: {
    organizationId: string;
    storeId: string;
    goodsReceiptId: string;
    supplyItemId: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    defectiveQuantity: string;
    actualUnitPrice: string;
    defectReason?: string | null;
  }) {
    try {
      return await this.uow.runInTransaction(async () => {
        const receipt = await this.requireReceipt(
          input.organizationId,
          input.storeId,
          input.goodsReceiptId,
        );
        if (receipt.status !== GoodsReceiptStatus.DRAFT) {
          throw new ConflictException({
            code: 'RECEIPT_NOT_DRAFT',
            message: 'Only DRAFT receipts can be edited',
          });
        }
        assertReceiptLine(
          input.receivedQuantity,
          input.acceptedQuantity,
          input.defectiveQuantity,
        );
        const line = await this.supplies.getSupplyItem(
          input.organizationId,
          receipt.supplyId,
          input.supplyItemId,
        );
        if (!line) {
          throw new NotFoundException({
            code: 'SUPPLY_ITEM_NOT_FOUND',
            message: 'Supply item not found',
          });
        }
        const unit = await this.units.getUnit(input.organizationId, line.item.unitId);
        assertQuantityMatchesScale(input.receivedQuantity, unit.quantityScale);
        const [posted, drafts] = await Promise.all([
          this.supplies.sumPostedBySupplyItem(input.organizationId, line.id),
          this.supplies.sumDraftOtherBySupplyItem(input.organizationId, line.id, receipt.id),
        ]);
        if (
          compareQty(addQty(addQty(posted, drafts), input.receivedQuantity), line.orderedQuantity) >
          0
        ) {
          throw new ConflictException({
            code: 'OVER_RECEIPT',
            message: 'Receipt quantity exceeds remaining ordered quantity',
          });
        }
        return this.supplies.addReceiptItem({
          id: randomUUID(),
          organizationId: input.organizationId,
          goodsReceiptId: receipt.id,
          supplyItemId: line.id,
          itemId: line.itemId,
          receivedQuantity: input.receivedQuantity,
          acceptedQuantity: input.acceptedQuantity,
          defectiveQuantity: input.defectiveQuantity,
          actualUnitPrice: input.actualUnitPrice,
          defectReason: input.defectReason?.trim() || null,
        });
      });
    } catch (error) {
      domain(error);
    }
  }

  async postGoodsReceipt(input: {
    organizationId: string;
    storeId: string;
    goodsReceiptId: string;
    idempotencyKey?: string;
  }): Promise<ReceiptView> {
    return this.uow.runInTransaction(async () => {
      const receipt = await this.requireReceipt(
        input.organizationId,
        input.storeId,
        input.goodsReceiptId,
      );
      if (receipt.status !== GoodsReceiptStatus.DRAFT) {
        throw new ConflictException({
          code: 'RECEIPT_NOT_DRAFT',
          message: 'Receipt is already posted or reversed',
        });
      }
      if (!receipt.items.length) {
        throw new BadRequestException({
          code: 'RECEIPT_HAS_NO_ITEMS',
          message: 'Receipt must have items',
        });
      }
      const supply = await this.requireSupply(
        input.organizationId,
        input.storeId,
        receipt.supplyId,
      );
      canCreateReceipt(supply.status as SupplyStatus);
      const supplier = await this.suppliers.getSupplier(input.organizationId, supply.supplierId);
      assertActiveReference(supplier.status, 'SUPPLIER');

      for (const line of receipt.items) {
        const [item, unit] = await Promise.all([
          this.items.getItem(input.organizationId, line.itemId),
          this.units.getUnit(input.organizationId, line.item.unitId),
        ]);
        assertItemPurchasable(item);
        assertQuantityMatchesScale(line.receivedQuantity, unit.quantityScale);
        const posted = await this.supplies.sumPostedBySupplyItem(
          input.organizationId,
          line.supplyItemId,
        );
        if (compareQty(addQty(posted, line.receivedQuantity), line.supplyItem.orderedQuantity) > 0) {
          throw new ConflictException({
            code: 'OVER_RECEIPT',
            message: 'Posting would exceed ordered quantity',
          });
        }
      }

      const lines = await Promise.all(
        receipt.items
          .filter((line) => compareQty(line.acceptedQuantity, '0') > 0)
          .map(async (line) => {
            const [item, policy] = await Promise.all([
              this.items.getItem(input.organizationId, line.itemId),
              this.policies.getPolicy(input.organizationId, line.item.inventoryPolicyId),
            ]);
            assertActiveReference(policy.status, 'POLICY');
            return {
              goodsReceiptItemId: line.id,
              itemId: line.itemId,
              acceptedQuantity: line.acceptedQuantity,
              actualUnitPrice: line.actualUnitPrice,
              receivedAt: receipt.receivedAt,
              itemType: item.itemType,
              defaultShelfLifeDays: policy.defaultShelfLifeDays,
            };
          }),
      );

      await this.inventoryPosting.postGoodsReceipt({
        organizationId: input.organizationId,
        storeId: receipt.storeId,
        warehouseId: receipt.warehouseId,
        goodsReceiptId: receipt.id,
        idempotencyKey: input.idempotencyKey,
        lines,
      });

      const posted = await this.supplies.setReceiptPosted(receipt.id, this.clock.now());
      await this.recalculate(supply);
      await this.auditAction(input.organizationId, receipt.storeId, 'goods_receipt.posted', receipt.id);
      return posted;
    });
  }

  async reverseGoodsReceipt(input: {
    organizationId: string;
    storeId: string;
    goodsReceiptId: string;
    idempotencyKey?: string;
  }): Promise<ReceiptView> {
    return this.uow.runInTransaction(async () => {
      const receipt = await this.requireReceipt(
        input.organizationId,
        input.storeId,
        input.goodsReceiptId,
      );
      if (receipt.status !== GoodsReceiptStatus.POSTED) {
        throw new ConflictException({
          code: 'RECEIPT_NOT_POSTED',
          message: 'Only POSTED receipts can be reversed',
        });
      }
      await this.inventoryPosting.reverseGoodsReceipt({
        organizationId: input.organizationId,
        storeId: receipt.storeId,
        warehouseId: receipt.warehouseId,
        goodsReceiptId: receipt.id,
        goodsReceiptItemIds: receipt.items.map((line) => line.id),
        idempotencyKey: input.idempotencyKey,
      });
      const reversed = await this.supplies.setReceiptReversed(receipt.id);
      await this.recalculate(
        await this.requireSupply(input.organizationId, input.storeId, receipt.supplyId),
      );
      await this.auditAction(
        input.organizationId,
        receipt.storeId,
        'goods_receipt.reversed',
        receipt.id,
      );
      return reversed;
    });
  }

  getGoodsReceipt(organizationId: string, storeId: string, id: string) {
    return this.requireReceipt(organizationId, storeId, id);
  }

  async listGoodsReceipts(organizationId: string, storeId: string, supplyId: string) {
    await this.requireSupply(organizationId, storeId, supplyId);
    return this.supplies.listReceipts(organizationId, storeId, supplyId);
  }

  private async recalculate(supply: SupplyView) {
    let received = '0';
    let ordered = '0';
    for (const line of supply.items) {
      ordered = addQty(ordered, line.orderedQuantity);
      received = addQty(
        received,
        await this.supplies.sumPostedBySupplyItem(supply.organizationId, line.id),
      );
    }
    await this.supplies.updateSupplyStatus(
      supply.id,
      recalculateSupplyStatus(ordered, received),
    );
  }

  private async requireSupply(org: string, store: string, id: string) {
    const supply = await this.supplies.getSupply(org, store, id);
    if (!supply) {
      throw new NotFoundException({
        code: 'SUPPLY_NOT_FOUND',
        message: 'Supply not found in this store',
      });
    }
    return supply;
  }

  private async requireReceipt(org: string, store: string, id: string) {
    const receipt = await this.supplies.getReceipt(org, store, id);
    if (!receipt) {
      throw new NotFoundException({
        code: 'GOODS_RECEIPT_NOT_FOUND',
        message: 'Goods receipt not found in this store',
      });
    }
    return receipt;
  }

  private auditAction(
    organizationId: string,
    storeId: string,
    action: string,
    entityId: string,
  ) {
    const ctx = getRequestContext();
    return this.audit.append({
      organizationId,
      storeId,
      actorId: ctx?.actorId ?? null,
      action,
      entityType: 'GoodsReceipt',
      entityId,
      afterState: {},
      requestId: ctx?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
  }
}
