import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Sale as PrismaSale,
  SaleAnnulment as PrismaAnnulment,
  SaleDiscount as PrismaDiscount,
  SaleInventoryConsumption as PrismaConsumption,
  SaleInventoryConsumptionLine as PrismaConsumptionLine,
  SaleLine as PrismaSaleLine,
  SaleTimelineEvent as PrismaTimeline,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { resolvePrismaClient } from '../../../infrastructure/persistence/prisma-transaction-context';
import type {
  DiscountReason,
  DiscountType,
  SaleInventorySourceType,
  SaleStatus,
  SaleType,
  SalesChannel,
} from '../domain/sale-rules';
import type {
  CreateSaleInput,
  SaleAnnulmentView,
  SaleConsumptionView,
  SaleDiscountView,
  SaleLineView,
  SaleListFilter,
  SaleRepository,
  SaleTimelineEventView,
  SaleView,
  SaveConsumptionInput,
} from '../application/ports/sale.repository';

type ConsumptionRow = PrismaConsumption & { lines: PrismaConsumptionLine[] };

type SaleFull = PrismaSale & {
  lines: PrismaSaleLine[];
  discount: PrismaDiscount | null;
  consumption: ConsumptionRow | null;
  annulment: PrismaAnnulment | null;
};

const saleInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  discount: true,
  consumption: { include: { lines: { orderBy: { createdAt: 'asc' as const } } } },
  annulment: true,
} satisfies Prisma.SaleInclude;

function mapLine(row: PrismaSaleLine): SaleLineView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    itemId: row.itemId,
    descriptionSnapshot: row.descriptionSnapshot,
    quantity: row.quantity.toString(),
    unitPrice: row.unitPrice.toFixed(2),
    grossAmount: row.grossAmount.toFixed(2),
    discountAmount: row.discountAmount.toFixed(2),
    netAmount: row.netAmount.toFixed(2),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function mapDiscount(row: PrismaDiscount): SaleDiscountView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    type: row.type as DiscountType,
    value: row.value.toString(),
    reason: row.reason as DiscountReason,
    comment: row.comment,
    approvedByMembershipId: row.approvedByMembershipId,
    createdAt: row.createdAt,
  };
}

function mapConsumptionLine(row: PrismaConsumptionLine) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    consumptionId: row.consumptionId,
    itemId: row.itemId,
    requestedQuantity: row.requestedQuantity.toString(),
    issuedQuantity: row.issuedQuantity.toString(),
    costAmount: row.costAmount.toFixed(4),
    createdAt: row.createdAt,
  };
}

function mapConsumption(row: ConsumptionRow): SaleConsumptionView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    sourceType: row.sourceType as SaleInventorySourceType,
    createdAt: row.createdAt,
    lines: row.lines.map(mapConsumptionLine),
  };
}

function mapAnnulment(row: PrismaAnnulment): SaleAnnulmentView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    reason: row.reason,
    actorMembershipId: row.actorMembershipId,
    createdAt: row.createdAt,
  };
}

function mapSale(row: SaleFull): SaleView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    warehouseId: row.warehouseId,
    orderId: row.orderId,
    number: row.number,
    type: row.type as SaleType,
    status: row.status as SaleStatus,
    salesChannel: row.salesChannel as SalesChannel,
    grossAmount: row.grossAmount.toFixed(2),
    discountAmount: row.discountAmount.toFixed(2),
    netAmount: row.netAmount.toFixed(2),
    costAmount: row.costAmount?.toFixed(4) ?? null,
    grossProfitAmount: row.grossProfitAmount?.toFixed(4) ?? null,
    marginPercent: row.marginPercent?.toFixed(4) ?? null,
    currencyCode: row.currencyCode,
    comment: row.comment,
    completedAt: row.completedAt,
    annulledAt: row.annulledAt,
    createdByMembershipId: row.createdByMembershipId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map(mapLine),
    discount: row.discount ? mapDiscount(row.discount) : null,
    consumption: row.consumption ? mapConsumption(row.consumption) : null,
    annulment: row.annulment ? mapAnnulment(row.annulment) : null,
  };
}

function mapTimeline(row: PrismaTimeline): SaleTimelineEventView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    type: row.type,
    message: row.message,
    actorMembershipId: row.actorMembershipId,
    payload: row.payload,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaSaleRepository implements SaleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    return resolvePrismaClient(this.prisma);
  }

  async uniqueNumber(prefix: string, organizationId: string): Promise<string> {
    for (let i = 0; i < 8; i += 1) {
      const number = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const exists = await this.client().sale.findFirst({ where: { organizationId, number } });
      if (!exists) return number;
    }
    throw new Error('Failed to allocate unique sale number');
  }

  async createSale(input: CreateSaleInput): Promise<SaleView> {
    const row = await this.client().sale.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        orderId: input.orderId,
        number: input.number,
        type: input.type,
        salesChannel: input.salesChannel,
        grossAmount: new Prisma.Decimal(input.grossAmount),
        discountAmount: new Prisma.Decimal(input.discountAmount),
        netAmount: new Prisma.Decimal(input.netAmount),
        currencyCode: input.currencyCode,
        comment: input.comment,
        createdByMembershipId: input.createdByMembershipId,
        lines: {
          create: input.lines.map((line) => ({
            id: line.id,
            organizationId: input.organizationId,
            itemId: line.itemId,
            descriptionSnapshot: line.descriptionSnapshot,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            grossAmount: new Prisma.Decimal(line.grossAmount),
            discountAmount: new Prisma.Decimal(line.discountAmount),
            netAmount: new Prisma.Decimal(line.netAmount),
            sortOrder: line.sortOrder,
          })),
        },
        ...(input.discount
          ? {
              discount: {
                create: {
                  id: input.discount.id,
                  organizationId: input.organizationId,
                  type: input.discount.type,
                  value: new Prisma.Decimal(input.discount.value),
                  reason: input.discount.reason,
                  comment: input.discount.comment,
                  approvedByMembershipId: input.discount.approvedByMembershipId,
                },
              },
            }
          : {}),
      },
      include: saleInclude,
    });
    return mapSale(row as SaleFull);
  }

  async getSale(
    organizationId: string,
    storeId: string,
    saleId: string,
  ): Promise<SaleView | null> {
    const row = await this.client().sale.findFirst({
      where: { id: saleId, organizationId, storeId },
      include: saleInclude,
    });
    return row ? mapSale(row as SaleFull) : null;
  }

  async listSales(
    organizationId: string,
    storeId: string,
    filter?: SaleListFilter,
  ): Promise<SaleView[]> {
    const rows = await this.client().sale.findMany({
      where: {
        organizationId,
        storeId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.type ? { type: filter.type } : {}),
        ...(filter?.orderId ? { orderId: filter.orderId } : {}),
      },
      include: saleInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((row) => mapSale(row as SaleFull));
  }

  async findActiveByOrderId(
    organizationId: string,
    orderId: string,
  ): Promise<SaleView | null> {
    const row = await this.client().sale.findFirst({
      where: {
        organizationId,
        orderId,
        status: { not: 'ANNULLED' },
      },
      include: saleInclude,
    });
    return row ? mapSale(row as SaleFull) : null;
  }

  async markCompleted(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    completedAt: Date;
    costAmount: string;
    grossProfitAmount: string;
    marginPercent: string | null;
  }): Promise<SaleView> {
    await this.client().sale.updateMany({
      where: {
        id: input.saleId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'DRAFT',
      },
      data: {
        status: 'COMPLETED',
        completedAt: input.completedAt,
        costAmount: new Prisma.Decimal(input.costAmount),
        grossProfitAmount: new Prisma.Decimal(input.grossProfitAmount),
        marginPercent:
          input.marginPercent === null ? null : new Prisma.Decimal(input.marginPercent),
      },
    });
    const row = await this.getSale(input.organizationId, input.storeId, input.saleId);
    if (!row) throw new Error('Sale not found after completion');
    return row;
  }

  async markAnnulled(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    annulledAt: Date;
  }): Promise<SaleView> {
    await this.client().sale.updateMany({
      where: {
        id: input.saleId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'COMPLETED',
      },
      data: {
        status: 'ANNULLED',
        annulledAt: input.annulledAt,
      },
    });
    const row = await this.getSale(input.organizationId, input.storeId, input.saleId);
    if (!row) throw new Error('Sale not found after annulment');
    return row;
  }

  async saveConsumption(input: SaveConsumptionInput): Promise<SaleConsumptionView> {
    const existing = await this.client().saleInventoryConsumption.findUnique({
      where: { saleId: input.saleId },
      include: { lines: true },
    });
    if (existing) {
      return mapConsumption(existing as ConsumptionRow);
    }

    const row = await this.client().saleInventoryConsumption.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        saleId: input.saleId,
        sourceType: input.sourceType,
        lines: {
          create: input.lines.map((line) => ({
            id: line.id,
            organizationId: input.organizationId,
            itemId: line.itemId,
            requestedQuantity: new Prisma.Decimal(line.requestedQuantity),
            issuedQuantity: new Prisma.Decimal(line.issuedQuantity),
            costAmount: new Prisma.Decimal(line.costAmount),
          })),
        },
      },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });
    return mapConsumption(row as ConsumptionRow);
  }

  async getConsumption(
    organizationId: string,
    saleId: string,
  ): Promise<SaleConsumptionView | null> {
    const row = await this.client().saleInventoryConsumption.findFirst({
      where: { organizationId, saleId },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? mapConsumption(row as ConsumptionRow) : null;
  }

  async appendTimeline(input: {
    id: string;
    organizationId: string;
    saleId: string;
    type: string;
    message: string | null;
    actorMembershipId: string | null;
    payload: unknown;
    occurredAt: Date;
  }): Promise<SaleTimelineEventView> {
    const row = await this.client().saleTimelineEvent.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        saleId: input.saleId,
        type: input.type as PrismaTimeline['type'],
        message: input.message,
        actorMembershipId: input.actorMembershipId,
        payload: input.payload === undefined ? undefined : (input.payload as Prisma.InputJsonValue),
        occurredAt: input.occurredAt,
      },
    });
    return mapTimeline(row);
  }

  async listTimeline(
    organizationId: string,
    saleId: string,
  ): Promise<SaleTimelineEventView[]> {
    const rows = await this.client().saleTimelineEvent.findMany({
      where: { organizationId, saleId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(mapTimeline);
  }

  async createAnnulment(input: {
    id: string;
    organizationId: string;
    saleId: string;
    reason: string;
    actorMembershipId: string | null;
  }): Promise<SaleAnnulmentView> {
    const existing = await this.client().saleAnnulment.findUnique({
      where: { saleId: input.saleId },
    });
    if (existing) return mapAnnulment(existing);

    const row = await this.client().saleAnnulment.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        saleId: input.saleId,
        reason: input.reason,
        actorMembershipId: input.actorMembershipId,
      },
    });
    return mapAnnulment(row);
  }
}
