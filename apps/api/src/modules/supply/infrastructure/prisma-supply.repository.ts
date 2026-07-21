import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  ReceiptItemView,
  ReceiptView,
  SupplyItemView,
  SupplyRepository,
  SupplyView,
} from '../application/ports/supply.repository';

const supplyInclude = {
  supplier: true,
  items: { include: { item: true } },
} satisfies Prisma.SupplyInclude;

const receiptInclude = {
  items: { include: { item: true, supplyItem: true } },
} satisfies Prisma.GoodsReceiptInclude;

function mapItem(item: {
  id: string;
  name: string;
  code: string;
  unitId: string;
  inventoryPolicyId: string;
  itemType: string;
  isPurchasable: boolean;
  status: string;
}): SupplyItemView['item'] {
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    unitId: item.unitId,
    inventoryPolicyId: item.inventoryPolicyId,
    itemType: item.itemType,
    isPurchasable: item.isPurchasable,
    status: item.status,
  };
}

function mapSupplyItem(row: {
  id: string;
  organizationId: string;
  supplyId: string;
  itemId: string;
  orderedQuantity: Prisma.Decimal;
  plannedUnitPrice: Prisma.Decimal | null;
  item: SupplyItemView['item'] extends never ? never : {
    id: string;
    name: string;
    code: string;
    unitId: string;
    inventoryPolicyId: string;
    itemType: string;
    isPurchasable: boolean;
    status: string;
  };
}): SupplyItemView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    supplyId: row.supplyId,
    itemId: row.itemId,
    orderedQuantity: row.orderedQuantity.toString(),
    plannedUnitPrice: row.plannedUnitPrice?.toString() ?? null,
    item: mapItem(row.item),
  };
}

function mapSupply(row: Prisma.SupplyGetPayload<{ include: typeof supplyInclude }>): SupplyView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    warehouseId: row.warehouseId,
    supplierId: row.supplierId,
    number: row.number,
    status: row.status,
    submittedAt: row.submittedAt,
    expectedReceiptDate: row.expectedReceiptDate,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: row.items.map(mapSupplyItem),
  };
}

function mapReceiptItem(row: Prisma.GoodsReceiptItemGetPayload<{
  include: { item: true; supplyItem: true };
}>): ReceiptItemView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    goodsReceiptId: row.goodsReceiptId,
    supplyItemId: row.supplyItemId,
    itemId: row.itemId,
    receivedQuantity: row.receivedQuantity.toString(),
    acceptedQuantity: row.acceptedQuantity.toString(),
    defectiveQuantity: row.defectiveQuantity.toString(),
    actualUnitPrice: row.actualUnitPrice.toString(),
    defectReason: row.defectReason,
    item: mapItem(row.item),
    supplyItem: {
      id: row.supplyItem.id,
      orderedQuantity: row.supplyItem.orderedQuantity.toString(),
    },
  };
}

function mapReceipt(row: Prisma.GoodsReceiptGetPayload<{ include: typeof receiptInclude }>): ReceiptView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    warehouseId: row.warehouseId,
    supplyId: row.supplyId,
    number: row.number,
    status: row.status,
    receivedAt: row.receivedAt,
    postedAt: row.postedAt,
    comment: row.comment,
    items: row.items.map(mapReceiptItem),
  };
}

@Injectable()
export class PrismaSupplyRepository implements SupplyRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get client() {
    return resolvePrismaClient(this.prisma);
  }

  async createSupply(input: {
    id: string;
    organizationId: string;
    storeId: string;
    warehouseId: string;
    supplierId: string;
    number: string;
    expectedReceiptDate: Date | null;
    comment: string | null;
  }): Promise<SupplyView> {
    const row = await this.client.supply.create({
      data: { ...input, status: 'DRAFT' },
      include: supplyInclude,
    });
    return mapSupply(row);
  }

  async getSupply(organizationId: string, storeId: string, id: string) {
    const row = await this.client.supply.findFirst({
      where: { id, organizationId, storeId },
      include: supplyInclude,
    });
    return row ? mapSupply(row) : null;
  }

  async listSupplies(organizationId: string, storeId: string, status?: string) {
    const rows = await this.client.supply.findMany({
      where: { organizationId, storeId, ...(status ? { status: status as never } : {}) },
      include: supplyInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapSupply);
  }

  async addSupplyItem(input: {
    id: string;
    organizationId: string;
    supplyId: string;
    itemId: string;
    orderedQuantity: string;
    plannedUnitPrice: string | null;
  }) {
    const row = await this.client.supplyItem.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        supplyId: input.supplyId,
        itemId: input.itemId,
        orderedQuantity: new Prisma.Decimal(input.orderedQuantity),
        plannedUnitPrice: input.plannedUnitPrice
          ? new Prisma.Decimal(input.plannedUnitPrice)
          : null,
      },
      include: { item: true },
    });
    return mapSupplyItem(row);
  }

  removeSupplyItem(organizationId: string, supplyId: string, itemId: string) {
    return this.client.supplyItem.deleteMany({ where: { organizationId, supplyId, itemId } });
  }

  async updateSupplyStatus(id: string, status: string, submittedAt?: Date | null) {
    await this.client.supply.update({
      where: { id },
      data: {
        status: status as never,
        ...(submittedAt !== undefined ? { submittedAt } : {}),
      },
    });
  }

  async getSupplyItem(organizationId: string, supplyId: string, id: string) {
    const row = await this.client.supplyItem.findFirst({
      where: { id, organizationId, supplyId },
      include: { item: true },
    });
    return row ? mapSupplyItem(row) : null;
  }

  async createReceipt(input: {
    id: string;
    organizationId: string;
    storeId: string;
    warehouseId: string;
    supplyId: string;
    number: string;
    receivedAt: Date;
    comment: string | null;
  }) {
    const row = await this.client.goodsReceipt.create({
      data: { ...input, status: 'DRAFT' },
      include: receiptInclude,
    });
    return mapReceipt(row);
  }

  async getReceipt(organizationId: string, storeId: string, id: string) {
    const row = await this.client.goodsReceipt.findFirst({
      where: { id, organizationId, storeId },
      include: receiptInclude,
    });
    return row ? mapReceipt(row) : null;
  }

  async listReceipts(organizationId: string, storeId: string, supplyId: string) {
    const rows = await this.client.goodsReceipt.findMany({
      where: { organizationId, storeId, supplyId },
      include: receiptInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapReceipt);
  }

  async addReceiptItem(input: {
    id: string;
    organizationId: string;
    goodsReceiptId: string;
    supplyItemId: string;
    itemId: string;
    receivedQuantity: string;
    acceptedQuantity: string;
    defectiveQuantity: string;
    actualUnitPrice: string;
    defectReason: string | null;
  }) {
    const row = await this.client.goodsReceiptItem.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        goodsReceiptId: input.goodsReceiptId,
        supplyItemId: input.supplyItemId,
        itemId: input.itemId,
        receivedQuantity: new Prisma.Decimal(input.receivedQuantity),
        acceptedQuantity: new Prisma.Decimal(input.acceptedQuantity),
        defectiveQuantity: new Prisma.Decimal(input.defectiveQuantity),
        actualUnitPrice: new Prisma.Decimal(input.actualUnitPrice),
        defectReason: input.defectReason,
      },
      include: { item: true, supplyItem: true },
    });
    return mapReceiptItem(row);
  }

  async setReceiptPosted(id: string, postedAt: Date) {
    const row = await this.client.goodsReceipt.update({
      where: { id },
      data: { status: 'POSTED', postedAt },
      include: receiptInclude,
    });
    return mapReceipt(row);
  }

  async setReceiptReversed(id: string) {
    const row = await this.client.goodsReceipt.update({
      where: { id },
      data: { status: 'REVERSED' },
      include: receiptInclude,
    });
    return mapReceipt(row);
  }

  async sumPostedBySupplyItem(organizationId: string, supplyItemId: string) {
    const result = await this.client.goodsReceiptItem.aggregate({
      where: { organizationId, supplyItemId, goodsReceipt: { status: 'POSTED' } },
      _sum: { receivedQuantity: true },
    });
    return result._sum.receivedQuantity?.toString() ?? '0';
  }

  async sumDraftOtherBySupplyItem(
    organizationId: string,
    supplyItemId: string,
    receiptId: string,
  ) {
    const result = await this.client.goodsReceiptItem.aggregate({
      where: {
        organizationId,
        supplyItemId,
        goodsReceiptId: { not: receiptId },
        goodsReceipt: { status: 'DRAFT' },
      },
      _sum: { receivedQuantity: true },
    });
    return result._sum.receivedQuantity?.toString() ?? '0';
  }

  async uniqueNumber(prefix: string, organizationId: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists =
        prefix === 'SUP'
          ? await this.client.supply.findFirst({
              where: { organizationId, number },
              select: { id: true },
            })
          : await this.client.goodsReceipt.findFirst({
              where: { organizationId, number },
              select: { id: true },
            });
      if (!exists) return number;
    }
    return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
