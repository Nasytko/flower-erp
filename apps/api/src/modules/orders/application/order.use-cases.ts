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
  type ReserveCompositionResult,
} from '../../inventory/application/ports/inventory-reservation.port';
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
  type CompositionReplacementReason,
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
  assertDraftEditable,
  assertQuantityPositive,
  isClaimEligibleStatus,
  statusFromReservationOutcome,
} from '../domain/order-rules';

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

function reservationTimelineType(
  outcome: ReserveCompositionResult['outcome'],
): 'RESERVATION_SUCCEEDED' | 'RESERVATION_PARTIAL' | 'RESERVATION_FAILED' {
  if (outcome === 'FULL') return 'RESERVATION_SUCCEEDED';
  if (outcome === 'PARTIAL') return 'RESERVATION_PARTIAL';
  return 'RESERVATION_FAILED';
}

@Injectable()
export class OrderUseCases {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY_RESERVATION_PORT) private readonly reservations: InventoryReservationPort,
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
    warehouseId: string;
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
  }) {
    await this.organizations.getWarehouse(input.organizationId, input.storeId, input.warehouseId);

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

    return this.uow.runInTransaction(async () => {
      const now = this.clock.now();
      const orderId = randomUUID();
      const compositionId = randomUUID();
      const order = await this.orders.createOrder({
        id: orderId,
        organizationId: input.organizationId,
        storeId: input.storeId,
        warehouseId: input.warehouseId,
        customerId: input.customerId ?? null,
        number: await this.orders.uniqueNumber('ORD', input.organizationId),
        type: input.type ?? OrderType.PICKUP,
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
      });

      await this.appendTimeline(order, 'ORDER_CREATED', 'Order created', null);
      await this.auditOrder(order, 'ORDER_CREATED', null, order);
      return order;
    });
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
  }) {
    const existing = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
    try {
      assertDraftEditable(existing.status as OrderStatus);
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
          });
        }
      }
      await this.appendTimeline(updated, 'REFERENCE_UPDATED', 'Draft updated', null);
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
      assertDraftEditable(order.status as OrderStatus);
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
      await this.appendTimeline(updated, 'COMPOSITION_CHANGED', 'Planned composition replaced', {
        itemCount: planned.length,
      });
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
      assertDraftEditable(order.status as OrderStatus);
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
      await this.appendTimeline(updated, 'COMPOSITION_CHANGED', 'Composition item added', {
        itemId: input.itemId,
      });
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
      assertDraftEditable(order.status as OrderStatus);
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
      await this.appendTimeline(updated, 'COMPOSITION_CHANGED', 'Composition item removed', {
        compositionItemId: input.compositionItemId,
      });
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
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      const items = order.composition?.items ?? [];
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
        {
          confirmedAt: now,
          reservedAt: result.outcome === 'FULL' ? now : null,
        },
      );

      await this.appendTimeline(updated, 'CONFIRMED', 'Order confirmed', { status });
      await this.appendTimeline(
        updated,
        reservationTimelineType(result.outcome),
        `Reservation ${result.outcome.toLowerCase()}`,
        result,
      );
      await this.auditOrder(updated, 'ORDER_CONFIRMED', order, { status, reservation: result });
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

      await this.appendTimeline(
        updated,
        reservationTimelineType(result.outcome),
        `Reservation retry ${result.outcome.toLowerCase()}`,
        result,
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

      await this.appendTimeline(updated, 'ASSIGNMENT_CHANGED', 'Florist assigned', {
        membershipId: input.membershipId,
      });
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
      await this.appendTimeline(updated, 'ASSIGNMENT_CHANGED', 'Order claimed', {
        membershipId,
        action: 'claim',
      });
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
      await this.appendTimeline(updated, 'ASSIGNMENT_CHANGED', 'Order claimed via ClaimNext', {
        membershipId,
        action: 'claim-next',
      });
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
      await this.appendTimeline(updated, 'ASSIGNMENT_CHANGED', 'Florist reassigned', {
        fromMembershipId: previous?.membershipId ?? null,
        toMembershipId: input.membershipId,
        reason: input.reason.trim(),
      });
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

      await this.appendTimeline(updated, 'ASSIGNMENT_CHANGED', 'Florist assignment released', {
        membershipId: released.membershipId,
        reason: input.reason.trim(),
      });
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

      await this.appendTimeline(updated, 'PREPARATION_STARTED', 'Preparation started', null);
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
      await this.appendTimeline(
        updated,
        'ACTUAL_COMPOSITION_CHANGED',
        'Actual composition updated',
        { itemCount: input.items.length, version: updated.version },
      );
      await this.auditOrder(updated, 'ACTUAL_COMPOSITION_CHANGED', order, updated);
      return updated;
    });
  }

  async replaceCompositionItem(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    expectedVersion: number;
    fromItemId: string;
    toItemId: string;
    quantity: string;
    reason: CompositionReplacementReason;
    comment?: string | null;
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
    try {
      assertQuantityPositive(input.quantity);
    } catch (e) {
      mapDomain(e);
    }
    if (input.fromItemId === input.toItemId) {
      throw new BadRequestException({
        code: 'INVALID_REPLACEMENT',
        message: 'fromItemId and toItemId must differ',
      });
    }

    const toItem = await this.items.getItem(input.organizationId, input.toItemId);
    if (toItem.status !== 'ACTIVE') {
      throw new BadRequestException({
        code: 'ITEM_NOT_ACTIVE',
        message: 'Only ACTIVE items can be used in actual composition',
      });
    }
    await this.items.getItem(input.organizationId, input.fromItemId);

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

      const actual = order.actualComposition!;
      const qty = Number(input.quantity);
      const nextLines: Array<{
        id: string;
        itemId: string;
        actualQuantity: string;
        batchId: string | null;
        comment: string | null;
        sortOrder: number;
      }> = [];

      let fromRemaining = qty;
      for (const line of actual.items) {
        if (line.itemId !== input.fromItemId || fromRemaining <= 0) {
          nextLines.push({
            id: randomUUID(),
            itemId: line.itemId,
            actualQuantity: line.actualQuantity,
            batchId: line.batchId,
            comment: line.comment,
            sortOrder: line.sortOrder,
          });
          continue;
        }
        const lineQty = Number(line.actualQuantity);
        const take = Math.min(lineQty, fromRemaining);
        const left = lineQty - take;
        fromRemaining -= take;
        if (left > 0) {
          nextLines.push({
            id: randomUUID(),
            itemId: line.itemId,
            actualQuantity: left.toString(),
            batchId: line.batchId,
            comment: line.comment,
            sortOrder: line.sortOrder,
          });
        }
      }
      if (fromRemaining > 0) {
        throw new BadRequestException({
          code: 'REPLACEMENT_QTY_EXCEEDS',
          message: 'Replacement quantity exceeds from-item actual quantity',
        });
      }

      const existingTo = nextLines.find((l) => l.itemId === input.toItemId);
      if (existingTo) {
        existingTo.actualQuantity = (Number(existingTo.actualQuantity) + qty).toString();
      } else {
        nextLines.push({
          id: randomUUID(),
          itemId: input.toItemId,
          actualQuantity: input.quantity,
          batchId: null,
          comment: input.comment ?? null,
          sortOrder: nextLines.length,
        });
      }

      await this.orders.replaceActualItems(
        input.organizationId,
        input.orderId,
        actual.id,
        nextLines.map((line, index) => ({ ...line, sortOrder: index })),
      );

      const replacement = await this.orders.createCompositionReplacement({
        id: randomUUID(),
        organizationId: input.organizationId,
        orderId: input.orderId,
        fromItemId: input.fromItemId,
        toItemId: input.toItemId,
        quantity: input.quantity,
        reason: input.reason,
        comment: input.comment ?? null,
        actorMembershipId: actorMembershipId(),
      });

      const updated = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      await this.appendTimeline(updated, 'COMPOSITION_REPLACED', 'Composition item replaced', {
        fromItemId: input.fromItemId,
        toItemId: input.toItemId,
        quantity: input.quantity,
        reason: input.reason,
        replacementId: replacement.id,
        version: updated.version,
      });
      await this.auditOrder(updated, 'COMPOSITION_ITEM_REPLACED', order, {
        order: updated,
        replacement,
      });
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

      await this.appendTimeline(updated, 'READY', 'Order marked ready', null);
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

  async completeOrder(input: { organizationId: string; storeId: string; orderId: string }) {
    return this.uow.runInTransaction(async () => {
      const order = await this.requireOrder(input.organizationId, input.storeId, input.orderId);
      try {
        assertCanComplete(order.status as OrderStatus);
      } catch (e) {
        mapDomain(e);
      }

      // No stock issue on COMPLETE (ADR-015)
      const updated = await this.orders.updateStatus(
        input.organizationId,
        input.storeId,
        input.orderId,
        OrderStatus.COMPLETED,
        { completedAt: this.clock.now() },
      );

      await this.appendTimeline(updated, 'COMPLETED', 'Order completed', null);
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

      await this.appendTimeline(updated, 'CANCELLED', 'Order cancelled', null);
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

      await this.appendTimeline(order, 'COMMENT_ADDED', 'Comment added', {
        commentId: comment.id,
      });
      await this.auditOrder(order, 'ORDER_COMMENT_ADDED', null, comment);
      return this.requireOrder(input.organizationId, input.storeId, input.orderId);
    });
  }

  async getOrder(organizationId: string, storeId: string, orderId: string) {
    const order = await this.requireOrder(organizationId, storeId, orderId);
    return this.enrichWithReservation(order);
  }

  async listOrders(organizationId: string, storeId: string, status?: OrderStatus) {
    await this.organizations.getStore(organizationId, storeId);
    const list = await this.orders.listOrders(
      organizationId,
      storeId,
      status ? { status } : undefined,
    );
    return Promise.all(list.map((o) => this.enrichWithReservation(o)));
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

  private async enrichWithReservation(order: OrderView): Promise<OrderView> {
    const items = order.composition?.items ?? [];
    if (items.length === 0) {
      return { ...order, hasDeficit: false };
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

    return {
      ...order,
      composition: order.composition
        ? { ...order.composition, items: enrichedItems }
        : null,
      hasDeficit,
    };
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

  private async appendTimeline(
    order: OrderView,
    type: string,
    message: string | null,
    payload: unknown,
  ): Promise<void> {
    await this.orders.appendTimeline({
      id: randomUUID(),
      organizationId: order.organizationId,
      orderId: order.id,
      type,
      message,
      actorMembershipId: actorMembershipId(),
      payload,
      occurredAt: this.clock.now(),
    });
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
