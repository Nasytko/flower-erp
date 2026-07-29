import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { CLOCK_PORT, type ClockPort } from '@flower/shared-kernel';
import type { ApiEnv } from '@flower/config';
import { AUDIT_PORT, type AuditPort } from '../../../infrastructure/audit/audit.port';
import { getRequestContext } from '../../../infrastructure/context/request-context';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../infrastructure/persistence/unit-of-work.port';
import { API_ENV } from '../../../infrastructure/infrastructure.module';
import { OrganizationUseCases } from '../../organization/application/organization.use-cases';
import { ItemUseCases } from '../../master-data/application/item.use-cases';
import {
  INVENTORY_RESERVATION_PORT,
  type InventoryReservationPort,
} from '../../inventory/application/ports/inventory-reservation.port';
import {
  INVENTORY_ISSUE_PORT,
  type InventoryIssuePort,
} from '../../inventory/application/ports/inventory-issue.port';
import {
  DELIVERY_FULFILLMENT_PORT,
  type DeliveryFulfillmentPort,
} from './ports/delivery-fulfillment.port';
import {
  DELIVERY_READINESS_PORT,
  type DeliveryReadinessPort,
} from './ports/delivery-readiness.port';
import {
  AssignmentConflictError,
  ORDER_REPOSITORY,
  type CompositionItemView,
  type OrderDashboardBuckets,
  type OrderRepository,
  type OrderView,
  type PlannedCompositionItemInput,
} from './ports/order.repository';
import {
  DomainError,
  OrderOccasion,
  OrderStatus,
  OrderType,
  assertCanAssign,
  assertCanCancel,
  assertCanComplete,
  assertCanConfirm,
  assertCanEditActual,
  assertCanMarkReady,
  assertCanReserve,
  assertCanStartPreparation,
  assertCompositionEditable,
  assertOrderHeaderEditable,
  assertQuantityPositive,
  isClaimEligibleStatus,
  statusFromReservationOutcome,
} from '../domain/order-rules';
import {
  orderDisplayPhaseLabel,
  resolveOrderDisplayPhase,
} from '../domain/order-display-phase';

function mapDomain(error: unknown): never {
  if (error instanceof AssignmentConflictError) {
    throw new ConflictException({
      code: 'ORDER_ASSIGNMENT_CONFLICT',
      message: error.message,
    });
  }
  if (error instanceof DomainError) {
    if (
      error.code.includes('EMPTY') ||
      error.code.includes('NOT_') ||
      error.code.includes('INVALID') ||
      error.code.includes('LOCKED') ||
      error.code.includes('NO_')
    ) {
      throw new BadRequestException({ code: error.code, message: error.message });
    }
    throw new ConflictException({ code: error.code, message: error.message });
  }
  throw error;
}

function compareQty(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new DomainError('INVALID_QUANTITY', 'Quantity comparison requires finite decimals');
  }
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function subtractQty(a: string, b: string): string {
  return (Number(a) - Number(b)).toString();
}

function actorMembershipId(): string | null {
  return getRequestContext()?.auth?.membershipId ?? null;
}

function requireMembershipId(): string {
  const id = actorMembershipId();
  if (!id) {
    throw new BadRequestException({
      code: 'ACTOR_REQUIRED',
      message: 'Authenticated membership is required',
    });
  }
  return id;
}

@Injectable()
export class OrderUseCases {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY_RESERVATION_PORT) private readonly reservations: InventoryReservationPort,
    @Inject(INVENTORY_ISSUE_PORT) private readonly inventoryIssue: InventoryIssuePort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly organizations: OrganizationUseCases,
    private readonly items: ItemUseCases,
    private readonly moduleRef: ModuleRef,
  ) {}

  private deliveryReadiness(): DeliveryReadinessPort | null {
    try {
      return this.moduleRef.get<DeliveryReadinessPort>(DELIVERY_READINESS_PORT, {
        strict: false,
      });
    } catch {
      return null;
    }
  }

  private deliveryFulfillment(): DeliveryFulfillmentPort | null {
    try {
      return this.moduleRef.get<DeliveryFulfillmentPort>(DELIVERY_FULFILLMENT_PORT, {
        strict: false,
      });
    } catch {
      return null;
    }
  }
  async createOrder(input: {
    organizationId: string;
    storeId: string;
    warehouseId?: string;
    type?: OrderType;
    occasion?: OrderOccasion;
    readyAt?: string | null;
    customerId?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    comment?: string | null;
    referenceUrl?: string | null;
    referenceComment?: string | null;
    plannedPrice?: string | null;
    customerNameSnapshot?: string | null;
    customerPhoneSnapshot?: string | null;
    /** Required when type=DELIVERY — creates delivery job immediately. */
    deliveryAddressLine?: string | null;
    deliveryCity?: string | null;
    deliveryApartment?: string | null;
    deliveryComment?: string | null;
  }) {
    const warehouse = await this.organizations.resolveStoreWarehouse(
      input.organizationId,
      input.storeId,
      input.warehouseId,
    );

    const type = input.type ?? OrderType.PICKUP;
    if (type === OrderType.DELIVERY && !input.deliveryAddressLine?.trim()) {
      throw new BadRequestException({
        code: 'ADDRESS_REQUIRED',
        message: 'Для доставки укажите адрес',
      });
    }

    let customerNameSnapshot = input.customerNameSnapshot ?? null;
    let customerPhoneSnapshot = input.customerPhoneSnapshot ?? null;
    if (input.customerId) {
      const customer = await this.orders.getCustomer(input.organizationId, input.customerId);
      if (!customer || customer.status === 'ARCHIVED') {
        throw new BadRequestException({
          code: 'CUSTOMER_NOT_AVAILABLE',
          message: 'Customer not found or archived',
        });
      }
      customerNameSnapshot = customerNameSnapshot ?? customer.name;
      customerPhoneSnapshot = customerPhoneSnapshot ?? customer.phone;
    }

    const order = await this.uow.runInTransaction(async () => {
      const now = this.clock.now();
      const orderId = randomUUID();
      const compositionId = randomUUID();
      const created = await this.orders.createOrder({
        id: orderId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: warehouse.id,
        customerId: input.customerId ?? null,
        number: await this.orders.uniqueNumber('ORD', input.organizationId),
        type,
        occasion: input.occasion ?? OrderOccasion.OTHER,
        orderDate: now,
        readyAt: input.readyAt ? new Date(input.readyAt) : null,
        customerNameSnapshot,
        customerPhoneSnapshot,
        recipientName: input.recipientName ?? null,
        recipientPhone: input.recipientPhone ?? null,
        comment: input.comment ?? null,
        referenceUrl: input.referenceUrl ?? null,
        referenceComment: input.referenceComment ?? null,
        plannedPrice: input.plannedPrice ?? null,
        createdByMembershipId: actorMembershipId(),
        compositionId,
        status: OrderStatus.CONFIRMED,
        confirmedAt: now,
      });

      
      
      await this.auditOrder(created, 'ORDER_CREATED', null, created);
      return created;
    });

    if (type === OrderType.DELIVERY) {
      const fulfillment = this.deliveryFulfillment();
      if (fulfillment) {
        await fulfillment.ensureDeliveryForOrder({
          organizationId: input.organizationId,
          storeId: input.storeId,
          orderId: order.id,
          addressLine: input.deliveryAddressLine!.trim(),
          city: input.deliveryCity,
          apartment: input.deliveryApartment,
          deliveryComment: input.deliveryComment,
          recipientName: order.recipientName,
          recipientPhone: order.recipientPhone,
          readyAt: input.readyAt,
        });
      }
    }

    return order;
  }

  async updateDraft(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    type?: OrderType;
    occasion?: OrderOccasion;
    readyAt?: string | null;
    customerId?: string | null;
    customerNameSnapshot?: string | null;
    customerPhoneSnapshot?: string | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    comment?: string | null;
    referenceUrl?: string | null;
    referenceComment?: string | null;
    plannedPrice?: string | null;
    warehouseId?: string;
    deliveryAddressLine?: string | null;
    deliveryCity?: string | null;
    deliveryApartment?: string | null;
    deliveryComment?: string | null;
  }) {
    const existing = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertOrderHeaderEditable(existing.status as OrderStatus);
    } catch (e) {
      mapDomain(e);
    }
    if (input.warehouseId) {
      await this.organizations.getWarehouse(input.organizationId, input.storeId, input.warehouseId);
    }

    let customerNameSnapshot = input.customerNameSnapshot;
    let customerPhoneSnapshot = input.customerPhoneSnapshot;
    if (input.customerId) {
      const customer = await this.orders.getCustomer(input.organizationId, input.customerId);
      if (!customer || customer.status === 'ARCHIVED') {
        throw new BadRequestException({
          code: 'CUSTOMER_NOT_AVAILABLE',
          message: 'Customer not found or archived',
        });
      }
      if (customerNameSnapshot === undefined) customerNameSnapshot = customer.name;
      if (customerPhoneSnapshot === undefined) customerPhoneSnapshot = customer.phone;
    }

    return this.uow.runInTransaction(async () => {
      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        input.orderId,
        {
          type: input.type,
          occasion: input.occasion,
          readyAt:
            input.readyAt === undefined
              ? undefined
              : input.readyAt
                ? new Date(input.readyAt)
                : null,
          customerId: input.customerId,
          customerNameSnapshot,
          customerPhoneSnapshot,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          comment: input.comment,
          referenceUrl: input.referenceUrl,
          referenceComment: input.referenceComment,
          plannedPrice: input.plannedPrice,
          warehouseId: input.warehouseId,
        },
      );
      if (
        input.type !== undefined &&
        input.type !== existing.type
      ) {
        const fulfillment = this.deliveryFulfillment();
        if (fulfillment) {
          await fulfillment.onFulfillmentTypeChanged({
            organizationId: input.organizationId,
            storeId: input.storeId,
            orderId: input.orderId,
            previousType: existing.type as 'PICKUP' | 'DELIVERY',
            nextType: input.type as 'PICKUP' | 'DELIVERY',
            recipientName: updated.recipientName,
            recipientPhone: updated.recipientPhone,
            addressLine: input.deliveryAddressLine,
            city: input.deliveryCity,
            apartment: input.deliveryApartment,
            deliveryComment: input.deliveryComment,
            readyAt:
              updated.readyAt instanceof Date
                ? updated.readyAt.toISOString()
                : (updated.readyAt ?? input.readyAt),
          });
        }
      } else if (
        (input.type ?? updated.type) === 'DELIVERY' &&
        input.deliveryAddressLine?.trim()
      ) {
        // Already DELIVERY but job missing (e.g. switched earlier without address).
        const fulfillment = this.deliveryFulfillment();
        if (fulfillment) {
          await fulfillment.ensureDeliveryForOrder({
            organizationId: input.organizationId,
            storeId: input.storeId,
            orderId: input.orderId,
            addressLine: input.deliveryAddressLine.trim(),
            city: input.deliveryCity,
            apartment: input.deliveryApartment,
            deliveryComment: input.deliveryComment,
            recipientName: updated.recipientName,
            recipientPhone: updated.recipientPhone,
            readyAt:
              updated.readyAt instanceof Date
                ? updated.readyAt.toISOString()
                : (updated.readyAt ?? input.readyAt),
          });
        }
      }
      
      await this.auditOrder(updated, 'ORDER_UPDATED', existing, updated);
      return updated;
    });
  }

  /** @deprecated Prefer updateDraft — kept for gradual controller migration */
  async updateOrder(input: Parameters<OrderUseCases['updateDraft']>[0]) {
    return this.updateDraft(input);
  }

  async setPlannedComposition(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    items: Array<{ itemId: string; quantity: string; comment?: string | null }>;
  }) {
    const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertCompositionEditable(order.status as OrderStatus);
    } catch (e) {
      mapDomain(e);
    }
    if (!order.composition) {
      throw new BadRequestException({
        code: 'COMPOSITION_MISSING',
        message: 'Order composition is missing',
      });
    }

    for (const line of input.items) {
      try {
        assertQuantityPositive(line.quantity);
      } catch (e) {
        mapDomain(e);
      }
      const item = await this.items.getItem(input.organizationId, line.itemId);
      if (item.status !== 'ACTIVE') {
        throw new BadRequestException({
          code: 'ITEM_NOT_ACTIVE',
          message: 'Only ACTIVE items can be ordered',
        });
      }
    }

    return this.uow.runInTransaction(async () => {
      const planned: PlannedCompositionItemInput[] = input.items.map((line, index) => ({
        id: randomUUID(),
        itemId: line.itemId,
        plannedQuantity: line.quantity,
        comment: line.comment ?? null,
        sortOrder: index,
      }));
      await this.orders.replaceCompositionItems(
        input.organizationId,
        input.orderId,
        order.composition!.id,
        planned,
      );
      const updated = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      
      await this.auditOrder(updated, 'COMPOSITION_CHANGED', order, updated);
      return updated;
    });
  }

  async addCompositionItem(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    itemId: string;
    quantity: string;
    comment?: string | null;
  }) {
    const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertCompositionEditable(order.status as OrderStatus);
      assertQuantityPositive(input.quantity);
    } catch (e) {
      mapDomain(e);
    }
    if (!order.composition) {
      throw new BadRequestException({
        code: 'COMPOSITION_MISSING',
        message: 'Order composition is missing',
      });
    }
    const item = await this.items.getItem(input.organizationId, input.itemId);
    if (item.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'ITEM_NOT_ACTIVE',
        message: 'Only ACTIVE items can be ordered',
      });
    }

    const existingItems = order.composition.items;
    const withoutDup = existingItems.filter((i) => i.itemId !== input.itemId);
    const next: PlannedCompositionItemInput[] = [
      ...withoutDup.map((i) => ({
        id: i.id,
        itemId: i.itemId,
        plannedQuantity: i.plannedQuantity,
        comment: i.comment,
        sortOrder: i.sortOrder,
      })),
      {
        id: randomUUID(),
        itemId: input.itemId,
        plannedQuantity: input.quantity,
        comment: input.comment ?? null,
        sortOrder: withoutDup.length,
      },
    ];

    return this.uow.runInTransaction(async () => {
      await this.orders.replaceCompositionItems(
        input.organizationId,
        input.orderId,
        order.composition!.id,
        next,
      );
      const updated = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      
      await this.auditOrder(updated, 'ORDER_COMPOSITION_ITEM_ADDED', order, updated);
      return updated;
    });
  }

  /** @deprecated Prefer addCompositionItem */
  async addItem(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    itemId: string;
    quantity: string;
    comment?: string | null;
  }) {
    return this.addCompositionItem(input);
  }

  async removeCompositionItem(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    compositionItemId: string;
  }) {
    const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertCompositionEditable(order.status as OrderStatus);
    } catch (e) {
      mapDomain(e);
    }
    if (!order.composition) {
      throw new BadRequestException({
        code: 'COMPOSITION_MISSING',
        message: 'Order composition is missing',
      });
    }

    const next = order.composition.items
      .filter((i) => i.id !== input.compositionItemId)
      .map((i, index) => ({
        id: i.id,
        itemId: i.itemId,
        plannedQuantity: i.plannedQuantity,
        comment: i.comment,
        sortOrder: index,
      }));

    return this.uow.runInTransaction(async () => {
      await this.orders.replaceCompositionItems(
        input.organizationId,
        input.orderId,
        order.composition!.id,
        next,
      );
      const updated = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      
      await this.auditOrder(updated, 'ORDER_COMPOSITION_ITEM_REMOVED', order, updated);
      return updated;
    });
  }

  /** @deprecated Prefer removeCompositionItem */
  async removeItem(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    orderItemId: string;
  }) {
    return this.removeCompositionItem({
      organizationId: input.organizationId,
      storeId: input.storeId,
      orderId: input.orderId,
      compositionItemId: input.orderItemId,
    });
  }

  async confirmOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    const status = order.status as OrderStatus;
    if (status !== OrderStatus.DRAFT) {
      if (
        status === OrderStatus.CONFIRMED ||
        status === OrderStatus.PARTIALLY_RESERVED ||
        status === OrderStatus.RESERVED
      ) {
        return this.reserveOrder(input);
      }
      try {
        assertCanConfirm(status, order.composition?.items.length ?? 0);
      } catch (e) {
        mapDomain(e);
      }
    }

    return this.uow.runInTransaction(async () => {
      const fresh = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      const items = fresh.composition?.items ?? [];
      try {
        assertCanConfirm(fresh.status as OrderStatus, items.length);
      } catch (e) {
        mapDomain(e);
      }
      for (const line of items) {
        if (line.item.status !== 'ACTIVE') {
          throw new BadRequestException({
            code: 'ITEM_NOT_ACTIVE',
            message: `Item ${line.item.code} is not ACTIVE`,
          });
        }
      }

      const now = this.clock.now();
      const result = await this.reservations.reserveComposition({
        organizationId: fresh.organizationId,
        storeId: fresh.storeId,
        warehouseId: fresh.warehouseId,
        orderId: fresh.id,
        lines: items.map((i) => ({
          compositionItemId: i.id,
          itemId: i.itemId,
          quantity: i.plannedQuantity,
        })),
      });

      const status = statusFromReservationOutcome(result.outcome);
      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        status,
        {
          confirmedAt: now,
          reservedAt: result.outcome === 'FULL' ? now : null,
        },
      );

      
      
      await this.auditOrder(updated, 'ORDER_CONFIRMED', fresh, { status, reservation: result });
      return this.enrichWithReservation(updated);
    });
  }

  async reserveOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanReserve(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }
      const items = order.composition?.items ?? [];
      if (items.length < 1) {
        throw new BadRequestException({
          code: 'ORDER_EMPTY',
          message: 'Order must have at least one composition item before reservation',
        });
      }
      const now = this.clock.now();
      const result = await this.reservations.reserveComposition({
        organizationId: order.organizationId,
        storeId: order.storeId,
        warehouseId: order.warehouseId,
        orderId: order.id,
        lines: items.map((i) => ({
          compositionItemId: i.id,
          itemId: i.itemId,
          quantity: i.plannedQuantity,
        })),
      });

      const status = statusFromReservationOutcome(result.outcome);
      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        status,
        { reservedAt: result.outcome === 'FULL' ? now : null },
      );

      
      await this.auditOrder(updated, 'ORDER_RESERVE_ATTEMPTED', order, { status, reservation: result });
      return this.enrichWithReservation(updated);
    });
  }

  async assignFlorist(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    membershipId: string;
  }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanAssign(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      const now = this.clock.now();
      try {
        await this.orders.createActiveAssignment({
          id: randomUUID(),
          organizationId: input.organizationId,
          orderId: input.orderId,
          membershipId: input.membershipId,
          assignedAt: now,
        });
      } catch (e) {
        mapDomain(e);
      }

      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        input.orderId,
        { assignedFloristId: input.membershipId },
      );

      
      await this.auditOrder(updated, 'ORDER_ASSIGNED', order, updated);
      return updated;
    });
  }

  /** Current membership claims a specific order if unassigned or already self. */
  async claimOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    const membershipId = requireMembershipId();
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanAssign(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }
      if (!isClaimEligibleStatus(order.status)) {
        throw new BadRequestException({
          code: 'ORDER_NOT_CLAIMABLE',
          message: 'Order status is not eligible for claim',
        });
      }

      const active = order.activeAssignment;
      if (active) {
        if (active.membershipId === membershipId) {
          return order;
        }
        throw new ConflictException({
          code: 'ORDER_ALREADY_ASSIGNED',
          message: 'Order is already assigned to another florist',
        });
      }

      const now = this.clock.now();
      try {
        await this.orders.createActiveAssignment({
          id: randomUUID(),
          organizationId: input.organizationId,
          orderId: input.orderId,
          membershipId,
          assignedAt: now,
        });
      } catch (e) {
        mapDomain(e);
      }

      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        input.orderId,
        { assignedFloristId: membershipId },
      );
      
      await this.auditOrder(updated, 'ORDER_CLAIMED', order, updated);
      return updated;
    });
  }

  /**
   * Atomic ClaimNext: server selects eligible unassigned order (FOR UPDATE SKIP LOCKED).
   * Returns NO_ORDER_AVAILABLE when queue is empty.
   */
  async claimNextOrder(input: { organizationId: string; storeId: string }) {
    const membershipId = requireMembershipId();
    await this.organizations.getStore(input.organizationId, input.storeId);

    return this.uow.runInTransaction(async () => {
      const now = this.clock.now();
      const orderId = await this.orders.lockNextClaimableOrderId({
        organizationId: input.organizationId,
        storeId: input.storeId,
        now,
        soonMinutes: this.env.WORKSPACE_READY_SOON_MINUTES,
      });
      if (!orderId) {
        return { code: 'NO_ORDER_AVAILABLE' as const, order: null };
      }

      const order = await this.requireOrder(input.organizationId, input.storeId, orderId);
      try {
        await this.orders.createActiveAssignment({
          id: randomUUID(),
          organizationId: input.organizationId,
          orderId,
          membershipId,
          assignedAt: now,
        });
      } catch (e) {
        mapDomain(e);
      }

      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        orderId,
        { assignedFloristId: membershipId },
      );
      
      await this.auditOrder(updated, 'ORDER_CLAIMED_NEXT', order, updated);
      return { code: 'OK' as const, order: updated };
    });
  }

  async reassignOrder(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    membershipId: string;
    reason: string;
  }) {
    if (!input.reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Reassignment reason is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanAssign(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      const now = this.clock.now();
      const previous = order.activeAssignment;
      if (previous) {
        await this.orders.releaseActiveAssignment(
          input.organizationId,
          input.orderId,
          now,
        );
      }

      try {
        await this.orders.createActiveAssignment({
          id: randomUUID(),
          organizationId: input.organizationId,
          orderId: input.orderId,
          membershipId: input.membershipId,
          assignedAt: now,
        });
      } catch (e) {
        mapDomain(e);
      }

      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        input.orderId,
        { assignedFloristId: input.membershipId },
      );
      
      await this.auditOrder(updated, 'ORDER_REASSIGNED', order, updated);
      return updated;
    });
  }

  async releaseAssignment(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    reason: string;
  }) {
    if (!input.reason.trim()) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Release reason is required',
      });
    }
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      const released = await this.orders.releaseActiveAssignment(
        input.organizationId,
        input.orderId,
        this.clock.now(),
      );
      if (!released) {
        throw new BadRequestException({
          code: 'ORDER_NO_ASSIGNEE',
          message: 'No active florist assignment to release',
        });
      }

      const updated = await this.orders.updateOrder(
        input.organizationId,
        input.storeId,
        input.orderId,
        { assignedFloristId: null },
      );

      
      await this.auditOrder(updated, 'ORDER_ASSIGNMENT_RELEASED', order, updated);
      return updated;
    });
  }

  async startPreparation(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
  }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      const hasActive = Boolean(order.activeAssignment);
      try {
        assertCanStartPreparation(order.status as OrderStatus, hasActive);
      } catch (e) {
        mapDomain(e);
      }

      const planned = order.composition?.items ?? [];
      await this.orders.seedActualFromPlanned({
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        items: planned.map((line, index) => ({
          id: randomUUID(),
          itemId: line.itemId,
          actualQuantity: line.plannedQuantity,
          batchId: null,
          comment: line.comment,
          sortOrder: index,
        })),
      });

      const now = this.clock.now();
      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        OrderStatus.IN_PREPARATION,
        { preparationStartedAt: now },
      );

      
      await this.auditOrder(updated, 'ORDER_PREPARATION_STARTED', order, updated);
      return updated;
    });
  }

  async updateActualComposition(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    expectedVersion: number;
    items: Array<{
      itemId: string;
      quantity: string;
      batchId?: string | null;
      comment?: string | null;
    }>;
  }) {
    const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertCanEditActual(order.status as OrderStatus);
    } catch (e) {
      mapDomain(e);
    }
    if (!order.actualComposition) {
      throw new BadRequestException({
        code: 'ACTUAL_MISSING',
        message: 'Actual composition is missing; start preparation first',
      });
    }
    if (order.actualComposition.frozenAt) {
      throw new BadRequestException({
        code: 'ACTUAL_LOCKED',
        message: 'Actual composition is frozen',
      });
    }
    if (input.expectedVersion !== order.version) {
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'Actual composition version conflict; reload and retry',
        version: order.version,
        updatedAt: order.updatedAt,
      });
    }

    for (const line of input.items) {
      try {
        assertQuantityPositive(line.quantity);
      } catch (e) {
        mapDomain(e);
      }
      const item = await this.items.getItem(input.organizationId, line.itemId);
      if (item.status !== 'ACTIVE') {
        throw new BadRequestException({
          code: 'ITEM_NOT_ACTIVE',
          message: 'Only ACTIVE items can be used in actual composition',
        });
      }
    }

    return this.uow.runInTransaction(async () => {
      const bumped = await this.orders.incrementVersion(
        input.organizationId,
        input.storeId,
        input.orderId,
        input.expectedVersion,
      );
      if (bumped === null) {
        const current = await this.requireOrder(
          input.organizationId,
          input.storeId,
          input.orderId,
        );
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Actual composition version conflict; reload and retry',
          version: current.version,
          updatedAt: current.updatedAt,
        });
      }

      await this.orders.replaceActualItems(
        input.organizationId,
        input.orderId,
        order.actualComposition!.id,
        input.items.map((line, index) => ({
          id: randomUUID(),
          itemId: line.itemId,
          actualQuantity: line.quantity,
          batchId: line.batchId ?? null,
          comment: line.comment ?? null,
          sortOrder: index,
        })),
      );
      const updated = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      
      await this.auditOrder(updated, 'ACTUAL_COMPOSITION_CHANGED', order, updated);
      return updated;
    });
  }

  async markReady(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanMarkReady(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      const now = this.clock.now();
      if (order.actualComposition) {
        await this.orders.freezeActual(input.organizationId, input.orderId, now);
      }

      // No stock issue on READY (ADR-015)
      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        OrderStatus.READY,
      );

      
      await this.auditOrder(updated, 'ORDER_MARKED_READY', order, updated);
      const readiness = this.deliveryReadiness();
      if (readiness) {
        await readiness.onOrderMarkedReady(
          input.organizationId,
          input.storeId,
          input.orderId,
        );
      }
      return updated;
    });
  }

  /** Confirm, reserve, seed actual, and mark ready — without florist assignment. */
  async assembleOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      let order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      if (order.status === OrderStatus.READY || order.status === OrderStatus.COMPLETED) {
        return order;
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException({
          code: 'ORDER_TERMINAL',
          message: 'Order cannot be assembled',
        });
      }

      const now = this.clock.now();
      const items = order.composition?.items ?? [];

      if (order.status === OrderStatus.DRAFT) {
        try {
          assertCanConfirm(order.status as OrderStatus, items.length);
        } catch (e) {
          mapDomain(e);
        }
        for (const line of items) {
          if (line.item.status !== 'ACTIVE') {
            throw new BadRequestException({
              code: 'ITEM_NOT_ACTIVE',
              message: `Item ${line.item.code} is not ACTIVE`,
            });
          }
        }
        const result = await this.reservations.reserveComposition({
          organizationId: order.organizationId,
          storeId: order.storeId,
          warehouseId: order.warehouseId,
          orderId: order.id,
          lines: items.map((i) => ({
            compositionItemId: i.id,
            itemId: i.itemId,
            quantity: i.plannedQuantity,
          })),
        });
        const status = statusFromReservationOutcome(result.outcome);
        order = await this.orders.updateStatus(
          input.organizationId,
          input.storeId,
          input.orderId,
          status,
          {
            confirmedAt: now,
            reservedAt: result.outcome === 'FULL' ? now : null,
          },
        );
        
        await this.auditOrder(order, 'ORDER_CONFIRMED', order, { status, reservation: result });
      }

      if (
        order.status === OrderStatus.CONFIRMED ||
        order.status === OrderStatus.PARTIALLY_RESERVED
      ) {
        try {
          assertCanReserve(order.status as OrderStatus);
        } catch (e) {
          mapDomain(e);
        }
        const result = await this.reservations.reserveComposition({
          organizationId: order.organizationId,
          storeId: order.storeId,
          warehouseId: order.warehouseId,
          orderId: order.id,
          lines: items.map((i) => ({
            compositionItemId: i.id,
            itemId: i.itemId,
            quantity: i.plannedQuantity,
          })),
        });
        const status = statusFromReservationOutcome(result.outcome);
        order = await this.orders.updateStatus(
          input.organizationId,
          input.storeId,
          input.orderId,
          status,
          { reservedAt: result.outcome === 'FULL' ? now : null },
        );
      }

      if (
        order.status === OrderStatus.RESERVED ||
        order.status === OrderStatus.PARTIALLY_RESERVED
      ) {
        await this.orders.seedActualFromPlanned({
          id: randomUUID(),
          organizationId: input.organizationId,
          orderId: input.orderId,
          items: items.map((line, index) => ({
            id: randomUUID(),
            itemId: line.itemId,
            actualQuantity: line.plannedQuantity,
            batchId: null,
            comment: line.comment,
            sortOrder: index,
          })),
        });
        order = await this.orders.updateStatus(
          input.organizationId,
          input.storeId,
          input.orderId,
          OrderStatus.IN_PREPARATION,
          { preparationStartedAt: now },
        );
        
        await this.auditOrder(order, 'ORDER_PREPARATION_STARTED', order, order);
      }

      if (order.status === OrderStatus.IN_PREPARATION) {
        try {
          assertCanMarkReady(order.status as OrderStatus);
        } catch (e) {
          mapDomain(e);
        }
        order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
        if (order.actualComposition) {
          await this.orders.freezeActual(input.organizationId, input.orderId, now);
        }
        order = await this.orders.updateStatus(
          input.organizationId,
          input.storeId,
          input.orderId,
          OrderStatus.READY,
        );
        
        await this.auditOrder(order, 'ORDER_MARKED_READY', order, order);
        const readiness = this.deliveryReadiness();
        if (readiness) {
          await readiness.onOrderMarkedReady(
            input.organizationId,
            input.storeId,
            input.orderId,
          );
        }
      }

      return order;
    });
  }

  async completeOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanComplete(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      const actual = order.actualComposition;
      if (!actual?.frozenAt || actual.items.length < 1) {
        throw new BadRequestException({
          code: 'ORDER_NO_ACTUAL_COMPOSITION',
          message: 'Order must have a frozen actual composition before handover',
        });
      }

      const compositionItemIds = (order.composition?.items ?? []).map((line) => line.id);
      const now = this.clock.now();
      await this.inventoryIssue.issueForOrderComplete({
        organizationId: order.organizationId,
        storeId: order.storeId,
        warehouseId: order.warehouseId,
        orderId: order.id,
        lines: actual.items.map((line) => ({
          itemId: line.itemId,
          quantity: line.actualQuantity,
          reservationSourceItemIds: compositionItemIds,
        })),
        idempotencyKey: `order-complete-${order.id}`,
        occurredAt: now,
      });

      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        OrderStatus.COMPLETED,
        { completedAt: now },
      );

      
      await this.auditOrder(updated, 'ORDER_COMPLETED', order, updated);
      return updated;
    });
  }

  async cancelOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanCancel(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      const compositionItemIds = (order.composition?.items ?? []).map((i) => i.id);
      if (compositionItemIds.length > 0) {
        await this.reservations.releaseComposition({
          organizationId: order.organizationId,
          storeId: order.storeId,
          warehouseId: order.warehouseId,
          orderId: order.id,
          compositionItemIds,
        });
      }

      if (order.activeAssignment) {
        await this.orders.releaseActiveAssignment(
          input.organizationId,
          input.orderId,
          this.clock.now(),
        );
      }

      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        OrderStatus.CANCELLED,
        { cancelledAt: this.clock.now() },
      );

      
      await this.auditOrder(updated, 'ORDER_CANCELLED', order, updated);
      return updated;
    });
  }

  async addComment(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    message: string;
  }) {
    const membershipId = actorMembershipId();
    if (!membershipId) {
      throw new BadRequestException({
        code: 'ACTOR_REQUIRED',
        message: 'Authenticated membership is required to comment',
      });
    }
    if (!input.message.trim()) {
      throw new BadRequestException({
        code: 'INVALID_COMMENT',
        message: 'Comment message is required',
      });
    }

    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      const comment = await this.orders.addComment({
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        authorMembershipId: membershipId,
        message: input.message.trim(),
      });

      
      await this.auditOrder(order, 'ORDER_COMMENT_ADDED', null, comment);
      return this.requireOrder(input.organizationId, input.storeId, input.orderId);
    });
  }

  async getOrder(organizationId: string, storeId: string, orderId: string) {
    const order = await this.requireOrder(organizationId, storeId, orderId);
    return this.enrichWithReservation(order);
  }

  async listOrders(
    organizationId: string,
    storeId: string,
    status?: OrderStatus,
    phase?: string,
  ) {
    await this.organizations.getStore(organizationId, storeId);
    const now = this.clock.now();
    const list = await this.orders.listOrders(organizationId, storeId, {
      status,
      phase,
      now,
    });
    return Promise.all(list.map((o) => this.enrichWithReservation(o)));
  }

  async getCalendarBoard(organizationId: string, storeId: string, date?: string) {
    await this.organizations.getStore(organizationId, storeId);
    const parsed = date ? new Date(date) : this.clock.now();
    return this.orders.getCalendarBoard({
      organizationId,
      storeId,
      date: parsed,
    });
  }

  async getDashboard(
    organizationId: string,
    storeId: string,
  ): Promise<OrderDashboardBuckets> {
    await this.organizations.getStore(organizationId, storeId);
    const open = await this.orders.listOpenForDashboard(organizationId, storeId);
    const enriched = await Promise.all(open.map((o) => this.enrichWithReservation(o)));
    const now = this.clock.now();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const terminalReady = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED];

    return {
      today: enriched.filter(
        (o) =>
          o.readyAt &&
          o.readyAt >= startOfDay &&
          o.readyAt <= endOfDay &&
          o.status !== OrderStatus.READY,
      ),
      overdue: enriched.filter(
        (o) =>
          o.readyAt &&
          o.readyAt < startOfDay &&
          !terminalReady.includes(o.status as OrderStatus),
      ),
      unassigned: enriched.filter(
        (o) =>
          !o.activeAssignment &&
          ![OrderStatus.DRAFT, OrderStatus.COMPLETED, OrderStatus.CANCELLED].includes(
            o.status as OrderStatus,
          ),
      ),
      partiallyReserved: enriched.filter((o) => o.status === OrderStatus.PARTIALLY_RESERVED),
      ready: enriched.filter((o) => o.status === OrderStatus.READY),
      inProgress: enriched.filter((o) => o.status === OrderStatus.IN_PREPARATION),
    };
  }

  private attachDisplayPhase(order: OrderView): OrderView {
    const hasActiveAssignment = Boolean(order.activeAssignment);
    const displayPhase = resolveOrderDisplayPhase({
      status: order.status,
      type: order.type,
      hasActiveAssignment,
    });
    return {
      ...order,
      displayPhase,
      displayPhaseLabel: orderDisplayPhaseLabel(displayPhase, { type: order.type }),
    };
  }

  private async enrichWithReservation(order: OrderView): Promise<OrderView> {
    const items = order.composition?.items ?? [];
    if (items.length === 0) {
      return this.attachDisplayPhase({ ...order, hasDeficit: false });
    }

    const reservedMap = await this.reservations.sumActiveReservedByCompositionItems(
      order.organizationId,
      items.map((i) => i.id),
    );

    const enrichedItems: CompositionItemView[] = items.map((line) => {
      const reserved = reservedMap.get(line.id) ?? '0';
      const deficit =
        compareQty(line.plannedQuantity, reserved) > 0
          ? subtractQty(line.plannedQuantity, reserved)
          : '0';
      return { ...line, reservedQuantity: reserved, deficitQuantity: deficit };
    });

    const hasDeficit = enrichedItems.some((i) => compareQty(i.deficitQuantity ?? '0', '0') > 0);

    return this.attachDisplayPhase({
      ...order,
      composition: order.composition
        ? { ...order.composition, items: enrichedItems }
        : null,
      hasDeficit,
    });
  }

  private async requireOrder(
    organizationId: string,
    storeId: string,
    orderId: string,
  ): Promise<OrderView> {
    const order = await this.orders.getOrder(organizationId, storeId, orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }
    return order;
  }



  private async auditOrder(
    order: OrderView,
    action: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.audit.append({
      organizationId: order.organizationId,
      storeId: order.storeId,
      actorId: getRequestContext()?.actorId ?? null,
      action,
      entityType: 'Order',
      entityId: order.id,
      beforeState: (before as Record<string, unknown> | null) ?? null,
      afterState: (after as Record<string, unknown> | null) ?? null,
      requestId: getRequestContext()?.requestId ?? 'unknown',
      occurredAt: this.clock.now(),
    });
  }
}
