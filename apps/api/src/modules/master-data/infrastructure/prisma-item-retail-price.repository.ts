import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type {
  ItemRetailPriceListRow,
  ItemRetailPriceRepository,
  ItemRetailPriceRow,
  ResolvedRetailPrice,
} from '../application/ports/item-retail-price.repository';
import type { RetailPricingMode } from '../domain/master-data-rules';

@Injectable()
export class PrismaItemRetailPriceRepository implements ItemRetailPriceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(input: {
    id: string;
    organizationId: string;
    itemId: string;
    effectiveFrom: Date;
    amount: string;
    pricingMode: RetailPricingMode;
    createdByMembershipId: string | null;
  }): Promise<ItemRetailPriceRow> {
    const row = await this.prisma.itemRetailPrice.upsert({
      where: {
        organizationId_itemId_effectiveFrom: {
          organizationId: input.organizationId,
          itemId: input.itemId,
          effectiveFrom: input.effectiveFrom,
        },
      },
      create: {
        id: input.id,
        organizationId: input.organizationId,
        itemId: input.itemId,
        effectiveFrom: input.effectiveFrom,
        amount: new Prisma.Decimal(input.amount),
        pricingMode: input.pricingMode,
        createdByMembershipId: input.createdByMembershipId,
      },
      update: {
        amount: new Prisma.Decimal(input.amount),
        pricingMode: input.pricingMode,
      },
    });
    return mapRow(row);
  }

  async listForWeek(
    organizationId: string,
    effectiveFrom: Date,
  ): Promise<ItemRetailPriceListRow[]> {
    const rows = await this.prisma.itemRetailPrice.findMany({
      where: { organizationId, effectiveFrom },
      include: {
        item: {
          select: { id: true, name: true, code: true, itemType: true, status: true },
        },
      },
      orderBy: [{ item: { itemType: 'asc' } }, { item: { name: 'asc' } }],
    });
    return rows.map((row) => ({
      ...mapRow(row),
      item: row.item,
    }));
  }

  async resolveForItems(
    organizationId: string,
    itemIds: string[],
    asOfDate: Date,
  ): Promise<ResolvedRetailPrice[]> {
    if (itemIds.length === 0) return [];

    const rows = await this.prisma.itemRetailPrice.findMany({
      where: {
        organizationId,
        itemId: { in: itemIds },
        effectiveFrom: { lte: asOfDate },
      },
      include: {
        item: {
          select: { id: true, name: true, code: true, itemType: true },
        },
      },
      orderBy: [{ itemId: 'asc' }, { effectiveFrom: 'desc' }],
    });

    const byItem = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!byItem.has(row.itemId)) {
        byItem.set(row.itemId, row);
      }
    }

    return [...byItem.values()].map((row) => ({
      itemId: row.itemId,
      amount: row.amount.toString(),
      pricingMode: row.pricingMode as RetailPricingMode,
      effectiveFrom: row.effectiveFrom,
      itemType: row.item.itemType,
      itemName: row.item.name,
      itemCode: row.item.code,
    }));
  }
}

function mapRow(row: {
  id: string;
  organizationId: string;
  itemId: string;
  effectiveFrom: Date;
  amount: Prisma.Decimal;
  pricingMode: string;
  createdAt: Date;
  updatedAt: Date;
}): ItemRetailPriceRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    itemId: row.itemId,
    effectiveFrom: row.effectiveFrom,
    amount: row.amount.toString(),
    pricingMode: row.pricingMode as RetailPricingMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
