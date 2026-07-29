import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  type AttentionItemProjection,
  type LowStockWarning,
  type OperationalStockRow,
  type PlannedLineProjection,
  type WorkspaceFilter,
  type WorkspaceOrderRow,
  type WorkspaceReadRepository,
  type WorkOrderProjection,
} from '../application/ports/workspace-read.repository';

/**
 * Analytics read-side repository (ADR-025).
 * Read-only Prisma/SQL scoped by organizationId + storeId.
 * Does NOT import Orders/Inventory/Payments write repositories.
 * Cross-module table reads here are intentional projections for workspace/operations.
 */
@Injectable()
export class PrismaWorkspaceReadRepository implements WorkspaceReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWorkspaceOrders(input: {
    organizationId: string;
    storeId: string;
    filter: WorkspaceFilter;
    now: Date;
    soonMinutes: number;
    offset: number;
    limit: number;
  }): Promise<{ rows: WorkspaceOrderRow[]; total: number }> {
    const where = await this.resolveFilterWhere(input);
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          assignments: { where: { releasedAt: null }, take: 1 },
          composition: { include: { items: { select: { id: true } } } },
        },
        orderBy: [{ readyAt: 'asc' }, { createdAt: 'asc' }],
        skip: input.offset,
        take: input.limit,
      }),
    ]);

    const compositionIds = rows.flatMap((o) => o.composition?.items.map((i) => i.id) ?? []);
    const deficitSet = await this.compositionItemsWithDeficit(
      input.organizationId,
      compositionIds,
    );

    return {
      total,
      rows: rows.map((row) => this.mapOrderRow(row, deficitSet)),
    };
  }

  async countWorkspaceBuckets(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
  }): Promise<Record<WorkspaceFilter, number>> {
    const filters: WorkspaceFilter[] = [
      'overdue',
      'soon',
      'unassigned',
      'in_preparation',
      'in_work',
      'ready',
      'handed_off_today',
      'today',
      'partially_reserved',
      'all_open',
    ];
    const entries = await Promise.all(
      filters.map(async (filter) => {
        const where = await this.resolveFilterWhere({ ...input, filter });
        const count = await this.prisma.order.count({ where });
        return [filter, count] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<WorkspaceFilter, number>;
  }

  async getWorkOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
  }): Promise<WorkOrderProjection | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: input.orderId,
        organizationId: input.organizationId,
        storeId: input.storeId,
      },
      include: {
        assignments: { where: { releasedAt: null }, take: 1 },
        composition: {
          include: {
            items: {
              include: { item: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        actualComposition: {
          include: {
            items: {
              include: { item: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });
    if (!order) return null;

    const compositionItemIds = order.composition?.items.map((i) => i.id) ?? [];
    const reservedMap = await this.sumReservedByCompositionItems(
      input.organizationId,
      compositionItemIds,
    );

    const itemIds = [
      ...new Set([
        ...(order.composition?.items.map((i) => i.itemId) ?? []),
        ...(order.actualComposition?.items.map((i) => i.itemId) ?? []),
      ]),
    ];
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: order.warehouseId,
        itemId: { in: itemIds },
      },
    });
    const availableByItem = new Map(
      balances.map((b) => [b.itemId, b.availableQuantity.toString()]),
    );

    const plannedLines: PlannedLineProjection[] = (order.composition?.items ?? []).map((line) => {
      const reserved = reservedMap.get(line.id) ?? '0';
      const planned = line.plannedQuantity.toString();
      const deficit =
        Number(planned) > Number(reserved)
          ? (Number(planned) - Number(reserved)).toString()
          : '0';
      return {
        id: line.id,
        itemId: line.itemId,
        itemName: line.item.name,
        itemCode: line.item.code,
        plannedQuantity: planned,
        reservedQuantity: reserved,
        availableQuantity: availableByItem.get(line.itemId) ?? '0',
        deficitQuantity: deficit,
      };
    });

    const deficitSet = new Set(
      plannedLines.filter((l) => Number(l.deficitQuantity) > 0).map((l) => l.id),
    );

    // Payment / sale projection — read-side only (analytics capability).
    const [orderAllocations, sale] = await Promise.all([
      this.prisma.paymentAllocation.findMany({
        where: {
          organizationId: input.organizationId,
          targetType: 'ORDER',
          targetId: order.id,
          isActive: true,
          payment: { status: 'COMPLETED' },
        },
      }),
      this.prisma.sale.findFirst({
        where: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          orderId: order.id,
          status: { not: 'ANNULLED' },
        },
      }),
    ]);

    let allocatedToSale = '0';
    if (sale) {
      const saleAllocations = await this.prisma.paymentAllocation.findMany({
        where: {
          organizationId: input.organizationId,
          targetType: 'SALE',
          targetId: sale.id,
          isActive: true,
          payment: { status: 'COMPLETED' },
        },
      });
      allocatedToSale = sumDecimals(saleAllocations.map((a) => a.amount.toString()));
    }

    return {
      order: this.mapOrderRow(order, deficitSet),
      plannedLines,
      actualLines: (order.actualComposition?.items ?? []).map((line) => ({
        id: line.id,
        itemId: line.itemId,
        itemName: line.item.name,
        itemCode: line.item.code,
        actualQuantity: line.actualQuantity.toString(),
        batchId: line.batchId,
        comment: line.comment,
      })),
      paymentSummary: {
        plannedPrice: order.plannedPrice?.toString() ?? null,
        allocatedToOrder: sumDecimals(orderAllocations.map((a) => a.amount.toString())),
        saleId: sale?.id ?? null,
        saleStatus: sale?.status ?? null,
        saleNetAmount: sale?.netAmount.toString() ?? null,
        allocatedToSale,
      },
    };
  }

  async listAttentionItems(input: {
    organizationId: string;
    storeId: string;
    now: Date;
    soonMinutes: number;
    lowStockThreshold: number;
  }): Promise<AttentionItemProjection[]> {
    const items: AttentionItemProjection[] = [];
    const startOfDay = dayStart(input.now);
    const soonAt = new Date(input.now.getTime() + input.soonMinutes * 60_000);

    const overdue = await this.prisma.order.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        readyAt: { lt: input.now },
        status: {
          in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
        },
      },
      take: 50,
      orderBy: { readyAt: 'asc' },
    });
    for (const order of overdue) {
      items.push({
        id: `overdue:${order.id}`,
        severity: 'CRITICAL',
        code: 'ORDER_OVERDUE',
        title: `Просрочен заказ ${order.number}`,
        reason: 'Время готовности уже прошло',
        entityType: 'Order',
        entityId: order.id,
        recommendedAction: 'Срочно собрать или переназначить',
        filterLink: 'overdue',
        ageMinutes: ageMinutes(order.readyAt ?? order.createdAt, input.now),
      });
    }

    const unassigned = await this.prisma.order.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: {
          in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
        },
        assignments: { none: { releasedAt: null } },
      },
      take: 30,
      orderBy: { readyAt: 'asc' },
    });
    for (const order of unassigned) {
      items.push({
        id: `unassigned:${order.id}`,
        severity: 'WARNING',
        code: 'ORDER_UNASSIGNED',
        title: `Заказ без флориста ${order.number}`,
        reason: 'Никто не назначен на сборку',
        entityType: 'Order',
        entityId: order.id,
        recommendedAction: 'Взять в работу или назначить',
        filterLink: 'unassigned',
        ageMinutes: ageMinutes(order.confirmedAt ?? order.createdAt, input.now),
      });
    }

    const soonNotStarted = await this.prisma.order.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        readyAt: { gt: input.now, lte: soonAt },
        status: { in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'] },
      },
      take: 30,
    });
    for (const order of soonNotStarted) {
      items.push({
        id: `soon:${order.id}`,
        severity: 'WARNING',
        code: 'ORDER_SOON_NOT_STARTED',
        title: `Скоро готовность — не начат ${order.number}`,
        reason: 'До дедлайна мало времени, сборка не начата',
        entityType: 'Order',
        entityId: order.id,
        recommendedAction: 'Начать сборку',
        filterLink: 'soon',
        ageMinutes: 0,
      });
    }

    const readyWithoutSale = await this.prisma.order.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'READY',
        // Sale existence checked separately — analytics projection
      },
      take: 40,
    });
    if (readyWithoutSale.length > 0) {
      const sales = await this.prisma.sale.findMany({
        where: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          orderId: { in: readyWithoutSale.map((o) => o.id) },
          status: { not: 'ANNULLED' },
        },
        select: { orderId: true },
      });
      const withSale = new Set(sales.map((s) => s.orderId).filter(Boolean));
      for (const order of readyWithoutSale) {
        if (withSale.has(order.id)) continue;
        items.push({
          id: `ready-no-sale:${order.id}`,
          severity: 'WARNING',
          code: 'READY_WITHOUT_SALE',
          title: `Готов, но без продажи ${order.number}`,
          reason: 'Заказ собран, продажа не оформлена',
          entityType: 'Order',
          entityId: order.id,
          recommendedAction: 'Оформить продажу',
          filterLink: 'ready',
          ageMinutes: ageMinutes(order.updatedAt, input.now),
        });
      }
    }

    const unpaidSales = await this.prisma.sale.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'COMPLETED',
        completedAt: { gte: startOfDay },
      },
      take: 40,
    });
    for (const sale of unpaidSales) {
      const allocated = await this.prisma.paymentAllocation.aggregate({
        where: {
          organizationId: input.organizationId,
          targetType: 'SALE',
          targetId: sale.id,
          isActive: true,
          payment: { status: 'COMPLETED' },
        },
        _sum: { amount: true },
      });
      const paid = Number(allocated._sum.amount?.toString() ?? '0');
      const net = Number(sale.netAmount.toString());
      if (paid + 0.0001 < net) {
        items.push({
          id: `unpaid:${sale.id}`,
          severity: paid <= 0 ? 'CRITICAL' : 'WARNING',
          code: paid <= 0 ? 'SALE_UNPAID' : 'SALE_PARTIALLY_PAID',
          title: `Неоплаченная продажа ${sale.number}`,
          reason: `Оплачено ${paid} из ${net}`,
          entityType: 'Sale',
          entityId: sale.id,
          recommendedAction: 'Принять оплату',
          filterLink: null,
          ageMinutes: ageMinutes(sale.completedAt ?? sale.createdAt, input.now),
        });
      }
    }

    const draftPayments = await this.prisma.payment.count({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'DRAFT',
      },
    });
    if (draftPayments > 0) {
      items.push({
        id: 'draft-payments',
        severity: 'INFO',
        code: 'DRAFT_PAYMENTS',
        title: `${draftPayments} незавершённых оплат`,
        reason: 'Есть черновики платежей',
        entityType: 'Payment',
        entityId: input.storeId,
        recommendedAction: 'Провести или аннулировать',
        filterLink: null,
        ageMinutes: 0,
      });
    }

    const shortages = await this.prisma.order.count({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'PARTIALLY_RESERVED',
      },
    });
    const flowerShortageOrders = await this.countFlowerShortageOrders({
      organizationId: input.organizationId,
      storeId: input.storeId,
    });
    if (flowerShortageOrders > 0) {
      items.push({
        id: 'flower-shortages',
        severity: 'WARNING',
        code: 'FLOWER_ORDER_SHORTAGE',
        title: `${flowerShortageOrders} заказ(ов) — нехватка цветов`,
        reason: 'В составе заказов не хватает цветов на складе',
        entityType: 'Order',
        entityId: input.storeId,
        recommendedAction: 'Пополните склад или замените позиции',
        filterLink: 'partially_reserved',
        ageMinutes: 0,
      });
    } else if (shortages > 0) {
      items.push({
        id: 'shortages',
        severity: 'WARNING',
        code: 'UNRESOLVED_SHORTAGES',
        title: `${shortages} заказ(ов) с нехваткой`,
        reason: 'Состав зарезервирован частично',
        entityType: 'Order',
        entityId: input.storeId,
        recommendedAction: 'Заменить позиции или пополнить склад',
        filterLink: 'partially_reserved',
        ageMinutes: 0,
      });
    }

    const supplies = await this.prisma.supply.count({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: { in: ['SUBMITTED_TO_SUPPLIER', 'PARTIALLY_RECEIVED'] },
      },
    });
    if (supplies > 0) {
      items.push({
        id: 'supplies-awaiting',
        severity: 'INFO',
        code: 'SUPPLIES_AWAITING_RECEIPT',
        title: `${supplies} приёмок ждут оприходования`,
        reason: 'Отправлены поставщику или оприходованы частично',
        entityType: 'Supply',
        entityId: input.storeId,
        recommendedAction: 'Оприходовать товар',
        filterLink: null,
        ageMinutes: 0,
      });
    }

    const lowStock = await this.listLowStockWarnings({
      organizationId: input.organizationId,
      storeId: input.storeId,
    });
    if (lowStock.length > 0) {
      items.push({
        id: 'flowers-below-threshold',
        severity: 'WARNING',
        code: 'FLOWERS_BELOW_THRESHOLD',
        title: `${lowStock.length} цвет(ов) ниже порога`,
        reason: 'Остаток на складе ниже минимума из справочника',
        entityType: 'Item',
        entityId: input.storeId,
        recommendedAction: 'Проверьте остатки и пополните склад',
        filterLink: null,
        ageMinutes: 0,
      });
    }
    for (const warn of lowStock.slice(0, 20)) {
      items.push({
        id: `low-stock:${warn.itemId}`,
        severity: 'WARNING',
        code: 'LOW_STOCK',
        title: `Мало на складе: ${warn.itemName}`,
        reason: `Доступно ${warn.availableQuantity}, порог ${warn.threshold}`,
        entityType: 'Item',
        entityId: warn.itemId,
        recommendedAction: 'Проверьте остаток — это не заявка на закупку',
        filterLink: null,
        ageMinutes: 0,
      });
    }

    return items;
  }

  async countFlowerShortageOrders(input: {
    organizationId: string;
    storeId: string;
  }): Promise<number> {
    const flowerLines = await this.prisma.orderCompositionItem.findMany({
      where: {
        organizationId: input.organizationId,
        item: { itemType: 'FLOWER' },
        composition: {
          order: {
            storeId: input.storeId,
            status: {
              in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
            },
          },
        },
      },
      select: {
        id: true,
        composition: { select: { orderId: true } },
      },
    });
    if (flowerLines.length === 0) {
      return 0;
    }
    const deficitSet = await this.compositionItemsWithDeficit(
      input.organizationId,
      flowerLines.map((line) => line.id),
    );
    const orderIds = new Set<string>();
    for (const line of flowerLines) {
      if (deficitSet.has(line.id)) {
        orderIds.add(line.composition.orderId);
      }
    }
    return orderIds.size;
  }

  async countFlowersBelowThreshold(input: {
    organizationId: string;
    storeId: string;
  }): Promise<number> {
    const warnings = await this.listLowStockWarnings({
      organizationId: input.organizationId,
      storeId: input.storeId,
    });
    return warnings.length;
  }

  async listLowStockWarnings(input: {
    organizationId: string;
    storeId: string;
    threshold?: number;
  }): Promise<LowStockWarning[]> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        isDefault: true,
        status: 'ACTIVE',
      },
    });
    if (!warehouse) return [];

    const rows = await this.prisma.inventoryBalance.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: warehouse.id,
        item: {
          itemType: 'FLOWER',
          status: 'ACTIVE',
          minimumStockQuantity: { not: null },
        },
      },
      include: { item: true },
      orderBy: { availableQuantity: 'asc' },
      take: 100,
    });

    return rows
      .filter(
        (row) =>
          Number(row.availableQuantity.toString()) <=
          Number(row.item.minimumStockQuantity!.toString()),
      )
      .map((row) => ({
        itemId: row.itemId,
        itemName: row.item.name,
        itemCode: row.item.code,
        warehouseId: warehouse.id,
        availableQuantity: row.availableQuantity.toString(),
        threshold: row.item.minimumStockQuantity!.toString(),
      }));
  }

  async listOperationalStock(input: {
    organizationId: string;
    storeId: string;
    includeCost: boolean;
  }): Promise<OperationalStockRow[]> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        isDefault: true,
        status: 'ACTIVE',
      },
    });
    if (!warehouse) return [];

    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: warehouse.id,
      },
      include: { item: true },
      orderBy: { item: { name: 'asc' } },
    });

    let costByItem = new Map<string, string>();
    if (input.includeCost && balances.length > 0) {
      // Latest open batch unit cost as operational hint (read projection).
      const batches = await this.prisma.inventoryBatch.findMany({
        where: {
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: warehouse.id,
          itemId: { in: balances.map((b) => b.itemId) },
          remainingQuantity: { gt: 0 },
        },
        orderBy: { receivedAt: 'desc' },
      });
      costByItem = new Map();
      for (const batch of batches) {
        if (!costByItem.has(batch.itemId)) {
          costByItem.set(batch.itemId, batch.unitCost.toString());
        }
      }
    }

    return balances.map((row) => {
      const minimumStockQuantity = row.item.minimumStockQuantity?.toString() ?? null;
      const isBelowMinimum =
        minimumStockQuantity !== null &&
        Number(row.availableQuantity.toString()) <= Number(minimumStockQuantity);
      return {
        itemId: row.itemId,
        itemName: row.item.name,
        itemCode: row.item.code,
        onHandQuantity: row.onHandQuantity.toString(),
        reservedQuantity: row.reservedQuantity.toString(),
        availableQuantity: row.availableQuantity.toString(),
        minimumStockQuantity,
        isBelowMinimum,
        unitCost: input.includeCost ? (costByItem.get(row.itemId) ?? null) : null,
      };
    });
  }

  private async resolveFilterWhere(input: {
    organizationId: string;
    storeId: string;
    filter: WorkspaceFilter;
    now: Date;
    soonMinutes: number;
  }): Promise<Prisma.OrderWhereInput> {
    if (input.filter === 'handed_off_today') {
      return this.handedOffTodayWhere(input);
    }
    return this.filterWhere(input);
  }

  private async handedOffTodayWhere(input: {
    organizationId: string;
    storeId: string;
    now: Date;
  }): Promise<Prisma.OrderWhereInput> {
    const start = dayStart(input.now);
    const end = dayEnd(input.now);
    const deliveredJobs = await this.prisma.deliveryJob.findMany({
      where: {
        organizationId: input.organizationId,
        storeId: input.storeId,
        status: 'DELIVERED',
        deliveredAt: { gte: start, lte: end },
      },
      select: { orderId: true },
    });
    const deliveredOrderIds = deliveredJobs.map((job) => job.orderId);
    return {
      organizationId: input.organizationId,
      storeId: input.storeId,
      OR: [
        { status: 'COMPLETED', completedAt: { gte: start, lte: end } },
        ...(deliveredOrderIds.length > 0 ? [{ id: { in: deliveredOrderIds } }] : []),
      ],
    };
  }

  private filterWhere(input: {
    organizationId: string;
    storeId: string;
    filter: WorkspaceFilter;
    now: Date;
    soonMinutes: number;
  }): Prisma.OrderWhereInput {
    const base: Prisma.OrderWhereInput = {
      organizationId: input.organizationId,
      storeId: input.storeId,
    };
    const soonAt = new Date(input.now.getTime() + input.soonMinutes * 60_000);
    const start = dayStart(input.now);
    const end = dayEnd(input.now);
    const openStatuses = [
      'CONFIRMED',
      'PARTIALLY_RESERVED',
      'RESERVED',
      'IN_PREPARATION',
      'READY',
    ] as const;

    switch (input.filter) {
      case 'overdue':
        return {
          ...base,
          readyAt: { lt: input.now },
          status: {
            in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
          },
        };
      case 'soon':
        return {
          ...base,
          readyAt: { gt: input.now, lte: soonAt },
          status: {
            in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
          },
        };
      case 'unassigned':
        return {
          ...base,
          status: {
            in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED', 'IN_PREPARATION'],
          },
          assignments: { none: { releasedAt: null } },
        };
      case 'in_preparation':
        return { ...base, status: 'IN_PREPARATION' };
      case 'in_work':
        return {
          ...base,
          OR: [
            { status: 'IN_PREPARATION' },
            {
              status: { in: ['CONFIRMED', 'PARTIALLY_RESERVED', 'RESERVED'] },
              assignments: { some: { releasedAt: null } },
            },
          ],
        };
      case 'ready':
        return { ...base, status: 'READY' };
      case 'today':
        return {
          ...base,
          readyAt: { gte: start, lte: end },
          status: { in: [...openStatuses] },
        };
      case 'partially_reserved':
        return { ...base, status: 'PARTIALLY_RESERVED' };
      case 'all_open':
      default:
        return { ...base, status: { in: [...openStatuses] } };
    }
  }

  private mapOrderRow(
    row: {
      id: string;
      number: string;
      status: string;
      readyAt: Date | null;
      type: string;
      occasion: string;
      customerNameSnapshot: string | null;
      assignedFloristId: string | null;
      version: number;
      warehouseId: string;
      plannedPrice: Prisma.Decimal | null;
      recipientName: string | null;
      comment: string | null;
      updatedAt: Date;
      assignments?: Array<{ id: string }>;
      composition?: { items: Array<{ id: string }> } | null;
    },
    deficitSet: Set<string>,
  ): WorkspaceOrderRow {
    const hasDeficit = (row.composition?.items ?? []).some((i) => deficitSet.has(i.id));
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      readyAt: row.readyAt,
      type: row.type,
      occasion: row.occasion,
      customerNameSnapshot: row.customerNameSnapshot,
      assignedFloristId: row.assignedFloristId,
      hasActiveAssignment: (row.assignments?.length ?? 0) > 0,
      hasDeficit,
      version: row.version,
      warehouseId: row.warehouseId,
      plannedPrice: row.plannedPrice?.toString() ?? null,
      recipientName: row.recipientName,
      comment: row.comment,
      updatedAt: row.updatedAt,
    };
  }

  private async sumReservedByCompositionItems(
    organizationId: string,
    compositionItemIds: string[],
  ): Promise<Map<string, string>> {
    if (compositionItemIds.length === 0) return new Map();
    const rows = await this.prisma.inventoryReservation.groupBy({
      by: ['orderItemId'],
      where: {
        organizationId,
        status: 'ACTIVE',
        orderItemId: { in: compositionItemIds },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.map((r) => [r.orderItemId, (r._sum.quantity ?? new Prisma.Decimal(0)).toString()]),
    );
  }

  private async compositionItemsWithDeficit(
    organizationId: string,
    compositionItemIds: string[],
  ): Promise<Set<string>> {
    if (compositionItemIds.length === 0) return new Set();
    const items = await this.prisma.orderCompositionItem.findMany({
      where: { organizationId, id: { in: compositionItemIds } },
      select: { id: true, plannedQuantity: true },
    });
    const reserved = await this.sumReservedByCompositionItems(
      organizationId,
      compositionItemIds,
    );
    const deficit = new Set<string>();
    for (const item of items) {
      const r = Number(reserved.get(item.id) ?? '0');
      if (Number(item.plannedQuantity.toString()) > r) deficit.add(item.id);
    }
    return deficit;
  }
}

function dayStart(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(now: Date): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

function ageMinutes(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
}

function sumDecimals(values: string[]): string {
  return values.reduce((acc, v) => acc + Number(v), 0).toFixed(2);
}
