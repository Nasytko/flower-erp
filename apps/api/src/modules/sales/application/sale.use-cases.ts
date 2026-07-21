import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '@flower/permissions';
import type { ApiEnv } from '@flower/config';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import {
  INVENTORY_ISSUE_PORT,
  type InventoryIssuePort,
} from '../../inventory/application/ports/inventory-issue.port';
import { ItemUseCases } from '../../master-data/application/item.use-cases';
import { assertAvailableForNewDocuments } from '../../master-data/domain/master-data-rules';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import {
  ORDERS_SALES_PORT,
  type OrdersSalesPort,
} from '../../orders/application/ports/orders-sales.port';
import { Money } from '@flower/shared-kernel';
import {
  DomainError,
  DiscountReason,
  DiscountType,
  SaleInventorySourceType,
  SaleStatus,
  SaleType,
  SalesChannel,
  applyDiscount,
  assertCanAnnul,
  assertCanComplete,
  computeGross,
  computeMargin,
  computeNet,
  lineGross,
  validateDiscount,
} from '../domain/sale-rules';
import {
  SALE_REPOSITORY,
  type SaleRepository,
  type SaleView,
} from './ports/sale.repository';

function mapDomain(error: unknown): never {
  const coded =
    error instanceof DomainError
      ? error
      : error instanceof Error &&
          'code' in error &&
          typeof (error as { code: unknown }).code === 'string'
        ? (error as Error & { code: string })
        : null;
  if (coded) {
    if (
      coded.code === 'DISCOUNT_OVERRIDE_REQUIRED' ||
      coded.code.includes('NOT_') ||
      coded.code.includes('INVALID') ||
      coded.code.includes('ARCHIVED') ||
      coded.code.includes('REQUIRED')
    ) {
      throw new BadRequestException({ code: coded.code, message: coded.message });
    }
    throw new ConflictException({ code: coded.code, message: coded.message });
  }
  throw error;
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function authPermissions(): readonly string[] {
  return getRequestContext()?.auth?.permissions ?? [];
}

type DiscountInput = {
  type: DiscountType;
  value: string;
  reason: DiscountReason;
  comment?: string | null;
};

@Injectable()
export class SaleUseCases {
  constructor(
    @Inject(SALE_REPOSITORY) private readonly sales: SaleRepository,
    @Inject(ORDERS_SALES_PORT) private readonly ordersSales: OrdersSalesPort,
    @Inject(INVENTORY_ISSUE_PORT) private readonly inventoryIssue: InventoryIssuePort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly organizations: OrganizationUseCases,
    private readonly items: ItemUseCases,
  ) {}

  async createSaleFromOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    salesChannel?: SalesChannel;
    discount?: DiscountInput;
    unitPrice?: string;
    comment?: string | null;
  }): Promise<SaleView> {
    await this.organizations.getStore(input.organizationId, input.storeId);

    const order = await this.ordersSales.getReadyOrderForSale(
      input.organizationId,
      input.storeId,
      input.orderId,
    );
    if (!order) {
      throw new BadRequestException({
        code: 'ORDER_NOT_READY_FOR_SALE',
        message: 'Order must be READY with a non-empty actual composition',
      });
    }

    const existing = await this.sales.findActiveByOrderId(input.organizationId, input.orderId);
    if (existing) {
      throw new ConflictException({
        code: 'ORDER_ALREADY_HAS_SALE',
        message: 'Order already has an active sale',
      });
    }

    const unitPrice = input.unitPrice ?? order.plannedPrice;
    if (!unitPrice || new Money(unitPrice).lte(0)) {
      throw new BadRequestException({
        code: 'SALE_PRICE_REQUIRED',
        message: 'Order planned price or unitPrice override is required',
      });
    }

    const descriptionParts = [`Order ${order.number}`];
    if (order.customerNameSnapshot) descriptionParts.push(order.customerNameSnapshot);
    const descriptionSnapshot = descriptionParts.join(' — ');

    const quantity = '1';
    const grossAmount = lineGross(quantity, unitPrice);
    const discount = this.resolveDiscount(input.discount, grossAmount);

    try {
      return await this.uow.runInTransaction(async () => {
        const saleId = randomUUID();
        const lineGrossAmt = grossAmount;
        const lineDiscount = discount.discountAmount;
        const lineNet = computeNet(lineGrossAmt, lineDiscount);

        const sale = await this.sales.createSale({
          id: saleId,
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: order.warehouseId,
          orderId: order.id,
          number: await this.sales.uniqueNumber('SAL', input.organizationId),
          type: SaleType.ORDER_BASED,
          salesChannel: input.salesChannel ?? SalesChannel.STORE,
          grossAmount: discount.grossAmount,
          discountAmount: discount.discountAmount,
          netAmount: discount.netAmount,
          currencyCode: 'BYN',
          comment: input.comment ?? order.comment,
          createdByMembershipId: actorMembershipId(),
          lines: [
            {
              id: randomUUID(),
              itemId: null,
              descriptionSnapshot,
              quantity,
              unitPrice: new Money(unitPrice).toFixed(2),
              grossAmount: lineGrossAmt,
              discountAmount: lineDiscount,
              netAmount: lineNet,
              sortOrder: 0,
            },
          ],
          discount: discount.record,
        });

        await this.appendTimeline(sale, 'SALE_CREATED', 'Sale created from order', {
          orderId: order.id,
        });
        if (discount.record && discount.record.type !== DiscountType.NONE) {
          await this.appendTimeline(sale, 'DISCOUNT_APPLIED', 'Discount applied', {
            type: discount.record.type,
            value: discount.record.value,
          });
        }
        await this.auditSale(sale, 'SALE_CREATED', null, sale);
        return sale;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async createDirectSale(input: {
    organizationId: string;
    storeId: string;
    warehouseId: string;
    salesChannel?: SalesChannel;
    comment?: string | null;
    lines: Array<{
      itemId: string;
      quantity: string;
      unitPrice: string;
      description?: string | null;
    }>;
    discount?: DiscountInput;
  }): Promise<SaleView> {
    await this.organizations.getWarehouse(
      input.organizationId,
      input.storeId,
      input.warehouseId,
    );

    if (!input.lines.length) {
      throw new BadRequestException({
        code: 'SALE_EMPTY',
        message: 'Direct sale requires at least one line',
      });
    }

    const preparedLines: Array<{
      id: string;
      itemId: string;
      descriptionSnapshot: string;
      quantity: string;
      unitPrice: string;
      grossAmount: string;
      discountAmount: string;
      netAmount: string;
      sortOrder: number;
    }> = [];

    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i]!;
      if (new Money(line.quantity).lte(0)) {
        throw new BadRequestException({
          code: 'INVALID_QUANTITY',
          message: 'Line quantity must be positive',
        });
      }
      if (new Money(line.unitPrice).lt(0)) {
        throw new BadRequestException({
          code: 'INVALID_UNIT_PRICE',
          message: 'Unit price must be non-negative',
        });
      }
      const item = await this.items.getItem(input.organizationId, line.itemId);
      try {
        assertAvailableForNewDocuments(item.status, 'ITEM');
      } catch (error) {
        mapDomain(error);
      }
      if (!item.isSellable) {
        throw new BadRequestException({
          code: 'ITEM_NOT_SELLABLE',
          message: `Item ${item.name} is not sellable`,
        });
      }
      const gross = lineGross(line.quantity, line.unitPrice);
      preparedLines.push({
        id: randomUUID(),
        itemId: item.id,
        descriptionSnapshot: line.description?.trim() || item.name,
        quantity: new Money(line.quantity).toString(),
        unitPrice: new Money(line.unitPrice).toFixed(2),
        grossAmount: gross,
        discountAmount: '0.00',
        netAmount: gross,
        sortOrder: i,
      });
    }

    const grossAmount = computeGross(preparedLines.map((l) => l.grossAmount));
    const discount = this.resolveDiscount(input.discount, grossAmount);

    // Distribute header discount proportionally across lines for snapshots
    const allocated = this.allocateLineDiscounts(preparedLines, discount.discountAmount);

    try {
      return await this.uow.runInTransaction(async () => {
        const sale = await this.sales.createSale({
          id: randomUUID(),
          organizationId: input.organizationId,
          storeId: input.storeId,
          warehouseId: input.warehouseId,
          orderId: null,
          number: await this.sales.uniqueNumber('SAL', input.organizationId),
          type: SaleType.DIRECT,
          salesChannel: input.salesChannel ?? SalesChannel.STORE,
          grossAmount: discount.grossAmount,
          discountAmount: discount.discountAmount,
          netAmount: discount.netAmount,
          currencyCode: 'BYN',
          comment: input.comment ?? null,
          createdByMembershipId: actorMembershipId(),
          lines: allocated,
          discount: discount.record,
        });

        await this.appendTimeline(sale, 'SALE_CREATED', 'Direct sale created', null);
        if (discount.record && discount.record.type !== DiscountType.NONE) {
          await this.appendTimeline(sale, 'DISCOUNT_APPLIED', 'Discount applied', {
            type: discount.record.type,
            value: discount.record.value,
          });
        }
        await this.auditSale(sale, 'SALE_CREATED', null, sale);
        return sale;
      });
    } catch (error) {
      mapDomain(error);
    }
  }

  async completeSale(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    idempotencyKey: string;
  }): Promise<SaleView> {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }

    const existing = await this.requireSale(
      input.organizationId,
      input.storeId,
      input.saleId,
    );
    if (existing.status === SaleStatus.COMPLETED) {
      return existing;
    }

    try {
      assertCanComplete(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const sale = await this.requireSale(
        input.organizationId,
        input.storeId,
        input.saleId,
      );
      if (sale.status === SaleStatus.COMPLETED) {
        return sale;
      }
      try {
        assertCanComplete(sale.status);
      } catch (error) {
        mapDomain(error);
      }

      const now = this.clock.now();
      let issueLines: Array<{
        itemId: string;
        quantity: string;
        reservationSourceItemIds?: string[];
      }>;
      let sourceType: SaleInventorySourceType;
      const orderId: string | null = sale.orderId;

      if (sale.type === SaleType.ORDER_BASED) {
        if (!sale.orderId) {
          throw new BadRequestException({
            code: 'SALE_ORDER_MISSING',
            message: 'ORDER_BASED sale has no orderId',
          });
        }
        const order = await this.ordersSales.getReadyOrderForSale(
          input.organizationId,
          input.storeId,
          sale.orderId,
        );
        if (!order?.actualComposition) {
          throw new BadRequestException({
            code: 'ORDER_NOT_READY_FOR_SALE',
            message: 'Linked order is not READY with actual composition',
          });
        }
        sourceType = SaleInventorySourceType.ORDER_ACTUAL_COMPOSITION;
        issueLines = order.actualComposition.items.map((item) => ({
          itemId: item.itemId,
          quantity: item.actualQuantity,
          reservationSourceItemIds: order.compositionItemIds,
        }));
      } else {
        sourceType = SaleInventorySourceType.DIRECT_COMPOSITION;
        const stockLines = sale.lines.filter((line) => line.itemId);
        if (stockLines.length < 1) {
          throw new BadRequestException({
            code: 'SALE_NO_INVENTORY_LINES',
            message: 'Direct sale has no inventory lines to issue',
          });
        }
        issueLines = stockLines.map((line) => ({
          itemId: line.itemId!,
          quantity: line.quantity,
        }));
      }

      const issueResult = await this.inventoryIssue.issueForSale({
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: sale.warehouseId,
        saleId: sale.id,
        orderId,
        lines: issueLines,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now,
      });

      const costByItem = new Map<string, { issued: Money; cost: Money }>();
      for (const alloc of issueResult.allocations) {
        const prev = costByItem.get(alloc.itemId) ?? {
          issued: new Money(0),
          cost: new Money(0),
        };
        costByItem.set(alloc.itemId, {
          issued: prev.issued.plus(alloc.quantity),
          cost: prev.cost.plus(alloc.costAmount),
        });
      }

      const requestedByItem = new Map<string, Money>();
      for (const line of issueLines) {
        requestedByItem.set(
          line.itemId,
          (requestedByItem.get(line.itemId) ?? new Money(0)).plus(line.quantity),
        );
      }

      const consumptionLines = [...requestedByItem.entries()].map(([itemId, requested]) => {
        const issued = costByItem.get(itemId);
        return {
          id: randomUUID(),
          itemId,
          requestedQuantity: requested.toString(),
          issuedQuantity: (issued?.issued ?? new Money(0)).toString(),
          costAmount: (issued?.cost ?? new Money(0)).toFixed(4),
        };
      });

      await this.sales.saveConsumption({
        id: randomUUID(),
        organizationId: input.organizationId,
        saleId: sale.id,
        sourceType,
        lines: consumptionLines,
      });

      const costAmount = new Money(issueResult.totalCostAmount).toFixed(4);
      const margin = computeMargin(sale.netAmount, costAmount);

      const completed = await this.sales.markCompleted({
        organizationId: input.organizationId,
        storeId: input.storeId,
        saleId: sale.id,
        completedAt: now,
        costAmount,
        grossProfitAmount: margin.grossProfitAmount,
        marginPercent: margin.marginPercent,
      });

      if (sale.type === SaleType.ORDER_BASED && sale.orderId) {
        await this.ordersSales.markOrderCompletedFromSale({
          organizationId: input.organizationId,
          storeId: input.storeId,
          orderId: sale.orderId,
          saleId: sale.id,
        });
      }

      await this.appendTimeline(completed, 'INVENTORY_ISSUED', 'Inventory issued for sale', {
        totalCostAmount: costAmount,
        idempotentReplay: issueResult.idempotentReplay,
      });
      await this.appendTimeline(completed, 'SALE_COMPLETED', 'Sale completed', null);
      await this.auditSale(completed, 'SALE_COMPLETED', sale, completed);
      return completed;
    });
  }

  async annulSale(input: {
    organizationId: string;
    storeId: string;
    saleId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<SaleView> {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'ANNUL_REASON_REQUIRED',
        message: 'Annul reason is required',
      });
    }

    const existing = await this.requireSale(
      input.organizationId,
      input.storeId,
      input.saleId,
    );
    if (existing.status === SaleStatus.ANNULLED) {
      return existing;
    }

    try {
      assertCanAnnul(existing.status);
    } catch (error) {
      mapDomain(error);
    }

    return this.uow.runInTransaction(async () => {
      const sale = await this.requireSale(
        input.organizationId,
        input.storeId,
        input.saleId,
      );
      if (sale.status === SaleStatus.ANNULLED) {
        return sale;
      }
      try {
        assertCanAnnul(sale.status);
      } catch (error) {
        mapDomain(error);
      }

      const now = this.clock.now();
      const reverse = await this.inventoryIssue.reverseIssue({
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: sale.warehouseId,
        saleId: sale.id,
        idempotencyKey: input.idempotencyKey,
        occurredAt: now,
      });

      await this.sales.createAnnulment({
        id: randomUUID(),
        organizationId: input.organizationId,
        saleId: sale.id,
        reason,
        actorMembershipId: actorMembershipId(),
      });

      const annulled = await this.sales.markAnnulled({
        organizationId: input.organizationId,
        storeId: input.storeId,
        saleId: sale.id,
        annulledAt: now,
      });

      if (sale.type === SaleType.ORDER_BASED && sale.orderId) {
        await this.ordersSales.revertOrderToReadyFromSaleAnnul({
          organizationId: input.organizationId,
          storeId: input.storeId,
          orderId: sale.orderId,
          saleId: sale.id,
        });
      }

      await this.appendTimeline(annulled, 'INVENTORY_REVERSED', 'Inventory issue reversed', {
        idempotentReplay: reverse.idempotentReplay,
      });
      await this.appendTimeline(annulled, 'SALE_ANNULLED', 'Sale annulled', { reason });
      await this.auditSale(annulled, 'SALE_ANNULLED', sale, annulled);
      return annulled;
    });
  }

  async getSale(organizationId: string, storeId: string, saleId: string): Promise<SaleView> {
    return this.requireSale(organizationId, storeId, saleId);
  }

  async listSales(
    organizationId: string,
    storeId: string,
    filter?: { status?: SaleStatus; type?: SaleType; orderId?: string },
  ): Promise<SaleView[]> {
    await this.organizations.getStore(organizationId, storeId);
    return this.sales.listSales(organizationId, storeId, filter);
  }

  async getTimeline(organizationId: string, storeId: string, saleId: string) {
    await this.requireSale(organizationId, storeId, saleId);
    return this.sales.listTimeline(organizationId, saleId);
  }

  async getConsumption(organizationId: string, storeId: string, saleId: string) {
    await this.requireSale(organizationId, storeId, saleId);
    return this.sales.getConsumption(organizationId, saleId);
  }

  private resolveDiscount(
    discount: DiscountInput | undefined,
    grossAmount: string,
  ): {
    grossAmount: string;
    discountAmount: string;
    netAmount: string;
    record: {
      id: string;
      type: DiscountType;
      value: string;
      reason: DiscountReason;
      comment: string | null;
      approvedByMembershipId: string | null;
    } | null;
  } {
    const type = discount?.type ?? DiscountType.NONE;
    const value = discount?.value ?? '0';
    const reason = discount?.reason ?? DiscountReason.OTHER;
    const permissions = authPermissions();

    if (type !== DiscountType.NONE) {
      if (!hasPermission(permissions, ['sales:discount'])) {
        throw new BadRequestException({
          code: 'DISCOUNT_PERMISSION_REQUIRED',
          message: 'Applying a discount requires sales:discount',
        });
      }
    }

    const hasOverride = hasPermission(permissions, ['sales:discount-override']);
    try {
      validateDiscount(
        type,
        value,
        grossAmount,
        this.env.SALES_DISCOUNT_OVERRIDE_PERCENT,
        hasOverride,
      );
    } catch (error) {
      mapDomain(error);
    }

    const discountAmount = applyDiscount(type, value, grossAmount);
    const netAmount = computeNet(grossAmount, discountAmount);

    if (type === DiscountType.NONE && new Money(discountAmount).eq(0)) {
      return {
        grossAmount,
        discountAmount: '0.00',
        netAmount: grossAmount,
        record: null,
      };
    }

    return {
      grossAmount,
      discountAmount,
      netAmount,
      record: {
        id: randomUUID(),
        type,
        value: new Money(value).toString(),
        reason,
        comment: discount?.comment ?? null,
        approvedByMembershipId: hasOverride ? actorMembershipId() : null,
      },
    };
  }

  private allocateLineDiscounts<
    T extends {
      grossAmount: string;
      discountAmount: string;
      netAmount: string;
    },
  >(lines: T[], headerDiscount: string): T[] {
    const totalGross = new Money(computeGross(lines.map((l) => l.grossAmount)));
    const discountTotal = new Money(headerDiscount);
    if (discountTotal.eq(0) || totalGross.eq(0)) {
      return lines.map((line) => ({
        ...line,
        discountAmount: '0.00',
        netAmount: line.grossAmount,
      }));
    }

    let remaining = discountTotal;
    return lines.map((line, index) => {
      const isLast = index === lines.length - 1;
      const share = isLast
        ? remaining
        : new Money(discountTotal.mul(line.grossAmount).div(totalGross).toFixed(2));
      remaining = remaining.minus(share);
      const discountAmount = share.toFixed(2);
      return {
        ...line,
        discountAmount,
        netAmount: computeNet(line.grossAmount, discountAmount),
      };
    });
  }

  private async requireSale(
    organizationId: string,
    storeId: string,
    saleId: string,
  ): Promise<SaleView> {
    const sale = await this.sales.getSale(organizationId, storeId, saleId);
    if (!sale) {
      throw new NotFoundException({ code: 'SALE_NOT_FOUND', message: 'Sale not found' });
    }
    return sale;
  }

  private async appendTimeline(
    sale: SaleView,
    type: string,
    message: string | null,
    payload: unknown,
  ): Promise<void> {
    await this.sales.appendTimeline({
      id: randomUUID(),
      organizationId: sale.organizationId,
      saleId: sale.id,
      type,
      message,
      actorMembershipId: actorMembershipId(),
      payload,
      occurredAt: this.clock.now(),
    });
  }

  private async auditSale(
    sale: SaleView,
    action: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.audit.append({
      organizationId: sale.organizationId,
      storeId: sale.storeId,
      actorId: getRequestContext()?.actorId ?? null,
      action,
      entityType: 'Sale',
      entityId: sale.id,
      beforeState: (before as Record<string, unknown> | null) ?? null,
      afterState: (after as Record<string, unknown> | null) ?? null,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
  }
}
