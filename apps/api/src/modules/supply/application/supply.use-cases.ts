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
import {
  DomainError,
  DEFAULT_QUANTITY_SCALE,
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
  canCorrectPostedSupplyItems,
  canCreateReceipt,
  canEditSupplyHeader,
  canEditSupplyItems,
  canReceiveSupply,
  canSubmit,
  compareQty,
  isOpenSupply,
} from '../domain/supply-rules';
import {
  SUPPLY_REPOSITORY,
  type ReceiptView,
  type SupplyItemView,
  type SupplyLineCorrectionView,
  type SupplyRepository,
  type SupplyView,
} from './ports/supply.repository';

function domain(error: unknown): never {
  if (error instanceof DomainError) {
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

function parseDateOnly(value: string): Date {
  const d = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({ code: 'INVALID_DATE', message: 'Invalid date' });
  }
  return d;
}

function dateOnlyFromClock(clock: ClockPort): Date {
  const now = clock.now();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function receiptAtFromDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0),
  );
}

function normalizeOptionalDocText(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new BadRequestException({
      code: 'TEXT_TOO_LONG',
      message: `Text exceeds ${max} characters`,
    });
  }
  return trimmed;
}

function dateOnlyIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function supplyHeaderSnapshot(supply: SupplyView): Record<string, unknown> {
  return {
    receivedDate: dateOnlyIso(supply.receivedDate),
    paymentDueDate: dateOnlyIso(supply.paymentDueDate),
    supplierDocumentNumber: supply.supplierDocumentNumber,
    comment: supply.comment,
  };
}

function supplyLineSnapshot(line: SupplyItemView): Record<string, unknown> {
  return {
    itemId: line.itemId,
    itemName: line.item.name,
    itemCode: line.item.code,
    quantity: line.orderedQuantity,
    unitCost: line.plannedUnitPrice,
    total:
      line.plannedUnitPrice != null
        ? (Number(line.orderedQuantity) * Number(line.plannedUnitPrice)).toFixed(2)
        : null,
  };
}

function supplyCreatedSnapshot(supply: SupplyView): Record<string, unknown> {
  return {
    number: supply.number,
    status: supply.status,
    supplierId: supply.supplierId,
    ...supplyHeaderSnapshot(supply),
    itemCount: supply.items.length,
  };
}

@Injectable()
export class SupplyUseCases {
  constructor(
    @Inject(SUPPLY_REPOSITORY) private readonly supplies: SupplyRepository,
    private readonly organizations: OrganizationUseCases,
    private readonly suppliers: SupplierUseCases,
    private readonly items: ItemUseCases,
    @Inject(INVENTORY_POSTING_PORT) private readonly inventoryPosting: InventoryPostingPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  async createSupply(input: {
    organizationId: string;
    storeId: string;
    warehouseId?: string;
    supplierId: string;
    expectedReceiptDate?: string;
    receivedDate?: string;
    paymentDueDate?: string;
    supplierDocumentNumber?: string | null;
    comment?: string | null;
  }): Promise<SupplyView> {
    try {
      const warehouse = await this.organizations.resolveStoreWarehouse(
        input.organizationId,
        input.storeId,
        input.warehouseId,
      );
      const supplier = await this.suppliers.getSupplier(input.organizationId, input.supplierId);
      assertActiveReference(supplier.status, 'SUPPLIER');
      return await this.uow.runInTransaction(async () => {
        const created = await this.supplies.createSupply({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: warehouse.id,
          supplierId: input.supplierId,
          number: await this.supplies.uniqueNumber('SUP', input.organizationId),
          expectedReceiptDate: input.expectedReceiptDate
            ? parseDateOnly(input.expectedReceiptDate)
            : null,
          receivedDate: input.receivedDate
            ? parseDateOnly(input.receivedDate)
            : dateOnlyFromClock(this.clock),
          paymentDueDate: input.paymentDueDate ? parseDateOnly(input.paymentDueDate) : null,
          supplierDocumentNumber: normalizeOptionalDocText(input.supplierDocumentNumber, 100),
          comment: input.comment?.trim() || null,
        });
        await this.auditSupply(
          input.organizationId,
          input.storeId,
          'supply.created',
          created.id,
          null,
          supplyCreatedSnapshot(created),
        );
        return created;
      });
    } catch (error) {
      domain(error);
    }
  }

  async updateSupply(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    receivedDate?: string | null;
    paymentDueDate?: string | null;
    supplierDocumentNumber?: string | null;
    comment?: string | null;
  }): Promise<SupplyView> {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canEditSupplyHeader(supply.status as SupplyStatus);
        const patch: {
          receivedDate?: Date | null;
          paymentDueDate?: Date | null;
          supplierDocumentNumber?: string | null;
          comment?: string | null;
        } = {};
        if (input.receivedDate !== undefined) {
          patch.receivedDate = input.receivedDate
            ? parseDateOnly(input.receivedDate)
            : dateOnlyFromClock(this.clock);
        }
        if (input.paymentDueDate !== undefined) {
          patch.paymentDueDate = input.paymentDueDate
            ? parseDateOnly(input.paymentDueDate)
            : null;
        }
        if (input.supplierDocumentNumber !== undefined) {
          patch.supplierDocumentNumber = normalizeOptionalDocText(input.supplierDocumentNumber, 100);
        }
        if (input.comment !== undefined) {
          patch.comment = input.comment?.trim() || null;
        }
        const before = supplyHeaderSnapshot(supply);
        const updated = await this.supplies.updateSupplyHeader(
          input.organizationId,
          input.storeId,
          supply.id,
          patch,
        );
        const after = supplyHeaderSnapshot(updated);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          await this.auditSupply(
            input.organizationId,
            input.storeId,
            'supply.header_updated',
            supply.id,
            before,
            after,
          );
        }
        return updated;
      });
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
        assertQuantityMatchesScale(input.orderedQuantity, DEFAULT_QUANTITY_SCALE);
        const added = await this.supplies.addSupplyItem({
          id: randomUUID(),
          organizationId: input.organizationId,
          supplyId: supply.id,
          itemId: item.id,
          orderedQuantity: input.orderedQuantity,
          plannedUnitPrice: input.plannedUnitPrice ?? null,
        });
        await this.auditSupply(
          input.organizationId,
          input.storeId,
          'supply.line_added',
          supply.id,
          null,
          supplyLineSnapshot(added),
        );
        return added;
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
        const line = supply.items.find((entry) => entry.itemId === input.itemId);
        if (!line) {
          throw new NotFoundException({
            code: 'SUPPLY_ITEM_NOT_FOUND',
            message: 'Supply item not found',
          });
        }
        const before = supplyLineSnapshot(line);
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
        await this.auditSupply(
          input.organizationId,
          input.storeId,
          'supply.line_removed',
          supply.id,
          before,
          null,
        );
      });
    } catch (error) {
      domain(error);
    }
  }

  async updateSupplyItem(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    itemId: string;
    orderedQuantity: string;
    plannedUnitPrice: string;
  }) {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        const item = await this.items.getItem(input.organizationId, input.itemId);
        assertItemPurchasable(item);
        assertQuantityMatchesScale(input.orderedQuantity, DEFAULT_QUANTITY_SCALE);
        const price = Number(input.plannedUnitPrice);
        if (!Number.isFinite(price) || price < 0) {
          throw new BadRequestException({
            code: 'INVALID_UNIT_PRICE',
            message: 'Unit cost must be a non-negative decimal',
          });
        }
        if (compareQty(input.orderedQuantity, '0') <= 0) {
          throw new BadRequestException({
            code: 'INVALID_QUANTITY',
            message: 'Quantity must be greater than zero',
          });
        }

        if (isOpenSupply(supply.status)) {
          const line = supply.items.find((entry) => entry.itemId === item.id);
          const before = line ? supplyLineSnapshot(line) : null;
          const updated = await this.supplies.updateSupplyItem({
            organizationId: input.organizationId,
            supplyId: supply.id,
            itemId: item.id,
            orderedQuantity: input.orderedQuantity,
            plannedUnitPrice: input.plannedUnitPrice,
          });
          if (!updated) {
            throw new NotFoundException({
              code: 'SUPPLY_ITEM_NOT_FOUND',
              message: 'Supply item not found',
            });
          }
          const after = supplyLineSnapshot(updated);
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            await this.auditSupply(
              input.organizationId,
              input.storeId,
              'supply.line_updated',
              supply.id,
              before,
              after,
            );
          }
          return updated;
        }

        canCorrectPostedSupplyItems(supply.status as SupplyStatus);
        const line = supply.items.find((entry) => entry.itemId === item.id);
        if (!line) {
          throw new NotFoundException({
            code: 'SUPPLY_ITEM_NOT_FOUND',
            message: 'Supply item not found',
          });
        }

        const qtyUnchanged = compareQty(line.orderedQuantity, input.orderedQuantity) === 0;
        const costUnchanged =
          line.plannedUnitPrice != null &&
          Number(line.plannedUnitPrice) === Number(input.plannedUnitPrice);
        if (qtyUnchanged && costUnchanged) {
          return line;
        }

        const posted = await this.supplies.findPostedReceiptItemBySupplyItem(
          input.organizationId,
          line.id,
        );
        if (!posted) {
          throw new ConflictException({
            code: 'SUPPLY_LINE_NOT_POSTED',
            message: 'Posted receipt line was not found for this supply item',
          });
        }

        const before = {
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code,
          quantity: line.orderedQuantity,
          unitCost: line.plannedUnitPrice,
          total:
            line.plannedUnitPrice != null
              ? (Number(line.orderedQuantity) * Number(line.plannedUnitPrice)).toFixed(2)
              : null,
        };
        const after = {
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code,
          quantity: input.orderedQuantity,
          unitCost: input.plannedUnitPrice,
          total: (Number(input.orderedQuantity) * Number(input.plannedUnitPrice)).toFixed(2),
        };

        await this.inventoryPosting.adjustGoodsReceiptItem({
          organizationId: input.organizationId,
          storeId: posted.storeId,
          warehouseId: posted.warehouseId,
          goodsReceiptId: posted.goodsReceiptId,
          goodsReceiptItemId: posted.goodsReceiptItemId,
          itemId: item.id,
          acceptedQuantity: input.orderedQuantity,
          actualUnitPrice: input.plannedUnitPrice,
          occurredAt: this.clock.now(),
        });

        await this.supplies.updateReceiptItem({
          id: posted.goodsReceiptItemId,
          receivedQuantity: input.orderedQuantity,
          acceptedQuantity: input.orderedQuantity,
          actualUnitPrice: input.plannedUnitPrice,
        });

        const updated = await this.supplies.updateSupplyItem({
          organizationId: input.organizationId,
          supplyId: supply.id,
          itemId: item.id,
          orderedQuantity: input.orderedQuantity,
          plannedUnitPrice: input.plannedUnitPrice,
        });
        if (!updated) {
          throw new NotFoundException({
            code: 'SUPPLY_ITEM_NOT_FOUND',
            message: 'Supply item not found',
          });
        }

        await this.auditSupply(
          input.organizationId,
          input.storeId,
          'supply.line_corrected',
          supply.id,
          before,
          after,
        );

        await this.recalculateSupplyStatus(input.organizationId, input.storeId, supply.id);

        return updated;
      });
    } catch (error) {
      domain(error);
    }
  }

  private async recalculateSupplyStatus(
    organizationId: string,
    storeId: string,
    supplyId: string,
  ): Promise<void> {
    const supply = await this.requireSupply(organizationId, storeId, supplyId);
    if (!supply.items.length) {
      await this.supplies.updateSupplyStatus(supply.id, 'SUBMITTED_TO_SUPPLIER');
      return;
    }

    let linesWithReceipt = 0;
    let fullyReceivedLines = 0;
    for (const line of supply.items) {
      const received = await this.supplies.sumPostedBySupplyItem(organizationId, line.id);
      if (compareQty(received, '0') > 0) {
        linesWithReceipt += 1;
      }
      if (compareQty(received, line.orderedQuantity) >= 0) {
        fullyReceivedLines += 1;
      }
    }

    const nextStatus =
      linesWithReceipt === 0
        ? 'SUBMITTED_TO_SUPPLIER'
        : fullyReceivedLines === supply.items.length
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED';

    await this.supplies.updateSupplyStatus(supply.id, nextStatus);
  }

  async listSupplyCorrections(
    organizationId: string,
    storeId: string,
    supplyId: string,
  ): Promise<SupplyLineCorrectionView[]> {
    await this.requireSupply(organizationId, storeId, supplyId);
    return this.supplies.listSupplyLineCorrections(organizationId, storeId, supplyId);
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
        await this.auditSupply(
          input.organizationId,
          input.storeId,
          'supply.annulled',
          supply.id,
          { status: supply.status, number: supply.number },
          { status: 'ANNULLED', number: supply.number },
        );
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

  private auditSupply(
    organizationId: string,
    storeId: string,
    action: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    const ctx = getRequestContext();
    return this.audit.append({
      organizationId,
      storeId,
      actorId: ctx?.actorId ?? null,
      action,
      entityType: 'Supply',
      entityId,
      beforeState: before,
      afterState: after,
      requestId: ctx?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
  }
}

@Injectable()
export class GoodsReceiptUseCases {
  constructor(
    @Inject(SUPPLY_REPOSITORY) private readonly supplies: SupplyRepository,
    private readonly suppliers: SupplierUseCases,
    private readonly items: ItemUseCases,
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

  /**
   * One-step receiving: open supply → goods receipt with all lines → post to inventory.
   */
  async receiveFromSupply(input: {
    organizationId: string;
    storeId: string;
    supplyId: string;
    receivedAt?: string;
    comment?: string | null;
    idempotencyKey?: string;
  }): Promise<ReceiptView> {
    try {
      return await this.uow.runInTransaction(async () => {
        const supply = await this.requireSupply(input.organizationId, input.storeId, input.supplyId);
        canReceiveSupply(supply.status as SupplyStatus, supply.items.length);

        for (const line of supply.items) {
          const price = Number(line.plannedUnitPrice);
          if (line.plannedUnitPrice == null || !Number.isFinite(price) || price < 0) {
            throw new BadRequestException({
              code: 'SUPPLY_ITEM_MISSING_COST',
              message: `Unit cost is required for item ${line.item.name}`,
            });
          }
          if (compareQty(line.orderedQuantity, '0') <= 0) {
            throw new BadRequestException({
              code: 'INVALID_RECEIPT_QUANTITY',
              message: `Quantity must be greater than zero for item ${line.item.name}`,
            });
          }
        }

        if (supply.status === SupplyStatus.DRAFT) {
          await this.supplies.updateSupplyStatus(
            supply.id,
            'SUBMITTED_TO_SUPPLIER',
            this.clock.now(),
          );
        }

        const receivedAt = input.receivedAt
          ? new Date(input.receivedAt)
          : supply.receivedDate
            ? receiptAtFromDateOnly(supply.receivedDate)
            : this.clock.now();
        const receipt = await this.supplies.createReceipt({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: supply.warehouseId,
          supplyId: supply.id,
          number: await this.supplies.uniqueNumber('GR', input.organizationId),
          receivedAt,
          comment: input.comment?.trim() || null,
        });

        for (const line of supply.items) {
          await this.supplies.addReceiptItem({
            id: randomUUID(),
            organizationId: input.organizationId,
            goodsReceiptId: receipt.id,
            supplyItemId: line.id,
            itemId: line.itemId,
            receivedQuantity: line.orderedQuantity,
            acceptedQuantity: line.orderedQuantity,
            defectiveQuantity: '0',
            actualUnitPrice: line.plannedUnitPrice as string,
            defectReason: null,
          });
        }

        const draft = await this.requireReceipt(
          input.organizationId,
          input.storeId,
          receipt.id,
        );
        const beforeReceive = {
          status: supply.status,
          number: supply.number,
          itemCount: supply.items.length,
        };
        const posted = await this.postDraftReceiptInTx(draft, input.idempotencyKey);
        const freshSupply = await this.requireSupply(
          input.organizationId,
          input.storeId,
          supply.id,
        );
        await this.auditSupplyAction(
          input.organizationId,
          input.storeId,
          'supply.received',
          supply.id,
          beforeReceive,
          {
            status: freshSupply.status,
            number: freshSupply.number,
            receiptId: posted.id,
            receiptNumber: posted.number,
          },
        );
        return posted;
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
        assertQuantityMatchesScale(input.receivedQuantity, DEFAULT_QUANTITY_SCALE);
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
      return this.postDraftReceiptInTx(receipt, input.idempotencyKey);
    });
  }

  private async postDraftReceiptInTx(
    receipt: ReceiptView,
    idempotencyKey?: string,
  ): Promise<ReceiptView> {
    if (!receipt.items.length) {
      throw new BadRequestException({
        code: 'RECEIPT_HAS_NO_ITEMS',
        message: 'Receipt must have items',
      });
    }
    const supply = await this.requireSupply(
      receipt.organizationId,
      receipt.storeId,
      receipt.supplyId,
    );
    canCreateReceipt(supply.status as SupplyStatus);
    const supplier = await this.suppliers.getSupplier(receipt.organizationId, supply.supplierId);
    assertActiveReference(supplier.status, 'SUPPLIER');

    for (const line of receipt.items) {
      const item = await this.items.getItem(receipt.organizationId, line.itemId);
      assertItemPurchasable(item);
      assertQuantityMatchesScale(line.receivedQuantity, DEFAULT_QUANTITY_SCALE);
      const posted = await this.supplies.sumPostedBySupplyItem(
        receipt.organizationId,
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
            this.items.getItem(receipt.organizationId, line.itemId),
            this.policies.getPolicy(receipt.organizationId, line.item.inventoryPolicyId),
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
      organizationId: receipt.organizationId,
      storeId: receipt.storeId,
      warehouseId: receipt.warehouseId,
      goodsReceiptId: receipt.id,
      idempotencyKey,
      lines,
    });

    const posted = await this.supplies.setReceiptPosted(receipt.id, this.clock.now());
    // Reload supply so recalculation sees current lines after posting.
    const freshSupply = await this.requireSupply(
      receipt.organizationId,
      receipt.storeId,
      receipt.supplyId,
    );
    await this.recalculate(freshSupply);
    await this.auditAction(
      receipt.organizationId,
      receipt.storeId,
      'goods_receipt.posted',
      receipt.id,
    );
    return posted;
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
    if (!supply.items.length) {
      await this.supplies.updateSupplyStatus(supply.id, 'SUBMITTED_TO_SUPPLIER');
      return;
    }

    let linesWithReceipt = 0;
    let fullyReceivedLines = 0;
    for (const line of supply.items) {
      const received = await this.supplies.sumPostedBySupplyItem(
        supply.organizationId,
        line.id,
      );
      if (compareQty(received, '0') > 0) {
        linesWithReceipt += 1;
      }
      if (compareQty(received, line.orderedQuantity) >= 0) {
        fullyReceivedLines += 1;
      }
    }

    const nextStatus =
      linesWithReceipt === 0
        ? 'SUBMITTED_TO_SUPPLIER'
        : fullyReceivedLines === supply.items.length
          ? 'RECEIVED'
          : 'PARTIALLY_RECEIVED';

    await this.supplies.updateSupplyStatus(supply.id, nextStatus);
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

  private auditSupplyAction(
    organizationId: string,
    storeId: string,
    action: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    const ctx = getRequestContext();
    return this.audit.append({
      organizationId,
      storeId,
      actorId: ctx?.actorId ?? null,
      action,
      entityType: 'Supply',
      entityId,
      beforeState: before,
      afterState: after,
      requestId: ctx?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
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
